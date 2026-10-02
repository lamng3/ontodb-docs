(function () {
  var input = document.getElementById("q");
  var results = document.getElementById("results");
  if (!input || !results) return;
  var pages = [];
  fetch("search-index.json")
    .then(function (r) { return r.json(); })
    .then(function (data) { pages = data; });
  input.addEventListener("input", function () {
    var q = input.value.trim().toLowerCase();
    results.innerHTML = "";
    if (q.length < 2) {
      results.hidden = true;
      return;
    }
    var hits = pages.filter(function (page) {
      return (page.title + " " + page.text).toLowerCase().indexOf(q) !== -1;
    }).slice(0, 8);
    results.hidden = hits.length === 0;
    hits.forEach(function (page) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = page.url;
      a.textContent = page.title;
      li.appendChild(a);
      results.appendChild(li);
    });
  });
})();
