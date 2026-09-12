// 오프라인 지원.
// 네트워크를 먼저 보고 실패하면 캐시를 쓴다. 캐시를 먼저 보면 파일을 새로 올려도
// 옛 화면이 계속 나와서, 그게 더 큰 문제였다.
var VERSION = "v9";
var ASSETS = [
  "./", "./index.html", "./css/style.css", "./js/app.js",
  "./data/a.js", "./data/b.js", "./data/c.js", "./data/d.js",
  "./manifest.webmanifest"
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
    fetch(e.request).then(function (res) {
      if (res.ok && res.type === "basic") {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match("./index.html");
      });
    })
  );
});
