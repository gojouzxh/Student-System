/**
 * js/utils/NotificationManager.js
 *
 * Provides accessible, user-friendly notification banners for the app.
 * Strips technical stack traces and presents clear, human-readable guidance.
 */

import { AppError } from "../errors/AppErrors.js";

class NotificationManager {
  #container = null;
  #timer = null;

  init() {
    this.#container = document.getElementById("msg");
    if (!this.#container) {
      this.#container = document.createElement("div");
      this.#container.id = "msg";
      this.#container.setAttribute("role", "status");
      this.#container.setAttribute("aria-live", "polite");
      document.body.prepend(this.#container);
    }
  }

  /**
   * Show a notification message.
   * @param {string} message - User-facing text
   * @param {"info"|"success"|"warning"|"error"} [type="info"]
   * @param {number} [duration=6000] - Auto-hide duration in ms (0 to persist)
   */
  show(message, type = "info", duration = 6000) {
    if (!this.#container) this.init();
    if (this.#timer) clearTimeout(this.#timer);

    this.#container.className = `notification notification--${type}`;
    this.#container.setAttribute("role", type === "error" ? "alert" : "status");
    this.#container.innerHTML = `
      <div class="notification__content">
        <span class="notification__icon">${this.#iconFor(type)}</span>
        <span class="notification__text">${this.#escapeHtml(message)}</span>
      </div>
      <button type="button" class="notification__close" aria-label="Dismiss">&times;</button>
    `;

    const closeBtn = this.#container.querySelector(".notification__close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.clear());
    }

    if (duration > 0) {
      this.#timer = setTimeout(() => this.clear(), duration);
    }
  }

  /**
   * Formats an error safely without stack traces.
   * @param {Error|AppError|string} error
   */
  showError(error) {
    let message = "An unexpected error occurred. Please try again.";
    if (typeof error === "string") {
      message = error;
    } else if (error instanceof AppError) {
      message = error.message;
    }
    this.show(message, "error", 8000);
  }

  showSuccess(message) {
    this.show(message, "success", 4000);
  }

  clear() {
    if (this.#timer) clearTimeout(this.#timer);
    if (this.#container) {
      this.#container.className = "";
      this.#container.innerHTML = "";
    }
  }

  #iconFor(type) {
    switch (type) {
      case "success": return "✓";
      case "error": return "⚠";
      case "warning": return "⚡";
      default: return "ℹ";
    }
  }

  #escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}

export const notifications = new NotificationManager();
