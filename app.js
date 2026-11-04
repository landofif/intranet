// KZN home-screen app: talks only to the Cloudflare Worker (see worker/).
const $ = (s) => document.querySelector(s);
const main = $('#main');
const DAY_MS = 864e5;
const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const LISTS = { absences: 'Absenzen', exams: 'Prüfungen', homework: 'Hausaufgaben' };
const BADGES = { cancel: 'Ausfall', rmchg: 'Zimmerwechsel' };
const THEMES = { auto: 'Automatisch', light: 'Hell', dark: 'Dunkel' };
const THEME_COLORS = { light: '#f4f5f8', dark: '#111318' };

// Browser storage can throw (private mode, blocked site data); fall back to null.
function loadConfig() {
  try { return JSON.parse(localStorage.getItem('kzn-config')); } catch { return null; }
}
function saveConfig(c) {
  try { localStorage.setItem('kzn-config', JSON.stringify(c)); } catch {}
}
function loadTheme() {
  try { return localStorage.getItem('kzn-theme') || 'auto'; } catch { return 'auto'; }
}
function saveTheme(t) {
  try { localStorage.setItem('kzn-theme', t); } catch {}
}
function applyTheme(t) {
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  // The status bar color follows these, each tagged light or dark for the device setting.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.content = THEME_COLORS[t] ?? THEME_COLORS[m.media.includes('dark') ? 'dark' : 'light'];
  });
}

let config = loadConfig();
let view = 'timetable';
const weeks = new Map(); // week start (ms) -> lessons

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

async function api(path) {
  const res = await fetch(config.url.replace(/\/$/, '') + path, {
    headers: { authorization: `Bearer ${config.key}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Fehler ${res.status}`);
  return body;
}

function render(html) {
  main.innerHTML = html;
  main.style.animation = 'none';
  void main.offsetWidth; // restart the fade-in
  main.style.animation = '';
}

function showError(e) {
  render(`<div class="error">${esc(e.message)}</div>`);
}

function setHeader(title, arrows) {
  $('#title').textContent = title;
  $('#prev').classList.toggle('hidden', !arrows);
  $('#next').classList.toggle('hidden', !arrows);
  if (!arrows) $('#days').innerHTML = '';
}

// ---- timetable ----

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const monday = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function weekNumber(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7)));
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round((t - firstThursday) / DAY_MS / 7);
}

// Open on today, or on next Monday at the weekend.
let selected = startOfDay(new Date());
if (selected.getDay() === 6) selected = new Date(selected.getTime() + 2 * DAY_MS);
if (selected.getDay() === 0) selected = new Date(selected.getTime() + DAY_MS);

function moveDay(step) {
  const lessons = weeks.get(monday(selected).getTime()) || [];
  const hasWeekend = (d) => lessons.some((l) => l.date === isoDate(d));
  let d = selected;
  do d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step);
  while (d.getDay() % 6 === 0 && !hasWeekend(d)); // skip empty Sat/Sun
  selected = d;
  showTimetable();
}

function moveWeek(step) {
  selected = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + 7 * step);
  showTimetable();
}

async function showTimetable() {
  const start = monday(selected);
  setHeader(`KW ${weekNumber(start)}`, true);
  let lessons = weeks.get(start.getTime());
  renderDays(start, lessons || []);
  if (!lessons) {
    render('<div class="empty">Lädt …</div>');
    try {
      const to = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7).getTime() - 1;
      lessons = (await api(`/timetable?from=${start.getTime()}&to=${to}`)).lessons;
      weeks.set(start.getTime(), lessons);
    } catch (e) {
      return showError(e);
    }
    if (view !== 'timetable' || monday(selected).getTime() !== start.getTime()) return;
    renderDays(start, lessons);
  }
  renderDay(lessons.filter((l) => l.date === isoDate(selected)));
}

function renderDays(start, lessons) {
  const today = isoDate(new Date());
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = isoDate(d);
    if (i >= 5 && !lessons.some((l) => l.date === iso)) continue;
    const cls = [iso === today && 'today', iso === isoDate(selected) && 'active'].filter(Boolean).join(' ');
    html += `<button class="${cls}" data-day="${iso}">${DAYS[i]}<b>${d.getDate()}</b></button>`;
  }
  $('#days').innerHTML = html;
}

function renderDay(lessons) {
  if (!lessons.length) return render('<div class="empty">Keine Lektionen</div>');
  const now = new Date();
  const nowIso = isoDate(now);
  const nowTime = now.toTimeString().slice(0, 5);
  render(
    lessons
      .map((l) => {
        const isNow = l.date === nowIso && l.start <= nowTime && nowTime < l.end && l.type !== 'cancel';
        const badge = l.type === 'lesson' ? '' : `<span class="badge">${esc(BADGES[l.type] || l.type)}</span>`;
        const room = l.type === 'rmchg' ? `<span class="changed">${esc(l.room)}</span>` : esc(l.room);
        return `<div class="card lesson ${esc(l.type)}${isNow ? ' now' : ''}">
          <div class="time"><b>${l.start}</b>${l.end}</div>
          <div class="what">
            <div class="subject">${esc(l.subject)}</div>
            <div class="meta">${room}${l.teacher ? ' · ' + esc(l.teacher) : ''}${l.message ? ' · ' + esc(l.message) : ''}</div>
          </div>${badge}
        </div>`;
      })
      .join(''),
  );
}

// ---- grades ----

async function showGrades() {
  setHeader('Noten', false);
  render('<div class="empty">Lädt …</div>');
  let data;
  try {
    data = await api('/grades');
  } catch (e) {
    return showError(e);
  }
  if (view !== 'grades') return;
  const courses = data.courses
    .map((c) => {
      const avg = c.average == null
        ? '<span class="avg none">–</span>'
        : `<span class="avg${c.average < 4 ? ' low' : ''}">${c.average.toFixed(2)}</span>`;
      const grades = c.grades
        .map((g) => `<div class="grade${g.struck ? ' struck' : ''}">
            <span class="t">${esc(g.title)} <span class="d">${esc(g.date.split('-').reverse().join('.'))} · ×${esc(+g.weight)}</span></span>
            <span class="v">${esc(g.value ?? '–')}</span></div>`)
        .join('');
      const summary = c.summary
        .filter((s) => s.title !== 'Schnitt' && s.value != null)
        .map((s) => `<div class="grade"><span class="t">${esc(s.title)}</span><span class="v">${esc(s.value)}</span></div>`)
        .join('');
      return `<details class="card course"><summary><span class="name">${esc(c.name)}</span>${avg}</summary>${grades || '<div class="grade"><span class="t d">Noch keine Noten</span></div>'}${summary}</details>`;
    })
    .join('');
  render(`<div class="section">${esc(data.period)}</div>${courses || '<div class="empty">Keine Kurse</div>'}`);
}

// ---- lists: absences, exams, homework ----

async function showList(name) {
  setHeader(LISTS[name], false);
  render('<div class="empty">Lädt …</div>');
  let data;
  try {
    data = await api(`/list/${name}`);
  } catch (e) {
    return showError(e);
  }
  if (view !== name) return;
  if (!data.rows.length) return render('<div class="empty">Keine Einträge</div>');
  const [first, ...rest] = data.columns;
  render(
    data.rows
      .map((r) => `<div class="card"><div class="row-title">${esc(r[first.field])}</div>${rest
        .filter((c) => r[c.field])
        .map((c) => `<div class="row-line">${esc(c.title)}: <span>${esc(r[c.field])}</span></div>`)
        .join('')}</div>`)
      .join(''),
  );
}

// ---- settings ----

function showSettings() {
  setHeader('Einstellungen', false);
  render(`<form id="cfg">
    <label for="url">Worker-URL</label>
    <input id="url" type="url" required placeholder="https://kzn-intranet.….workers.dev" value="${esc(config?.url)}">
    <label for="key">App-Schlüssel</label>
    <input id="key" type="password" required autocomplete="off" value="${esc(config?.key)}">
    <button class="save">Speichern</button>
    <label id="theme-label">Darstellung</label>
    <div class="theme" role="group" aria-labelledby="theme-label">${Object.entries(THEMES)
      .map(([t, name]) => `<button type="button" data-theme-choice="${t}">${name}</button>`)
      .join('')}</div>
  </form>`);
  const choices = main.querySelectorAll('[data-theme-choice]');
  const markTheme = (t) => choices.forEach((b) => {
    b.classList.toggle('active', b.dataset.themeChoice === t);
    b.setAttribute('aria-pressed', b.dataset.themeChoice === t);
  });
  markTheme(loadTheme());
  choices.forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.themeChoice;
    saveTheme(t);
    applyTheme(t);
    markTheme(t);
  }));
  $('#cfg').addEventListener('submit', (e) => {
    e.preventDefault();
    config = { url: $('#url').value.trim(), key: $('#key').value.trim() };
    saveConfig(config);
    weeks.clear();
    show('timetable');
  });
}

// ---- navigation ----

function show(v) {
  if (!config && v !== 'settings') v = 'settings';
  view = v;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'timetable') showTimetable();
  else if (v === 'grades') showGrades();
  else if (v === 'settings') showSettings();
  else showList(v);
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) show(b.dataset.view);
});
$('#days').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const [y, m, d] = b.dataset.day.split('-').map(Number);
  selected = new Date(y, m - 1, d);
  showTimetable();
});
$('#prev').addEventListener('click', () => moveWeek(-1));
$('#next').addEventListener('click', () => moveWeek(1));
$('#settings').addEventListener('click', () => show('settings'));

// Swipe left/right on the timetable to change day.
let touchX = null;
let touchY = null;
main.addEventListener('touchstart', (e) => {
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
}, { passive: true });
main.addEventListener('touchend', (e) => {
  if (view !== 'timetable' || touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  touchX = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) moveDay(dx < 0 ? 1 : -1);
});

applyTheme(loadTheme());
show('timetable');
