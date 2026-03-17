import { renderShell, attachModalHandlers, openModal, closeModal } from "../ui.js";
import { qs, formatDateRu, formatDateISO, safeJsonParse } from "../utils.js";
import { APP_CONFIG } from "../config.js";
import { getToken, setToken, startOAuthLogin } from "../github/auth.js";
import { GitHubClient } from "../github/api.js";

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function authModal() {
  const oauthEnabled = Boolean(APP_CONFIG.github?.oauth?.enabled);
  openModal({
    title: "Вход (для сохранения в GitHub)",
    bodyHtml: `
      <div class="muted" style="margin-bottom:10px">
        Для записи данных в репозиторий нужен токен. Самый надёжный способ на GitHub Pages — вставить fine-grained PAT.
      </div>
      <div class="card">
        ${
          oauthEnabled
            ? `
          <div class="row" style="margin-bottom:12px">
            <button class="btn btn-primary" id="oauthLoginBtn" type="button">Войти через GitHub</button>
            <div class="muted" style="flex:2">
              Если OAuth не сработает (ограничения браузера), используйте token ниже.
            </div>
          </div>
        `
            : ""
        }
        <div class="row" style="gap:12px;align-items:flex-start">
          <div style="flex:1">
            <div class="muted" style="margin-bottom:6px">GitHub token</div>
            <input class="input" id="tokenInput" placeholder="ghp_... или github_pat_..." />
            <label class="muted" style="display:block;margin-top:8px">
              <input type="checkbox" id="persistToken" />
              Запомнить на этом устройстве
            </label>
          </div>
        </div>
        <div class="row" style="margin-top:12px;justify-content:flex-end">
          <button class="btn" id="logoutBtn" type="button">Выйти</button>
          <button class="btn btn-primary" id="saveTokenBtn" type="button">Сохранить</button>
        </div>
        <div class="muted" style="margin-top:10px">
          Токен хранится только в вашем браузере. Для приватного репозитория нужен доступ на запись.\n
        </div>
      </div>
    `,
  });

  const tokenInput = qs("#tokenInput");
  tokenInput.value = getToken();

  const oauthBtn = qs("#oauthLoginBtn");
  if (oauthBtn) {
    oauthBtn.addEventListener("click", async () => {
      try {
        await startOAuthLogin();
      } catch (e) {
        alert(e?.message ? e.message : String(e));
      }
    });
  }

  qs("#logoutBtn").addEventListener("click", () => {
    setToken("", false);
    closeModal();
    updateAuthBtn();
  });
  qs("#saveTokenBtn").addEventListener("click", () => {
    const token = tokenInput.value.trim();
    const persist = qs("#persistToken").checked;
    setToken(token, persist);
    closeModal();
    updateAuthBtn();
  });
}

function updateAuthBtn() {
  const btn = qs("#authBtn");
  const token = getToken();
  btn.textContent = token ? "Вход: OK" : "Вход";
}

function renderHome({ meta }) {
  const today = formatDateISO(new Date());
  qs("#app").innerHTML = `
    <div class="grid">
      <div class="col-12">
        <h1>Отчёты</h1>
        <div class="row">
          <a class="btn btn-primary" href="./day.html?date=${encodeURIComponent(today)}">Открыть сегодня</a>
          <a class="btn" href="./week.html">Открыть неделю</a>
        </div>
        <div id="status" class="status">Готово.</div>
      </div>

      <div class="col-8">
        <div class="card">
          <h2>Последние дни</h2>
          <table class="table-like">
            <thead>
              <tr>
                <th style="width:160px">Дата</th>
                <th>Статус</th>
                <th style="width:160px">Время</th>
              </tr>
            </thead>
            <tbody>
              ${meta.days.length === 0 ? `<tr><td colspan="3" class="muted">Пока нет данных. Откройте день и начните заполнять.</td></tr>` : ""}
              ${meta.days
                .slice()
                .sort((a, b) => (a.date < b.date ? 1 : -1))
                .slice(0, 30)
                .map(
                  (d) => `
                    <tr>
                      <td><a href="./day.html?date=${encodeURIComponent(d.date)}">${formatDateRu(d.date)}</a></td>
                      <td>${d.closed ? "Закрыт" : "Черновик"}</td>
                      <td>${d.timeTotal || "—"}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div class="col-4">
        <div class="card">
          <h2>Недельные итоги</h2>
          <table class="table-like">
            <thead>
              <tr>
                <th>Неделя</th>
                <th style="width:90px">Дней</th>
              </tr>
            </thead>
            <tbody>
              ${meta.weeks.length === 0 ? `<tr><td colspan="2" class="muted">Пока нет недель.</td></tr>` : ""}
              ${meta.weeks
                .slice()
                .sort((a, b) => (a.week < b.week ? 1 : -1))
                .slice(0, 20)
                .map(
                  (w) => `
                    <tr>
                      <td><a href="./week.html?week=${encodeURIComponent(w.week)}">${w.week}</a></td>
                      <td>${w.daysClosed ?? "—"}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
          <div class="muted" style="margin-top:10px">
            Данные берутся из <code>data/meta/index.json</code>.
          </div>
        </div>

        <div class="card section">
          <h2>Репозиторий</h2>
          <div class="muted">
            ${APP_CONFIG.github.owner}/${APP_CONFIG.github.repo} · ветка ${APP_CONFIG.github.branch}
          </div>
        </div>
      </div>
    </div>
  `;
}

async function main() {
  renderShell({ active: "home" });
  attachModalHandlers();
  qs("#authBtn").addEventListener("click", authModal);
  updateAuthBtn();

  let meta = null;
  const token = getToken();
  if (token) {
    try {
      const client = new GitHubClient({ token });
      const { value } = await client.getJson({
        path: "data/meta/index.json",
        fallback: { days: [], weeks: [], version: 1, updatedAt: new Date().toISOString() },
      });
      meta = value;
    } catch {
      // fallback to static
    }
  }
  if (!meta) {
    try {
      meta = await fetchJson("./data/meta/index.json");
    } catch {
      meta = safeJsonParse("{}", { days: [], weeks: [], version: 1, updatedAt: new Date().toISOString() });
    }
  }

  renderHome({ meta });
}

main();

