document.addEventListener("DOMContentLoaded", () => {
  const storageKey = "pomodoro-preferences";
  const workDurations = [15, 25, 35, 45];
  const breakDurations = [5, 10, 15];
  const themes = ["light", "dark", "focus"];
  const defaults = {
    workDuration: 25,
    breakDuration: 5,
    theme: "light",
    sounds: {
      start: false,
      end: true,
      tick: false,
    },
  };

  const timerDisplay = document.getElementById("timer-display");
  const modeLabel = document.getElementById("mode-label");
  const statusMessage = document.getElementById("status-message");
  const timerAnnouncement = document.getElementById("timer-announcement");
  const startButton = document.getElementById("start-button");
  const pauseButton = document.getElementById("pause-button");
  const resetButton = document.getElementById("reset-button");
  const workModeButton = document.getElementById("work-mode-button");
  const breakModeButton = document.getElementById("break-mode-button");
  const workDurationSelect = document.getElementById("work-duration");
  const breakDurationSelect = document.getElementById("break-duration");
  const themeInputs = document.querySelectorAll('input[name="theme"]');
  const startSoundInput = document.getElementById("start-sound");
  const endSoundInput = document.getElementById("end-sound");
  const tickSoundInput = document.getElementById("tick-sound");
  let audioContext;

  const state = {
    timerId: null,
    mode: "work",
    preferences: loadPreferences(),
    remainingSeconds: 0,
    lastAnnouncement: "",
    suppressNextTimerAnnouncement: false,
  };

  function normalizeBoolean(value, fallback) {
    if (value === undefined || value === null) {
      return fallback;
    }

    if (typeof value === "string") {
      if (value.toLowerCase() === "true") {
        return true;
      }

      if (value.toLowerCase() === "false") {
        return false;
      }
    }

    if (typeof value === "boolean") {
      return value;
    }

    return Boolean(value);
  }

  function loadPreferences() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      if (!stored) {
        return { ...defaults, sounds: { ...defaults.sounds } };
      }

      return {
        workDuration: workDurations.includes(Number(stored.workDuration))
          ? Number(stored.workDuration)
          : defaults.workDuration,
        breakDuration: breakDurations.includes(Number(stored.breakDuration))
          ? Number(stored.breakDuration)
          : defaults.breakDuration,
        theme: themes.includes(stored.theme) ? stored.theme : defaults.theme,
        sounds: {
          start: normalizeBoolean(stored.sounds?.start, defaults.sounds.start),
          end: normalizeBoolean(stored.sounds?.end, defaults.sounds.end),
          tick: normalizeBoolean(stored.sounds?.tick, defaults.sounds.tick),
        },
      };
    } catch (error) {
      console.error("Unable to load preferences:", error);
      return { ...defaults, sounds: { ...defaults.sounds } };
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state.preferences));
      return true;
    } catch (error) {
      console.error("Unable to save preferences:", error);
      return false;
    }
  }

  function getModeDuration(mode) {
    return (mode === "work" ? state.preferences.workDuration : state.preferences.breakDuration) * 60;
  }

  function formatTime(totalSeconds) {
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function updateDisplay() {
    timerDisplay.textContent = formatTime(state.remainingSeconds);
    modeLabel.textContent = state.mode === "work" ? "Work session" : "Break session";
    workModeButton.classList.toggle("active", state.mode === "work");
    breakModeButton.classList.toggle("active", state.mode === "break");
    announceTimerUpdate();
  }

  function setStatus(message) {
    statusMessage.textContent = message;
  }

  function announceTimerUpdate() {
    if (state.suppressNextTimerAnnouncement) {
      state.suppressNextTimerAnnouncement = false;
      return;
    }

    const minutes = Math.floor(state.remainingSeconds / 60);
    const seconds = state.remainingSeconds % 60;
    const shouldAnnounce =
      state.remainingSeconds === getModeDuration(state.mode) ||
      state.remainingSeconds % 60 === 0 ||
      state.remainingSeconds <= 10;

    if (!shouldAnnounce) {
      return;
    }

    const announcement =
      state.mode === "work"
        ? `Work session: ${minutes} minute${minutes === 1 ? "" : "s"} and ${seconds} second${seconds === 1 ? "" : "s"} remaining.`
        : `Break session: ${minutes} minute${minutes === 1 ? "" : "s"} and ${seconds} second${seconds === 1 ? "" : "s"} remaining.`;

    if (announcement === state.lastAnnouncement) {
      return;
    }

    timerAnnouncement.textContent = announcement;
    state.lastAnnouncement = announcement;
  }

  function updateButtons() {
    const running = state.timerId !== null;
    startButton.disabled = running;
    pauseButton.disabled = !running;
    workDurationSelect.disabled = running;
    breakDurationSelect.disabled = running;
    themeInputs.forEach((input) => {
      input.disabled = running;
    });
    startSoundInput.disabled = running;
    endSoundInput.disabled = running;
    tickSoundInput.disabled = running;
  }

  function syncControls() {
    workDurationSelect.value = String(state.preferences.workDuration);
    breakDurationSelect.value = String(state.preferences.breakDuration);
    startSoundInput.checked = state.preferences.sounds.start;
    endSoundInput.checked = state.preferences.sounds.end;
    tickSoundInput.checked = state.preferences.sounds.tick;
    themeInputs.forEach((input) => {
      input.checked = input.value === state.preferences.theme;
    });
    document.body.dataset.theme = state.preferences.theme;
  }

  function createTone(type, context) {
    const soundEnabled = state.preferences.sounds[type];
    if (!soundEnabled) {
      return;
    }

    const frequencies = { start: 523.25, end: 659.25, tick: 880 };
    const durations = { start: 0.12, end: 0.2, tick: 0.03 };
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequencies[type];
    gainNode.gain.value = type === "tick" ? 0.02 : 0.05;

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + durations[type]);
  }

  function playTone(type) {
    if (!state.preferences.sounds[type]) {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    if (!audioContext) {
      audioContext = new AudioContextClass();
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().then(() => createTone(type, audioContext)).catch(() => {});
      return;
    }

    createTone(type, audioContext);
  }

  function stopTimer() {
    if (state.timerId !== null) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    updateButtons();
  }

  function resetTimer() {
    stopTimer();
    state.remainingSeconds = getModeDuration(state.mode);
    state.lastAnnouncement = "";
    updateDisplay();
  }

  function completeTimer() {
    stopTimer();
    playTone("end");

    let completionMessage;
    if (state.mode === "work") {
      state.mode = "break";
      completionMessage = "Work session complete. Your break timer is ready.";
    } else {
      state.mode = "work";
      completionMessage = "Break complete. Your next work session is ready.";
    }

    setStatus(completionMessage);
    timerAnnouncement.textContent = completionMessage;
    state.lastAnnouncement = completionMessage;
    state.suppressNextTimerAnnouncement = true;
    state.remainingSeconds = getModeDuration(state.mode);
    updateDisplay();
  }

  function startTimer() {
    if (state.timerId !== null) {
      return;
    }

    playTone("start");
    setStatus(state.mode === "work" ? "Focus time started." : "Break time started.");

    state.timerId = window.setInterval(() => {
      state.remainingSeconds -= 1;

      if (state.remainingSeconds > 0) {
        playTone("tick");
        updateDisplay();
        return;
      }

      completeTimer();
    }, 1000);

    updateButtons();
  }

  function setMode(mode) {
    state.mode = mode;
    resetTimer();
    setStatus(mode === "work" ? "Work session selected." : "Break session selected.");
  }

  function updatePreferences(partialPreferences, modeToReset = null) {
    state.preferences = {
      ...state.preferences,
      ...partialPreferences,
      sounds: {
        ...state.preferences.sounds,
        ...partialPreferences.sounds,
      },
    };
    const persisted = savePreferences();
    syncControls();
    if (modeToReset && state.mode === modeToReset) {
      resetTimer();
    }
    setStatus(persisted ? "Preferences saved." : "Preferences updated for this session only.");
  }

  startButton.addEventListener("click", startTimer);
  pauseButton.addEventListener("click", () => {
    stopTimer();
    setStatus("Timer paused.");
  });
  resetButton.addEventListener("click", () => {
    resetTimer();
    setStatus("Timer reset.");
  });
  workModeButton.addEventListener("click", () => setMode("work"));
  breakModeButton.addEventListener("click", () => setMode("break"));

  workDurationSelect.addEventListener("change", () => {
    updatePreferences({ workDuration: Number(workDurationSelect.value) }, "work");
  });

  breakDurationSelect.addEventListener("change", () => {
    updatePreferences({ breakDuration: Number(breakDurationSelect.value) }, "break");
  });

  themeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) {
        updatePreferences({ theme: input.value });
      }
    });
  });

  startSoundInput.addEventListener("change", () => {
    updatePreferences({ sounds: { start: startSoundInput.checked } });
  });

  endSoundInput.addEventListener("change", () => {
    updatePreferences({ sounds: { end: endSoundInput.checked } });
  });

  tickSoundInput.addEventListener("change", () => {
    updatePreferences({ sounds: { tick: tickSoundInput.checked } });
  });

  syncControls();
  resetTimer();
  setStatus("Choose your preferred timer, theme, and sound settings.");
  updateButtons();
});
