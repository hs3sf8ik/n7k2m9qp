(function () {
  "use strict";

  function dec(b64) {
    if (!b64) return [];
    try {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder("utf-8").decode(bytes));
    } catch (e) {
      return [];
    }
  }

  var CARDS = dec(window.__A);
  var DOCS = dec(window.__B);

  // 앱에서 고친 내용은 이 기기 브라우저에만 쌓인다. build.py 로 내보내야 원본에 반영된다
  var EDIT_KEY = "adm.edits";
  var BASE = CARDS.map(function (c) {
    return { lv1: c.lv1, lv2: c.lv2, hint: c.hint };
  });
  var EDITS = {};
  try { EDITS = JSON.parse(localStorage.getItem(EDIT_KEY) || "{}") || {}; }
  catch (e) { EDITS = {}; }

  function editCount() { return Object.keys(EDITS).length; }

  function applyEdits() {
    for (var i = 0; i < CARDS.length; i++) {
      var e = EDITS[CARDS[i].no] || {};
      CARDS[i].lv1 = e.lv1 !== undefined ? e.lv1 : BASE[i].lv1;
      CARDS[i].lv2 = e.lv2 !== undefined ? e.lv2 : BASE[i].lv2;
      CARDS[i].hint = e.hint !== undefined ? e.hint : BASE[i].hint;
    }
  }

  function saveEdits() {
    try { localStorage.setItem(EDIT_KEY, JSON.stringify(EDITS)); }
    catch (e) { alert("이 브라우저에 저장할 수 없습니다."); }
    applyEdits();
    CARD_IX = buildIndex(CARDS);
    syncOut();
  }

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function stars(n) {
    return n > 0 ? '<span class="stars">' + "★".repeat(n) + "</span>" : "";
  }

  /* ══════════════════════════  검색  ══════════════════════════ */

  var CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  var ONLY_CHO = /^[ㄱ-ㅎ]+$/;

  // 한글 음절에서 첫 자음만 뽑는다. 'ㅎㅈㄱㅎ' 로 '행정계획' 을 찾기 위한 것
  function chosung(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      out += c >= 0xac00 && c <= 0xd7a3
        ? CHO.charAt(Math.floor((c - 0xac00) / 588))
        : s.charAt(i);
    }
    return out;
  }

  // 검색 대상 문자열을 미리 만들어 둔다
  function buildIndex(list) {
    return list.map(function (o) {
      var hay = [o.no, o.title, o.lv1, o.lv2, o.hint, o.mnemonic]
        .filter(Boolean).join(" ");
      return { hay: hay.toLowerCase(), cho: chosung(o.title) };
    });
  }

  applyEdits();

  var CARD_IX = buildIndex(CARDS);
  var DOC_IX = buildIndex(DOCS);

  function hit(ix, q) {
    q = (q || "").trim();
    if (!q) return true;
    if (ONLY_CHO.test(q)) return ix.cho.indexOf(q) >= 0;
    return ix.hay.indexOf(q.toLowerCase()) >= 0;
  }

  function rowsHtml(list, ix, q) {
    var out = "", n = 0;
    for (var i = 0; i < list.length; i++) {
      if (!hit(ix[i], q)) continue;
      n++;
      out += '<button type="button" data-i="' + i + '">' +
        '<span class="n">' + esc(list[i].no) + "</span>" +
        '<span class="t">' + esc(list[i].title) + "</span>" +
        stars(list[i].stars) + "</button>";
    }
    return n ? out : '<p class="none">찾는 항목이 없습니다.</p>';
  }

  /* ══════════════════════════  탭 전환  ══════════════════════════ */

  var views = { quiz: $("view-quiz"), read: $("view-read") };
  var tabs = { quiz: $("tab-quiz"), read: $("tab-read") };

  function show(name) {
    Object.keys(views).forEach(function (k) {
      views[k].hidden = k !== name;
      tabs[k].setAttribute("aria-selected", String(k === name));
    });
    closeSheet();
    window.scrollTo(0, 0);
  }

  Object.keys(tabs).forEach(function (k) {
    tabs[k].addEventListener("click", function () { show(k); });
  });

  /* ══════════════════════════  1. 카드퀴즈  ══════════════════════════ */

  var LAYERS = ["1수준 두문자", "2수준 두문자"];

  var deck = [];
  var at = 0;
  var open = 0; // 공개된 층 수 (0 ~ 2)

  function seek(no) {
    for (var i = 0; i < deck.length; i++) if (deck[i].no === no) return i;
    return -1;
  }

  function buildDeck(keepNo) {
    var min = Number($("f-star").value);
    deck = CARDS.filter(function (c) { return c.stars >= min; });

    if ($("f-order").value === "random") {
      for (var i = deck.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
      }
    }
    at = keepNo ? Math.max(seek(keepNo), 0) : 0;
    open = 0;
    clearTry();
    render();
  }

  // "[법치] 형 한실위"  →  대괄호 부분을 칩으로
  function lv1Html(s) {
    var m = /^\s*[[<]([^\]>]+)[\]>]\s*(.*)$/.exec(s);
    if (!m) return esc(s);
    return '<span class="chip">' + esc(m[1]) + "</span>" + esc(m[2]);
  }

  // 공백으로 나뉜 그룹이 목차 절에 대응한다 → 그룹마다 밑줄
  function lv2Html(s) {
    return s.split(/\s+/).filter(Boolean).map(function (g) {
      return '<span class="grp">' + esc(g) + "</span>";
    }).join(" ");
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
        (window.__P ? '<button type="button" class="edit" id="edit">수정</button>' : "") +
      "</div>" +
      '<div class="stack">';

    var bodies = [
      '<div class="lv1">' + lv1Html(c.lv1) + "</div>",
      '<div class="lv2">' + lv2Html(c.lv2) + "</div>",
    ];

    // 갓 열린 층에만 등장 효과를 준다. 이미 나와 있던 층은 그대로 둔다.
    for (var i = 0; i < open; i++) {
      html += '<div class="layer' + (i === open - 1 ? " new" : "") + '">' +
        '<span class="layer-tag">' + LAYERS[i] + "</span>" +
        bodies[i] + "</div>";
    }

    html += "</div>";

    // 연상문장은 단계가 아니라, 1수준부터 카드 오른쪽 아래에 계속 떠 있는 힌트
    html += '<div class="card-foot">' +
      '<span class="tap-hint">' +
        (open < LAYERS.length ? "탭하면 " + LAYERS[open] : "탭하면 다음 카드") +
      "</span>" +
      (open >= 1 && c.hint
        ? '<span class="hint' + (open === 1 ? " new" : "") + '">' + esc(c.hint) + "</span>"
        : "") +
      "</div>";

    host.innerHTML = html;
    $("count").textContent = at + 1 + " / " + deck.length;
    $("prev").disabled = at === 0;
    $("next").disabled = at === deck.length - 1;
  }

  /* 직접 써보기 — 카드가 바뀌면 비운다. 어디에도 저장하지 않는다 */
  function grow() {
    var el = $("typing");
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  function clearTry() {
    var el = $("typing");
    if (!el) return;
    el.value = "";
    el.style.height = "";
  }

  $("typing").addEventListener("input", grow);
  $("try-clear").addEventListener("click", function () {
    clearTry();
    $("typing").focus();
  });

  function step() {
    if (!deck.length) return;
    if (open < LAYERS.length) { open++; }
    else if (at < deck.length - 1) { at++; open = 0; clearTry(); }
    render();
  }

  function move(d) {
    if (!deck.length) return;
    var was = at;
    at = Math.min(Math.max(at + d, 0), deck.length - 1);
    if (at !== was) clearTry();
    open = 0;
    render();
  }

  // 별점 조건에 걸려 덱에 없는 카드로 가려 하면 조건을 풀어준다
  function jump(i) {
    var no = CARDS[i].no;
    if (seek(no) < 0) {
      $("f-star").value = "0";
      buildDeck(no);
    } else {
      at = seek(no);
      open = 0;
      render();
    }
    clearTry();
    closeSheet();
    window.scrollTo(0, 0);
  }

  $("card").addEventListener("click", function (e) {
    if (e.target.closest("#edit")) { e.stopPropagation(); return askEdit(); }
    step();
  });
  $("prev").addEventListener("click", function (e) { e.stopPropagation(); move(-1); });
  $("next").addEventListener("click", function (e) { e.stopPropagation(); move(1); });
  $("f-star").addEventListener("change", function () { buildDeck(); });
  $("f-order").addEventListener("change", function () { buildDeck(); });

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

  /* ══════════════════════════  이동 패널  ══════════════════════════ */

  function drawSheet() {
    $("sheet-list").innerHTML = rowsHtml(CARDS, CARD_IX, $("q").value);
  }

  function openSheet() {
    $("q").value = "";
    drawSheet();
    $("sheet").hidden = false;
    // 좁은 화면에서 키보드가 바로 올라오면 목록이 가려지므로 데스크톱에서만 포커스
    if (window.matchMedia("(min-width: 48rem)").matches) $("q").focus();
  }

  function closeSheet() {
    ["sheet", "esheet", "psheet", "xsheet"].forEach(function (id) {
      if ($(id)) $(id).hidden = true;
    });
  }

  $("go").addEventListener("click", openSheet);
  $("q").addEventListener("input", drawSheet);
  $("sheet-x").addEventListener("click", closeSheet);
  ["sheet", "esheet", "psheet", "xsheet"].forEach(function (id) {
    $(id).addEventListener("click", function (e) {
      if (e.target === this) this.hidden = true;
    });
  });
  $("sheet-list").addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (t) jump(Number(t.dataset.i));
  });

  /* ══════════════════════════  수정  ══════════════════════════ */

  // 소스에는 비밀번호 대신 해시만 둔다. 정적 사이트라 완벽한 잠금은 아니고,
  // 실수나 장난을 막는 용도다. 고친 내용은 어차피 이 기기에만 남는다.
  function sha(str) {
    if (!(window.crypto && crypto.subtle && crypto.subtle.digest)) return null;
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode("adminlaw:" + str))
      .then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ("0" + b.toString(16)).slice(-2);
        }).join("");
      });
  }

  function unlocked() {
    try { return sessionStorage.getItem("adm.ok") === "1"; } catch (e) { return false; }
  }

  function askEdit() {
    if (unlocked()) return openEdit();
    $("p-msg").hidden = true;
    $("pw").value = "";
    $("psheet").hidden = false;
    $("pw").focus();
  }

  function tryPassword() {
    var p = sha($("pw").value);
    if (!p) {
      $("p-msg").textContent = "이 브라우저에서는 수정 기능을 쓸 수 없습니다.";
      $("p-msg").hidden = false;
      return;
    }
    p.then(function (h) {
      if (h !== window.__P) {
        $("p-msg").textContent = "비밀번호가 맞지 않습니다.";
        $("p-msg").hidden = false;
        return;
      }
      try { sessionStorage.setItem("adm.ok", "1"); } catch (e) {}
      $("psheet").hidden = true;
      openEdit();
    });
  }

  function openEdit() {
    var c = deck[at];
    if (!c) return;
    $("e-title").textContent = c.no + ". " + c.title;
    $("e1").value = c.lv1;
    $("e2").value = c.lv2;
    $("e3").value = c.hint;
    $("e-reset").hidden = !EDITS[c.no];
    $("esheet").hidden = false;
    ["e1", "e2", "e3"].forEach(function (id) { autoGrow($(id)); });
  }

  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  ["e1", "e2", "e3"].forEach(function (id) {
    $(id).addEventListener("input", function () { autoGrow(this); });
  });

  $("e-save").addEventListener("click", function () {
    var c = deck[at];
    var i = CARDS.indexOf(c);
    var v = { lv1: $("e1").value.trim(), lv2: $("e2").value.trim(), hint: $("e3").value.trim() };

    // 원본과 같아진 항목은 수정본에서 빼서 군더더기를 남기지 않는다
    var diff = {};
    ["lv1", "lv2", "hint"].forEach(function (k) {
      if (v[k] !== BASE[i][k]) diff[k] = v[k];
    });

    if (Object.keys(diff).length) EDITS[c.no] = diff;
    else delete EDITS[c.no];

    saveEdits();
    $("esheet").hidden = true;
    render();
  });

  $("e-reset").addEventListener("click", function () {
    delete EDITS[deck[at].no];
    saveEdits();
    $("esheet").hidden = true;
    render();
  });

  $("e-x").addEventListener("click", function () { $("esheet").hidden = true; });
  $("p-x").addEventListener("click", function () { $("psheet").hidden = true; });
  $("p-ok").addEventListener("click", tryPassword);
  $("pw").addEventListener("keydown", function (e) {
    if (e.key === "Enter") tryPassword();
  });

  /* ── 내보내기 ── */

  function syncOut() {
    var n = editCount();
    $("out").hidden = n === 0;
    $("out").textContent = "내보내기 " + n;
  }

  $("out").addEventListener("click", function () {
    $("x-title").textContent = "수정본 " + editCount() + "건";
    $("x-text").value = JSON.stringify(EDITS, null, 1);
    $("xsheet").hidden = false;
  });

  $("x-x").addEventListener("click", function () { $("xsheet").hidden = true; });

  $("x-copy").addEventListener("click", function () {
    var t = $("x-text");
    t.select();
    t.setSelectionRange(0, 999999);
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    if (!ok && navigator.clipboard) navigator.clipboard.writeText(t.value);
    $("x-copy").textContent = "복사됨";
    setTimeout(function () { $("x-copy").textContent = "복사"; }, 1500);
  });

  $("x-save").addEventListener("click", function () {
    var blob = new Blob([$("x-text").value], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "overrides.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });

  $("x-wipe").addEventListener("click", function () {
    if (!confirm("이 기기에 저장된 수정본을 모두 지웁니다. PC 에 반영한 뒤에 누르세요.")) return;
    EDITS = {};
    saveEdits();
    $("xsheet").hidden = true;
    render();
  });

  /* ══════════════════════════  2. 단문 열람  ══════════════════════════ */

  var fontStep = 0;
  var docQuery = "";
  var curDoc = -1; // 목차를 보고 있으면 -1

  function toc() {
    if (!DOCS.length) {
      $("read-body").innerHTML =
        '<div class="empty"><strong>단문 원문이 아직 없습니다.</strong><br>' +
        "원문 텍스트를 <code>source/</code> 폴더에 넣고 " +
        "<code>python build.py</code> 를 실행하세요.</div>";
      return;
    }
    curDoc = -1;
    $("read-body").innerHTML =
      '<div class="search"><input type="search" id="dq" autocomplete="off" ' +
      'placeholder="번호 · 제목 · 두문자 · 초성" value="' + esc(docQuery) + '"></div>' +
      '<div class="toc" id="toc-list">' + rowsHtml(DOCS, DOC_IX, docQuery) + "</div>";
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
    if (i < 0 || i >= DOCS.length) return;
    curDoc = i;
    var d = DOCS[i];
    var out = "";

    d.blocks.forEach(function (b) {
      if (b.lv === 1) {
        out += '<h3><span class="rn">' + esc(b.num) + ".</span><span>" +
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
      '<div class="doc-nav">' +
        '<button type="button" class="back" id="to-toc">← 목차</button>' +
        '<span class="size-ctl">' +
          '<button type="button" id="fs-down" aria-label="글자 작게">A−</button>' +
          '<button type="button" id="fs-up" aria-label="글자 크게">A+</button>' +
        "</span>" +
      "</div>" +
      '<div class="doc-head">' +
        '<div class="meta"><span class="n">' + esc(d.no) + "</span>" + stars(d.stars) + "</div>" +
        "<h2>" + esc(d.title) + "</h2>" +
        (d.mnemonic ? '<div class="doc-mn">' + lv1Html(d.mnemonic) + "</div>" : "") +
      "</div>" +
      '<div class="doc-body" id="doc-body">' + out + "</div>" +
      '<div class="doc-pager">' +
        '<button type="button" data-go="' + (i - 1) + '"' +
          (i === 0 ? " disabled" : "") + ">← 이전 단문</button>" +
        '<button type="button" data-go="' + (i + 1) + '"' +
          (i === DOCS.length - 1 ? " disabled" : "") + ">다음 단문 →</button>" +
      "</div>";

    applyFont();
    window.scrollTo(0, 0);
  }

  function applyFont() {
    var el = $("doc-body");
    if (el) el.style.fontSize = 1.0625 + fontStep * 0.09375 + "rem";
  }

  $("read-body").addEventListener("input", function (e) {
    if (e.target.id !== "dq") return;
    docQuery = e.target.value;
    $("toc-list").innerHTML = rowsHtml(DOCS, DOC_IX, docQuery);
  });

  $("read-body").addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.i !== undefined) return doc(Number(t.dataset.i));
    if (t.dataset.go !== undefined) return doc(Number(t.dataset.go));
    if (t.id === "to-toc") return toc();
    if (t.id === "fs-up") { fontStep = Math.min(fontStep + 1, 5); return applyFont(); }
    if (t.id === "fs-down") { fontStep = Math.max(fontStep - 1, -2); return applyFont(); }
  });

  // 좌우로 밀어 이전·다음 단문. 본문을 보고 있을 때만 동작한다
  (function () {
    var x0 = null, y0 = null;
    var el = $("read-body");
    el.addEventListener("touchstart", function (e) {
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (x0 === null || curDoc < 0) { x0 = y0 = null; return; }
      var dx = e.changedTouches[0].clientX - x0;
      var dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        var t = curDoc + (dx < 0 ? 1 : -1);
        if (t >= 0 && t < DOCS.length) { e.preventDefault(); doc(t); }
      }
      x0 = y0 = null;
    });
  })();

  /* ══════════════════════════  키보드  ══════════════════════════ */

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") return closeSheet();
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (!$("sheet").hidden || !$("esheet").hidden ||
        !$("psheet").hidden || !$("xsheet").hidden) return;

    if (e.key === "/") { e.preventDefault(); return openSheet(); }

    if (views.quiz.hidden) {
      if (curDoc < 0) return;
      if (e.key === "ArrowRight") doc(curDoc + 1);
      else if (e.key === "ArrowLeft") doc(curDoc - 1);
      return;
    }

    if (e.key === " " || e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault(); step();
    } else if (e.key === "ArrowRight") { move(1); }
    else if (e.key === "ArrowLeft") { move(-1); }
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
  syncOut();
  show("quiz");

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
