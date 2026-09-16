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

  const audioContext =
    typeof window.AudioContext !== "undefined"
      ? new window.AudioContext()
      : typeof window.webkitAudioContext !== "undefined"
        ? new window.webkitAudioContext()
        : null;

  const state = {
    timerId: null,
    mode: "work",
    preferences: loadPreferences(),
    remainingSeconds: 0,
  };

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
          start: Boolean(stored.sounds?.start),
          end: stored.sounds?.end ?? defaults.sounds.end,
          tick: Boolean(stored.sounds?.tick),
        },
      };
    } catch (error) {
      console.error("Unable to load preferences:", error);
      return { ...defaults, sounds: { ...defaults.sounds } };
    }
  }

  function savePreferences() {
    localStorage.setItem(storageKey, JSON.stringify(state.preferences));
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
  }

  function setStatus(message) {
    statusMessage.textContent = message;
  }

  function updateButtons() {
    const running = state.timerId !== null;
    startButton.disabled = running;
    pauseButton.disabled = !running;
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

  function playTone(type) {
    if (!audioContext) {
      return;
    }

    const soundEnabled = state.preferences.sounds[type];
    if (!soundEnabled) {
      return;
    }

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    const frequencies = { start: 523.25, end: 659.25, tick: 880 };
    const durations = { start: 0.12, end: 0.2, tick: 0.03 };
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequencies[type];
    gainNode.gain.value = type === "tick" ? 0.02 : 0.05;

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + durations[type]);
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
    updateDisplay();
  }

  function completeTimer() {
    stopTimer();
    playTone("end");

    if (state.mode === "work") {
      state.mode = "break";
      setStatus("Work session complete. Your break timer is ready.");
    } else {
      state.mode = "work";
      setStatus("Break complete. Your next work session is ready.");
    }

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

  function updatePreferences(partialPreferences) {
    state.preferences = {
      ...state.preferences,
      ...partialPreferences,
      sounds: {
        ...state.preferences.sounds,
        ...partialPreferences.sounds,
      },
    };
    savePreferences();
    syncControls();
    resetTimer();
    setStatus("Preferences saved.");
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
    updatePreferences({ workDuration: Number(workDurationSelect.value) });
  });

  breakDurationSelect.addEventListener("change", () => {
    updatePreferences({ breakDuration: Number(breakDurationSelect.value) });
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
