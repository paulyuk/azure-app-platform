export function renderStudioIntroStyles() {
  return `
    .studio-intro, .studio-intro::backdrop {
      --studio-intro-bg: #000000; --studio-intro-ink: #edf0f5;
      --studio-intro-button: #20232b; --studio-intro-line: #454b57;
      color-scheme: dark; background: var(--studio-intro-bg);
    }
    .studio-intro {
      position: fixed; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none;
      margin: 0; padding: 0; border: 0; color: var(--studio-intro-ink);
    }
    .studio-intro video { display: block; width: 100%; height: 100%; min-height: 0; object-fit: contain; }
    .studio-intro button {
      position: absolute; right: 16px; bottom: 16px; min-height: 32px; padding: 6px 12px;
      border: 1px solid var(--studio-intro-line); border-radius: 6px; font-size: 12px; line-height: 18px;
      background: var(--studio-intro-button); color: var(--studio-intro-ink);
    }
    .studio-intro button:hover { border-color: var(--studio-intro-ink); }
    .studio-intro button:focus-visible { outline: 2px solid var(--studio-intro-ink); outline-offset: 3px; }
    .studio-intro-notice { padding: 10px 12px; margin-bottom: 16px; border: 1px solid var(--studio-line); border-radius: 10px; color: var(--studio-muted); }
    .studio-intro-notice:empty { display: none; }
  `;
}

export function renderStudioIntro() {
  return `<dialog class="studio-intro" aria-label="Welcome to Unity Studio">
    <video muted playsinline preload="none" aria-label="Unity logo animation"></video>
    <button type="button" id="skip-studio-intro" autofocus>Skip</button>
  </dialog>`;
}

export function renderStudioIntroClientScript() {
  return `
    (() => {
      const dialog = document.querySelector(".studio-intro");
      if (!dialog) return;
      // Consume the launch marker so reload and Home do not replay the intro.
      const location = new URL(window.location.href);
      location.searchParams.delete("intro");
      history.replaceState(history.state, "", location);
      const motion = matchMedia("(prefers-reduced-motion: reduce)");
      if (motion.matches) { dialog.remove(); return; }
      const video = dialog.querySelector("video");
      const previousFocus = document.activeElement;
      const listeners = new AbortController();
      const options = { signal: listeners.signal };
      let finished = false;
      let stallTimer;
      let deadline;
      const finish = (warning = "") => {
        if (finished) return;
        finished = true;
        clearTimeout(stallTimer);
        clearTimeout(deadline);
        listeners.abort();
        video.pause();
        video.removeAttribute("src");
        video.load();
        dialog.close();
        dialog.remove();
        if (warning) {
          console.warn(warning);
          document.querySelector(".studio-intro-notice").textContent = warning;
        }
        const target = previousFocus?.isConnected && previousFocus !== document.body
          ? previousFocus : document.getElementById("new-app");
        target?.focus({ preventScroll: true });
      };
      const stalled = () => finish("The Unity intro took too long to play. You can continue below.");
      const resetStallTimer = () => {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(stalled, 5000);
      };
      dialog.querySelector("button").addEventListener("click", () => finish(), options);
      dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(); }, options);
      video.addEventListener("ended", () => finish(), options);
      video.addEventListener("error", () => finish("The Unity intro could not be loaded. You can continue below."), options);
      let lastTime = 0;
      video.addEventListener("timeupdate", () => {
        if (video.currentTime > lastTime) { lastTime = video.currentTime; resetStallTimer(); }
      }, options);
      motion.addEventListener("change", (event) => { if (event.matches) finish(); }, options);
      dialog.showModal();
      dialog.querySelector("button").focus();
      video.muted = true;
      video.src = "/assets/unity-intro.mp4";
      resetStallTimer();
      deadline = setTimeout(stalled, 18000);
      video.play().catch(() => finish("Your browser could not play the Unity intro automatically. You can continue below."));
    })();
  `;
}
