(function () {
  "use strict";

  var CARDS = window.DUMUN || [];
  var DOCS = window.DANMUN || [];

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function stars(n) {
    return n > 0 ? '<span class="stars">' + "★".repeat(n) + "</span>" : "";
  }

  /* ══════════════════════════  탭 전환  ══════════════════════════ */

  var views = { quiz: $("view-quiz"), read: $("view-read") };
  var tabs = { quiz: $("tab-quiz"), read: $("tab-read") };

  function show(name) {
    Object.keys(views).forEach(function (k) {
      views[k].hidden = k !== name;
      tabs[k].setAttribute("aria-selected", String(k === name));
    });
    window.scrollTo(0, 0);
  }

  Object.keys(tabs).forEach(function (k) {
    tabs[k].addEventListener("click", function () { show(k); });
  });

  /* ══════════════════════════  1. 카드퀴즈  ══════════════════════════ */

  var LAYERS = ["1수준 두문자", "2수준 두문자", "연상문장"];

  var deck = [];
  var at = 0;
  var open = 0; // 공개된 층 수 (0 ~ 3)

  function buildDeck() {
    var min = Number($("f-star").value);
    deck = CARDS.filter(function (c) { return c.stars >= min; });

    if ($("f-order").value === "random") {
      for (var i = deck.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
      }
    }
    at = 0;
    open = 0;
    render();
  }

  // "[법치] 형 한실위"  →  대괄호 부분을 칩으로
  function lv1Html(s) {
    var m = /^\s*[[<]([^\]>]+)[\]>]\s*(.*)$/.exec(s);
    if (!m) return esc(s);
    return '<span class="chip">' + esc(m[1]) + "</span>" + esc(m[2]);
  }

  // 공백으로 나뉜 그룹이 목차 절에 대응한다 → 그룹마다 칸을 나눔
  function lv2Html(s) {
    return s.split(/\s+/).filter(Boolean).map(function (g) {
      return '<span class="grp">' + esc(g) + "</span>";
    }).join("");
  }

  function render() {
    var host = $("card");

    if (!deck.length) {
      host.innerHTML = '<div class="empty">해당하는 카드가 없습니다. 별점 조건을 낮춰보세요.</div>';
      $("count").textContent = "";
      $("prev").disabled = $("next").disabled = true;
      return;
    }

    var c = deck[at];
    var html =
      '<div class="card-head">' +
        '<span class="card-no">' + esc(c.no) + "</span>" +
        '<span class="card-title">' + esc(c.title) + "</span>" +
        stars(c.stars) +
      "</div>" +
      '<div class="stack">';

    var bodies = [
      '<div class="lv1">' + lv1Html(c.lv1) + "</div>",
      '<div class="lv2">' + lv2Html(c.lv2) + "</div>",
      '<div class="lv3">' + esc(c.hint) + "</div>",
    ];

    for (var i = 0; i < open; i++) {
      if (!bodies[i]) continue;
      html += '<div class="layer">' +
        '<span class="layer-tag">' + LAYERS[i] + "</span>" +
        bodies[i] + "</div>";
    }

    html += "</div>";
    html += '<span class="tap-hint">' +
      (open < LAYERS.length ? "탭하면 " + LAYERS[open] : "탭하면 다음 카드") +
      "</span>";

    host.innerHTML = html;
    $("count").textContent = at + 1 + " / " + deck.length;
    $("prev").disabled = at === 0;
    $("next").disabled = at === deck.length - 1;
  }

  function step() {
    if (!deck.length) return;
    if (open < LAYERS.length) { open++; }
    else if (at < deck.length - 1) { at++; open = 0; }
    render();
  }

  function move(d) {
    if (!deck.length) return;
    at = Math.min(Math.max(at + d, 0), deck.length - 1);
    open = 0;
    render();
  }

  $("card").addEventListener("click", step);
  $("prev").addEventListener("click", function (e) { e.stopPropagation(); move(-1); });
  $("next").addEventListener("click", function (e) { e.stopPropagation(); move(1); });
  $("f-star").addEventListener("change", buildDeck);
  $("f-order").addEventListener("change", buildDeck);

  // 좌우 스와이프로 카드 이동
  (function () {
    var x0 = null, y0 = null;
    var el = $("card");
    el.addEventListener("touchstart", function (e) {
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      var dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        e.preventDefault();
        move(dx < 0 ? 1 : -1);
      }
      x0 = y0 = null;
    });
  })();

  document.addEventListener("keydown", function (e) {
    if (views.quiz.hidden) return;
    if (e.key === " " || e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault(); step();
    } else if (e.key === "ArrowRight") { move(1); }
    else if (e.key === "ArrowLeft") { move(-1); }
  });

  /* ══════════════════════════  2. 단문 열람  ══════════════════════════ */

  var ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ", "Ⅺ", "Ⅻ"];
  var fontStep = 0;

  function toc() {
    if (!DOCS.length) {
      $("read-body").innerHTML =
        '<div class="empty"><strong>단문 원문이 아직 없습니다.</strong><br>' +
        "원문 텍스트를 <code>source/</code> 폴더에 넣고 " +
        "<code>python build.py</code> 를 실행하세요.</div>";
      return;
    }
    $("read-body").innerHTML =
      '<div class="toc">' +
      DOCS.map(function (d, i) {
        return '<button type="button" data-i="' + i + '">' +
          '<span class="n">' + esc(d.no) + "</span>" +
          '<span class="t">' + esc(d.title) + "</span>" +
          stars(d.stars) + "</button>";
      }).join("") +
      "</div>";
  }

  // "의의 : 특정인에…"  →  콜론 앞 라벨을 굵게
  function bodyHtml(t) {
    var i = t.indexOf(" : ");
    var j = i < 0 ? t.indexOf(": ") : i;
    if (j > 0 && j < 26) {
      return '<span class="lab">' + esc(t.slice(0, j)) + "</span>" +
        esc(t.slice(j).replace(/^\s*:\s*/, " : "));
    }
    return esc(t);
  }

  function doc(i) {
    var d = DOCS[i];
    var out = "";

    d.blocks.forEach(function (b) {
      if (b.lv === 1) {
        out += "<h3><span class=\"rn\">" + esc(b.num) + ".</span><span>" +
          esc(b.t) + "</span></h3>";
      } else if (b.lv === 0) {
        out += "<p>" + bodyHtml(b.t) + "</p>";
      } else {
        var mark = b.lv === 2 ? b.num + "." : b.lv === 3 ? b.num + ")" : "(" + b.num + ")";
        out += '<p class="d' + b.lv + '"><span class="num">' + esc(mark) + "</span>" +
          bodyHtml(b.t) + "</p>";
      }
    });

    $("read-body").innerHTML =
      '<button type="button" class="back" id="to-toc">← 목차</button>' +
      '<div class="doc-head">' +
        '<div class="meta"><span class="n">' + esc(d.no) + "</span>" + stars(d.stars) +
          '<span class="size-ctl">' +
            '<button type="button" id="fs-down" aria-label="글자 작게">A−</button>' +
            '<button type="button" id="fs-up" aria-label="글자 크게">A+</button>' +
          "</span></div>" +
        "<h2>" + esc(d.title) + "</h2>" +
        (d.mnemonic ? '<div class="doc-mn">' + lv1Html(d.mnemonic) + "</div>" : "") +
      "</div>" +
      '<div class="doc-body" id="doc-body">' + out + "</div>";

    applyFont();
    window.scrollTo(0, 0);
  }

  function applyFont() {
    var el = $("doc-body");
    if (el) el.style.fontSize = 1.0625 + fontStep * 0.09375 + "rem";
  }

  $("read-body").addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.i !== undefined) return doc(Number(t.dataset.i));
    if (t.id === "to-toc") return toc();
    if (t.id === "fs-up") { fontStep = Math.min(fontStep + 1, 5); return applyFont(); }
    if (t.id === "fs-down") { fontStep = Math.max(fontStep - 1, -2); return applyFont(); }
  });

  /* ══════════════════════════  시작  ══════════════════════════ */

  if (!CARDS.length) {
    $("view-quiz").innerHTML =
      '<div class="empty"><strong>두문자 데이터가 없습니다.</strong><br>' +
      "엑셀 파일을 <code>source/</code> 에 넣고 <code>python build.py</code> 를 실행하세요.</div>";
  } else {
    buildDeck();
  }
  toc();
  show("quiz");

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
