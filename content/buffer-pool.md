---
title: Buffer pool
slug: buffer-pool
order: 9
kicker: Disk
description: Pages, the disk manager, the I/O scheduler, LRU-K, page guards, and the pageLSN that WAL will use.
lede: The B+ tree never reads a file. It pins a frame. The buffer pool is the only component that talks to the disk.
---

`PAGE_SIZE` is 4096. Every page image, including ones written before any log exists, reserves 8 bytes at offset 0 for the pageLSN. The rest is payload. That reservation is why logging can be added later without reformatting the file.

## Disk manager

`DiskManager` owns the database file. `AllocatePage` ids are stable across restart. `ReadPage` and `WritePage` move exactly one page, including the pageLSN. A page never written reads back as zeros. `ShutDown` flushes and closes. When stats are installed, count `PageRead` and `PageWrite`. Trace component `"disk"`.

Write the bytes you were given. Do not invent a second header in front of the page.

::: next
Plan 1.1. It depends on nothing. `scripts/check 1.1`.
:::

## Disk scheduler

One background thread drains a queue of `DiskRequest`. `Schedule` returns immediately. The promise is set when the I/O finishes, on the scheduler thread, not the caller. The destructor finishes queued work and joins. The caller's buffer stays valid until then. Trace component `"io"`.

The query thread must not call `ReadPage` itself once the scheduler exists. A prefetch and a flush can then overlap the CPU work. The promise is moved into the queue. Do not touch it after `Schedule`.

## LRU-K

`RecordAccess` appends a timestamp. A frame with fewer than `k` accesses has infinite backward k-distance. `Evict` picks the evictable frame with the largest distance, and breaks ties by the older k-th access. It returns false when nothing is evictable, and it does not write `frame_id`. `SetEvictable(false)` keeps history so a page that is pinned and unpinned does not look new. `Remove` drops history. `Size` is the evictable count. The replacer is thread-safe. Trace component `"replacer"`.

Infinite distance is larger than every finite distance. A frame touched once is thrown out before a frame touched `k` times. The default `k` in the shell is 2. `\set lru_k K` stores the knob. The pool has to be built with that `k` for it to matter.

The classic paper is O'Neil, O'Neil, and Weikum, "The LRU-K Page Replacement Algorithm". `k = 1` is LRU.

## Buffer pool

Thread-safe from the first version. `NewPage` allocates, pins, and returns a zeroed frame. `FetchPage` pins, and reads from disk on a miss. `UnpinPage` drops one pin and marks dirty when asked. `DeletePage` fails when the page is pinned. `GetPinnedFrameCount` is safe to call from a test thread while a query runs. `BufferHit` on a memory fetch, `BufferMiss` when a frame is read from disk. Trace component `"bpm"`.

The replacer only sees unpinned frames. A pin count and a latch are different. The latch arrives with the guards.

`FlushPage` writes a dirty frame only. If a log manager is installed, the order is fixed:

1. Flush the log up to the page's pageLSN.
2. `CrashPoint::Reach("BufferPoolManager::FlushPage::before_disk_write")`.
3. Write the page.

Step 2 sits between the log and the disk so a crash test can kill the process after the log is durable and before the page is. If the crash point fired before the log flush, a torn crash could leave a new page and no log record, and redo would have nothing to trust. See [the WAL rule](recovery.html#the-wal-rule).

The constructor is `(pool_size, DiskManager*, replacer_k, LogManager* = nullptr, IoStats* = nullptr, TraceSink* = nullptr)`. The scaffold's constructor throws `PLAN 1.4`. `Database::bpm_` stays null until you construct a pool.

## Page guards

`ReadPageGuard` takes a shared latch and one pin. `WritePageGuard` takes an exclusive latch and one pin. Both unpin exactly once, in `Drop` or the destructor. Move transfers the pin and leaves the source empty. An empty guard is not dereferenceable. Copying is forbidden. Two read guards on one page may coexist. A write guard excludes every other guard on that page.

::: today
Constructing a guard throws `PLAN 1.5`. The scaffold's `Drop` only clears pointers. It does not unpin. Replacing that function is the whole item. Unpinning twice is a bug the pin-count tests catch.
:::

The harness asserts zero pinned frames after every query and every destroyed iterator. That assertion is the reason guards exist. A raw `FetchPage` without a matching `UnpinPage` fails it.

## Inspection

`\bpm` prints frames. `\page <id>` prints one page. `\trace on` and `\trace off` flip `SwitchableTraceSink`. Components call `Event`. They do not print. The scaffold never increments `IoStats`. The call sites are named in `io_stats.h` so the counts start at zero until you add them.

`\stats` prints the counters. A scan with pool size 4 and pool size 64, and with `lru_k` 1 and 2, is the experiment that tells you whether eviction is doing what you think.

::: read
Petrov, chapters 2 and 3. O'Neil, O'Neil, and Weikum, LRU-K.
:::
