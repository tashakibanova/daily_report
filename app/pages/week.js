import { renderShell, attachModalHandlers, openModal, closeModal, setStatus } from "../ui.js";
import { qs, formatDateISO, buildWeekIdFromDateISO, safeJsonParse } from "../utils.js";
import { APP_CONFIG } from "../config.js";
import { getToken, setToken, startOAuthLogin } from "../github/auth.js";
import { GitHubClient } from "../github/api.js";
import { mountGiscus } from "../giscus.js";

function parseTimeToMinutes(s) {
  const str = String(s || "").trim();
  if (!str) return 0;
  const m = /^(\d+):(\d{1,2})$/.exec(str);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return 0;
}

function formatMinutesToTime(min) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${String(mm).padStart(2, "0")}`;
}

async function loadStaticJson(path, fallback) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

async function loadMeta({ client }) {
  if (client) {
    const { value } = await client.getJson({ path: "data/meta/index.json", fallback: { days: [], weeks: [], version: 1 } });
    return value;
  }
  return await loadStaticJson("./data/meta/index.json", { days: [], weeks: [], version: 1 });
}

async function loadWeeklyReport({ client, week }) {
  if (!client) return null;
  const { value } = await client.getJson({ path: `data/weekly_reports/${week}.json`, fallback: null });
  return value;
}

async function saveWeeklyReport({ client, week, report }) {
  const path = `data/weekly_reports/${week}.json`;
  const existing = await client.getJson({ path, fallback: null });
  await client.putJson({ path, value: report, sha: existing.sha, message: `Update weekly report ${week}` });
}

async function loadDailyReport({ client, dateISO }) {
  const path = `data/daily_reports/${dateISO}.json`;
  const { value } = await client.getJson({ path, fallback: null });
  return value;
}

function compileWeek({ week, dailyReports }) {
  const byProject = new Map(); // key -> {name, minutes}
  let totalMin = 0;
  for (const r of dailyReports) {
    if (!r) continue;
    totalMin += parseTimeToMinutes(r.timeTotal);
    for (const a of r.areas || []) {
      const key = a.projectId || a.name;
      const rec = byProject.get(key) || { key, name: a.name || key, minutes: 0 };
      rec.minutes += parseTimeToMinutes(a.time);
      byProject.set(key, rec);
    }
  }
  const areas = Array.from(byProject.values())
    .sort((a, b) => b.minutes - a.minutes)
    .map((x) => ({ key: x.key, name: x.name, time: x.minutes ? formatMinutesToTime(x.minutes) : "" }));

  return {
    version: 1,
    week,
    updatedAt: new Date().toISOString(),
    timeTotal: totalMin ? formatMinutesToTime(totalMin) : "",
    areas,
  };
}

function authModal() {
  const oauthEnabled = Boolean(APP_CONFIG.github?.oauth?.enabled);
  openModal({
    title: "Вход (для сохранения)",
    bodyHtml: `
      ${
        oauthEnabled
          ? `
        <div class="row" style="margin-bottom:12px">
          <button class="btn btn-primary" id="oauthLoginBtn" type="button">Войти через GitHub</button>
          <div class="muted" style="flex:2">Если OAuth не сработает — используйте token ниже.</div>
        </div>
      `
          : ""
      }
      <div class="card">
        <div class="muted" style="margin-bottom:6px">GitHub token</div>
        <input class="input" id="tokenInput" placeholder="github_pat_..." />
        <label class="muted" style="display:block;margin-top:8px">
          <input type="checkbox" id="persistToken" />
          Запомнить на этом устройстве
        </label>
        <div class="row" style="margin-top:12px;justify-content:flex-end">
          <button class="btn" id="logoutBtn" type="button">Выйти</button>
          <button class="btn btn-primary" id="saveTokenBtn" type="button">Сохранить</button>
        </div>
      </div>
    `,
  });

  qs("#tokenInput").value = getToken();
  const oauthBtn = qs("#oauthLoginBtn");
  if (oauthBtn) oauthBtn.addEventListener("click", () => startOAuthLogin());
  qs("#logoutBtn").addEventListener("click", () => {
    setToken("", false);
    closeModal();
  });
  qs("#saveTokenBtn").addEventListener("click", () => {
    setToken(qs("#tokenInput").value.trim(), qs("#persistToken").checked);
    closeModal();
  });
}

function render({ week, compiled, weekly, days }) {
  qs("#app").innerHTML = `
    <div class="grid">
      <div class="col-12">
        <h1>Неделя · ${week}</h1>
        <div class="row">
          <input class="input" id="weekInput" value="${week}" style="max-width:220px" />
          <button class="btn" id="openWeekBtn" type="button">Открыть</button>
          <div style="flex:2"></div>
          <button class="btn btn-ghost" id="authBtn2" type="button">${getToken() ? "Вход: OK" : "Вход"}</button>
        </div>
        <div id="status" class="status">Данные собраны из закрытых дней недели.</div>
      </div>

      <div class="col-8">
        <div class="card">
          <h2>Итоги недели</h2>
          <textarea class="textarea" id="weekSummary" placeholder="Коротко: что главное сделано">${escapeHtml(weekly.weekSummary || "")}</textarea>
          <h2>Фокус следующей недели</h2>
          <textarea class="textarea" id="nextWeekFocus" placeholder="Главный фокус">${escapeHtml(weekly.nextWeekFocus || "")}</textarea>
          <div class="row" style="margin-top:12px;justify-content:flex-end">
            <button class="btn btn-primary" id="saveWeekBtn" type="button">Сохранить неделю</button>
          </div>
        </div>

        <div class="card section">
          <h2>Закрытые дни</h2>
          <table class="table-like">
            <thead><tr><th>Дата</th><th style="width:120px">Время</th><th style="width:120px"></th></tr></thead>
            <tbody>
              ${days.length === 0 ? `<tr><td colspan="3" class="muted">Нет закрытых дней в этой неделе.</td></tr>` : ""}
              ${days
                .slice()
                .sort((a, b) => (a.date < b.date ? 1 : -1))
                .map(
                  (d) => `
                    <tr>
                      <td>${d.date}</td>
                      <td>${d.timeTotal || "—"}</td>
                      <td><a class="btn btn-ghost" href="./day.html?date=${encodeURIComponent(d.date)}">Открыть день</a></td>
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
          <h2>Время</h2>
          <div class="kpi">
            <div class="card" style="flex:1">
              <div class="label">Время (всего)</div>
              <div class="value">${compiled.timeTotal || "—"}</div>
            </div>
          </div>
          <div class="section">
            <h3>По направлениям</h3>
            <table class="table-like">
              <thead><tr><th>Направление</th><th style="width:110px">Время</th></tr></thead>
              <tbody>
                ${compiled.areas.length === 0 ? `<tr><td colspan="2" class="muted">—</td></tr>` : ""}
                ${compiled.areas.map((a) => `<tr><td>${escapeHtml(a.name)}</td><td>${a.time || "—"}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="col-12" id="comments"></div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function main() {
  renderShell({ active: "week" });
  attachModalHandlers();

  const url = new URL(window.location.href);
  const weekParam = url.searchParams.get("week");
  const week = weekParam || buildWeekIdFromDateISO(formatDateISO(new Date()));

  const token = getToken();
  const client = token ? new GitHubClient({ token }) : null;

  const meta = await loadMeta({ client });
  const days = (meta.days || []).filter((d) => d.week === week && d.closed);

  let dailyReports = [];
  if (client) {
    dailyReports = await Promise.all(days.map((d) => loadDailyReport({ client, dateISO: d.date })));
  }

  const compiled = compileWeek({ week, dailyReports });
  const existingWeekly = (client ? await loadWeeklyReport({ client, week }) : null) || {};

  const weekly = {
    week,
    weekSummary: existingWeekly.weekSummary || "",
    nextWeekFocus: existingWeekly.nextWeekFocus || "",
  };

  render({ week, compiled, weekly, days });
  mountGiscus(qs("#comments"));

  qs("#authBtn2").addEventListener("click", authModal);
  qs("#openWeekBtn").addEventListener("click", () => {
    const w = qs("#weekInput").value.trim();
    if (w) window.location.assign(`./week.html?week=${encodeURIComponent(w)}`);
  });

  qs("#saveWeekBtn").addEventListener("click", async () => {
    const token = getToken();
    if (!token) {
      setStatus("Нужен вход, чтобы сохранять неделю в GitHub.", "warn");
      return;
    }
    try {
      setStatus("Сохраняю неделю…", "info");
      const client = new GitHubClient({ token });
      await saveWeeklyReport({
        client,
        week,
        report: {
          ...compiled,
          weekSummary: qs("#weekSummary").value,
          nextWeekFocus: qs("#nextWeekFocus").value,
        },
      });
      setStatus("Недельный отчёт сохранён в GitHub.", "success");
    } catch (e) {
      setStatus(`Ошибка сохранения недели: ${e?.message ? e.message : String(e)}`, "error");
    }
  });
}

main();

