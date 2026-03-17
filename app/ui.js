import { qs, escapeHtml } from "./utils.js";
import { APP_CONFIG } from "./config.js";

export function renderShell({ active }) {
  document.body.innerHTML = `
    <header class="site-header">
      <div class="container">
        <div class="site-title">
          <a href="./index.html">${escapeHtml(APP_CONFIG.title || "Daily Report")}</a>
        </div>
        <nav class="site-nav">
          <a class="${active === "home" ? "active" : ""}" href="./index.html">Отчёты</a>
          <a class="${active === "day" ? "active" : ""}" href="./day.html">День</a>
          <a class="${active === "week" ? "active" : ""}" href="./week.html">Неделя</a>
        </nav>
        <div class="site-actions">
          <button class="btn btn-ghost" id="authBtn" type="button">Вход</button>
        </div>
      </div>
    </header>
    <main class="container">
      <div id="app"></div>
    </main>
    <footer class="site-footer">
      <div class="container">
        <span class="muted">GitHub Pages · данные сохраняются в репозиторий</span>
      </div>
    </footer>
    <div class="modal-backdrop hidden" id="modalBackdrop" aria-hidden="true"></div>
    <div class="modal hidden" id="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title" id="modalTitle"></div>
          <button class="btn btn-ghost" id="modalClose" type="button">Закрыть</button>
        </div>
        <div class="modal-body" id="modalBody"></div>
      </div>
    </div>
  `;
}

export function setStatus(text, kind = "info") {
  const root = qs("#status");
  if (!root) return;
  root.className = `status status-${kind}`;
  root.textContent = text;
}

export function openModal({ title, bodyHtml }) {
  const backdrop = qs("#modalBackdrop");
  const modal = qs("#modal");
  qs("#modalTitle").textContent = title;
  qs("#modalBody").innerHTML = bodyHtml;
  backdrop.classList.remove("hidden");
  modal.classList.remove("hidden");
  backdrop.setAttribute("aria-hidden", "false");
}

export function closeModal() {
  const backdrop = qs("#modalBackdrop");
  const modal = qs("#modal");
  backdrop.classList.add("hidden");
  modal.classList.add("hidden");
  backdrop.setAttribute("aria-hidden", "true");
  qs("#modalBody").innerHTML = "";
}

export function attachModalHandlers() {
  qs("#modalClose")?.addEventListener("click", closeModal);
  qs("#modalBackdrop")?.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

