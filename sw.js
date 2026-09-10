// 오프라인 지원. 파일을 고친 뒤에는 VERSION 을 올려야 갱신됩니다.
var VERSION = "v2";
var ASSETS = [
  "./", "./index.html", "./css/style.css", "./js/app.js",
  "./data/a.js", "./data/b.js", "./manifest.webmanifest"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        if (res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return caches.match("./index.html"); });
    })
  );
});
