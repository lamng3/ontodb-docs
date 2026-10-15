---
title: Buffer pool
slug: buffer-pool
part: Internals
order: 6
kicker: Internals
description: Pages, the disk manager, the I/O scheduler, LRU-K, page guards, and the pageLSN that WAL will use.
lede: The B+ tree never reads a file. It pins a frame. The buffer pool is the only component that talks to the disk.
---

`PAGE_SIZE` is 4096. Every page image, including ones written before any log exists, reserves 8 bytes at offset 0 for the pageLSN. The rest is payload. That reservation is why logging can be added later without reformatting the file.

## Disk manager

`DiskManager` owns the database file. `AllocatePage` ids are stable across restart. `ReadPage` and `WritePage` move exactly one page, including the pageLSN. A page never written reads back as zeros. `ShutDown` flushes and closes. When stats are installed, count `PageRead` and `PageWrite`. Trace component `"disk"`.

Write the bytes you were given. Do not invent a second header in front of the page.

The file's length is the allocation record. `AllocatePage` grows the file by one zero page, so a restart sees every page allocated before it, and page 0 is an ordinary page (the catalog uses it). `DeallocatePage` does not reuse the id: the file only grows, because a reused id that a log record still names would send redo into someone else's page. `WritePage` goes through the page cache and does not `fsync`; `ShutDown` does, and a failed `fsync` throws instead of retrying. A write past the end grows the file, and a read past the end returns zeros, so recovery can redo a record for a page the file has not reached yet. A negative page id, or any call after `ShutDown`, throws `StorageException`.

::: next
Plan 1.1 is done. `scripts/check 1.1`.
:::

## Disk scheduler

One background thread drains a queue of `DiskRequest`. `Schedule` returns immediately. The promise is set when the I/O finishes, on the scheduler thread, not the caller. The destructor finishes queued work and joins. The caller's buffer stays valid until then. Trace component `"io"`.

The query thread must not call `ReadPage` itself once the scheduler exists. A prefetch and a flush can then overlap the CPU work. The promise is moved into the queue. Do not touch it after `Schedule`.

Requests run in the order they were scheduled, so a write followed by a read of the same page reads what was written. If the disk manager throws, the exception is stored in the promise and `get()` rethrows it. Plan 1.2 is done; `scripts/check 1.2`.

## LRU-K

`RecordAccess` appends a timestamp. A frame with fewer than `k` accesses has infinite backward k-distance. `Evict` picks the evictable frame with the largest distance, and breaks ties by the older k-th access. It returns false when nothing is evictable, and it does not write `frame_id`. `SetEvictable(false)` keeps history so a page that is pinned and unpinned does not look new. `Remove` drops history. `Size` is the evictable count. The replacer is thread-safe. Trace component `"replacer"`.

Infinite distance is larger than every finite distance. A frame touched once is thrown out before a frame touched `k` times. The default `k` in the shell is 2. `\set lru_k K` stores the knob. The pool has to be built with that `k` for it to matter.

The classic paper is O'Neil, O'Neil, and Weikum, "The LRU-K Page Replacement Algorithm". `k = 1` is LRU.

Time is a logical clock that ticks on every `RecordAccess`, so eviction is deterministic. Among frames with infinite distance, the one whose oldest recorded access is earliest goes first; with `k = 2` that is LRU among frames seen once. `Evict` drops the victim's history. A frame id out of range throws `std::invalid_argument`. Choosing a victim scans every frame, which is cheap at the default 64. Plan 1.3 is done; `scripts/check 1.3`.

## Buffer pool

Thread-safe from the first version. `NewPage` allocates, pins, and returns a zeroed frame. `FetchPage` pins, and reads from disk on a miss. `UnpinPage` drops one pin and marks dirty when asked. `DeletePage` fails when the page is pinned. `GetPinnedFrameCount` is safe to call from a test thread while a query runs. `BufferHit` on a memory fetch, `BufferMiss` when a frame is read from disk. Trace component `"bpm"`.

One latch covers the page table, the free list, pins, dirty bits, and the replacer, and it is held across the disk read of a miss or the write-back of a victim. Every read and write goes through the scheduler. When a log manager is installed, write-back flushes the log up to the page's pageLSN, reaches `BufferPoolManager::FlushPage::before_disk_write`, and only then writes the page. `NewPage` and `FetchPage` return null when every frame is pinned. The destructor does not flush; a clean shutdown calls `FlushAllPages`. Plan 1.4 is done; `scripts/check 1.4`.

The replacer only sees unpinned frames. A pin count and a latch are different: the pin keeps the frame in memory, the latch protects its bytes.

`FlushPage` writes a dirty frame only. If a log manager is installed, the order is fixed:

1. Flush the log up to the page's pageLSN.
2. `CrashPoint::Reach("BufferPoolManager::FlushPage::before_disk_write")`.
3. Write the page.

Step 2 sits between the log and the disk so a crash test can kill the process after the log is durable and before the page is. If the crash point fired before the log flush, a torn crash could leave a new page and no log record, and redo would have nothing to trust. See [the WAL rule](recovery.html#the-wal-rule).

The constructor is `(pool_size, DiskManager*, replacer_k, LogManager* = nullptr, IoStats* = nullptr, TraceSink* = nullptr)`. `Database::bpm_` is null on the memory backend and points at the indexed backend's pool after `\set backend indexed`.

## Page guards

`ReadPageGuard` takes a shared latch and one pin. `WritePageGuard` takes an exclusive latch and one pin. Both unpin exactly once, in `Drop` or the destructor. Move transfers the pin and leaves the source empty. An empty guard is not dereferenceable. Copying is forbidden. Two read guards on one page may coexist. A write guard excludes every other guard on that page.

Each frame carries a reader-writer latch. A guard pins first (through `FetchPage` or `NewPage`), then takes the latch outside the pool's latch, so waiting for a busy page never blocks the pool. `Drop` releases the latch first and the pin second; unpinned first, the frame could be evicted while its latch is still held. When a frame starts holding a different page it gets a newly allocated latch, so a latch belongs to one page; with a latch per frame, ThreadSanitizer reported lock-order cycles between unrelated pages that had shared a frame. A write guard marks the page dirty only if its mutable `GetData` was called, so crabbing can hold an exclusive latch on a page it never changes without causing a write. `FetchPageRead`, `FetchPageWrite`, and `NewPageGuarded` throw `StorageException` when the pool returns null.

::: today
Plan 1.5 is done. `scripts/check 1.5`. The guard tests pass under ThreadSanitizer.
:::

The harness asserts zero pinned frames after every query and every destroyed iterator. That assertion is the reason guards exist. A raw `FetchPage` without a matching `UnpinPage` fails it.

## Inspection

`\bpm` prints one line for the pool (frames, `lru_k`, in use, free, pinned, dirty, evictable) and one per resident frame (page, pins, dirty or clean, pageLSN). `\page <id>` reads the page through a read guard and prints its pageLSN and the first 64 payload bytes in hex. Reading through the pool shows what the engine sees, dirty changes included; it is also an access, so it can load the page, evict another, and add to the page's LRU-K history. `\trace on` and `\trace off` flip `SwitchableTraceSink`, which prints `component: message` lines to stderr. Components call `Event`. They do not print.

The default memory backend has no pool. There, `\bpm` and `\page` answer `no buffer pool`; they come alive after `\set backend indexed`. The disk manager counts page reads and writes, and the pool counts hits and misses, so `\stats` reports them once a pool exists. Plan 1.6 is done; the buffer pool is complete.

`\stats` prints the counters. A scan with pool size 4 and pool size 64, and with `lru_k` 1 and 2, is the experiment that tells you whether eviction is doing what you think.

::: read
Petrov, chapters 2 and 3. O'Neil, O'Neil, and Weikum, LRU-K.
:::
