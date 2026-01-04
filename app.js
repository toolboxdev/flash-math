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
  const elPaused = $("paused");

  const btnToSettings = $("btnToSettings");
  const btnStart = $("btnStart");
  const btnStop = $("btnStop");
  const btnRevealNow = $("btnRevealNow");
  const btnCorrect = $("btnCorrect");
  const btnWrong = $("btnWrong");
  const btnPause = $("btnPause");
  const btnResume = $("btnResume");
  const btnResetHistory = $("btnResetHistory");

  const sum10Card = $("sum10Card");
  const chkSum10 = $("sum10");

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
    phase: "settings",   // settings | question | reveal | paused
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
    elSettings.classList.remove("hidden");
    elPaused.classList.add("hidden");
    setStatus("");
  }

  function showQuiz() {
    state.phase = "question";
    elSettings.classList.add("hidden");
    elQuiz.classList.remove("hidden");
    elPaused.classList.add("hidden");
    setStatus("");
  }

  function showPaused() {
    state.phase = "paused";
    elPaused.classList.remove("hidden");
    setStatus("停止中");
  }

  function hidePaused() {
    elPaused.classList.add("hidden");
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
    if (r === "c2a") return { aMin: 0, aMax: 9, bMin: 0, bMax: 9, mode: "both" };
    if (r === "c2b") return { aMin: 0, aMax: 18, bMin: 0, bMax: 18, mode: "both" };
    // c3: one side 10-99, the other 0-9
    return { aMin: 10, aMax: 99, bMin: 0, bMax: 9, mode: "one2digit" };
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

  function startQuestion() {
    clearTimer();

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
    state.phase = "question";

    state.timer = setInterval(() => {
      if (state.phase !== "question") return;
      state.remaining -= 1;
      if (state.remaining <= 0) {
        revealAnswer();
      } else {
        elCountdown.textContent = `あと ${state.remaining} 秒`;
      }
    }, 1000);
  }

  function revealAnswer() {
    clearTimer();
    if (!state.current) return;
    state.phase = "reveal";
    elCountdown.textContent = "";
    elAnswer.classList.remove("hidden");
    elControlsReveal.classList.remove("hidden");
  }

  function submitResult(isCorrect) {
    if (!state.current) return;
    updateWeight(state.current.key, isCorrect);
    saveHistory();
    startQuestion();
  }

function pause() {
  if (state.phase === "paused") return;

  clearTimer();
  state.phase = "paused";

  elPaused.classList.remove("hidden");
  setStatus("停止中");
}


  function resume() {
  // 停止中オーバーレイを必ず消す
  elPaused.classList.add("hidden");

  // 状態を出題中に戻す
  state.phase = "question";

  // 表示状態を正規化
  elControlsReveal.classList.add("hidden");
  elAnswer.classList.add("hidden");

  // タイマー再構築
  clearTimer();

  elCountdown.textContent =
    state.remaining > 0 ? `あと ${state.remaining} 秒` : "";

  state.timer = setInterval(() => {
    if (state.phase !== "question") return;
    state.remaining -= 1;
    if (state.remaining <= 0) {
      revealAnswer();
    } else {
      elCountdown.textContent = `あと ${state.remaining} 秒`;
    }
  }, 1000);
}


  function stop() {
    clearTimer();
    state.current = null;
    showSettings();
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
      showQuiz();
      startQuestion();
    });

    btnStop.addEventListener("click", stop);
    btnRevealNow.addEventListener("click", revealAnswer);
    btnCorrect.addEventListener("click", () => submitResult(true));
    btnWrong.addEventListener("click", () => submitResult(false));

    btnPause.addEventListener("click", pause);
    btnResume.addEventListener("click", resume);

    btnToSettings.addEventListener("click", () => {
      if (state.phase !== "settings") stop();
    });

    btnResetHistory.addEventListener("click", resetHistory);
  }

  function init() {
    loadSettings();
    loadHistory();
    wireUI();
    normalizeUIBySettings();
    showSettings();
    setStatus("準備完了");
  }

  init();
})();

