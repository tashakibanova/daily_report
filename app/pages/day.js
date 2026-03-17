import { renderShell, attachModalHandlers, openModal, closeModal, setStatus } from "../ui.js";
import { qs, qsa, formatDateISO, parseDateISO, formatDateRu, debounce, safeJsonParse, buildWeekIdFromDateISO } from "../utils.js";
import { APP_CONFIG } from "../config.js";
import { getToken, setToken, startOAuthLogin } from "../github/auth.js";
import { GitHubClient } from "../github/api.js";
import { mountGiscus } from "../giscus.js";

const DRAFT_KEY_PREFIX = "dr.day.draft.v1.";

function parseTimeToMinutes(s) {
  const str = String(s || "").trim();
  if (!str) return 0;
  const m = /^(\d+):(\d{1,2})$/.exec(str);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(str.replace(",", "."));
  if (Number.isFinite(n)) return Math.round(n * 60);
  return 0;
}

function formatMinutesToTime(min) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${String(mm).padStart(2, "0")}`;
}

function newEmptyDay(dateISO) {
  return {
    version: 1,
    date: dateISO,
    daySummary: "",
    tomorrowFocus: "",
    tomorrowTasks: [],
    notes: "",
    areas: [],
    updatedAt: new Date().toISOString(),
    closed: false,
  };
}

function render({ dateISO, projects, model }) {
  const weekId = buildWeekIdFromDateISO(dateISO);
  qs("#app").innerHTML = `
    <div class="grid">
      <div class="col-12">
        <h1>День · ${formatDateRu(dateISO)}</h1>
        <div class="row">
          <div style="min-width:220px;flex:0 0 220px">
            <div class="muted" style="margin-bottom:6px">Дата</div>
            <input class="input" id="dateInput" type="date" value="${dateISO}" />
          </div>
          <div style="flex:1">
            <div class="muted" style="margin-bottom:6px">Итог дня</div>
            <input class="input" id="daySummary" placeholder="Коротко: что главное сделано" value="${escapeAttr(model.daySummary)}" />
          </div>
          <div style="min-width:220px;flex:0 0 220px">
            <div class="muted" style="margin-bottom:6px">Время (всего)</div>
            <input class="input" id="timeTotal" placeholder="авто" value="${escapeAttr(calcTotalTime(model))}" />
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn btn-primary" id="saveBtn" type="button">Сохранить</button>
          <button class="btn" id="closeDayBtn" type="button">Закрыть день</button>
          <a class="btn btn-ghost" href="./week.html?week=${encodeURIComponent(weekId)}">К неделе</a>
          <div style="flex:2"></div>
          <button class="btn btn-ghost" id="authBtn2" type="button">${getToken() ? "Вход: OK" : "Вход"}</button>
        </div>
        <div id="status" class="status">Черновик (автосохранение локально).</div>
      </div>

      <div class="col-8">
        <div class="card">
          <h2>Задачи по проектам</h2>
          <div class="row" style="margin-bottom:10px">
            <div style="flex:2;min-width:260px">
              <select class="select" id="projectSelect">
                <option value="">+ Добавить проект…</option>
                ${projects.map((p) => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>`).join("")}
              </select>
            </div>
            <div style="flex:1"></div>
          </div>
          <div id="areas"></div>
        </div>

        <div class="card section">
          <h2>Заметки</h2>
          <textarea class="textarea" id="notes" placeholder="Любые детали, блокеры, контекст…">${escapeHtml(model.notes || "")}</textarea>
        </div>
      </div>

      <div class="col-4">
        <div class="card">
          <h2>Планы</h2>
          <div class="section">
            <h3>Фокус завтра</h3>
            <input class="input" id="tomorrowFocus" placeholder="Главный фокус" value="${escapeAttr(model.tomorrowFocus)}" />
          </div>
          <div class="section">
            <h3>Планы на завтра</h3>
            <div class="row" style="margin-bottom:10px">
              <input class="input" id="tomorrowTaskInput" placeholder="Добавить пункт…" />
              <button class="btn" id="addTomorrowTaskBtn" type="button">Добавить</button>
            </div>
            <ul class="task-list" id="tomorrowTasks">
              ${(model.tomorrowTasks || []).map((t, i) => `<li>${escapeHtml(t)} <button class="btn btn-ghost" data-remove-tomorrow="${i}" type="button">×</button></li>`).join("")}
            </ul>
          </div>
        </div>
      </div>

      <div class="col-12" id="comments"></div>
    </div>
  `;

  renderAreas(model, projects);
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(s) {
  return escapeHtml(s).replaceAll("\n", " ");
}

function calcTotalTime(model) {
  const sum = (model.areas || []).reduce((acc, a) => acc + parseTimeToMinutes(a.time), 0);
  return sum ? formatMinutesToTime(sum) : "";
}

function calcTotalTimeMinutes(model) {
  const areasSum = (model.areas || []).reduce((acc, a) => acc + parseTimeToMinutes(a.time), 0);
  if (areasSum) return areasSum;
  return (model.areas || []).reduce((acc, a) => acc + (a.tasks || []).reduce((x, t) => x + parseTimeToMinutes(t.time), 0), 0);
}

function ensureArea(model, project, projects) {
  const existing = model.areas.find((a) => a.projectId === project.id);
  if (existing) return existing;
  const a = {
    projectId: project.id,
    name: project.name,
    time: "",
    tasks: [{ task: "", result: "", time: "" }],
  };
  model.areas.push(a);
  // stable order according to projects list
  model.areas.sort((x, y) => (projects.findIndex((p) => p.id === x.projectId) - projects.findIndex((p) => p.id === y.projectId)));
  return a;
}

function renderAreas(model, projects) {
  const root = qs("#areas");
  if (!root) return;
  if (!model.areas?.length) {
    root.innerHTML = `<div class="muted">Добавьте проект через выпадающий список выше.</div>`;
    return;
  }

  root.innerHTML = model.areas
    .map((a, ai) => {
      const trows = (a.tasks || []).map(
        (t, ti) => `
          <tr>
            <td><input class="input" data-ai="${ai}" data-ti="${ti}" data-field="task" value="${escapeAttr(t.task)}" placeholder="Задача" /></td>
            <td><input class="input" data-ai="${ai}" data-ti="${ti}" data-field="result" value="${escapeAttr(t.result)}" placeholder="Результат" /></td>
            <td style="width:120px"><input class="input" data-ai="${ai}" data-ti="${ti}" data-field="time" value="${escapeAttr(t.time)}" placeholder="0:00" /></td>
            <td class="cell-actions" style="width:90px">
              <button class="btn btn-ghost" data-add-task="${ai}" type="button">+</button>
              <button class="btn btn-ghost" data-remove-task="${ai}:${ti}" type="button">−</button>
            </td>
          </tr>
        `,
      );
      return `
        <div class="card section">
          <div class="row" style="margin-bottom:10px">
            <div style="flex:2">
              <h3 style="margin:0">${escapeHtml(a.name)}</h3>
            </div>
            <div style="flex:0 0 160px">
              <input class="input" data-ai="${ai}" data-area-time="1" value="${escapeAttr(a.time)}" placeholder="время, напр. 1:30" />
            </div>
            <div style="flex:0 0 120px;text-align:right">
              <button class="btn btn-ghost" data-remove-area="${ai}" type="button">Убрать</button>
            </div>
          </div>
          <table class="table-like">
            <thead>
              <tr>
                <th style="width:40%">Задача</th>
                <th>Результат</th>
                <th style="width:120px">Время</th>
                <th style="width:90px"></th>
              </tr>
            </thead>
            <tbody>${trows.join("")}</tbody>
          </table>
        </div>
      `;
    })
    .join("");
}

function loadLocalDraft(dateISO) {
  const raw = localStorage.getItem(DRAFT_KEY_PREFIX + dateISO);
  return safeJsonParse(raw || "null", null);
}

function saveLocalDraft(dateISO, model) {
  localStorage.setItem(DRAFT_KEY_PREFIX + dateISO, JSON.stringify({ ...model, updatedAt: new Date().toISOString() }));
}

async function loadProjects() {
  const res = await fetch("./data/projects.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`projects: HTTP ${res.status}`);
  const json = await res.json();
  return json.projects || [];
}

async function loadDayFromGitHub({ client, dateISO }) {
  const path = `data/daily_entries/${dateISO}.json`;
  const { value } = await client.getJson({ path, fallback: null });
  return value;
}

async function saveDayToGitHub({ client, dateISO, model }) {
  const path = `data/daily_entries/${dateISO}.json`;
  const existing = await client.getJson({ path, fallback: null });
  const value = { ...model, date: dateISO, updatedAt: new Date().toISOString() };
  await client.putJson({
    path,
    value,
    sha: existing.sha,
    message: `Update daily entry ${dateISO}`,
  });
  return value;
}

function compileDailyReport({ dateISO, model }) {
  const week = buildWeekIdFromDateISO(dateISO);
  const timeTotalMin = calcTotalTimeMinutes(model);
  const areas = (model.areas || []).map((a) => ({
    projectId: a.projectId,
    name: a.name,
    time: a.time || "",
    tasks: (a.tasks || [])
      .filter((t) => (t.task || "").trim() || (t.result || "").trim())
      .map((t) => ({ task: t.task || "", result: t.result || "", time: t.time || "" })),
  }));

  return {
    version: 1,
    date: dateISO,
    week,
    closedAt: new Date().toISOString(),
    daySummary: model.daySummary || "",
    tomorrowFocus: model.tomorrowFocus || "",
    tomorrowTasks: model.tomorrowTasks || [],
    notes: model.notes || "",
    timeTotal: timeTotalMin ? formatMinutesToTime(timeTotalMin) : "",
    areas,
  };
}

async function updateMetaIndex({ client, dateISO, report }) {
  const week = report.week;
  const metaPath = "data/meta/index.json";
  const existing = await client.getJson({
    path: metaPath,
    fallback: { version: 1, days: [], weeks: [], updatedAt: new Date().toISOString() },
  });

  const meta = existing.value || { version: 1, days: [], weeks: [], updatedAt: new Date().toISOString() };
  meta.days = meta.days || [];
  meta.weeks = meta.weeks || [];

  const dayRec = meta.days.find((d) => d.date === dateISO);
  const newDay = { date: dateISO, week, closed: true, timeTotal: report.timeTotal || "" };
  if (dayRec) Object.assign(dayRec, newDay);
  else meta.days.push(newDay);

  let weekRec = meta.weeks.find((w) => w.week === week);
  if (!weekRec) {
    weekRec = { week, daysClosed: 0 };
    meta.weeks.push(weekRec);
  }
  weekRec.daysClosed = meta.days.filter((d) => d.week === week && d.closed).length;

  meta.updatedAt = new Date().toISOString();
  await client.putJson({ path: metaPath, value: meta, sha: existing.sha, message: `Update meta index (${dateISO})` });
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

async function main() {
  renderShell({ active: "day" });
  attachModalHandlers();

  const url = new URL(window.location.href);
  const dateISO = url.searchParams.get("date") || formatDateISO(new Date());
  if (!parseDateISO(dateISO)) {
    window.location.assign(`./day.html?date=${encodeURIComponent(formatDateISO(new Date()))}`);
    return;
  }

  const projects = await loadProjects();
  let model = newEmptyDay(dateISO);

  const localDraft = loadLocalDraft(dateISO);
  if (localDraft) model = { ...model, ...localDraft };

  // If user is logged in, prefer server version (but keep local draft as fallback).
  const token = getToken();
  if (token) {
    try {
      const client = new GitHubClient({ token });
      const remote = await loadDayFromGitHub({ client, dateISO });
      if (remote) model = { ...model, ...remote };
    } catch {
      // ignore; stay with local
    }
  }

  render({ dateISO, projects, model });
  mountGiscus(qs("#comments"));

  qs("#authBtn2").addEventListener("click", authModal);
  qs("#dateInput").addEventListener("change", (e) => {
    const v = e.target.value;
    if (v && parseDateISO(v)) window.location.assign(`./day.html?date=${encodeURIComponent(v)}`);
  });

  const saveDraftDebounced = debounce(() => {
    collectFormIntoModel(model);
    saveLocalDraft(dateISO, model);
    setStatus("Черновик сохранён локально.", "info");
  }, 600);

  document.addEventListener("input", (e) => {
    if (e.target.closest("#app")) saveDraftDebounced();
  });

  qs("#projectSelect").addEventListener("change", (e) => {
    const pid = e.target.value;
    if (!pid) return;
    const project = projects.find((p) => p.id === pid);
    if (!project) return;
    ensureArea(model, project, projects);
    renderAreas(model, projects);
    e.target.value = "";
    saveDraftDebounced();
    qs("#timeTotal").value = calcTotalTime(model);
  });

  qs("#addTomorrowTaskBtn").addEventListener("click", () => {
    const v = qs("#tomorrowTaskInput").value.trim();
    if (!v) return;
    model.tomorrowTasks = model.tomorrowTasks || [];
    model.tomorrowTasks.push(v);
    qs("#tomorrowTaskInput").value = "";
    render({ dateISO, projects, model });
  });

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const addTask = t.getAttribute("data-add-task");
    if (addTask != null) {
      const ai = Number(addTask);
      model.areas[ai].tasks.push({ task: "", result: "", time: "" });
      renderAreas(model, projects);
      return;
    }
    const removeTask = t.getAttribute("data-remove-task");
    if (removeTask) {
      const [aiS, tiS] = removeTask.split(":");
      const ai = Number(aiS);
      const ti = Number(tiS);
      model.areas[ai].tasks.splice(ti, 1);
      if (model.areas[ai].tasks.length === 0) model.areas[ai].tasks.push({ task: "", result: "", time: "" });
      renderAreas(model, projects);
      return;
    }
    const removeArea = t.getAttribute("data-remove-area");
    if (removeArea != null) {
      const ai = Number(removeArea);
      model.areas.splice(ai, 1);
      renderAreas(model, projects);
      qs("#timeTotal").value = calcTotalTime(model);
      return;
    }
    const removeTomorrow = t.getAttribute("data-remove-tomorrow");
    if (removeTomorrow != null) {
      const i = Number(removeTomorrow);
      model.tomorrowTasks.splice(i, 1);
      render({ dateISO, projects, model });
      return;
    }
  });

  qs("#saveBtn").addEventListener("click", async () => {
    const token = getToken();
    if (!token) {
      setStatus("Нужен вход, чтобы сохранять в GitHub. Нажмите «Вход».", "warn");
      return;
    }
    collectFormIntoModel(model);
    try {
      setStatus("Сохраняю в GitHub…", "info");
      const client = new GitHubClient({ token });
      await saveDayToGitHub({ client, dateISO, model });
      saveLocalDraft(dateISO, model);
      setStatus("Сохранено в GitHub.", "success");
    } catch (e) {
      setStatus(`Ошибка сохранения: ${e?.message ? e.message : String(e)}`, "error");
    }
  });

  qs("#closeDayBtn").addEventListener("click", () => {
    (async () => {
      const token = getToken();
      if (!token) {
        setStatus("Нужен вход, чтобы закрыть день и записать отчёт в GitHub.", "warn");
        return;
      }
      collectFormIntoModel(model);
      try {
        setStatus("Закрываю день: сохраняю записи и собираю отчёт…", "info");
        const client = new GitHubClient({ token });

        await saveDayToGitHub({ client, dateISO, model });

        const report = compileDailyReport({ dateISO, model });
        const reportPath = `data/daily_reports/${dateISO}.json`;
        const existingReport = await client.getJson({ path: reportPath, fallback: null });
        await client.putJson({
          path: reportPath,
          value: report,
          sha: existingReport.sha,
          message: `Close day ${dateISO}`,
        });

        await updateMetaIndex({ client, dateISO, report });

        model.closed = true;
        saveLocalDraft(dateISO, model);
        qs("#timeTotal").value = report.timeTotal || "";
        setStatus("День закрыт. Отчёт сохранён в GitHub.", "success");
      } catch (e) {
        setStatus(`Ошибка закрытия дня: ${e?.message ? e.message : String(e)}`, "error");
      }
    })();
  });
}

function collectFormIntoModel(model) {
  model.daySummary = qs("#daySummary")?.value ?? "";
  model.tomorrowFocus = qs("#tomorrowFocus")?.value ?? "";
  model.notes = qs("#notes")?.value ?? "";
  // areas inputs
  for (const el of qsa("[data-area-time]")) {
    const ai = Number(el.getAttribute("data-ai"));
    if (!Number.isFinite(ai)) continue;
    model.areas[ai].time = el.value;
  }
  for (const el of qsa("[data-field]")) {
    const ai = Number(el.getAttribute("data-ai"));
    const ti = Number(el.getAttribute("data-ti"));
    const field = el.getAttribute("data-field");
    if (!Number.isFinite(ai) || !Number.isFinite(ti) || !field) continue;
    model.areas[ai].tasks[ti][field] = el.value;
  }
}

main();

