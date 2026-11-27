'use strict';

/* ================= Basics ================= */
const MAX_CLIENTS = 20;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');

const HEAD_FIELDS = [
  ['present', 'Present', 'Who was there'],
  ['purpose', 'Purpose', 'e.g. first home visit'],
  ['childSighted', 'Child sighted', 'Yes or No'],
];
const SECTIONS = [
  ['general', 'General'],
  ['attachmentParenting', 'Attachment/Parenting'],
  ['safetyWellbeing', 'Safety/Wellbeing'],
  ['cfp', 'CFP'],
  ['services', 'Services'],
  ['plan', 'Plan'],
];
const FIELD_KEYS = [...HEAD_FIELDS.map(f => f[0]), ...SECTIONS.map(f => f[0])];
const CHIP_LABELS = { present: 'Present', purpose: 'Purpose', childSighted: 'Sighted', general: 'General', attachmentParenting: 'Attachment', safetyWellbeing: 'Safety', cfp: 'CFP', services: 'Services', plan: 'Plan' };
const LEGACY_KEYS = ['presentingNeed', 'korero', 'strengths', 'actions', 'culturalConsiderations', 'followUp'];
function completion(rec) {
  const has = k => (k === 'general' && !('general' in rec))
    ? LEGACY_KEYS.some(x => String(rec[x] || '').trim()) : String(rec[k] || '').trim() !== '';
  return { done: FIELD_KEYS.filter(has).length, total: FIELD_KEYS.length };
}
const pill = rec => { const { done, total } = completion(rec); return done === total ? '<span class="pill ok">Complete</span>' : `<span class="pill warn">${done}/${total}</span>`; };
const initials = name => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const ICON_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m9.5 17.3-4.8-4.8 1.4-1.4 3.4 3.4 8.4-8.4 1.4 1.4-9.8 9.8Z"/></svg>';

const fmtDT = ms => new Date(ms).toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const toLocalInput = ms => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const appendText = (a, b) => {
  a = a || ''; b = (b || '').trim();
  if (!a.trim()) return b;
  return a.endsWith('\n') ? a + b : a.replace(/\s+$/, '') + ' ' + b;
};
const toDateInput = ms => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fmtD = ms => new Date(ms).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
/** Adds dictated text. In bullet boxes, saying "next point" starts a new line. */
function addSpoken(ta, text) {
  const t = (text || '').trim(); if (!t) return;
  const notify = () => ta.dispatchEvent(new Event('input', { bubbles: true }));
  if (ta.id === 'quick') { ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' + t : t; notify(); return; }
  if (ta.tagName !== 'TEXTAREA') { ta.value = appendText(ta.value, t); notify(); return; }
  const parts = t.split(/\b(?:next point|new bullet|next bullet)\b[,.]?\s*/i).map(x => x.trim());
  ta.value = parts.reduce((acc, p, i) => i === 0 ? (p ? appendText(acc, p) : acc) : acc.replace(/\s+$/, '') + '\n' + p, ta.value);
  notify();
}

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
function openDialog(html, cls = '') {
  const d = $('#dlg'); d.className = cls; d.innerHTML = html; d.returnValue = ''; d.showModal(); return d;
}
function confirmBox(msg, okLabel = 'Delete') {
  return new Promise(res => {
    const d = openDialog(`<form method="dialog"><p>${esc(msg)}</p><div class="row"><button class="btn ghost" value="cancel">Cancel</button><button class="btn danger" value="ok">${esc(okLabel)}</button></div></form>`);
    d.onclose = () => res(d.returnValue === 'ok');
  });
}

/* ================= Dictation ================= */
let live = null;
function setStatus(msg) {
  let el = $('#listening');
  if (!el) { el = document.createElement('div'); el.id = 'listening'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.toggle('show', !!msg);
}
function stopDictation() {
  if (!live) return;
  const l = live; live = null; clearTimeout(l.startTimer); l.btn.classList.remove('on'); setStatus('');
  try { l.rec && (l.rec.abort ? l.rec.abort() : l.rec.stop()); } catch { /* ignore */ }
}
function dictationHelp() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (ios && standalone) return 'Voice dictation doesn’t work in a Home Screen app on iPhone. Tap the microphone on your keyboard instead.';
  if (/Firefox/.test(ua)) return 'Firefox doesn’t support voice dictation. Use Chrome, or the microphone on your keyboard.';
  return 'This browser can’t do voice dictation here. Use Chrome, or the microphone on your keyboard.';
}
function toggleDictation(btn, ta) {
  if (live && live.btn === btn) { stopDictation(); return; }
  stopDictation();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast(dictationHelp()); return; }
  const l = { btn, rec: null, silent: 0 }; live = l;
  btn.classList.add('on'); setStatus('Starting microphone…');
  const run = () => {
    if (live !== l) return;
    const rec = new SR(); l.rec = rec; let heard = false;
    clearTimeout(l.startTimer);
    l.startTimer = setTimeout(() => {
      if (live === l && !l.started) { toast('The microphone didn’t start. Check the site’s microphone permission and that you’re online, or use the microphone on your keyboard.'); stopDictation(); }
    }, 6000);
    rec.lang = 'en-NZ'; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onstart = () => { l.started = true; clearTimeout(l.startTimer); setStatus('Listening… tap the red mic to stop'); };
    rec.onresult = e => {
      let fin = '', interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t; else interim += t;
      }
      if (interim) setStatus('Hearing: ' + interim);
      if (fin.trim()) { heard = true; addSpoken(ta, fin); setStatus('Listening… tap the red mic to stop'); }
    };
    rec.onerror = e => {
      const msgs = {
        'not-allowed': 'The microphone is blocked. Allow it in your browser’s site settings, then try again.',
        'service-not-allowed': 'Voice dictation is turned off on this phone. Check your browser and Google app settings.',
        'audio-capture': 'No microphone found, or another app is using it.',
        'network': 'Dictation needs an internet connection.',
        'language-not-supported': 'This language isn’t supported for dictation on this phone.',
      };
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      toast(msgs[e.error] || 'Dictation stopped (' + e.error + ').'); stopDictation();
    };
    rec.onend = () => {
      if (live !== l) return;
      if (heard) l.silent = 0;
      else if (++l.silent >= 2) { toast('I didn’t hear anything. Tap the mic and try again.'); stopDictation(); return; }
      setTimeout(run, 250);
    };
    try { rec.start(); } catch { toast('Couldn’t start the microphone. Tap it again.'); stopDictation(); }
  };
  run();
}

/** Say each heading followed by "colon". Say "next point" for a new bullet. Text before the first heading goes under General. */
function parseHeadings(text) {
  const clean = text.replace(/\bslash\b/gi, '/').replace(/\b(?:next point|new bullet|next bullet)\b[,.]?\s*/gi, '\n').replace(/\bcolon\b/gi, ':').trim();
  const re = /(present|purpose|child sighted|general|attachment\s*\/?\s*parenting|safety\s*\/?\s*wellbeing|c\.?\s?f\.?\s?p\.?|services|plan)\s*:/gi;
  const map = { present: 'present', purpose: 'purpose', childsighted: 'childSighted', general: 'general', attachmentparenting: 'attachmentParenting', safetywellbeing: 'safetyWellbeing', cfp: 'cfp', services: 'services', plan: 'plan' };
  const ms = [...clean.matchAll(re)];
  if (!ms.length) return { general: clean };
  const out = {};
  const add = (k, v) => { v = v.trim(); if (v) out[k] = out[k] ? out[k] + '\n' + v : v; };
  add('general', clean.slice(0, ms[0].index));
  ms.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < ms.length ? ms[i + 1].index : clean.length;
    const key = map[m[1].toLowerCase().replace(/[\s./]/g, '')];
    let v = clean.slice(start, end);
    if (['present', 'purpose', 'childSighted'].includes(key)) v = v.replace(/\s*\n\s*/g, ' ');
    add(key, v);
  });
  return out;
}

/* ================= Talk freely: on-device sorting (nothing leaves your phone) ================= */
const DEFAULT_KEYWORDS = {
  attachmentParenting: ['parent*:2', 'mum', 'mother', 'dad', 'father', 'caregiver*', 'bond*', 'attachment', 'cuddl*', 'comfort*', 'settl*', 'soothe*', 'respons*', 'interact*', 'play*:1', 'routine*', 'bedtime', 'boundar*', 'disciplin*', 'feeding', 'bottle', 'breastfe*', 'eye contact', 'affection*', 'nurtur*', 'attuned', 'tantrum*', 'cues', 'smil*:1', 'laugh*:1', 'relationship with'],
  safetyWellbeing: ['safe:2', 'safety', 'unsafe:3', 'risk*', 'injur*:3', 'bruis*:3', 'harm*', 'violen*:3', 'assault*:3', 'abus*:3', 'neglect*:3', 'safe sleep:3', 'cot', 'wahakura', 'pepi pod', 'bed shar*:3', 'co-sleep*:3', 'hazard*', 'smoke alarm*:3', 'medical:1', 'doctor', 'gp', 'plunket', 'immunis*', 'health*:1', 'sick', 'illness', 'medication*', 'hungry', 'kai', 'food:1', 'fridge', 'pantry', 'clean:1', 'tidy:1', 'mould', 'damp', 'heating:1', 'hygiene', 'drug*', 'alcohol', 'meth', 'cannabis', 'substance*', 'mental health', 'depress*', 'anxi*', 'suicid*:3', 'self harm:3', 'wellbeing', 'school:1', 'attendance', 'development*:1', 'weight:1', 'growth:1', 'condition of the home:3', 'home environment'],
  cfp: ['cfp:4', 'family plan:4', 'child and family plan:4', 'whanau plan:4', 'goal*', 'outcome*', 'milestone*:1', 'progress:1', 'review*:1'],
  services: ['referral*', 'referred', 'service*:1', 'agency', 'agencies', 'provider*', 'support worker*', 'counsell*', 'programme*', 'program*', 'course*:1', 'budget*', 'msd', 'winz:3', 'work and income:3', 'housing', 'kainga ora:3', 'whanau ora:3', 'kaupapa maori', 'navigator*', 'swis:3', 'family start:3', 'early intervention', 'strengthening families:3', 'acc', 'foodbank*', 'food bank*', 'iwi:1', 'marae:1', 'ngo', 'barnardos:3', 'refuge:3', 'shine:3', 'kindergarten', 'early childhood', 'ece', 'daycare', 'childcare'],
  plan: ['will:3', 'going to:3', 'plan to:3', 'next visit:3', 'next week:3', 'next fortnight:3', 'next month:3', 'tomorrow', 'follow up:3', 'follow-up:3', 'followup:3', 'agreed:1', 'to arrange:3', 'to contact:3', 'to call:3', 'to book:3', 'needs to', 'need to', 'by next:3', 'action*', 'check in', 'check-in', 'organis*', 'schedul*', 'arrange*', 'to do', 'outstanding', 'deadline*', 'to be completed:3'],
};
const KW_KEY = 'cf_keywords';
function getKeywords() {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KW_KEY) || '{}'); } catch { /* ignore */ }
  return { ...DEFAULT_KEYWORDS, ...saved };
}
const norm = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(i|we|he|she|they|you|it)['’]ll\b/g, '$1 will');
function compileKeywords(map) {
  const out = {};
  for (const [sec, list] of Object.entries(map)) {
    out[sec] = list.map(raw => {
      const m = String(raw).trim().match(/^(.*?)(?::(\d))?$/); let kw = norm(m[1]).trim(); if (!kw) return null;
      const stem = kw.endsWith('*'); if (stem) kw = kw.slice(0, -1);
      const base = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      return { re: new RegExp('(?:^|[^a-z0-9])' + base + (stem ? '[a-z0-9]*' : '(?=$|[^a-z0-9])')), w: m[2] ? +m[2] : 2 };
    }).filter(Boolean);
  }
  return out;
}
function breakLong(seg) {
  const words = seg.split(/\s+/);
  if (words.length <= 28) return [seg];
  const mid = words.length / 2; let best = -1, bd = 1e9;
  for (let i = 4; i < words.length - 4; i++) {
    const w = words[i].toLowerCase().replace(/[^a-z]/g, '');
    if (['and', 'then', 'but', 'also', 'while', 'because'].includes(w) || /,$/.test(words[i - 1])) { const d = Math.abs(i - mid); if (d < bd) { bd = d; best = i; } }
  }
  if (best < 0) best = Math.floor(mid);
  const tidy = x => x.replace(/[,;]+$/, '').trim();
  return [...breakLong(tidy(words.slice(0, best).join(' '))), ...breakLong(words.slice(best).join(' ').replace(/^(and|then|but|also)\s+/i, ''))];
}
function splitSentences(text) {
  const out = [];
  for (const block of text.split(/\r?\n+/)) {
    for (const seg of block.replace(/([.!?])\s+/g, '$1\u0001').split('\u0001')) {
      for (let p of breakLong(seg.trim())) {
        p = p.replace(/\b(?:um+|uh+|erm)\b[,]?\s*/gi, '').replace(/[.!?]+$/, '').trim();
        if (p.length > 1) out.push(p.charAt(0).toUpperCase() + p.slice(1));
      }
    }
  }
  return out;
}
const CHILD_RE = /\b(child|children|tamariki|tamaiti|baby|pepi|infant|toddler|boy|girl|kids?)\b/;
function extractMeta(sentences) {
  const meta = {}, rest = [];
  for (const s of sentences) {
    const n = norm(s); let m;
    if (!meta.purpose && (m = s.match(/(?:the )?purpose (?:of (?:the|this|today['’]?s) (?:visit|meeting|contact) )?(?:was|is) (?:to )?(.+)/i))) { meta.purpose = m[1].trim(); continue; }
    if (!meta.present && (m = s.match(/^(?:present|those present|attendees|in attendance)(?: (?:were|was|are|is))?[:\s-]+(.+)/i))) { meta.present = m[1].trim(); continue; }
    if (!meta.present && (m = s.match(/^(.+?)\s+(?:was|were)\s+(?:also\s+)?present$/i))) { meta.present = m[1].trim(); continue; }
    if (!meta.childSighted && CHILD_RE.test(n) && /\b(sighted|saw|seen|see|sight)\b/.test(n)) {
      meta.childSighted = /\b(not|unable|couldn't|could not|didn't|did not|wasn't|weren't|no)\b/.test(n) ? 'No' : 'Yes';
    }
    rest.push(s);
  }
  return { meta, rest };
}
function classify(sentence, kw, prev) {
  const n = norm(sentence), scores = {};
  for (const sec of Object.keys(kw)) { let t = 0; for (const { re, w } of kw[sec]) if (re.test(n)) t += w; scores[sec] = t; }
  let best = 'general', bs = 1;
  for (const sec of ['plan', 'cfp', 'services', 'safetyWellbeing', 'attachmentParenting']) if ((scores[sec] || 0) > bs) { bs = scores[sec]; best = sec; }
  if (best === 'general' && prev && prev !== 'general' && /^(he|she|they|it|this|that|also|and|but|then|their|his|her)\b/.test(n)) best = prev;
  return best;
}
function sortTranscript(text) {
  const p = parseHeadings(text);
  const explicitKeys = Object.keys(p).filter(k => k !== 'general');
  if (explicitKeys.length) {
    const meta = {}, items = [];
    for (const [k, v] of Object.entries(p)) {
      if (['present', 'purpose', 'childSighted'].includes(k)) meta[k] = v;
      else v.split(/\n+/).map(x => x.trim()).filter(Boolean).forEach(t => items.push({ text: t.charAt(0).toUpperCase() + t.slice(1), section: k }));
    }
    return { meta, items };
  }
  const kw = compileKeywords(getKeywords());
  const { meta, rest } = extractMeta(splitSentences(text));
  let prev = 'general';
  const items = rest.map(t => { const section = classify(t, kw, prev); prev = section; return { text: t, section }; });
  return { meta, items };
}
const SEC_LABEL = Object.fromEntries(SECTIONS);
const KW_LABELS = [['attachmentParenting', 'Attachment/Parenting'], ['safetyWellbeing', 'Safety/Wellbeing'], ['cfp', 'CFP'], ['services', 'Services'], ['plan', 'Plan']];
function openSortSheet(result, onApply) {
  const items = result.items.map(x => ({ ...x }));
  const opts = k => SECTIONS.map(([v, l]) => `<option value="${v}"${v === k ? ' selected' : ''}>${l}</option>`).join('') + '<option value="__remove">Remove</option>';
  const m = result.meta;
  const d = openDialog(`<form method="dialog"><h2>Check before filing</h2><p class="hint" id="sh-count"></p>
    <div class="sheet-meta">
      <label for="pm-present">Present</label><input id="pm-present" type="text" value="${esc(m.present || '')}">
      <label for="pm-purpose">Purpose</label><input id="pm-purpose" type="text" value="${esc(m.purpose || '')}">
      <label for="pm-sighted">Child sighted</label><select id="pm-sighted"><option value="">Not stated</option><option${m.childSighted === 'Yes' ? ' selected' : ''}>Yes</option><option${m.childSighted === 'No' ? ' selected' : ''}>No</option></select>
    </div><div id="groups"></div>
    <div class="row sticky"><button class="btn ghost" value="cancel">Cancel</button><button class="btn" value="ok">File into note</button></div></form>`, 'sheet');
  const draw = () => {
    const live = items.map((x, i) => ({ ...x, i })).filter(x => x.section !== '__remove');
    $('#sh-count').textContent = `${live.length} point${live.length === 1 ? '' : 's'} sorted. Change any that landed in the wrong place.`;
    $('#groups').innerHTML = SECTIONS.map(([k, l]) => {
      const g = live.filter(x => x.section === k); if (!g.length) return '';
      return `<section class="grp s-${k}"><header><strong>${l}</strong><span class="count">${g.length}</span></header><ul>${g.map(x => `<li><span>${esc(x.text)}</span><select data-i="${x.i}" aria-label="Move to section">${opts(k)}</select></li>`).join('')}</ul></section>`;
    }).join('') || '<p class="empty">Nothing to file.</p>';
    $$('#groups select').forEach(sel => sel.onchange = () => { items[+sel.dataset.i].section = sel.value; draw(); });
  };
  draw();
  d.onclose = () => {
    if (d.returnValue !== 'ok') return;
    onApply({ meta: { present: $('#pm-present').value.trim(), purpose: $('#pm-purpose').value.trim(), childSighted: $('#pm-sighted').value }, items: items.filter(x => x.section !== '__remove') });
  };
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
  a.href = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type })); a.download = name;
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

/* ================= Word document (matches your case note template) ================= */
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
function crc32(buf) {
  if (!crc32.t) { crc32.t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc32.t[n] = c >>> 0; } }
  let crc = -1; for (let i = 0; i < buf.length; i++) crc = crc32.t[(crc ^ buf[i]) & 255] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}
function zipStore(files) {
  const enc = new TextEncoder(), u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const out = [], central = []; let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
    const local = [0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
    central.push([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]);
    out.push(new Uint8Array(local), name, data);
    offset += local.length + name.length + data.length;
  }
  const cd = central.flat();
  out.push(new Uint8Array(cd), new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(cd.length), ...u32(offset), 0, 0]));
  return new Blob(out, { type: DOCX_MIME });
}
const xmlEsc = t => String(t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function buildDocx(rec) {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const run = t => `<w:r><w:rPr><w:lang w:val="en-NZ"/></w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const para = t => `<w:p>${t ? run(t) : ''}</w:p>`;
  const bullet = t => `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(t)}</w:p>`;
  const [y, m, d] = (rec.visitDate || toDateInput(rec.dateTime)).split('-');
  const body = [para(`Date: ${d}/${m}/${y}`), para(`Present: ${rec.present || ''}`.trim()), para(`Purpose: ${rec.purpose || ''}`.trim()), para(`Child sighted: ${rec.childSighted || ''}`.trim())];
  for (const [k, label] of SECTIONS) {
    body.push(para(label + ':'));
    String(rec[k] || '').split(/\r?\n/).map(l => l.replace(/^\s*[-•*–]\s+/, '').trim()).filter(Boolean).forEach(l => body.push(bullet(l)));
  }
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zipStore([
    { name: '[Content_Types].xml', data: xml + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>' },
    { name: '_rels/.rels', data: xml + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: xml + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${R}/numbering" Target="numbering.xml"/></Relationships>` },
    { name: 'word/document.xml', data: xml + `<w:document ${W}><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>` },
    { name: 'word/styles.xml', data: xml + `<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Aptos" w:cs="Aptos"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-NZ" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="278" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style></w:styles>` },
    { name: 'word/numbering.xml', data: xml + `<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="\uF0B7"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>` },
  ]);
}
function docxName(rec, client) {
  const [y, m, d] = (rec.visitDate || toDateInput(rec.dateTime)).split('-');
  return `Case note - ${client.name} - ${d}-${m}-${y}.docx`.replace(/[\\/:*?"<>|]/g, '');
}
async function sendWord(rec, client) {
  const fname = docxName(rec, client), blob = buildDocx(rec);
  const file = new File([blob], fname, { type: DOCX_MIME });
  const email = localStorage.getItem('cf_email') || '';
  if (email && navigator.clipboard) { try { await navigator.clipboard.writeText(email); toast('Your email address is copied. Paste it in the To box.'); } catch { /* ignore */ } }
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Case note', text: 'Case note attached.' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  download(fname, blob, DOCX_MIME);
  toast('Word file saved. Attach it to the email that opens.');
  setTimeout(() => { location.href = 'mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent('Case note') + '&body=' + encodeURIComponent('Case note attached.'); }, 600);
}

/* ================= Views ================= */
const head = (title, back, extra = '') => `<header class="bar"><a class="back" href="${back}" aria-label="Back">${ICON_BACK}</a><h1>${esc(title)}</h1>${extra}</header>`;

async function clientsView() {
  const clients = (await DB.all('clients')).sort((a, b) => a.name.localeCompare(b.name));
  const stats = {}; let drafts = 0;
  for (const n of await DB.all('notes')) {
    const c = completion(n); const st = stats[n.clientId] || (stats[n.clientId] = { count: 0, drafts: 0 });
    st.count++; if (c.done < c.total) { st.drafts++; drafts++; }
  }
  const ticks = Array.from({ length: MAX_CLIENTS }, (_, i) => `<i class="${i < clients.length ? 'on' : ''}"></i>`).join('');
  app.innerHTML = `<header class="hero"><h1>Case Flow</h1><div class="meter" role="img" aria-label="${clients.length} of ${MAX_CLIENTS} clients">${ticks}</div>
      <p>${clients.length} of ${MAX_CLIENTS} clients${drafts ? ` · ${drafts} draft note${drafts === 1 ? '' : 's'} to finish` : ''}</p></header>
    ${clients.length ? `<ul class="list">${clients.map(c => { const st = stats[c.id] || { count: 0, drafts: 0 }; const sub = [c.culturalName, c.pronouns].filter(Boolean).join(' · ');
      return `<li><a class="crow" href="#/client/${c.id}"><span class="avatar" aria-hidden="true">${esc(initials(c.name))}</span><span class="cmeta"><strong>${esc(c.name)}</strong><span>${esc(sub || (st.count + (st.count === 1 ? ' note' : ' notes')))}</span></span>${st.drafts ? `<span class="pill warn">${st.drafts} draft${st.drafts === 1 ? '' : 's'}</span>` : ''}<span class="chev" aria-hidden="true">›</span></a></li>`; }).join('')}</ul>`
      : '<p class="empty">No clients yet. Add your first client to start taking notes.</p>'}
    <a class="fab" href="#/client/new">+ New client</a>`;
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
    ${notes.length ? `<ul class="list">${notes.map(n => { const first = String(n.general || n.presentingNeed || n.korero || '').split(/\r?\n/).find(Boolean) || ''; return `<li><a href="#/note/${id}/${n.id}"><div class="ntop"><span class="when">${fmtD(n.dateTime)}${n.purpose ? ' · ' + esc(n.purpose) : ''}</span>${pill(n)}</div><span class="snip">${esc(first || '(empty note)')}</span></a></li>`; }).join('')}</ul>` : '<p class="empty">No notes yet. Tap New note to add one.</p>'}`;
  $('#addrem').onclick = async () => { if (await reminderDialog(id, 'Follow up: ' + c.name)) clientView(id); };
  $$('[data-rem]').forEach(b => b.onclick = async () => { await DB.del('reminders', +b.dataset.rem); clientView(id); });
}

async function noteForm(clientId, noteId) {
  const c = await DB.get('clients', clientId);
  if (!c) { location.hash = '#/'; return; }
  const n = noteId ? await DB.get('notes', noteId) : null;
  const legacy = ['presentingNeed', 'korero', 'strengths', 'actions', 'culturalConsiderations', 'followUp'];
  const val = k => {
    if (!n) return '';
    if (k === 'general' && !('general' in n)) return legacy.map(x => n[x]).filter(Boolean).join('\n');
    return n[k] ?? '';
  };
  const today = toDateInput(Date.now());
  const dateVal = n?.visitDate || (n ? toDateInput(n.dateTime) : today);
  let currentId = n?.id;
  const sect = (k, l, inner) => `<div class="sect s-${k}" id="w-${k}"><div class="shead"><label for="f-${k}">${l}</label><span class="tick" aria-hidden="true">${ICON_CHECK}</span></div>${inner}${micBtn('f-' + k, 'Dictate ' + l)}</div>`;
  app.innerHTML = `${head(noteId ? 'Edit note' : 'New note', `#/client/${clientId}`, noteId ? '<button class="btn small ghost danger-text" id="delnote" type="button">Delete</button>' : '')}
    <p class="sub">${esc(c.name)}</p>
    <form id="nf" class="stack">
      <div class="progress" id="prog" role="status"><div class="ptext"><strong id="pcount"></strong><span id="plabel"></span></div><div class="pbar"><i id="pfill"></i></div>
        <div class="chips">${FIELD_KEYS.map(k => `<button type="button" class="chip" data-k="${k}">${ICON_CHECK}${CHIP_LABELS[k]}</button>`).join('')}</div></div>
      <section class="card talk">
        <h2>Talk freely</h2>
        <p class="hint">Tell it about the visit in your own words and pause between thoughts. Then tap Sort and it files each point under the right heading for you to check.</p>
        <button type="button" class="orb" id="orb" data-for="quick" aria-label="Start talking"><span class="ring"></span><span class="ring r2"></span>${ICON_MIC}</button>
        <div class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <textarea id="quick" rows="5" placeholder="Your words appear here. You can edit them."></textarea>
        <button type="button" class="btn" id="sort">Sort into sections</button>
      </section>
      <div class="sect"><div class="shead"><label for="f-visitDate">Date</label></div><input id="f-visitDate" type="date" required value="${dateVal}"></div>
      ${HEAD_FIELDS.map(([k, l, ph]) => sect(k, l, `<input id="f-${k}" type="text" autocomplete="off" placeholder="${ph}" ${k === 'childSighted' ? 'list="yn"' : ''} value="${esc(val(k))}">`)).join('')}
      <datalist id="yn"><option value="Yes"><option value="No"></datalist>
      ${SECTIONS.map(([k, l]) => sect(k, l, `<textarea id="f-${k}" rows="4" placeholder="One point per line. Each line becomes a bullet.">${esc(val(k))}</textarea>`)).join('')}
      <button class="btn" type="submit">Save note</button>
      <div class="actions"><button type="button" class="btn ghost" id="wordbtn">Save as Word</button><button type="button" class="btn ghost" id="sendbtn">Send to my email</button></div>
    </form>`;
  const refresh = () => {
    let done = 0;
    for (const k of FIELD_KEYS) {
      const ok = $('#f-' + k).value.trim() !== ''; if (ok) done++;
      $('#w-' + k).classList.toggle('filled', ok); $(`.chip[data-k="${k}"]`).classList.toggle('done', ok);
    }
    $('#pcount').textContent = `${done} of ${FIELD_KEYS.length}`;
    $('#plabel').textContent = done === FIELD_KEYS.length ? 'Complete, ready to send' : 'sections filled';
    $('#pfill').style.width = (done / FIELD_KEYS.length * 100) + '%';
    $('#prog').classList.toggle('complete', done === FIELD_KEYS.length);
  };
  $('#nf').addEventListener('input', refresh);
  $$('.chip').forEach(ch => ch.onclick = () => {
    const w = $('#w-' + ch.dataset.k);
    w.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    $('#f-' + ch.dataset.k).focus({ preventScroll: true });
  });
  refresh();
  $$('.mic, .orb').forEach(b => b.onclick = () => { if (navigator.vibrate) navigator.vibrate(8); toggleDictation(b, $('#' + b.dataset.for)); });
  $('#sort').onclick = () => {
    stopDictation();
    const text = $('#quick').value.trim();
    if (!text) { toast('Talk or type something first.'); return; }
    openSortSheet(sortTranscript(text), res => {
      const setIfEmpty = (k, v) => { const el = $('#f-' + k); if (v && !el.value.trim()) el.value = v; };
      setIfEmpty('present', res.meta.present); setIfEmpty('purpose', res.meta.purpose); setIfEmpty('childSighted', res.meta.childSighted);
      for (const [k] of SECTIONS) {
        const lines = res.items.filter(x => x.section === k).map(x => x.text); if (!lines.length) continue;
        const el = $('#f-' + k); el.value = el.value.trim() ? el.value.replace(/\s+$/, '') + '\n' + lines.join('\n') : lines.join('\n');
      }
      $('#quick').value = ''; refresh(); toast('Filed into your note.');
    });
  };
  const persist = async () => {
    stopDictation();
    const rec = { ...(n || {}), clientId };
    rec.visitDate = $('#f-visitDate').value || today;
    rec.dateTime = new Date(rec.visitDate + 'T12:00:00').getTime();
    for (const [k] of [...HEAD_FIELDS, ...SECTIONS]) rec[k] = $('#f-' + k).value.trim();
    const q = $('#quick').value.trim();
    if (q) { rec.general = rec.general ? rec.general + '\n' + q : q; $('#f-general').value = rec.general; $('#quick').value = ''; refresh(); }
    if (currentId) rec.id = currentId;
    currentId = await DB.put('notes', rec); rec.id = currentId;
    return rec;
  };
  $('#nf').onsubmit = async e => { e.preventDefault(); await persist(); location.hash = `#/client/${clientId}`; };
  $('#wordbtn').onclick = async () => {
    const rec = await persist();
    download(docxName(rec, c), buildDocx(rec), DOCX_MIME);
    toast('Saved as Word in your Downloads.');
  };
  $('#sendbtn').onclick = async () => { const rec = await persist(); await sendWord(rec, c); };
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
    <section class="section card"><h2 style="margin-top:0">Send notes to</h2>
      <p class="hint">Your email address. It stays on this phone. When you tap Send to my email, it’s copied so you can paste it into the To box.</p>
      <input id="mail" type="email" autocomplete="email" aria-label="Your email address" value="${esc(localStorage.getItem('cf_email') || '')}">
      <button class="btn ghost" id="savemail" type="button">Save email</button></section>
    <section class="section card"><h2 style="margin-top:0">Sorting words</h2>
      <p class="hint">Talk freely sorts each sentence by the words in it. Edit the words for each section, separated by commas. A number after a word (for example plan:3) makes it count more. Anything that matches nothing goes to General.</p>
      ${KW_LABELS.map(([k, l]) => `<details class="kw"><summary>${l}</summary><textarea id="kw-${k}" rows="6" style="padding-right:.8rem">${esc(getKeywords()[k].join(', '))}</textarea></details>`).join('')}
      <button class="btn ghost" id="kwsave" type="button">Save words</button><button class="btn ghost" id="kwreset" type="button">Reset to defaults</button></section>
    <section class="section card"><h2 style="margin-top:0">Backup</h2>
      <p class="hint">Your data lives only on this device. If you clear browser data or change phones it’s gone, so export a backup regularly. The backup file is not encrypted, so store it somewhere private.</p>
      <button class="btn ghost" id="export" type="button">Export backup</button>
      <button class="btn ghost" id="import" type="button">Restore from backup</button><input id="file" type="file" accept="application/json,.json" hidden></section>`;
  $('#setpin').onclick = async () => { const p = await pinDialog(); if (p) { await setPin(p); toast('PIN saved.'); settingsView(); } };
  if (hasPin()) $('#rmpin').onclick = async () => { if (await confirmBox('Remove the PIN lock?', 'Remove')) { localStorage.removeItem(PIN_KEY); settingsView(); } };
  if (perm === 'default') $('#notif').onclick = async () => { await Notification.requestPermission(); settingsView(); };
  $('#kwsave').onclick = () => {
    const out = {}; for (const [k] of KW_LABELS) out[k] = $('#kw-' + k).value.split(',').map(x => x.trim()).filter(Boolean);
    localStorage.setItem(KW_KEY, JSON.stringify(out)); toast('Sorting words saved.');
  };
  $('#kwreset').onclick = async () => { if (await confirmBox('Reset all sorting words to the defaults?', 'Reset')) { localStorage.removeItem(KW_KEY); settingsView(); } };
  $('#savemail').onclick = () => { localStorage.setItem('cf_email', $('#mail').value.trim()); toast('Email saved.'); };
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
  app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter');
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
