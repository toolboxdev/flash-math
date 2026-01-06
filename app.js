(() => {
  const LS_SETTINGS = "flash_math_settings_v1";
  const LS_HISTORY  = "flash_math_history_v1";

  const $ = (id) => document.getElementById(id);

  const elSettings = $("screenSettings");
  const elQuiz = $("screenQuiz");
  const elProblem = $("problem");
  const elAnswer = $("answer");
  const elCountdown = $("countdown");
  const elControlsReveal = $("controlsReveal");
  const elStatus = $("status");


  const btnToSettings = $("btnToSettings");
  const btnStart = $("btnStart");
  const btnStop = $("btnStop");
  const btnRevealNow = $("btnRevealNow");
  const btnCorrect = $("btnCorrect");
  const btnWrong = $("btnWrong");
  const btnResetHistory = $("btnResetHistory");

  const sum10Card = $("sum10Card");
  const chkSum10 = $("sum10");

  const elResult = $("result");

  const btnBackToSettings = $("btnBackToSettings");


  const TEXT = {
    // ボタン
    start: "はじめる",
    stop: "おわる",
  
    // 判定
    correct: "できた！",
    wrong: "ちがった",
  
    // 表示
    ready: "できたよ！",
  
    // カウントダウン
    countdown: (n) => `あと ${n} びょう`,
  
    // ===== 設定画面 =====
  
    // 見出し
    heading_op: "しゅつだいの しかた",
    heading_range: "かずの はんい",
    heading_seconds: "こたえを みるまで",
  
    // 出題タイプ
    opmode: {
      add: "たしざん",
      sub: "ひきざん",
      mix: "まぜて"
    },
  
    // 数値範囲
    range: {
      c2a: "ひとけた（1〜9）",
      c2b: "1〜18",
      c3: "どちらか にけた（10〜99）"
    },
  
    // 秒数
    seconds: (n) => `${n} びょう`
  };

  TEXT.heading_op = "しゅつだいの しかた";

  TEXT.opmode = {
    add: "たしざん",
    sub: "ひきざん",
    mix: "まぜて"
  };

  TEXT.heading_range = "かずの はんい";

  TEXT.range = {
    c2a: "ひとけた（1〜9）",
    c2b: "1〜18",
    c3: "どちらか にけた（10〜99）"
  };
  
  TEXT.heading_seconds = "こたえを みるまで";

  TEXT.result = (correct, total) =>
    `\n${total}もん おわり！\n${correct}もん できたよ！`;

  const state = {
    settings: {
      opmode: "add",     // add | sub | mix
      range: "c2a",      // c2a | c2b | c3
      sum10: false,      // add only
      seconds: 3
    },
    history: {},         // key -> { shown, correct, weight, last_at }
    current: null,       // { op,left,right,answer,key }
    prevKey: null,
    timer: null,
    remaining: 0,
    phase: "settings",   // settings | question | reveal
    sessionTotal: 0,
    sessionCorrect: 0
  };

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || "null");
      if (s && typeof s === "object") {
        state.settings = { ...state.settings, ...s };
      }
    } catch {}
  }

  function saveSettings() {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(state.settings));
  }

  function loadHistory() {
    try {
      const h = JSON.parse(localStorage.getItem(LS_HISTORY) || "{}");
      if (h && typeof h === "object") state.history = h;
    } catch {
      state.history = {};
    }
  }

  function saveHistory() {
    localStorage.setItem(LS_HISTORY, JSON.stringify(state.history));
  }

  function resetHistory() {
    state.history = {};
    saveHistory();
    setStatus("学習履歴をリセットしました");
  }

  function setStatus(msg) {
    elStatus.textContent = msg || "";
  }

  function setActiveSeg(selector, value, attr) {
    document.querySelectorAll(selector).forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute(attr) === String(value));
    });
  }

function showSettings() {
  state.phase = "settings";
  elQuiz.classList.add("hidden");
  elQuiz.setAttribute("hidden", ""); 
  elSettings.classList.remove("hidden");
  syncUI();
}


function showQuiz() {
  state.phase = "question";
  elSettings.classList.add("hidden");
  elQuiz.classList.remove("hidden");
  elQuiz.removeAttribute("hidden"); 
  syncUI();
  setStatus("");
}




  function normalizeUIBySettings() {
    setActiveSeg(".segBtn[data-opmode]", state.settings.opmode, "data-opmode");
    setActiveSeg(".segBtn[data-range]", state.settings.range, "data-range");
    setActiveSeg(".segBtn[data-seconds]", state.settings.seconds, "data-seconds");

    // 合計10までは足し算または混合で表示し、引き算では無効化
    const showSum10 = (state.settings.opmode === "add" || state.settings.opmode === "mix");
    sum10Card.classList.toggle("hidden", !showSum10);
    if (!showSum10) state.settings.sum10 = false;
    chkSum10.checked = !!state.settings.sum10;
  }

  function opSymbol(op) {
    return op === "add" ? "+" : "−";
  }

  function makeKey(op, left, right) {
    return `${op}:${left}:${right}`;
  }

  function getHist(key) {
    const h = state.history[key];
    if (h && typeof h === "object") return h;
    const init = { shown: 0, correct: 0, weight: 1.0, last_at: 0 };
    state.history[key] = init;
    return init;
  }

  function updateWeight(key, isCorrect) {
    const h = getHist(key);
    h.shown += 1;
    if (isCorrect) {
      h.correct += 1;
      h.weight = Math.max(0.3, +(h.weight * 0.8).toFixed(6));
    } else {
      h.weight = Math.min(3.0, +(h.weight * 1.25).toFixed(6));
    }
    h.last_at = Date.now();
  }

  function getRangeSpec() {
    const r = state.settings.range;
  
    // 一桁（1〜9）
    if (r === "c2a") {
      return { aMin: 1, aMax: 9, bMin: 1, bMax: 9, mode: "both" };
    }
  
    // 1〜18（0なし）
    if (r === "c2b") {
      return { aMin: 1, aMax: 18, bMin: 1, bMax: 18, mode: "both" };
    }
  
    // 片方二桁（10〜99）＋一桁（1〜9）
    return {
      aMin: 10,
      aMax: 99,
      bMin: 1,
      bMax: 9,
      mode: "one2digit"
    };
  }


  function listCandidatesForOp(op) {
    const spec = getRangeSpec();
    const sum10 = !!state.settings.sum10;

    const out = [];

    if (spec.mode === "both") {
      for (let a = spec.aMin; a <= spec.aMax; a++) {
        for (let b = spec.bMin; b <= spec.bMax; b++) {
          if (op === "add") {
            const ans = a + b;
            if (sum10 && ans > 10) continue;
            const key = makeKey(op, a, b);
            out.push({ op, left: a, right: b, answer: ans, key });
          } else {
            // sub: enforce left >= right by swapping
            const left = Math.max(a, b);
            const right = Math.min(a, b);
            const ans = left - right;
            const key = makeKey(op, left, right);
            out.push({ op, left, right, answer: ans, key });
          }
        }
      }
    } else {
      // one2digit: generate both orientations, then normalize for sub
      for (let two = spec.aMin; two <= spec.aMax; two++) {
        for (let one = spec.bMin; one <= spec.bMax; one++) {
          if (op === "add") {
            // two + one
            let a = two, b = one;
            let ans = a + b;
            if (!(sum10 && ans > 10)) out.push({ op, left: a, right: b, answer: ans, key: makeKey(op, a, b) });

            // one + two
            a = one; b = two;
            ans = a + b;
            if (!(sum10 && ans > 10)) out.push({ op, left: a, right: b, answer: ans, key: makeKey(op, a, b) });
          } else {
            // sub: normalize to left >= right
            // two - one
            let left = two, right = one;
            if (left < right) [left, right] = [right, left];
            out.push({ op, left, right, answer: left - right, key: makeKey(op, left, right) });

            // one - two
            left = one; right = two;
            if (left < right) [left, right] = [right, left];
            out.push({ op, left, right, answer: left - right, key: makeKey(op, left, right) });
          }
        }
      }
      // 重複キーを除去
      const seen = new Set();
      const uniq = [];
      for (const p of out) {
        if (seen.has(p.key)) continue;
        seen.add(p.key);
        uniq.push(p);
      }
      return uniq;
    }

    // sub の場合、bothモードで同一キーが大量に重複するため除去
    if (op === "sub") {
      const seen = new Set();
      const uniq = [];
      for (const p of out) {
        if (seen.has(p.key)) continue;
        seen.add(p.key);
        uniq.push(p);
      }
      return uniq;
    }

    return out;
  }

  function listCandidatesBySettings() {
    const m = state.settings.opmode;
    if (m === "add") return listCandidatesForOp("add");
    if (m === "sub") return listCandidatesForOp("sub");
    // mix
    const a = listCandidatesForOp("add");
    const b = listCandidatesForOp("sub");
    // 混合は両方を同じ箱に入れる
    return a.concat(b);
  }

  function weightedPick(candidates) {
    // 直前と同一キーは除外
    const filtered = candidates.filter(c => c.key !== state.prevKey);
    const pool = filtered.length ? filtered : candidates;

    let total = 0;
    const weights = new Array(pool.length);

    for (let i = 0; i < pool.length; i++) {
      const h = state.history[pool[i].key];
      const w = (h && typeof h.weight === "number") ? h.weight : 1.0;
      weights[i] = w;
      total += w;
    }

    if (total <= 0) return pool[Math.floor(Math.random() * pool.length)];

    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function formatProblem(p) {
    return `${p.left} ${opSymbol(p.op)} ${p.right}`;
  }

  function clearTimer() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }
  function syncUI() {

    // 答え表示・判定ボタン
    if (state.phase === "reveal") {
      elAnswer.classList.remove("hidden");
      elControlsReveal.classList.remove("hidden");
    } else {
      elAnswer.classList.add("hidden");
      elControlsReveal.classList.add("hidden");
    }
  }

  function startTimer() {
    clearTimer();

    state.timer = setInterval(() => {
      state.remaining -= 1;

      if (state.remaining <= 0) {
        clearTimer();
        revealAnswer();
      } else {
        elCountdown.textContent = `あと ${state.remaining} 秒`;
      }
    }, 1000);
  }

  
  function startQuestion() {
    // ★必ず最初に状態を正規化する
    clearTimer();
    state.phase = "question";
    syncUI();
  
    const candidates = listCandidatesBySettings();
    if (!candidates.length) {
      setStatus("条件に合う問題がありません。設定を見直してください");
      showSettings();
      return;
    }
  
    const p = weightedPick(candidates);
    state.current = p;
    state.prevKey = p.key;
  
    elProblem.textContent = formatProblem(p);
    elAnswer.textContent = String(p.answer);
    elAnswer.classList.add("hidden");
    elControlsReveal.classList.add("hidden");
  
    state.remaining = Number(state.settings.seconds) || 3;
    elCountdown.textContent = `あと ${state.remaining} 秒`;
  
    startTimer();
  }
  
  
  function revealAnswer() {
    clearTimer();
    state.phase = "reveal";
  
    syncUI();
  }

  function submitResult(isCorrect) {
    if (!state.current) return;
  
    state.sessionTotal += 1;
    if (isCorrect) state.sessionCorrect += 1;
  
    updateWeight(state.current.key, isCorrect);
    saveHistory();
  
    // ★ 50問終わったら終了
    if (state.sessionTotal >= 50) {
      stop();
      return;
    }
  
    startQuestion();
  }




  
  
  
  function stop() {
    clearTimer();
    state.current = null;
  
    if (state.sessionTotal > 0) {
      elResult.textContent = TEXT.result(
        state.sessionCorrect,
        state.sessionTotal
      );
      elResult.classList.remove("hidden");
      btnBackToSettings.classList.remove("hidden"); 
    }
  }



  function wireUI() {
    document.querySelectorAll(".segBtn[data-opmode]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.settings.opmode = btn.getAttribute("data-opmode");
        // 引き算のみのときは合計10まで無効
        if (state.settings.opmode === "sub") state.settings.sum10 = false;
        saveSettings();
        normalizeUIBySettings();
      });
    });

    document.querySelectorAll(".segBtn[data-range]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.settings.range = btn.getAttribute("data-range");
        saveSettings();
        normalizeUIBySettings();
      });
    });

    document.querySelectorAll(".segBtn[data-seconds]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.settings.seconds = Number(btn.getAttribute("data-seconds"));
        saveSettings();
        normalizeUIBySettings();
      });
    });

    chkSum10.addEventListener("change", () => {
      state.settings.sum10 = chkSum10.checked;
      saveSettings();
      normalizeUIBySettings();
    });

  btnStart.addEventListener("click", () => {
    saveSettings();
  
    state.sessionTotal = 0;
    state.sessionCorrect = 0;
  
    elResult.textContent = "";
    elResult.classList.add("hidden");
    btnBackToSettings.classList.add("hidden"); 
  
    showQuiz();
    startQuestion();
  });


    btnStop.addEventListener("click", stop);
    btnRevealNow.addEventListener("click", revealAnswer);
    btnCorrect.addEventListener("click", () => submitResult(true));
    btnWrong.addEventListener("click", () => submitResult(false));


    btnToSettings.addEventListener("click", () => {
      if (state.phase !== "settings") stop();
    });

    btnResetHistory.addEventListener("click", resetHistory);

    btnBackToSettings.addEventListener("click", () => {
      elResult.classList.add("hidden");
      btnBackToSettings.classList.add("hidden");
      showSettings();
    });

  }

  function init() {
    loadSettings();
    loadHistory();
    wireUI();
    normalizeUIBySettings();

    // ラベル（出題タイプ）
    document.querySelectorAll(".card .label").forEach(label => {
      if (label.textContent.trim() === "出題タイプ") {
        label.textContent = TEXT.heading_op;
      }
    });
    
    // ボタン（足し算・引き算・混合）
    document.querySelector('[data-opmode="add"]').textContent = TEXT.opmode.add;
    document.querySelector('[data-opmode="sub"]').textContent = TEXT.opmode.sub;
    document.querySelector('[data-opmode="mix"]').textContent = TEXT.opmode.mix;

    document.querySelectorAll(".card .label").forEach(label => {
      if (label.textContent.trim() === "数値範囲") {
        label.textContent = TEXT.heading_range;
      }
    });

    document.querySelector('[data-range="c2a"]').textContent = TEXT.range.c2a;
    document.querySelector('[data-range="c2b"]').textContent = TEXT.range.c2b;
    document.querySelector('[data-range="c3"]').textContent = TEXT.range.c3;

    document.querySelectorAll(".card .label").forEach(label => {
      if (label.textContent.trim() === "答え表示までの秒数") {
        label.textContent = TEXT.heading_seconds;
      }
    });
  
    // 数値範囲
    document.querySelector('[data-range="c2a"]').textContent = TEXT.range.c2a;
    document.querySelector('[data-range="c2b"]').textContent = TEXT.range.c2b;
    document.querySelector('[data-range="c3"]').textContent = TEXT.range.c3;
  
    // 秒数
    document.querySelectorAll(".segBtn[data-seconds]").forEach(btn => {
      const sec = btn.getAttribute("data-seconds");
      btn.textContent = TEXT.seconds(sec);
    });

    btnStop.textContent = TEXT.stop;
  
    btnCorrect.textContent = TEXT.correct;
    btnWrong.textContent = TEXT.wrong;
  
    setStatus("");

    showSettings();
  }

  init();
})();




























