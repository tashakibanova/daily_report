import { APP_CONFIG } from "./config.js";

export function mountGiscus(container) {
  const cfg = APP_CONFIG.giscus;
  if (!cfg?.enabled) return;
  if (!container) return;

  // Clear previous
  container.innerHTML = `
    <div class="card section">
      <h2>Комментарии</h2>
      <div id="giscusMount"></div>
      <div class="muted" style="margin-top:10px">Комментарии — GitHub Discussions (giscus).</div>
    </div>
  `;

  const mount = container.querySelector("#giscusMount");
  const script = document.createElement("script");
  script.src = "https://giscus.app/client.js";
  script.async = true;
  script.crossOrigin = "anonymous";

  script.setAttribute("data-repo", cfg.repo);
  script.setAttribute("data-repo-id", cfg.repoId);
  script.setAttribute("data-category", cfg.category);
  script.setAttribute("data-category-id", cfg.categoryId);
  script.setAttribute("data-mapping", "pathname");
  script.setAttribute("data-strict", "1");
  script.setAttribute("data-reactions-enabled", "1");
  script.setAttribute("data-emit-metadata", "0");
  script.setAttribute("data-input-position", "bottom");
  script.setAttribute("data-theme", cfg.theme || "transparent_dark");
  script.setAttribute("data-lang", cfg.lang || "ru");

  mount.appendChild(script);
}

