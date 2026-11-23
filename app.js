'use strict';

/* ================= Basics ================= */
const MAX_CLIENTS = 20;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');

const FIELDS = [
  ['presentingNeed', 'Presenting need'],
  ['korero', 'Kōrero'],
  ['strengths', 'Strengths'],
  ['actions', 'Actions'],
  ['culturalConsiderations', 'Cultural considerations'],
  ['followUp', 'Follow up'],
];

const fmtDT = ms => new Date(ms).toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const toLocalInput = ms => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const appendText = (a, b) => (a || '').trim() ? a.replace(/\s+$/, '') + ' ' + b.trim() : b.trim();

const ICON_MIC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>';
const ICON_BACK = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m14.7 5.3-1.4-1.4L5.2 12l8.1 8.1 1.4-1.4L8 12l6.7-6.7Z"/></svg>';
const ICON_TRASH = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z"/></svg>';
const micBtn = (target, label) => `<button type="button" class="mic" data-for="${target}" aria-label="${esc(label)}">${ICON_MIC}</button>`;

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}

/* ================= Storage (IndexedDB, on this device only) ================= */
let H;
const dbReady = new Promise((res, rej) => {
  const rq = indexedDB.open('caseflow', 1);
  rq.onupgradeneeded = () => {
    const db = rq.result;
    db.createObjectStore('clients', { keyPath: 'id', autoIncrement: true });
    db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true }).createIndex('clientId', 'clientId');
    db.createObjectStore('reminders', { keyPath: 'id', autoIncrement: true });
  };
  rq.onsuccess = () => { H = rq.result; res(); };
  rq.onerror = () => rej(rq.error);
});
const st = (n, m = 'readonly') => H.transaction(n, m).objectStore(n);
const wrap = rq => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
const DB = {
  all: n => wrap(st(n).getAll()),
  get: (n, id) => wrap(st(n).get(id)),
  put: (n, o) => wrap(st(n, 'readwrite').put(o)),
  del: (n, id) => wrap(st(n, 'readwrite').delete(id)),
  clear: n => wrap(st(n, 'readwrite').clear()),
  notesFor: id => wrap(st('notes').index('clientId').getAll(id)),
};

/* ================= Dialogs ================= */
function openDialog(html) {
  const d = $('#dlg'); d.innerHTML = html; d.returnValue = ''; d.showModal(); return d;
}
function confirmBox(msg, okLabel = 'Delete') {
  return new Promise(res => {
    const d = openDialog(`<form method="dialog"><p>${esc(msg)}</p><div class="row"><button class="btn ghost" value="cancel">Cancel</button><button class="btn danger" value="ok">${esc(okLabel)}</button></div></form>`);
    d.onclose = () => res(d.returnValue === 'ok');
  });
}

/* ================= Dictation ================= */
let live = null;
function stopDictation() {
  if (!live) return;
  const l = live; live = null; l.btn.classList.remove('on');
  try { l.rec && l.rec.stop(); } catch { /* ignore */ }
}
function toggleDictation(btn, ta) {
  if (live && live.btn === btn) { stopDictation(); return; }
  stopDictation();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Dictation isn’t available in this browser. Use the microphone on your keyboard instead.'); return; }
  const l = { btn, rec: null }; live = l; btn.classList.add('on');
  const run = () => {
    const rec = new SR(); l.rec = rec;
    rec.lang = 'en-NZ'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = e => { ta.value = appendText(ta.value, e.results[e.results.length - 1][0].transcript); };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { toast('Microphone access is blocked. Allow it in your browser’s site settings.'); stopDictation(); }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') { toast('Dictation stopped (' + e.error + ').'); stopDictation(); }
    };
    rec.onend = () => { if (live === l) setTimeout(() => { if (live === l) run(); }, 150); };
    try { rec.start(); } catch { stopDictation(); }
  };
  run();
}

/** Say each heading followed by "colon". Text before the first heading goes under kōrero. */
function parseHeadings(text) {
  const clean = text.replace(/\bcolon\b/gi, ':').trim();
  const re = /(presenting need|korero|kōrero|strengths|actions|cultural considerations|follow ?up)\s*[:\-]/gi;
  const ms = [...clean.matchAll(re)];
  if (!ms.length) return { korero: clean };
  const out = {};
  const pre = clean.slice(0, ms[0].index).trim();
  if (pre) out.korero = pre;
  ms.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < ms.length ? ms[i + 1].index : clean.length;
    const key = { 'presenting need': 'presentingNeed', korero: 'korero', 'kōrero': 'korero', strengths: 'strengths', actions: 'actions', 'cultural considerations': 'culturalConsiderations' }[m[1].toLowerCase()] || 'followUp';
    const val = clean.slice(start, end).trim();
    out[key] = out[key] ? out[key] + ' ' + val : val;
  });
  return out;
}

/* ================= PIN lock (screen lock, not encryption) ================= */
const PIN_KEY = 'cf_pin';
let locked = false, hiddenAt = 0;
const hasPin = () => !!localStorage.getItem(PIN_KEY);
async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function setPin(pin) {
  const salt = crypto.getRandomValues(new Uint32Array(4)).join('-');
  localStorage.setItem(PIN_KEY, JSON.stringify({ salt, hash: await hashPin(pin, salt) }));
}
async function checkPin(pin) {
  const s = JSON.parse(localStorage.getItem(PIN_KEY) || 'null');
  return !!s && (await hashPin(pin, s.salt)) === s.hash;
}
function lock() {
  locked = true; stopDictation(); document.body.classList.add('locked');
  app.innerHTML = `<form class="lock" id="lockf"><h1>Case Flow</h1><p class="muted">Enter your PIN to continue.</p>
    <input id="pin" type="password" inputmode="numeric" autocomplete="off" aria-label="PIN"><p class="err" id="lerr"></p>
    <button class="btn" type="submit">Unlock</button></form>`;
  $('#pin').focus();
  $('#lockf').onsubmit = async e => {
    e.preventDefault();
    if (await checkPin($('#pin').value)) {
      locked = false; document.body.classList.remove('locked');
      route(); checkReminders(); flushPending();
    } else { $('#lerr').textContent = 'That PIN isn’t right.'; $('#pin').value = ''; }
  };
}
function pinDialog() {
  return new Promise(res => {
    const d = openDialog(`<form method="dialog"><h2>Set a PIN</h2><label for="p1">New PIN (4 to 12 digits)</label>
      <input id="p1" type="password" inputmode="numeric" autocomplete="off"><label for="p2" style="margin-top:.6rem">Repeat PIN</label>
      <input id="p2" type="password" inputmode="numeric" autocomplete="off"><p class="err" id="perr"></p>
      <div class="row"><button class="btn ghost" value="cancel">Cancel</button><button class="btn" value="ok">Save PIN</button></div></form>`);
    $('form', d).addEventListener('submit', e => {
      if (e.submitter && e.submitter.value === 'cancel') return;
      const a = $('#p1').value, b = $('#p2').value;
      if (!/^\d{4,12}$/.test(a)) { e.preventDefault(); $('#perr').textContent = 'Use 4 to 12 digits.'; }
      else if (a !== b) { e.preventDefault(); $('#perr').textContent = 'The PINs don’t match.'; }
    });
    d.onclose = () => res(d.returnValue === 'ok' ? $('#p1').value : null);
  });
}

/* ================= Reminders ================= */
const pending = [];
function showAlert(r, late) {
  const el = document.createElement('div'); el.className = 'alert'; el.setAttribute('role', 'alert');
  el.innerHTML = `<div><strong>${late ? 'Missed reminder' : 'Reminder'}</strong><span>${esc(r.title)}</span></div><button type="button">Dismiss</button>`;
  $('button', el).onclick = () => el.remove();
  $('#alerts').appendChild(el);
}
function flushPending() { pending.splice(0).forEach(r => showAlert(r, true)); }
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.15; o.start(); o.stop(ctx.currentTime + 0.4);
  } catch { /* ignore */ }
}
async function notify() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification('Case Flow reminder', { body: 'Open Case Flow to see it.', tag: 'cf-reminder', renotify: true, vibrate: [300, 150, 300], icon: 'icons/icon-192.png' });
  } catch { /* ignore */ }
}
function fire(r, late) {
  notify();
  if (locked) { pending.push(r); return; }
  showAlert(r, late); beep();
  if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
}
async function checkReminders() {
  const now = Date.now();
  let changed = false;
  for (const r of await DB.all('reminders')) {
    if (r.done || r.time > now) continue;
    fire(r, now - r.time > 120000);
    if (r.repeatDaily) {
      const d = new Date(r.time);
      while (d.getTime() <= now) d.setDate(d.getDate() + 1);
      r.time = d.getTime();
    } else r.done = true;
    await DB.put('reminders', r); changed = true;
  }
  if (changed && !locked && location.hash === '#/reminders') route();
}
function icsText(r) {
  const z = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const e = s => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Case Flow//EN', 'BEGIN:VEVENT', `UID:caseflow-${r.id}-${r.time}@caseflow.local`,
    `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(r.time)}`, `DTEND:${z(r.time + 900000)}`, `SUMMARY:${e(r.title)}`];
  if (r.repeatDaily) L.push('RRULE:FREQ=DAILY');
  L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e(r.title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return L.join('\r\n');
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function reminderDialog(clientId, defaultTitle) {
  return new Promise(res => {
    const d = openDialog(`<form method="dialog"><h2>New reminder</h2>
      <label for="rt">What to remember</label><input id="rt" type="text" value="${esc(defaultTitle)}" required>
      <label for="rd" style="margin-top:.7rem">When</label><input id="rd" type="datetime-local" value="${toLocalInput(Date.now() + 3600000)}" required>
      <label class="check" style="margin-top:.8rem"><input id="rr" type="checkbox"> Repeat daily</label><p class="err" id="rerr"></p>
      <div class="row"><button class="btn ghost" value="cancel">Cancel</button><button class="btn" value="ok">Save reminder</button></div></form>`);
    $('form', d).addEventListener('submit', async e => {
      if (e.submitter && e.submitter.value === 'cancel') return;
      const time = new Date($('#rd').value).getTime(), repeat = $('#rr').checked;
      if (!$('#rt').value.trim() || isNaN(time)) { e.preventDefault(); $('#rerr').textContent = 'Add a title and a time.'; return; }
      if (!repeat && time <= Date.now()) { e.preventDefault(); $('#rerr').textContent = 'Pick a time in the future.'; return; }
      d.dataset.rec = JSON.stringify({ title: $('#rt').value.trim(), time, clientId, repeatDaily: repeat, done: false });
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    });
    d.onclose = async () => {
      if (d.returnValue !== 'ok' || !d.dataset.rec) return res(false);
      await DB.put('reminders', JSON.parse(d.dataset.rec)); res(true);
    };
  });
}

/* ================= Views ================= */
const head = (title, back, extra = '') => `<header class="bar"><a class="back" href="${back}" aria-label="Back">${ICON_BACK}</a><h1>${esc(title)}</h1>${extra}</header>`;

async function clientsView() {
  const clients = (await DB.all('clients')).sort((a, b) => a.name.localeCompare(b.name));
  const ticks = Array.from({ length: MAX_CLIENTS }, (_, i) => `<i class="${i < clients.length ? 'on' : ''}"></i>`).join('');
  app.innerHTML = `<header class="hero"><h1>Case Flow</h1><div class="meter" role="img" aria-label="${clients.length} of ${MAX_CLIENTS} clients">${ticks}</div><p>${clients.length} of ${MAX_CLIENTS} clients</p></header>
    ${clients.length ? `<ul class="list">${clients.map(c => `<li><a href="#/client/${c.id}"><strong>${esc(c.name)}</strong><span>${esc([c.culturalName, c.pronouns].filter(Boolean).join(' · '))}</span></a></li>`).join('')}</ul>`
      : '<p class="empty">No clients yet. Add your first client to start taking notes.</p>'}
    <a class="fab" href="#/client/new">New client</a>`;
  $('.fab').onclick = e => { if (clients.length >= MAX_CLIENTS) { e.preventDefault(); toast('You’ve reached the 20 client limit.'); } };
}

async function clientForm(id) {
  const c = id ? await DB.get('clients', id) : null;
  if (id && !c) { location.hash = '#/'; return; }
  const n = await DB.all('clients');
  if (!id && n.length >= MAX_CLIENTS) { toast('You’ve reached the 20 client limit.'); location.hash = '#/'; return; }
  app.innerHTML = `${head(id ? 'Edit client' : 'New client', id ? `#/client/${id}` : '#/', id ? '<button class="btn small ghost danger-text" id="del" type="button">Delete</button>' : '')}
    <form id="cf" class="stack">
      <div><label for="name">Name</label><input id="name" type="text" required autocomplete="off" value="${esc(c?.name)}"></div>
      <div><label for="cn">Cultural name or iwi (optional)</label><input id="cn" type="text" autocomplete="off" value="${esc(c?.culturalName)}"></div>
      <div><label for="pr">Pronouns (optional)</label><input id="pr" type="text" autocomplete="off" value="${esc(c?.pronouns)}"></div>
      <div><label for="nt">Background notes</label><textarea id="nt" rows="4" style="padding-right:.8rem">${esc(c?.notes)}</textarea></div>
      <button class="btn" type="submit">Save client</button></form>`;
  $('#cf').onsubmit = async e => {
    e.preventDefault();
    const rec = { ...(c || {}), name: $('#name').value.trim(), culturalName: $('#cn').value.trim(), pronouns: $('#pr').value.trim(), notes: $('#nt').value.trim() };
    const newId = await DB.put('clients', rec);
    location.hash = `#/client/${c ? id : newId}`;
  };
  if (id) $('#del').onclick = async () => {
    if (!await confirmBox('Delete this client, all their case notes and their reminders? This can’t be undone.')) return;
    for (const x of await DB.notesFor(id)) await DB.del('notes', x.id);
    for (const r of await DB.all('reminders')) if (r.clientId === id) await DB.del('reminders', r.id);
    await DB.del('clients', id); location.hash = '#/';
  };
}

async function clientView(id) {
  const c = await DB.get('clients', id);
  if (!c) { location.hash = '#/'; return; }
  const notes = (await DB.notesFor(id)).sort((a, b) => b.dateTime - a.dateTime);
  const rems = (await DB.all('reminders')).filter(r => r.clientId === id && !r.done).sort((a, b) => a.time - b.time);
  const bits = [c.culturalName, c.pronouns && 'Pronouns: ' + c.pronouns].filter(Boolean);
  app.innerHTML = `${head(c.name, '#/', `<a class="btn small ghost" href="#/client/${id}/edit">Edit</a>`)}
    ${bits.length || c.notes ? `<section class="card">${bits.map(b => `<p><strong>${esc(b)}</strong></p>`).join('')}${c.notes ? `<p>${esc(c.notes)}</p>` : ''}</section>` : ''}
    <div class="actions"><a class="btn" href="#/note/${id}/new">New note</a><button class="btn ghost" id="addrem" type="button">Add reminder</button></div>
    ${rems.length ? `<h2>Reminders</h2><ul class="list">${rems.map(r => `<li class="row live"><div class="grow"><b>${esc(r.title)}</b><span>${fmtDT(r.time)}${r.repeatDaily ? ' · daily' : ''}</span></div><button class="icon-btn" data-rem="${r.id}" aria-label="Delete reminder">${ICON_TRASH}</button></li>`).join('')}</ul>` : ''}
    <h2>Case notes</h2>
    ${notes.length ? `<ul class="list">${notes.map(n => `<li><a href="#/note/${id}/${n.id}"><span class="when">${fmtDT(n.dateTime)}</span><span class="snip">${esc(n.presentingNeed || n.korero || n.actions || '(empty note)')}</span></a></li>`).join('')}</ul>` : '<p class="empty">No notes yet. Tap New note to add one.</p>'}`;
  $('#addrem').onclick = async () => { if (await reminderDialog(id, 'Follow up: ' + c.name)) clientView(id); };
  $$('[data-rem]').forEach(b => b.onclick = async () => { await DB.del('reminders', +b.dataset.rem); clientView(id); });
}

async function noteForm(clientId, noteId) {
  const c = await DB.get('clients', clientId);
  if (!c) { location.hash = '#/'; return; }
  const n = noteId ? await DB.get('notes', noteId) : null;
  app.innerHTML = `${head(noteId ? 'Edit note' : 'New note', `#/client/${clientId}`, noteId ? '<button class="btn small ghost danger-text" id="delnote" type="button">Delete</button>' : '')}
    <p class="sub">${esc(c.name)}${n ? ' · ' + fmtDT(n.dateTime) : ''}</p>
    <form id="nf" class="stack">
      <section class="card quick"><label for="quick">Quick dictation</label>
        <p class="hint">Tap the microphone and say each heading followed by “colon”, for example “presenting need colon …”. Then tap Sort into sections.</p>
        <div class="field"><textarea id="quick" rows="4"></textarea>${micBtn('quick', 'Dictate')}</div>
        <button type="button" class="btn ghost" id="sort">Sort into sections</button></section>
      ${FIELDS.map(([k, l]) => `<div class="field"><label for="f-${k}">${l}</label><textarea id="f-${k}" rows="3">${esc(n?.[k])}</textarea>${micBtn('f-' + k, 'Dictate ' + l)}</div>`).join('')}
      <button class="btn" type="submit">Save note</button></form>`;
  $$('.mic').forEach(b => b.onclick = () => toggleDictation(b, $('#' + b.dataset.for)));
  $('#sort').onclick = () => {
    const parsed = parseHeadings($('#quick').value);
    for (const [k, v] of Object.entries(parsed)) { const ta = $('#f-' + k); ta.value = appendText(ta.value, v); }
    $('#quick').value = ''; toast('Sorted into sections.');
  };
  $('#nf').onsubmit = async e => {
    e.preventDefault(); stopDictation();
    const rec = { ...(n || {}), clientId, dateTime: n?.dateTime ?? Date.now() };
    for (const [k] of FIELDS) rec[k] = $('#f-' + k).value.trim();
    const q = $('#quick').value.trim(); if (q) rec.korero = appendText(rec.korero, q);
    await DB.put('notes', rec); location.hash = `#/client/${clientId}`;
  };
  if (noteId) $('#delnote').onclick = async () => {
    if (await confirmBox('Delete this note? This can’t be undone.')) { await DB.del('notes', noteId); location.hash = `#/client/${clientId}`; }
  };
}

async function remindersView() {
  const rs = await DB.all('reminders');
  const names = Object.fromEntries((await DB.all('clients')).map(c => [c.id, c.name]));
  rs.sort((a, b) => (a.done - b.done) || (a.time - b.time));
  app.innerHTML = `<header class="hero"><h1>Reminders</h1><p>Alerts ring while Case Flow is open. For alarms when it’s closed, add a reminder to your phone calendar.</p></header>
    <button class="btn" id="newrem" type="button">New reminder</button>
    ${rs.length ? `<ul class="list" style="margin-top:1rem">${rs.map(r => `<li class="row ${r.done ? '' : 'live'}"><div class="grow"><b>${esc(r.title)}</b><span>${fmtDT(r.time)}${r.repeatDaily ? ' · daily' : r.done ? ' · done' : ''}<br>${esc(names[r.clientId] || 'General')}</span></div>
      ${r.done ? '' : `<button class="btn small ghost" data-ics="${r.id}" type="button">Calendar</button>`}<button class="icon-btn" data-rem="${r.id}" aria-label="Delete reminder">${ICON_TRASH}</button></li>`).join('')}</ul>` : '<p class="empty">No reminders yet. Add one for paperwork or a client follow-up.</p>'}`;
  $('#newrem').onclick = async () => { if (await reminderDialog(0, '')) remindersView(); };
  $$('[data-rem]').forEach(b => b.onclick = async () => { await DB.del('reminders', +b.dataset.rem); remindersView(); });
  $$('[data-ics]').forEach(b => b.onclick = () => { const r = rs.find(x => x.id === +b.dataset.ics); download('case-flow-reminder.ics', icsText(r), 'text/calendar'); });
}

async function settingsView() {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  app.innerHTML = `<header class="hero"><h1>Settings</h1></header>
    <section class="section card"><h2 style="margin-top:0">Screen lock</h2>
      <p class="hint">${hasPin() ? 'A PIN is set. Case Flow locks after a minute in the background.' : 'Add a PIN so nobody can open your notes if they pick up your phone. It’s a screen lock, not encryption.'}</p>
      <button class="btn ghost" id="setpin" type="button">${hasPin() ? 'Change PIN' : 'Set a PIN'}</button>
      ${hasPin() ? '<button class="btn ghost danger-text" id="rmpin" type="button">Remove PIN</button>' : ''}</section>
    <section class="section card"><h2 style="margin-top:0">Notifications</h2>
      <p class="hint">${perm === 'granted' ? 'Notifications are on.' : perm === 'denied' ? 'Notifications are blocked. Allow them in your browser’s site settings.' : perm === 'unsupported' ? 'This browser doesn’t support notifications. On iPhone, add Case Flow to your Home Screen first.' : 'Allow notifications so reminders can alert you while the app is in the background.'}</p>
      ${perm === 'default' ? '<button class="btn ghost" id="notif" type="button">Allow notifications</button>' : ''}</section>
    <section class="section card"><h2 style="margin-top:0">Backup</h2>
      <p class="hint">Your data lives only on this device. If you clear browser data or change phones it’s gone, so export a backup regularly. The backup file is not encrypted, so store it somewhere private.</p>
      <button class="btn ghost" id="export" type="button">Export backup</button>
      <button class="btn ghost" id="import" type="button">Restore from backup</button><input id="file" type="file" accept="application/json,.json" hidden></section>`;
  $('#setpin').onclick = async () => { const p = await pinDialog(); if (p) { await setPin(p); toast('PIN saved.'); settingsView(); } };
  if (hasPin()) $('#rmpin').onclick = async () => { if (await confirmBox('Remove the PIN lock?', 'Remove')) { localStorage.removeItem(PIN_KEY); settingsView(); } };
  if (perm === 'default') $('#notif').onclick = async () => { await Notification.requestPermission(); settingsView(); };
  $('#export').onclick = async () => {
    const data = { app: 'case-flow', version: 1, exportedAt: new Date().toISOString(), clients: await DB.all('clients'), notes: await DB.all('notes'), reminders: await DB.all('reminders') };
    download(`case-flow-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
  };
  $('#import').onclick = () => $('#file').click();
  $('#file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'case-flow' || !Array.isArray(d.clients)) throw new Error('bad');
      if (!await confirmBox('Replace everything in Case Flow with this backup?', 'Replace')) return;
      for (const s of ['clients', 'notes', 'reminders']) { await DB.clear(s); for (const o of d[s] || []) await DB.put(s, o); }
      toast('Backup restored.'); location.hash = '#/';
    } catch { toast('That file isn’t a Case Flow backup.'); }
  };
}

/* ================= Router ================= */
const routes = [
  [/^#\/?$/, () => clientsView()],
  [/^#\/client\/new$/, () => clientForm(null)],
  [/^#\/client\/(\d+)$/, m => clientView(+m[1])],
  [/^#\/client\/(\d+)\/edit$/, m => clientForm(+m[1])],
  [/^#\/note\/(\d+)\/(new|\d+)$/, m => noteForm(+m[1], m[2] === 'new' ? null : +m[2])],
  [/^#\/reminders$/, () => remindersView()],
  [/^#\/settings$/, () => settingsView()],
];
async function route() {
  if (locked) return;
  stopDictation();
  const h = location.hash || '#/';
  for (const [re, fn] of routes) { const m = h.match(re); if (m) { await fn(m); break; } }
  const tab = h.startsWith('#/reminders') ? 'reminders' : h.startsWith('#/settings') ? 'settings' : 'clients';
  $$('#tabs a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  window.scrollTo(0, 0);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hasPin() && !locked && Date.now() - hiddenAt > 60000) lock();
  else if (!locked) checkReminders();
});
window.addEventListener('hashchange', route);

(async function init() {
  try { await dbReady; } catch { app.innerHTML = '<p class="empty">Case Flow can’t store data in this browser. Turn off private browsing and try again.</p>'; return; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (hasPin()) lock(); else { route(); checkReminders(); }
  setInterval(checkReminders, 15000);
})();
