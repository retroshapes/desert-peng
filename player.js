(function () {
  "use strict";

  const BTN = { LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8, O: 16, X: 32, MENU: 64 };
  const DIRECTION_BUTTONS = ["LEFT", "RIGHT", "UP", "DOWN"];
  const GPIO = { SCORE_HIGH: 1, SCORE_LOW: 2, SUBMIT: 3, LEADERBOARD: 4, HARDCORE: 5 };
  const gameFrame = document.getElementById("gameFrame");
  const bootScreen = document.getElementById("bootScreen");
  const bootLabel = bootScreen.querySelector(".startbox");
  const submitModal = document.getElementById("submitModal");
  const leaderboardModal = document.getElementById("leaderboardModal");
  const systemMenuModal = document.getElementById("systemMenuModal");
  const systemMenuButton = document.getElementById("systemMenuButton");
  const scoreForm = document.getElementById("scoreForm");
  const nameInput = document.getElementById("playerName");
  const submitStatus = document.getElementById("submitStatus");
  const scoreList = document.getElementById("scoreList");
  const dpad = document.getElementById("dpad");
  let buttonState = 0;
  let dpadMask = 0;
  let dpadPointerId = null;
  let frameReady = false;
  let booted = false;
  let pendingScore = 0;
  let pendingMode = "normal";
  let leaderboardMode = "normal";

  function frameWindow() {
    try { return gameFrame.contentWindow; } catch (error) { return null; }
  }

  function writeButtons() {
    const win = frameWindow();
    if (win && win.pico8_buttons) win.pico8_buttons[0] = buttonState;
  }

  function setPressed(name, pressed) {
    document.querySelectorAll('[data-btn="' + name + '"]').forEach(function (element) {
      element.classList.toggle("is-pressed", pressed);
    });
  }

  function hapticTap() {
    if (typeof navigator.vibrate === "function") navigator.vibrate(8);
  }

  function activateAudio() {
    const win = frameWindow();
    if (!win) return;
    try {
      if (typeof win.p8_create_audio_context === "function") win.p8_create_audio_context();
      if (win.pico8_audio_context && win.pico8_audio_context.state === "suspended") {
        win.pico8_audio_context.resume().catch(function () {});
      }
    } catch (error) {}
  }

  function activeModal() {
    return document.querySelector(".game-modal.active");
  }

  function closeModals() {
    submitModal.classList.remove("active");
    leaderboardModal.classList.remove("active");
    systemMenuModal.classList.remove("active");
    submitModal.setAttribute("aria-hidden", "true");
    leaderboardModal.setAttribute("aria-hidden", "true");
    systemMenuModal.setAttribute("aria-hidden", "true");
    buttonState = 0;
    writeButtons();
  }

  function modalPress(name) {
    const modal = activeModal();
    if (!modal) return false;
    if (name === "X" || name === "MENU") closeModals();
    else if (name === "O" && modal === submitModal) scoreForm.requestSubmit();
    else if (name === "O" && modal === leaderboardModal) closeModals();
    else if (name === "UP" && modal === leaderboardModal) scoreList.scrollBy({ top: -70, behavior: "smooth" });
    else if (name === "DOWN" && modal === leaderboardModal) scoreList.scrollBy({ top: 70, behavior: "smooth" });
    return true;
  }

  function press(name) {
    activateAudio();
    setPressed(name, true);
    hapticTap();
    if (!booted) {
      boot();
      return;
    }
    if (modalPress(name)) return;
    buttonState |= BTN[name];
    writeButtons();
  }

  function release(name) {
    setPressed(name, false);
    buttonState &= ~BTN[name];
    writeButtons();
  }

  function releaseAll() {
    buttonState = 0;
    dpadMask = 0;
    dpadPointerId = null;
    document.querySelectorAll("[data-btn].is-pressed").forEach(function (element) {
      element.classList.remove("is-pressed");
    });
    writeButtons();
  }

  function bindButton(element, name) {
    element.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      press(name);
    });
    element.addEventListener("pointerup", function (event) {
      event.preventDefault();
      release(name);
    });
    element.addEventListener("pointercancel", function () { release(name); });
    element.addEventListener("contextmenu", function (event) { event.preventDefault(); });
  }

  document.querySelectorAll("[data-btn]").forEach(function (element) {
    if (!DIRECTION_BUTTONS.includes(element.dataset.btn)) {
      bindButton(element, element.dataset.btn);
    }
  });

  function directionMaskAt(clientX, clientY) {
    const rect = dpad.getBoundingClientRect();
    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;
    const x = (clientX - (rect.left + halfWidth)) / halfWidth;
    const y = (clientY - (rect.top + halfHeight)) / halfHeight;
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const deadZone = 0.16;
    const diagonalBias = 0.42;
    let mask = 0;

    if (absX < deadZone && absY < deadZone) return 0;
    if (absX >= deadZone && absX >= absY * diagonalBias) mask |= x < 0 ? BTN.LEFT : BTN.RIGHT;
    if (absY >= deadZone && absY >= absX * diagonalBias) mask |= y < 0 ? BTN.UP : BTN.DOWN;
    return mask;
  }

  function applyDpadMask(nextMask) {
    if (nextMask === dpadMask) return;
    const previousMask = dpadMask;
    dpadMask = nextMask;

    setPressed("LEFT", Boolean(nextMask & BTN.LEFT));
    setPressed("RIGHT", Boolean(nextMask & BTN.RIGHT));
    setPressed("UP", Boolean(nextMask & BTN.UP));
    setPressed("DOWN", Boolean(nextMask & BTN.DOWN));

    if (nextMask && nextMask !== previousMask) hapticTap();
    if (!booted) {
      if (nextMask) boot();
      return;
    }

    if (activeModal()) {
      buttonState &= ~(BTN.LEFT | BTN.RIGHT | BTN.UP | BTN.DOWN);
      writeButtons();
      if ((nextMask & BTN.UP) && !(previousMask & BTN.UP)) modalPress("UP");
      if ((nextMask & BTN.DOWN) && !(previousMask & BTN.DOWN)) modalPress("DOWN");
      return;
    }

    buttonState = (buttonState & ~(BTN.LEFT | BTN.RIGHT | BTN.UP | BTN.DOWN)) | nextMask;
    writeButtons();
  }

  dpad.addEventListener("pointerdown", function (event) {
    if (dpadPointerId !== null) return;
    event.preventDefault();
    activateAudio();
    dpadPointerId = event.pointerId;
    dpad.setPointerCapture(event.pointerId);
    applyDpadMask(directionMaskAt(event.clientX, event.clientY));
  });

  dpad.addEventListener("pointermove", function (event) {
    if (event.pointerId !== dpadPointerId) return;
    event.preventDefault();
    applyDpadMask(directionMaskAt(event.clientX, event.clientY));
  });

  function releaseDpad(event) {
    if (event.pointerId !== dpadPointerId) return;
    event.preventDefault();
    applyDpadMask(0);
    dpadPointerId = null;
  }

  dpad.addEventListener("pointerup", releaseDpad);
  dpad.addEventListener("pointercancel", releaseDpad);
  dpad.addEventListener("lostpointercapture", function () {
    if (dpadPointerId !== null) {
      applyDpadMask(0);
      dpadPointerId = null;
    }
  });
  dpad.addEventListener("contextmenu", function (event) { event.preventDefault(); });

  const keyMap = {
    ArrowLeft: "LEFT", ArrowRight: "RIGHT", ArrowUp: "UP", ArrowDown: "DOWN",
    x: "O", X: "O", c: "X", C: "X", Enter: "MENU", Escape: "X"
  };
  const codeMap = {
    ArrowLeft: "LEFT", ArrowRight: "RIGHT", ArrowUp: "UP", ArrowDown: "DOWN",
    KeyX: "O", KeyC: "X", Enter: "MENU", Escape: "X"
  };
  const keyboardReleaseTimers = {};

  function mappedKey(event) {
    return keyMap[event.key] || codeMap[event.code];
  }

  function handleKeyDown(event) {
    const tagName = event.target && event.target.tagName;
    if (tagName === "INPUT" || tagName === "TEXTAREA") return;
    const name = mappedKey(event);
    if (!name) return;
    event.preventDefault();
    clearTimeout(keyboardReleaseTimers[name]);
    if (!event.repeat) press(name);
  }

  function handleKeyUp(event) {
    const name = mappedKey(event);
    if (!name) return;
    event.preventDefault();
    clearTimeout(keyboardReleaseTimers[name]);
    keyboardReleaseTimers[name] = setTimeout(function () {
      release(name);
    }, 60);
  }

  function bindKeyboard(target) {
    try {
      if (target.__desertPengKeyboardBound) return;
      target.__desertPengKeyboardBound = true;
      target.addEventListener("keydown", handleKeyDown, true);
      target.addEventListener("keyup", handleKeyUp, true);
      target.addEventListener("blur", releaseAll);
    } catch (error) {}
  }

  bindKeyboard(window);

  function markFrameReady() {
    frameReady = true;
    bindKeyboard(frameWindow());
    bootScreen.disabled = false;
    bootLabel.textContent = "PRESS A / START";
  }

  gameFrame.addEventListener("load", markFrameReady);
  try {
    if (gameFrame.contentDocument && gameFrame.contentDocument.readyState === "complete") {
      markFrameReady();
    }
  } catch (error) {}

  function boot() {
    if (booted || !frameReady) return false;
    const win = frameWindow();
    if (!win || typeof win.p8_run_cart !== "function") {
      bootLabel.textContent = "LOADING CART...";
      return false;
    }
    booted = true;
    bootScreen.disabled = true;
    bootLabel.textContent = "LOADING...";
    activateAudio();
    try {
      win.p8_run_cart();
    } catch (error) {
      booted = false;
      bootScreen.disabled = false;
      bootLabel.textContent = "PRESS A / START";
      return false;
    }

    let revealTimer;
    let fallbackTimer;

    function onCartReady(event) {
      if (event.source === gameFrame.contentWindow && event.data === "desert-peng-ready") {
        revealGame();
      }
    }

    function revealGame() {
      clearInterval(revealTimer);
      clearTimeout(fallbackTimer);
      window.removeEventListener("message", onCartReady);
      bootScreen.classList.add("is-hidden");
    }

    window.addEventListener("message", onCartReady);
    revealTimer = setInterval(function () {
      const state = win.pico8_state;
      if (state && Number(state.frame_number || 0) > 1) {
        revealGame();
      }
    }, 50);
    fallbackTimer = setTimeout(function () {
      revealGame();
    }, 11000);
    return true;
  }

  bootScreen.addEventListener("click", boot);

  function getGpio() {
    const win = frameWindow();
    return win && win.pico8_gpio ? win.pico8_gpio : null;
  }

  function readMode(gpio) {
    return Number(gpio[GPIO.HARDCORE] || 0) > 0 ? "hardcore" : "normal";
  }

  function showSubmit(score, mode) {
    closeModals();
    pendingScore = score;
    pendingMode = mode;
    document.getElementById("submitScore").textContent = String(score);
    document.getElementById("submitMode").textContent = mode.toUpperCase();
    nameInput.value = localStorage.getItem("desert_peng_name") || "";
    submitStatus.textContent = "B: SAVE  A: CLOSE";
    submitModal.setAttribute("aria-hidden", "false");
    submitModal.classList.add("active");
  }

  async function loadLeaderboard(mode) {
    leaderboardMode = mode;
    document.querySelectorAll("[data-mode]").forEach(function (button) {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
    scoreList.innerHTML = '<div class="score-row"><span></span><span>LOADING...</span><span></span></div>';
    try {
      const scores = await desertPengFirebase.getScores(mode, 20);
      scoreList.textContent = "";
      if (!scores.length) {
        scoreList.innerHTML = '<div class="score-row"><span></span><span>NO SCORES YET</span><span></span></div>';
        return;
      }
      scores.forEach(function (entry, index) {
        const row = document.createElement("div");
        row.className = "score-row";
        const rank = document.createElement("span");
        rank.className = "score-rank";
        rank.textContent = "#" + (index + 1);
        const name = document.createElement("span");
        name.className = "score-name";
        name.textContent = String(entry.name || "ANON").toUpperCase();
        const value = document.createElement("span");
        value.className = "score-value";
        value.textContent = String(entry.score || 0);
        row.append(rank, name, value);
        scoreList.appendChild(row);
      });
    } catch (error) {
      scoreList.innerHTML = '<div class="score-row"><span></span><span>LOAD FAILED</span><span></span></div>';
    }
  }

  function showLeaderboard(mode) {
    closeModals();
    leaderboardModal.setAttribute("aria-hidden", "false");
    leaderboardModal.classList.add("active");
    loadLeaderboard(mode);
  }

  function showSystemMenu() {
    closeModals();
    systemMenuModal.setAttribute("aria-hidden", "false");
    systemMenuModal.classList.add("active");
  }

  systemMenuButton.addEventListener("pointerdown", hapticTap);
  systemMenuButton.addEventListener("click", showSystemMenu);
  systemMenuModal.querySelectorAll("button, a").forEach(function (button) {
    button.addEventListener("pointerdown", hapticTap);
  });
  document.querySelector("[data-system-leaderboard]").addEventListener("click", function () {
    const gpio = getGpio();
    showLeaderboard(gpio ? readMode(gpio) : "normal");
  });

  document.querySelectorAll("[data-close-modal]").forEach(function (button) {
    button.addEventListener("click", closeModals);
  });
  document.querySelectorAll("[data-mode]").forEach(function (button) {
    button.addEventListener("click", function () { loadLeaderboard(button.dataset.mode); });
  });

  scoreForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      submitStatus.textContent = "ENTER A NAME";
      nameInput.focus();
      return;
    }
    submitStatus.textContent = "SAVING...";
    try {
      await desertPengFirebase.submitScore(name, pendingScore, pendingMode);
      localStorage.setItem("desert_peng_name", name);
      submitStatus.textContent = "SAVED!";
      setTimeout(closeModals, 650);
    } catch (error) {
      submitStatus.textContent = String(error.message || "SAVE FAILED").toUpperCase();
    }
  });

  setInterval(function () {
    if (!booted || activeModal()) return;
    const gpio = getGpio();
    if (!gpio) return;
    if (Number(gpio[GPIO.SUBMIT]) === 1) {
      gpio[GPIO.SUBMIT] = 0;
      showSubmit(Number(gpio[GPIO.SCORE_HIGH] || 0) * 256 + Number(gpio[GPIO.SCORE_LOW] || 0), readMode(gpio));
    } else if (Number(gpio[GPIO.LEADERBOARD]) === 1) {
      gpio[GPIO.LEADERBOARD] = 0;
      showLeaderboard(readMode(gpio));
    }
  }, 100);

  bootScreen.disabled = true;
  desertPengFirebase.initialize().catch(function () {});
})();
