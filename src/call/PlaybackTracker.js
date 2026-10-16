// ============================================================
// PLAYBACK TRACKER
// TTS finishing generation != caller finished hearing it.
// Exotel echoes our "mark" when playback actually ends; this
// class lets the call wait for that moment (with a timeout).
// ============================================================

export default class PlaybackTracker {
  constructor() {
    this.finished = true;
    this.pending = null; // { resolve, timer }
  }

  // New audio is about to be played.
  begin() {
    this.finished = false;
  }

  // Exotel confirmed playback ended (or we interrupted it).
  complete() {
    this.finished = true;
    this.release();
  }

  // Wake up whoever is waiting, without marking playback done.
  release() {
    const pending = this.pending;
    if (!pending) return;

    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve();
  }

  wait(timeoutMs, onTimeout) {
    if (this.finished) {
      return Promise.resolve();
    }

    // Only one waiter at a time.
    this.release();

    return new Promise((resolve) => {
      const entry = { resolve };

      // Timeout only resolves THIS wait, never a newer one.
      entry.timer = setTimeout(() => {
        if (this.pending !== entry) return;
        this.pending = null;
        onTimeout?.();
        resolve();
      }, timeoutMs);

      this.pending = entry;
    });
  }
}
