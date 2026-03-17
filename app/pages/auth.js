import { renderShell, attachModalHandlers } from "../ui.js";
import { qs } from "../utils.js";
import { APP_CONFIG } from "../config.js";
import { exchangeOAuthCodeForToken } from "../github/auth.js";

function render({ title, message, kind = "info", actionsHtml = "" }) {
  qs("#app").innerHTML = `
    <div class="card">
      <h1>${title}</h1>
      <div id="status" class="status status-${kind}">${message}</div>
      <div class="row" style="margin-top:12px">
        <a class="btn btn-primary" href="./index.html">На главную</a>
        <a class="btn" href="./day.html">Открыть день</a>
        ${actionsHtml}
      </div>
      <div class="muted" style="margin-top:10px">
        Репозиторий: ${APP_CONFIG.github.owner}/${APP_CONFIG.github.repo}
      </div>
    </div>
  `;
}

async function main() {
  renderShell({ active: "" });
  attachModalHandlers();

  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  if (err) {
    render({
      title: "Авторизация отменена",
      message: `GitHub вернул ошибку: ${err}`,
      kind: "warn",
    });
    return;
  }

  if (!code || !state) {
    render({
      title: "Нет кода авторизации",
      message: "Откройте вход заново на главной странице.",
      kind: "warn",
    });
    return;
  }

  render({
    title: "Авторизация",
    message: "Получаю токен…",
    kind: "info",
  });

  try {
    await exchangeOAuthCodeForToken({ code, state });
    render({
      title: "Готово",
      message: "Вход выполнен. Теперь можно сохранять данные в репозиторий.",
      kind: "success",
    });
  } catch (e) {
    render({
      title: "Не удалось выполнить OAuth",
      message:
        (e && e.message ? e.message : String(e)) +
        "\n\nЕсли браузер блокирует обмен кода на токен (CORS), используйте вход по PAT: на главной нажмите «Вход» и вставьте token.",
      kind: "error",
    });
  }
}

main();

