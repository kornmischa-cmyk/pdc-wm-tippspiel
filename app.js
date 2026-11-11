/* WM-Tippspiel · App-Logik (Vanilla JS, Supabase via RPC)
   Design „Bühne pur“ – Markup folgt dem Stil-Board (design/handoff.md). */
(() => {
  'use strict';

  const CFG = window.TIPPSPIEL_CONFIG || {};
  const TZ = 'Europe/Berlin';
  const SESSION_KEY = 'wm-tippspiel-session';
  const LASTNAME_KEY = 'wm-tippspiel-last-name';
  const view = document.getElementById('view');
  const tabs = document.getElementById('tabs');
  const who = document.getElementById('who');
  const toastEl = document.getElementById('toast');
  const liveEl = document.getElementById('live');

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------------------------------------------------------------------
  // Zeichen
  // ------------------------------------------------------------------

  const ICON = {
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17v.5"/></svg>',
    hourglass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10M7 21h10M8 3c0 5 8 6 8 9s-8 4-8 9M16 3c0 5-8 6-8 9s8 4 8 9"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg>',
    logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4"/></svg>',
    rings: '<svg viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="26"/><circle cx="28" cy="28" r="18"/><circle cx="28" cy="28" r="10"/><circle class="hit" cx="28" cy="28" r="4"/></svg>',
    timer: '<svg viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="30" r="20"/><path d="M28 18v12l8 5M22 6h12M28 6v4"/></svg>',
    bracket: '<svg viewBox="0 0 56 56" aria-hidden="true"><path d="M6 10h12v12H6M6 34h12v12H6M18 16h8v24h-8M26 28h10M36 22h14v12H36"/></svg>',
    offline: '<svg viewBox="0 0 56 56" aria-hidden="true"><path d="M8 22a30 30 0 0 1 40 0M15 30a20 20 0 0 1 26 0M22 38a10 10 0 0 1 12 0"/><circle class="hit" cx="28" cy="45" r="3"/><path d="M10 10l36 36"/></svg>',
    terminal: '<svg viewBox="0 0 56 56" aria-hidden="true"><rect x="8" y="12" width="40" height="32" rx="4"/><path d="M8 20h40M16 30l5 4-5 4M26 38h12"/></svg>'
  };
  const STAGE_BOARD = `<svg class="stage-board" viewBox="-104 -104 208 208" aria-hidden="true"><path d="M-8.60 -54.32A55 55 0 0 1 8.60 -54.32L1.25 -7.90A8 8 0 0 0 -1.25 -7.90Z" fill="#1b1916"/><path d="M-9.70 -61.24A62 62 0 0 1 9.70 -61.24L8.60 -54.32A55 55 0 0 0 -8.60 -54.32Z" fill="rgba(200,53,46,.42)"/><path d="M-14.08 -88.89A90 90 0 0 1 14.08 -88.89L9.70 -61.24A62 62 0 0 0 -9.70 -61.24Z" fill="#1b1916"/><path d="M-15.64 -98.77A100 100 0 0 1 15.64 -98.77L14.08 -88.89A90 90 0 0 0 -14.08 -88.89Z" fill="rgba(200,53,46,.42)"/><path d="M8.60 -54.32A55 55 0 0 1 24.97 -49.01L3.63 -7.13A8 8 0 0 0 1.25 -7.90Z" fill="#24211d"/><path d="M9.70 -61.24A62 62 0 0 1 28.15 -55.24L24.97 -49.01A55 55 0 0 0 8.60 -54.32Z" fill="rgba(34,166,93,.45)"/><path d="M14.08 -88.89A90 90 0 0 1 40.86 -80.19L28.15 -55.24A62 62 0 0 0 9.70 -61.24Z" fill="#24211d"/><path d="M15.64 -98.77A100 100 0 0 1 45.40 -89.10L40.86 -80.19A90 90 0 0 0 14.08 -88.89Z" fill="rgba(34,166,93,.45)"/><path d="M24.97 -49.01A55 55 0 0 1 38.89 -38.89L5.66 -5.66A8 8 0 0 0 3.63 -7.13Z" fill="#1b1916"/><path d="M28.15 -55.24A62 62 0 0 1 43.84 -43.84L38.89 -38.89A55 55 0 0 0 24.97 -49.01Z" fill="rgba(200,53,46,.42)"/><path d="M40.86 -80.19A90 90 0 0 1 63.64 -63.64L43.84 -43.84A62 62 0 0 0 28.15 -55.24Z" fill="#1b1916"/><path d="M45.40 -89.10A100 100 0 0 1 70.71 -70.71L63.64 -63.64A90 90 0 0 0 40.86 -80.19Z" fill="rgba(200,53,46,.42)"/><path d="M38.89 -38.89A55 55 0 0 1 49.01 -24.97L7.13 -3.63A8 8 0 0 0 5.66 -5.66Z" fill="#24211d"/><path d="M43.84 -43.84A62 62 0 0 1 55.24 -28.15L49.01 -24.97A55 55 0 0 0 38.89 -38.89Z" fill="rgba(34,166,93,.45)"/><path d="M63.64 -63.64A90 90 0 0 1 80.19 -40.86L55.24 -28.15A62 62 0 0 0 43.84 -43.84Z" fill="#24211d"/><path d="M70.71 -70.71A100 100 0 0 1 89.10 -45.40L80.19 -40.86A90 90 0 0 0 63.64 -63.64Z" fill="rgba(34,166,93,.45)"/><path d="M49.01 -24.97A55 55 0 0 1 54.32 -8.60L7.90 -1.25A8 8 0 0 0 7.13 -3.63Z" fill="#1b1916"/><path d="M55.24 -28.15A62 62 0 0 1 61.24 -9.70L54.32 -8.60A55 55 0 0 0 49.01 -24.97Z" fill="rgba(200,53,46,.42)"/><path d="M80.19 -40.86A90 90 0 0 1 88.89 -14.08L61.24 -9.70A62 62 0 0 0 55.24 -28.15Z" fill="#1b1916"/><path d="M89.10 -45.40A100 100 0 0 1 98.77 -15.64L88.89 -14.08A90 90 0 0 0 80.19 -40.86Z" fill="rgba(200,53,46,.42)"/><path d="M54.32 -8.60A55 55 0 0 1 54.32 8.60L7.90 1.25A8 8 0 0 0 7.90 -1.25Z" fill="#24211d"/><path d="M61.24 -9.70A62 62 0 0 1 61.24 9.70L54.32 8.60A55 55 0 0 0 54.32 -8.60Z" fill="rgba(34,166,93,.45)"/><path d="M88.89 -14.08A90 90 0 0 1 88.89 14.08L61.24 9.70A62 62 0 0 0 61.24 -9.70Z" fill="#24211d"/><path d="M98.77 -15.64A100 100 0 0 1 98.77 15.64L88.89 14.08A90 90 0 0 0 88.89 -14.08Z" fill="rgba(34,166,93,.45)"/><path d="M54.32 8.60A55 55 0 0 1 49.01 24.97L7.13 3.63A8 8 0 0 0 7.90 1.25Z" fill="#1b1916"/><path d="M61.24 9.70A62 62 0 0 1 55.24 28.15L49.01 24.97A55 55 0 0 0 54.32 8.60Z" fill="rgba(200,53,46,.42)"/><path d="M88.89 14.08A90 90 0 0 1 80.19 40.86L55.24 28.15A62 62 0 0 0 61.24 9.70Z" fill="#1b1916"/><path d="M98.77 15.64A100 100 0 0 1 89.10 45.40L80.19 40.86A90 90 0 0 0 88.89 14.08Z" fill="rgba(200,53,46,.42)"/><path d="M49.01 24.97A55 55 0 0 1 38.89 38.89L5.66 5.66A8 8 0 0 0 7.13 3.63Z" fill="#24211d"/><path d="M55.24 28.15A62 62 0 0 1 43.84 43.84L38.89 38.89A55 55 0 0 0 49.01 24.97Z" fill="rgba(34,166,93,.45)"/><path d="M80.19 40.86A90 90 0 0 1 63.64 63.64L43.84 43.84A62 62 0 0 0 55.24 28.15Z" fill="#24211d"/><path d="M89.10 45.40A100 100 0 0 1 70.71 70.71L63.64 63.64A90 90 0 0 0 80.19 40.86Z" fill="rgba(34,166,93,.45)"/><path d="M38.89 38.89A55 55 0 0 1 24.97 49.01L3.63 7.13A8 8 0 0 0 5.66 5.66Z" fill="#1b1916"/><path d="M43.84 43.84A62 62 0 0 1 28.15 55.24L24.97 49.01A55 55 0 0 0 38.89 38.89Z" fill="rgba(200,53,46,.42)"/><path d="M63.64 63.64A90 90 0 0 1 40.86 80.19L28.15 55.24A62 62 0 0 0 43.84 43.84Z" fill="#1b1916"/><path d="M70.71 70.71A100 100 0 0 1 45.40 89.10L40.86 80.19A90 90 0 0 0 63.64 63.64Z" fill="rgba(200,53,46,.42)"/><path d="M24.97 49.01A55 55 0 0 1 8.60 54.32L1.25 7.90A8 8 0 0 0 3.63 7.13Z" fill="#24211d"/><path d="M28.15 55.24A62 62 0 0 1 9.70 61.24L8.60 54.32A55 55 0 0 0 24.97 49.01Z" fill="rgba(34,166,93,.45)"/><path d="M40.86 80.19A90 90 0 0 1 14.08 88.89L9.70 61.24A62 62 0 0 0 28.15 55.24Z" fill="#24211d"/><path d="M45.40 89.10A100 100 0 0 1 15.64 98.77L14.08 88.89A90 90 0 0 0 40.86 80.19Z" fill="rgba(34,166,93,.45)"/><path d="M8.60 54.32A55 55 0 0 1 -8.60 54.32L-1.25 7.90A8 8 0 0 0 1.25 7.90Z" fill="#1b1916"/><path d="M9.70 61.24A62 62 0 0 1 -9.70 61.24L-8.60 54.32A55 55 0 0 0 8.60 54.32Z" fill="rgba(200,53,46,.42)"/><path d="M14.08 88.89A90 90 0 0 1 -14.08 88.89L-9.70 61.24A62 62 0 0 0 9.70 61.24Z" fill="#1b1916"/><path d="M15.64 98.77A100 100 0 0 1 -15.64 98.77L-14.08 88.89A90 90 0 0 0 14.08 88.89Z" fill="rgba(200,53,46,.42)"/><path d="M-8.60 54.32A55 55 0 0 1 -24.97 49.01L-3.63 7.13A8 8 0 0 0 -1.25 7.90Z" fill="#24211d"/><path d="M-9.70 61.24A62 62 0 0 1 -28.15 55.24L-24.97 49.01A55 55 0 0 0 -8.60 54.32Z" fill="rgba(34,166,93,.45)"/><path d="M-14.08 88.89A90 90 0 0 1 -40.86 80.19L-28.15 55.24A62 62 0 0 0 -9.70 61.24Z" fill="#24211d"/><path d="M-15.64 98.77A100 100 0 0 1 -45.40 89.10L-40.86 80.19A90 90 0 0 0 -14.08 88.89Z" fill="rgba(34,166,93,.45)"/><path d="M-24.97 49.01A55 55 0 0 1 -38.89 38.89L-5.66 5.66A8 8 0 0 0 -3.63 7.13Z" fill="#1b1916"/><path d="M-28.15 55.24A62 62 0 0 1 -43.84 43.84L-38.89 38.89A55 55 0 0 0 -24.97 49.01Z" fill="rgba(200,53,46,.42)"/><path d="M-40.86 80.19A90 90 0 0 1 -63.64 63.64L-43.84 43.84A62 62 0 0 0 -28.15 55.24Z" fill="#1b1916"/><path d="M-45.40 89.10A100 100 0 0 1 -70.71 70.71L-63.64 63.64A90 90 0 0 0 -40.86 80.19Z" fill="rgba(200,53,46,.42)"/><path d="M-38.89 38.89A55 55 0 0 1 -49.01 24.97L-7.13 3.63A8 8 0 0 0 -5.66 5.66Z" fill="#24211d"/><path d="M-43.84 43.84A62 62 0 0 1 -55.24 28.15L-49.01 24.97A55 55 0 0 0 -38.89 38.89Z" fill="rgba(34,166,93,.45)"/><path d="M-63.64 63.64A90 90 0 0 1 -80.19 40.86L-55.24 28.15A62 62 0 0 0 -43.84 43.84Z" fill="#24211d"/><path d="M-70.71 70.71A100 100 0 0 1 -89.10 45.40L-80.19 40.86A90 90 0 0 0 -63.64 63.64Z" fill="rgba(34,166,93,.45)"/><path d="M-49.01 24.97A55 55 0 0 1 -54.32 8.60L-7.90 1.25A8 8 0 0 0 -7.13 3.63Z" fill="#1b1916"/><path d="M-55.24 28.15A62 62 0 0 1 -61.24 9.70L-54.32 8.60A55 55 0 0 0 -49.01 24.97Z" fill="rgba(200,53,46,.42)"/><path d="M-80.19 40.86A90 90 0 0 1 -88.89 14.08L-61.24 9.70A62 62 0 0 0 -55.24 28.15Z" fill="#1b1916"/><path d="M-89.10 45.40A100 100 0 0 1 -98.77 15.64L-88.89 14.08A90 90 0 0 0 -80.19 40.86Z" fill="rgba(200,53,46,.42)"/><path d="M-54.32 8.60A55 55 0 0 1 -54.32 -8.60L-7.90 -1.25A8 8 0 0 0 -7.90 1.25Z" fill="#24211d"/><path d="M-61.24 9.70A62 62 0 0 1 -61.24 -9.70L-54.32 -8.60A55 55 0 0 0 -54.32 8.60Z" fill="rgba(34,166,93,.45)"/><path d="M-88.89 14.08A90 90 0 0 1 -88.89 -14.08L-61.24 -9.70A62 62 0 0 0 -61.24 9.70Z" fill="#24211d"/><path d="M-98.77 15.64A100 100 0 0 1 -98.77 -15.64L-88.89 -14.08A90 90 0 0 0 -88.89 14.08Z" fill="rgba(34,166,93,.45)"/><path d="M-54.32 -8.60A55 55 0 0 1 -49.01 -24.97L-7.13 -3.63A8 8 0 0 0 -7.90 -1.25Z" fill="#1b1916"/><path d="M-61.24 -9.70A62 62 0 0 1 -55.24 -28.15L-49.01 -24.97A55 55 0 0 0 -54.32 -8.60Z" fill="rgba(200,53,46,.42)"/><path d="M-88.89 -14.08A90 90 0 0 1 -80.19 -40.86L-55.24 -28.15A62 62 0 0 0 -61.24 -9.70Z" fill="#1b1916"/><path d="M-98.77 -15.64A100 100 0 0 1 -89.10 -45.40L-80.19 -40.86A90 90 0 0 0 -88.89 -14.08Z" fill="rgba(200,53,46,.42)"/><path d="M-49.01 -24.97A55 55 0 0 1 -38.89 -38.89L-5.66 -5.66A8 8 0 0 0 -7.13 -3.63Z" fill="#24211d"/><path d="M-55.24 -28.15A62 62 0 0 1 -43.84 -43.84L-38.89 -38.89A55 55 0 0 0 -49.01 -24.97Z" fill="rgba(34,166,93,.45)"/><path d="M-80.19 -40.86A90 90 0 0 1 -63.64 -63.64L-43.84 -43.84A62 62 0 0 0 -55.24 -28.15Z" fill="#24211d"/><path d="M-89.10 -45.40A100 100 0 0 1 -70.71 -70.71L-63.64 -63.64A90 90 0 0 0 -80.19 -40.86Z" fill="rgba(34,166,93,.45)"/><path d="M-38.89 -38.89A55 55 0 0 1 -24.97 -49.01L-3.63 -7.13A8 8 0 0 0 -5.66 -5.66Z" fill="#1b1916"/><path d="M-43.84 -43.84A62 62 0 0 1 -28.15 -55.24L-24.97 -49.01A55 55 0 0 0 -38.89 -38.89Z" fill="rgba(200,53,46,.42)"/><path d="M-63.64 -63.64A90 90 0 0 1 -40.86 -80.19L-28.15 -55.24A62 62 0 0 0 -43.84 -43.84Z" fill="#1b1916"/><path d="M-70.71 -70.71A100 100 0 0 1 -45.40 -89.10L-40.86 -80.19A90 90 0 0 0 -63.64 -63.64Z" fill="rgba(200,53,46,.42)"/><path d="M-24.97 -49.01A55 55 0 0 1 -8.60 -54.32L-1.25 -7.90A8 8 0 0 0 -3.63 -7.13Z" fill="#24211d"/><path d="M-28.15 -55.24A62 62 0 0 1 -9.70 -61.24L-8.60 -54.32A55 55 0 0 0 -24.97 -49.01Z" fill="rgba(34,166,93,.45)"/><path d="M-40.86 -80.19A90 90 0 0 1 -14.08 -88.89L-9.70 -61.24A62 62 0 0 0 -28.15 -55.24Z" fill="#24211d"/><path d="M-45.40 -89.10A100 100 0 0 1 -15.64 -98.77L-14.08 -88.89A90 90 0 0 0 -40.86 -80.19Z" fill="rgba(34,166,93,.45)"/><circle r="8" fill="rgba(34,166,93,.5)"/><circle r="3.6" fill="rgba(200,53,46,.55)"/><circle r="100" fill="none" stroke="rgba(255,236,200,.10)" stroke-width=".6"/></svg>`;

  // ------------------------------------------------------------------
  // Texte
  // ------------------------------------------------------------------

  const ERRORS = {
    wrong: 'Die PIN stimmt nicht.',
    locked: 'Zu viele Fehlversuche. Das Profil ist 15 Minuten gesperrt.',
    unknown: 'Dieses Profil gibt es nicht.',
    name_taken: 'Diesen Namen gibt es schon. Melde dich an oder wähle einen anderen.',
    name_invalid: 'Der Name braucht 2 bis 24 Zeichen.',
    pin_invalid: 'Die PIN muss aus genau 4 Ziffern bestehen.',
    locked_match: 'Tippschluss: Das Spiel hat schon begonnen.',
    match_not_ready: 'Für dieses Spiel fehlen noch Paarung oder Beginn.',
    match_unknown: 'Dieses Spiel gibt es nicht mehr.',
    sets_invalid: 'Dieses Satzergebnis ist nicht möglich.',
    pick_invalid: 'Ungültiger Tipp.',
    not_admin: 'Dafür brauchst du Admin-Rechte.',
    next_match_played: 'Das Folgespiel hat schon ein Ergebnis. Lösche zuerst das Ergebnis dort.',
    round_unknown: 'Diese Runde gibt es nicht.',
    import_format: 'Der Import muss eine JSON-Liste sein.',
    self_delete: 'Du kannst dein eigenes Profil nicht löschen.'
  };
  const isNetwork = (e) => !e?.code && /fetch|network|load failed|netzwerk/i.test(e?.message || '');
  const errText = (e) => {
    if (e?.code === 'result_invalid') return `Ergebnis ungültig: Eine Seite braucht genau ${e.data.first_to} Sätze, die andere weniger.`;
    if (isNetwork(e)) return 'Keine Verbindung.';
    return ERRORS[e?.code] || e?.message || 'Unbekannter Fehler.';
  };
  // Alte Protokolltexte der Automatik nutzen noch „Anstoß“.
  const darts = (s) => String(s ?? '').replace(/Anstoß/g, 'Beginn').replace(/Anpfiff/g, 'Spielbeginn');
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // ------------------------------------------------------------------
  // Zustand
  // ------------------------------------------------------------------

  const state = {
    session: readSession(),
    rounds: {},
    matches: [],
    myTips: {},
    publicTips: [],
    board: [],
    players: [],
    loaded: false,
    loadError: null,
    filter: 'alle',
    filterIds: null,       // „Ohne Tipp“: Karten bleiben bis zum nächsten Laden stehen
    lockedErr: {},         // Karten mit abgelehntem Tipp (Tippschluss)
    savePhase: {},         // id -> 'saving' | 'saved'
    resultOpen: {},        // vom Nutzer auf- oder zugeklappte Ergebnisse
    adminDay: null,
    authMode: 'login'
  };

  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
  }
  function writeSession(s) {
    state.session = s;
    try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* privat */ }
  }
  const lastName = {
    get() { try { return localStorage.getItem(LASTNAME_KEY) || ''; } catch { return ''; } },
    set(v) { try { localStorage.setItem(LASTNAME_KEY, v); } catch { /* privat */ } }
  };

  // ------------------------------------------------------------------
  // Backend
  // ------------------------------------------------------------------

  const configured = !!(CFG.supabaseUrl && CFG.supabaseKey && !CFG.supabaseUrl.includes('DEIN-PROJEKT'));
  const db = configured && window.supabase ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;

  async function rpc(fn, args = {}) {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
    if (data && data.ok === false) {
      const e = new Error(data.error); e.code = data.error; e.data = data;
      if (['wrong', 'unknown'].includes(e.code) && fn !== 'login' && fn !== 'register_player' && state.session) {
        writeSession(null);
        toast('Bitte melde dich neu an.', true);
        setTimeout(route, 0);
      }
      throw e;
    }
    return data;
  }
  const auth = () => ({ p_player: state.session.id, p_pin: state.session.pin });

  function enrich(m) {
    const r = state.rounds[m.round_id] || { name: `Runde ${m.round_id}`, best_of: 5, multiplier: 1 };
    const start = m.starts_at ? new Date(m.starts_at) : null;
    const ft = (r.best_of + 1) / 2;
    const finished = m.sets1 != null && m.sets2 != null;
    return {
      ...m, round: r, start, ft, finished,
      started: !!start && start.getTime() <= Date.now(),
      ready: !!(m.player1 && m.player2 && start),
      winner: finished ? (m.sets1 === ft ? 1 : 2) : null
    };
  }

  async function loadAll() {
    const [r, m, board, pub, players] = await Promise.all([
      db.from('rounds').select('*'),
      db.from('matches').select('*'),
      rpc('leaderboard'),
      rpc('get_public_tips'),
      rpc('list_players')
    ]);
    if (r.error) throw new Error(r.error.message);
    if (m.error) throw new Error(m.error.message);
    state.rounds = Object.fromEntries(r.data.map((x) => [x.id, x]));
    state.matches = m.data.map(enrich).sort((a, b) =>
      (a.start ? a.start.getTime() : Infinity) - (b.start ? b.start.getTime() : Infinity) ||
      a.round_id - b.round_id || a.pos - b.pos);
    state.board = board || [];
    state.publicTips = pub || [];
    state.players = players || [];
    if (state.session) {
      const t = await rpc('get_my_tips', auth());
      state.myTips = Object.fromEntries(t.tips.map((x) => [x.match_id, x]));
    }
    state.loaded = true;
    state.loadError = null;
    state.lockedErr = {};
    if (state.filter === 'offen') state.filterIds = untippedIds();
  }

  const refreshStatus = () => { state.matches = state.matches.map(enrich); };
  const openMatches = () => state.matches.filter((m) => m.ready && !m.started && !m.finished);
  const untippedIds = () => new Set(openMatches().filter((m) => !state.myTips[m.id]).map((m) => m.id));

  // ------------------------------------------------------------------
  // Formatierung
  // ------------------------------------------------------------------

  const fmtTime = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const fmtDay = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
  const fmtDayLong = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  const fmtStamp = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const dayKey = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d); // YYYY-MM-DD

  function toLocalInput(d) {
    if (!d) return '';
    const p = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }

  // Tippschluss-Hinweis: > 24 Std keiner · bis 24 Std Text · < 3 Std Umriss · < 60 Min kräftig
  function deadline(m) {
    const min = (m.start.getTime() - Date.now()) / 60000;
    if (min > 24 * 60) return '';
    if (min < 60) return `<span class="deadline now">${ICON.clock}Tippschluss in ${Math.max(1, Math.round(min))} Min</span>`;
    const h = Math.round(min / 60);
    return min < 180
      ? `<span class="deadline soon">${ICON.clock}Tippschluss in ${h} Std</span>`
      : `<span class="deadline">Tippschluss in ${h} Std</span>`;
  }

  const PARTICLES = new Set(['van', 'von', 'de', 'den', 'der', 'da', 'di', 'du', 'le', 'la', 'mac', 'mc']);
  // „Michael van Gerwen“ → „van Gerwen“, „Dimitri Van den Bergh“ → „Van den Bergh“
  function shortName(full) {
    const w = String(full || '').trim().split(/\s+/);
    if (w.length < 2) return w[0] || 'offen';
    const i = w.findIndex((x, k) => k > 0 && PARTICLES.has(x.toLowerCase()));
    return i > 0 ? w.slice(i).join(' ') : w[w.length - 1];
  }
  const pName = (m, side) => (side === 1 ? m.player1 : m.player2) || 'offen';
  const tipLabel = (m, t) => {
    if (!t) return 'kein Tipp';
    const n = shortName(pName(m, t.pick));
    return t.loser_sets != null ? `${n} ${m.ft}:${t.loser_sets}` : n;
  };
  const ptsText = (p) => (p > 0 ? `+${p}` : String(p));

  function groupByDay(list) {
    const groups = new Map();
    for (const m of list) {
      const k = m.start ? dayKey(m.start) : 'offen';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(m);
    }
    return groups;
  }

  // ------------------------------------------------------------------
  // Tippen
  // ------------------------------------------------------------------

  function matchCard(m) {
    const t = state.myTips[m.id];
    const err = state.lockedErr[m.id];
    const locked = !!err || m.started;
    const mult = m.round.multiplier || 1;
    const phase = state.savePhase[m.id];
    const winner = t ? pName(m, t.pick) : '';
    const cls = ['match', t && 'tipped', locked && 'locked'].filter(Boolean).join(' ');

    const side = (s) => `<button type="button" class="side${t && t.pick !== s ? ' other' : ''}" data-action="pick" data-id="${m.id}" data-pick="${s}" aria-pressed="${t?.pick === s}"${locked ? ' disabled' : ''}>${esc(pName(m, s))}</button>`;

    let label;
    if (locked) label = t ? `Dein Tipp: <b>${esc(winner)}</b>` : 'Kein Tipp abgegeben';
    else label = t ? `Wie gewinnt <b>${esc(winner)}?</b>` : 'Erst Sieger wählen';

    const off = !t || locked;
    const scores = Array.from({ length: m.ft }, (_, l) => {
      const aria = t ? `${winner} gewinnt ${m.ft} zu ${l}` : `Erst Sieger wählen: ${m.ft} zu ${l}`;
      return `<button type="button" class="score" data-action="exact" data-id="${m.id}" data-l="${l}" aria-pressed="${t?.loser_sets === l}"${off ? ' aria-disabled="true" tabindex="-1"' : ''} aria-label="${esc(aria)}">${m.ft}:${l}</button>`;
    }).join('');
    const bonus = locked ? '' : `<span class="bonus"><span aria-hidden="true">exakt +${2 * mult}</span><span class="sr-only">Exaktes Ergebnis bringt ${2 * mult} Zusatzpunkte</span></span>`;
    const groupLabel = t ? `Exaktes Ergebnis für ${winner}` : 'Exaktes Ergebnis, erst Sieger wählen';

    const meta = `<div class="meta"><span class="time">${fmtTime.format(m.start)}</span><span>${esc(m.round.name)}</span><span>Best of ${m.round.best_of}</span>${mult > 1 ? '<span class="badge x2">Punkte ×2</span>' : ''}${locked ? `<span class="deadline locked">${ICON.lock}Tippschluss</span>` : deadline(m)}</div>`;

    const errBlock = err ? `<div class="card-error" role="alert" tabindex="-1">${ICON.warn}<div><p>${esc(err)}</p><a href="#ergebnisse">Tipps der anderen ansehen</a></div></div>` : '';

    return `<article class="${cls}" data-card="${m.id}" aria-label="${esc(`${pName(m, 1)} gegen ${pName(m, 2)}, ${fmtTime.format(m.start)}`)}">${meta}<div class="pick">${side(1)}<span class="vs">vs</span>${side(2)}</div><div class="exact" role="group" aria-label="${esc(groupLabel)}"><span class="label">${label}</span>${bonus}${scores}<span class="saving"${phase === 'saving' ? '' : ' hidden'}>speichert …</span><span class="saved"${phase === 'saved' ? '' : ' hidden'}>gespeichert</span></div>${errBlock}</article>`;
  }

  // Bezug der Statusleiste: der nächste Spieltag mit offenen Spielen.
  function nextDayInfo() {
    const open = openMatches();
    if (!open.length) return null;
    const key = dayKey(open[0].start);
    const list = open.filter((m) => dayKey(m.start) === key);
    const tipped = list.filter((m) => state.myTips[m.id]).length;
    return { key, label: fmtDay.format(open[0].start), list, tipped, left: list.length - tipped };
  }

  function statusbar(info) {
    const score = info.left > 0
      ? `<span class="sb-num">${info.left}</span><span class="sb-lbl">offen</span>`
      : '<span class="sb-done">alle getippt</span>';
    return `<div class="statusbar"><div class="status-row"><div class="sb-bug"><span class="status-day">${esc(info.label)}</span><span class="sb-score">${score}<span class="sr-only">, ${info.tipped} von ${info.list.length} getippt</span></span></div><div class="chips" role="group" aria-label="Filter"><button type="button" class="chip" data-action="filter" data-f="alle" aria-pressed="${state.filter === 'alle'}">Alle</button><button type="button" class="chip" data-action="filter" data-f="offen" aria-pressed="${state.filter === 'offen'}">Ohne Tipp</button></div></div><div class="progress" aria-hidden="true">${info.list.map((m) => `<i class="${state.myTips[m.id] ? 'on' : ''}"></i>`).join('')}</div></div>`;
  }

  function dayStatus(key) {
    const list = openMatches().filter((m) => dayKey(m.start) === key);
    const left = list.filter((m) => !state.myTips[m.id]).length;
    return left > 0 ? `<span class="day-status"><b>${left}</b> offen</span>` : '<span class="day-status done">alle getippt</span>';
  }

  function pendingNote() {
    const n = state.matches.filter((m) => !m.ready && !m.finished).length;
    if (!n) return '';
    return `<p class="note">${ICON.hourglass}<span>${n} weitere ${n === 1 ? 'Spiel folgt' : 'Spiele folgen'}, sobald Paarung und Beginn feststehen.</span></p>`;
  }

  function renderTippen() {
    const h1 = '<h1 class="sr-only">Tippen</h1>';
    if (!state.matches.length) {
      view.innerHTML = `${h1}<div class="empty">${ICON.bracket}<h2>Noch keine Spiele</h2><p>Sobald Auslosung und Spielplan feststehen, erscheinen die Partien hier.</p></div>`;
      return;
    }
    const info = nextDayInfo();
    const extra = state.matches.filter((m) => state.lockedErr[m.id] && !(m.ready && !m.started && !m.finished));
    if (!info && !extra.length) {
      view.innerHTML = `${h1}<div class="empty">${ICON.timer}<h2>Gerade nichts zu tippen</h2><p>Im Moment ist kein Spiel offen.</p><a class="btn" href="#ergebnisse">Zu den Ergebnissen</a></div>${pendingNote()}`;
      return;
    }
    let base = openMatches();
    if (state.filter === 'offen') {
      if (!state.filterIds) state.filterIds = untippedIds();
      base = base.filter((m) => state.filterIds.has(m.id));
    }
    const shown = [...base, ...extra].sort((a, b) => a.start - b.start);

    let html = h1 + (info ? statusbar(info) : '');
    if (!shown.length) {
      html += `<div class="empty">${ICON.rings}<h2>Alles getippt</h2><p>Du hast auf alle offenen Spiele getippt. Ändern geht bis zum Spielbeginn.</p><button type="button" class="btn" data-action="filter" data-f="alle">Alle anzeigen</button></div>`;
    } else {
      for (const [key, list] of groupByDay(shown)) {
        const label = esc(fmtDay.format(list[0].start));
        html += info && key === info.key
          ? `<h2 class="sr-only"><span>${label}</span></h2>`
          : `<h2 class="day" data-day="${key}"><span>${label}</span>${dayStatus(key)}</h2>`;
        html += `<div class="stack">${list.map(matchCard).join('')}</div>`;
      }
    }
    view.innerHTML = html + pendingNote();
  }

  // Nach dem Tippen: Karte, Statusleiste und Tagesstatus mitziehen, Fokus halten.
  function rerenderCard(id, focus) {
    const m = state.matches.find((x) => x.id === id);
    const el = view.querySelector(`[data-card="${id}"]`);
    if (!m || !el) return;
    const active = el.contains(document.activeElement) ? document.activeElement : null;
    const key = focus || (active && active.dataset.action
      ? `[data-action="${active.dataset.action}"]${active.dataset.pick ? `[data-pick="${active.dataset.pick}"]` : ''}${active.dataset.l ? `[data-l="${active.dataset.l}"]` : ''}`
      : null);
    el.outerHTML = matchCard(m);
    const fresh = view.querySelector(`[data-card="${id}"]`);
    if (key && fresh) fresh.querySelector(key)?.focus({ preventScroll: true });

    const info = nextDayInfo();
    const bar = view.querySelector('.statusbar');
    if (bar && info) bar.outerHTML = statusbar(info);
    for (const h of view.querySelectorAll('h2.day[data-day]')) {
      h.querySelector('.day-status')?.remove();
      h.insertAdjacentHTML('beforeend', dayStatus(h.dataset.day));
    }
  }

  const savedTimers = {};
  async function saveTip(id, pick, loserSets) {
    const m = state.matches.find((x) => x.id === id);
    if (!m) return;
    const before = state.myTips[id] ? { ...state.myTips[id] } : null;
    if (pick == null) delete state.myTips[id];
    else state.myTips[id] = { ...(before || {}), match_id: id, pick, loser_sets: loserSets };
    clearTimeout(savedTimers[id]);
    state.savePhase[id] = 'saving';
    rerenderCard(id);
    try {
      await rpc('save_tip', { ...auth(), p_match: id, p_pick: pick, p_loser_sets: loserSets });
      if (pick == null) {
        delete state.savePhase[id];
        rerenderCard(id);
        const label = tipLabel(m, before);
        announce(`Tipp ${label} entfernt`);
        toast(`Tipp ${label} entfernt`, false, { label: 'Rückgängig', fn: () => saveTip(id, before.pick, before.loser_sets ?? null) });
      } else {
        state.savePhase[id] = 'saved';
        rerenderCard(id);
        announce(`${tipLabel(m, state.myTips[id])} gespeichert`);
        savedTimers[id] = setTimeout(() => { delete state.savePhase[id]; rerenderCard(id); }, 1200);
      }
    } catch (e) {
      delete state.savePhase[id];
      if (before) state.myTips[id] = before; else delete state.myTips[id];
      if (e.code === 'locked_match') {
        state.lockedErr[id] = before
          ? `Zu spät, das Spiel hat begonnen. Deine Änderung wurde nicht gespeichert, es bleibt bei ${tipLabel(m, before)}.`
          : 'Zu spät, das Spiel hat begonnen. Dein Tipp wurde nicht gespeichert.';
        rerenderCard(id, '.card-error');
        return;
      }
      rerenderCard(id);
      const what = pick == null ? `Tipp ${tipLabel(m, before)} nicht entfernt.` : `Tipp auf ${shortName(pName(m, pick))} nicht gespeichert.`;
      toast(isNetwork(e) ? `Keine Verbindung. ${what}` : `${errText(e)} ${what}`, true,
        { label: 'Erneut versuchen', fn: () => saveTip(id, pick, loserSets) });
    }
  }

  function nudge(id) {
    const el = view.querySelector(`[data-card="${id}"]`);
    if (!el) return;
    el.classList.remove('nudge');
    void el.offsetWidth;
    el.classList.add('nudge');
    setTimeout(() => el.classList.remove('nudge'), 600);
  }

  // ------------------------------------------------------------------
  // Ergebnisse
  // ------------------------------------------------------------------

  function resultBlock(m, tips, isOpen) {
    const mine = tips.find((t) => t.player_id === state.session?.id);
    const mult = m.round.multiplier || 1;
    const cls = (s) => (m.finished ? (m.winner === s ? ' win' : ' lose') : '');
    const sets = m.finished
      ? `<span class="sets"><span aria-hidden="true">${m.sets1}:${m.sets2}</span><span class="sr-only">${m.sets1} zu ${m.sets2} Sätze</span></span>`
      : '<span class="sets open"><span aria-hidden="true">–:–</span><span class="sr-only">noch kein Ergebnis</span></span>';

    let calc = ''; let big = '';
    if (m.finished && mine) {
      if (mine.exact) {
        calc = mult > 1 ? '(1 + 2) × 2' : '1 Sieger + 2 exakt';
        big = `<span class="pts big exact"><span class="v">${ptsText(mine.points)}</span><span class="w">exakt${mult > 1 ? ' ×2' : ''}</span></span>`;
      } else if (mine.hit) {
        calc = mult > 1 ? '1 Sieger × 2' : '1 Sieger';
        big = `<span class="pts big plus"><span class="v">${ptsText(mine.points)}</span><span class="w">Treffer${mult > 1 ? ' ×2' : ''}</span></span>`;
      } else {
        calc = 'falscher Sieger';
        big = '<span class="pts big"><span class="v">0</span><span class="w">daneben</span></span>';
      }
    } else if (m.finished) {
      calc = 'nicht getippt';
    }

    // Tippliste: nach Punkten, dann alphabetisch; wer nicht getippt hat, am Ende.
    const rows = [...tips].sort((a, b) => (m.finished ? (b.points - a.points) : 0) || a.name.localeCompare(b.name, 'de'));
    const tipped = new Set(tips.map((t) => t.player_id));
    const missing = state.players.filter((p) => !tipped.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const li = (id, name, label, pts) => `<li class="${id === state.session?.id ? 'me' : ''}"><span class="n">${esc(name)}</span><span class="t">${esc(label)}</span>${pts}</li>`;
    const list = [
      ...rows.map((t) => li(t.player_id, t.name, tipLabel(m, t),
        m.finished ? `<span class="pts ${t.exact ? 'exact' : t.points > 0 ? 'plus' : ''}">${ptsText(t.points)}</span>` : '')),
      ...missing.map((p) => li(p.id, p.name, 'kein Tipp', ''))
    ].join('');

    const short1 = shortName(pName(m, 1)); const short2 = shortName(pName(m, 2));
    const summaryLabel = m.finished
      ? `${short1} ${m.sets1}:${m.sets2} ${short2}, dein Tipp ${mine ? ptsText(mine.points) : 'fehlt'}`
      : `${short1} gegen ${short2}, läuft, dein Tipp ${tipLabel(m, mine)}`;

    return `<details class="result" data-result="${m.id}"${isOpen ? ' open' : ''}><summary aria-label="${esc(summaryLabel)}"><div class="meta">${m.start ? `<span class="time">${fmtTime.format(m.start)}</span>` : ''}<span>${esc(m.round.name)}</span><span>Best of ${m.round.best_of}</span>${m.finished ? '' : '<span class="badge live">läuft</span>'}${mult > 1 ? '<span class="badge x2">×2<span class="sr-only"> Punkte doppelt</span></span>' : ''}</div><div class="scoreline"><span class="p${cls(1)}">${esc(pName(m, 1))}</span>${sets}<span class="p r${cls(2)}">${esc(pName(m, 2))}</span></div><div class="mytip"><span class="tip"><span class="k">Dein Tipp</span><b>${esc(tipLabel(m, mine))}</b>${calc ? `<span class="calc">${calc}</span>` : ''}</span>${big}${ICON.chev}</div></summary><ul class="tiplist">${list || '<li><span class="t">Noch keine Profile.</span></li>'}</ul></details>`;
  }

  function renderErgebnisse() {
    const list = state.matches.filter((m) => m.started || m.finished)
      .sort((a, b) => (b.start?.getTime() || 0) - (a.start?.getTime() || 0));
    const title = '<h1 class="page">Ergebnisse</h1>';
    if (!list.length) {
      view.innerHTML = `${title}<div class="empty">${ICON.timer}<h2>Noch nichts gespielt</h2><p>Sobald ein Spiel beginnt, siehst du hier alle Tipps und später das Ergebnis.</p></div>`;
      return;
    }
    const byMatch = new Map();
    for (const t of state.publicTips) {
      if (!byMatch.has(t.match_id)) byMatch.set(t.match_id, []);
      byMatch.get(t.match_id).push(t);
    }
    const newest = list.find((m) => m.finished)?.id;
    let html = title;
    for (const [, ms] of groupByDay(list)) {
      html += `<h2 class="day"><span>${ms[0].start ? esc(fmtDay.format(ms[0].start)) : 'Ohne Termin'}</span></h2><div class="stack">`;
      html += ms.map((m) => resultBlock(m, byMatch.get(m.id) || [], state.resultOpen[m.id] ?? m.id === newest)).join('');
      html += '</div>';
    }
    view.innerHTML = html;
  }

  // ------------------------------------------------------------------
  // Rangliste
  // ------------------------------------------------------------------

  function renderRangliste() {
    const meId = state.session?.id;
    const finishedCount = state.matches.filter((m) => m.finished).length;
    const rows = [...state.board].sort((a, b) => b.points - a.points || b.exacts - a.exacts || a.name.localeCompare(b.name, 'de'));
    let rank = 0; let prev = null;
    rows.forEach((r, i) => { const k = `${r.points}|${r.exacts}`; if (k !== prev) { rank = i + 1; prev = k; } r.rank = rank; });

    const du = '<span class="du"><span class="sr-only">, </span>du</span>';
    const sub = `${plural(rows.length, 'Tipper', 'Tipper')} · ${finishedCount ? `nach ${plural(finishedCount, 'Spiel', 'Spielen')}` : 'noch kein Ergebnis'}`;
    let html = `<div class="rank-head"><h1>Rangliste</h1><p class="sub">${sub}</p></div>`;

    const groups = [];
    if (finishedCount) {
      for (const r of rows) {
        if (r.rank > 3 || r.points <= 0) continue;
        const g = groups.find((x) => x.rank === r.rank);
        g ? g.people.push(r) : groups.push({ rank: r.rank, people: [r] });
      }
    }
    const podIds = new Set(groups.flatMap((g) => g.people.map((p) => p.player_id)));

    if (groups.length) {
      html += `<section class="podium n${groups.length}" aria-label="Podium">${groups.map((g, i) => `<div class="pod p${i + 1}"><div class="pod-people">${g.people.map((p) => `<div class="pod-person${p.player_id === meId ? ' me' : ''}"><span class="pod-name">${esc(p.name)}${p.player_id === meId ? du : ''}</span><span class="pod-pts">${p.points}<small>Pkt</small></span><span class="pod-stats">${p.exacts} exakt</span></div>`).join('')}</div><div class="pod-step"><span>${g.rank}</span>${g.people.length > 1 ? '<span class="pod-shared">geteilt</span>' : ''}</div></div>`).join('')}</section>`;
    } else if (rows.length) {
      const wait = finishedCount ? 'Noch hat niemand gepunktet.' : 'Das Podium wird nach dem ersten Ergebnis besetzt.';
      html += `<section class="podium is-empty" aria-label="Podium">${[1, 2, 3].map((n) => `<div class="pod p${n}"><div class="pod-people"></div><div class="pod-step"><span>${n}</span></div></div>`).join('')}<p class="pod-wait">${wait}</p></section>`;
    }

    const rest = finishedCount
      ? rows.filter((r) => !podIds.has(r.player_id))
      : [...rows].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const meRow = rest.find((r) => r.player_id === meId);
    if (finishedCount && meRow && groups.length) {
      html += `<a class="myplace" href="#me" data-action="myplace" aria-label="Dein Platz ${meRow.rank}, ${plural(meRow.points, 'Punkt', 'Punkte')}. Zu deinem Eintrag springen"><span class="mp-k">Dein Platz</span><b>${meRow.rank}</b><span class="mp-pts">${plural(meRow.points, 'Punkt', 'Punkte')}</span><span class="mp-go" aria-hidden="true"></span></a>`;
    }
    if (rows.length === 1) {
      html += '<p class="alone">Noch bist du allein in der Wertung. Sobald weitere aus der Mannschaft ein Profil anlegen, erscheinen sie hier.</p>';
    } else if (rest.length) {
      html += `<ol class="board-list">${rest.map((r) => {
        const me = r.player_id === meId;
        return `<li${me ? ' class="me" id="me" tabindex="-1"' : ''}><span class="rank">${finishedCount ? r.rank : '–'}</span><div><div class="pname">${esc(r.name)}${me ? ` ${du}` : ''}</div><div class="pstats">${finishedCount ? `${r.hits} Treffer · ${r.exacts} exakt · ${r.tipped} gewertet` : 'noch nichts gewertet'}</div></div><div class="ppoints">${r.points}<small>Pkt</small></div></li>`;
      }).join('')}</ol>`;
    }

    const firstMult = Object.values(state.rounds).sort((a, b) => a.id - b.id).find((r) => r.multiplier > 1);
    html += `<section class="rules"><h2>So wird gezählt</h2><div class="rule-tiles"><div class="rt"><b>1</b><span>Punkt für den richtigen Sieger</span></div><div class="rt ex"><b>+2</b><span>dazu für das exakte Satzergebnis</span></div>${firstMult ? `<div class="rt"><b>×${firstMult.multiplier}</b><span>ab ${esc(firstMult.name)} zählen alle Punkte ${firstMult.multiplier === 2 ? 'doppelt' : `${firstMult.multiplier}-fach`}</span></div>` : ''}</div><ul><li>Tippschluss ist der Spielbeginn. Danach sind alle Tipps sichtbar.</li><li>Bei Punktgleichheit entscheiden die exakten Tipps. Ist auch das gleich, teilt ihr euch den Platz.</li></ul></section>`;
    view.innerHTML = html;
  }

  // ------------------------------------------------------------------
  // Anmelden
  // ------------------------------------------------------------------

  function renderAuth() {
    tabs.hidden = true; who.innerHTML = '';
    document.body.classList.add('auth-shell');
    view.className = 'view auth';
    const first = state.players.length === 0;
    const mode = first ? 'register' : state.authMode;
    const remembered = lastName.get();
    const subText = first
      ? 'Noch hat niemand ein Profil. Leg deins an, dann können die anderen nachziehen.'
      : 'Tippe auf jedes WM-Spiel den Sieger. Für das exakte Satzergebnis gibt es Extrapunkte.';
    const pin = (name, label, ac) => `<label class="f">${label}<input name="${name}" class="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="${ac}" placeholder="• • • •"></label>`;
    const fields = mode === 'login'
      ? `<label class="f">Name<span class="select"><select name="name" required><option value="">Bitte wählen</option>${state.players.map((p) => `<option${p.name === remembered ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></span></label>${pin('pin', 'PIN', 'current-password')}`
      : `<label class="f">Dein Name, wie ihn das Team kennt<input name="name" maxlength="24" autocomplete="nickname"></label><div class="pin-row">${pin('pin', 'PIN (4 Ziffern)', 'new-password')}${pin('pin2', 'PIN wiederholen', 'new-password')}</div>`;
    view.innerHTML = `<div class="auth-hero">${STAGE_BOARD}<h1>Wer tippt mit?</h1><p class="sub">${subText}</p></div>${first ? '' : `<div class="seg" role="group" aria-label="Anmelden oder neues Profil"><button type="button" data-action="authmode" data-mode="login" aria-pressed="${mode === 'login'}">Anmelden</button><button type="button" data-action="authmode" data-mode="register" aria-pressed="${mode === 'register'}">Neues Profil</button></div>`}<form class="form" id="authForm" novalidate>${fields}<p class="form-err" id="authErr" role="alert" hidden>${ICON.warn}<span></span></p><button type="submit" class="btn-primary">${mode === 'login' ? 'Anmelden' : 'Profil anlegen'}</button></form><p class="auth-note">Die PIN schützt dein Profil, damit niemand für dich tippt. Sie wird verschlüsselt gespeichert. ${mode === 'login' ? `PIN vergessen? ${esc(CFG.admin || 'Der Admin')} kann sie zurücksetzen.` : 'Merk sie dir gut.'}</p>`;
  }

  function authError(form, msg, field) {
    const p = form.querySelector('#authErr');
    p.querySelector('span').textContent = msg;
    p.hidden = false;
    form.setAttribute('aria-describedby', 'authErr');
    for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
    const target = field && form.querySelector(`[name="${field}"]`);
    if (target) { target.setAttribute('aria-invalid', 'true'); target.focus(); }
  }

  // ------------------------------------------------------------------
  // Systemzustände
  // ------------------------------------------------------------------

  function renderSetup() {
    tabs.hidden = true; who.innerHTML = '';
    view.className = 'view';
    view.innerHTML = `<div class="empty sys">${ICON.terminal}<h2>Fast fertig</h2><p>Die App ist noch nicht mit der Datenbank verbunden.</p><ol class="steps"><li>In <code>config.js</code> die URL und den anon key des Supabase-Projekts eintragen.</li><li>Die Seite neu laden.</li></ol><p class="tech">Die einzelnen Schritte stehen in der README.</p></div>`;
  }

  const SKEL_CARD = '<div class="skel-card" aria-hidden="true"><div class="skel-row"><i class="skel w40"></i><i class="skel w30 r"></i></div><i class="skel w50 sm"></i><div class="skel-pick"><i class="skel blk"></i><i class="skel blk"></i></div><i class="skel w45 sm"></i><div class="skel-pick three"><i class="skel blk sm"></i><i class="skel blk sm"></i><i class="skel blk sm"></i></div></div>';
  function renderLoading() {
    view.className = 'view';
    view.setAttribute('aria-busy', 'true');
    view.innerHTML = `<div class="skel-bar" aria-hidden="true"><i class="skel-bug"></i><i class="skel pill"></i></div><div class="stack" style="margin-top:14px">${SKEL_CARD}${SKEL_CARD}</div><p class="sr-only" role="status">Lädt …</p>`;
  }

  function renderOffline(e) {
    view.className = 'view';
    view.removeAttribute('aria-busy');
    view.innerHTML = `<div class="empty sys">${ICON.offline}<h2>Keine Verbindung</h2><p>Die Daten konnten nicht geladen werden. Prüfe dein Netz und versuch es noch einmal.</p><button type="button" class="btn-primary" data-action="retry">Erneut versuchen</button><p class="tech">Technisch: ${esc(e?.message || 'unbekannt')}</p></div>`;
  }

  // ------------------------------------------------------------------
  // Admin
  // ------------------------------------------------------------------

  const matchDay = (m) => (m.start ? dayKey(m.start) : 'offen');

  function adminRow(m) {
    const meta = `am-${m.id}`;
    const pl = (s) => {
      const name = s === 1 ? m.player1 : m.player2;
      const sets = s === 1 ? m.sets1 : m.sets2;
      return `<div class="pl-row"><input name="player${s}" value="${esc(name || '')}" placeholder="offen" autocomplete="off" aria-label="Spieler ${s}"><input class="set-in" name="sets${s}" type="number" min="0" max="${m.ft}" inputmode="numeric" value="${sets ?? ''}" aria-label="Sätze ${esc(name || `Spieler ${s}`)}"></div>`;
    };
    return `<form class="arow" data-admin-match="${m.id}"><p class="arow-meta" id="${meta}">${esc(m.round.name)} · Position ${m.pos} · Best of ${m.round.best_of}${m.player1 || m.player2 ? `<span class="sr-only">: ${esc(pName(m, 1))} gegen ${esc(pName(m, 2))}</span>` : ''}</p><div class="duel"><div class="duel-head" aria-hidden="true"><span>Spieler</span><span>Sätze</span></div>${pl(1)}${pl(2)}</div><label class="f">Beginn (deutsche Zeit)<input name="starts_at" type="datetime-local" value="${toLocalInput(m.start)}"></label><div class="actions"><button type="button" class="btn-text danger" data-action="admin-delete-match" data-id="${m.id}" aria-describedby="${meta}">Löschen</button><button type="submit" class="btn" aria-describedby="${meta}">Speichern</button></div></form>`;
  }

  function renderAdmin() {
    if (!state.session?.is_admin) { location.hash = '#tippen'; return; }
    view.className = 'view adm';
    const days = [...new Set(state.matches.map(matchDay))];
    if (!state.adminDay || !days.includes(state.adminDay)) {
      const today = dayKey(new Date());
      state.adminDay = days.includes(today) ? today
        : days.find((d) => d !== 'offen' && d >= today) || days[0] || null;
    }
    const dayMatches = state.matches.filter((m) => matchDay(m) === state.adminDay);
    const rounds = Object.values(state.rounds).sort((a, b) => a.id - b.id);
    const dayLabel = (d) => `${d === 'offen' ? 'Ohne Termin' : fmtDayLong.format(new Date(`${d}T12:00:00`))} · ${plural(state.matches.filter((m) => matchDay(m) === d).length, 'Spiel', 'Spiele')}`;

    view.innerHTML = `<div class="rank-head adm-head"><h1>Admin</h1><p class="sub">Spiele, Ergebnisse und Profile verwalten</p></div>`
      + `<section class="adm-sec first"><h2>Automatik</h2><p class="sub">Was der automatische Abgleich zuletzt eingetragen hat. Konflikte werden nie überschrieben.</p><div id="botlog"><ul class="loglist is-loading">${'<li aria-hidden="true"><i class="skel w30"></i><i class="skel w20 r"></i><i class="skel w70 sm"></i></li>'.repeat(3)}</ul><p class="sr-only" role="status">Protokoll lädt …</p></div></section>`
      + `<section class="adm-sec"><h2>Spieltag</h2><p class="sub">Nur nötig, wenn die Automatik etwas nicht schafft. Der Sieger rückt automatisch in die nächste Runde.</p>${days.length
        ? `<label class="f">Spieltag<span class="select"><select name="day" data-action="admin-day">${days.map((d) => `<option value="${d}"${d === state.adminDay ? ' selected' : ''}>${esc(dayLabel(d))}</option>`).join('')}</select></span></label><div class="stack">${dayMatches.map(adminRow).join('')}</div>`
        : '<p class="adm-empty">Noch keine Spiele. Lege unten welche an oder importiere sie.</p>'}</section>`
      + `<section class="adm-sec"><h2>Spiel anlegen</h2><p class="sub">Gibt es Runde und Position schon, wird das Spiel aktualisiert.</p><form class="arow" id="newMatch"><div class="grid2"><label class="f">Runde<span class="select"><select name="round">${rounds.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></span></label><label class="f">Position im Baum<input name="pos" type="number" min="1" inputmode="numeric" required></label></div><div class="grid2"><label class="f">Spieler 1<input name="player1" placeholder="offen"></label><label class="f">Spieler 2<input name="player2" placeholder="offen"></label></div><label class="f">Beginn (deutsche Zeit)<input name="starts_at" type="datetime-local"></label><div class="actions"><button class="btn" type="submit">Anlegen</button></div></form></section>`
      + `<section class="adm-sec"><h2>Import</h2><p class="sub">JSON-Liste mit round, pos, player1, player2, starts_at (deutsche Zeit). Leere Felder bleiben unverändert.</p><form class="arow" id="importForm"><label class="f">JSON<textarea name="json" spellcheck="false" placeholder='[{"round":1,"pos":1,"player1":"…","player2":"…","starts_at":"2026-12-11 20:00"}]'></textarea></label><div class="actions"><button class="btn" type="submit">Importieren</button></div></form></section>`
      + `<section class="adm-sec"><h2>Profile</h2><p class="sub">PIN zurücksetzen oder Profile entfernen. Beim Löschen verschwinden auch die Tipps.</p><ul class="plist">${state.players.map((p) => {
        const me = p.id === state.session.id;
        return `<li><span class="pname">${esc(p.name)}${me ? '<span class="du"><span class="sr-only">, </span>du</span>' : ''}</span><button type="button" class="btn small" data-action="admin-reset" data-id="${p.id}" data-name="${esc(p.name)}" aria-label="PIN neu für ${esc(p.name)}">PIN neu</button>${me ? '<span aria-hidden="true"></span>' : `<button type="button" class="btn-text danger" data-action="admin-del-player" data-id="${p.id}" data-name="${esc(p.name)}" aria-label="${esc(p.name)} löschen">Löschen</button>`}</li>`;
      }).join('')}</ul></section>`
      + `<section class="adm-sec"><h2>Runden</h2><p class="sub">Ändern im Supabase Table Editor (Tabelle rounds).</p><table class="rounds"><thead><tr><th scope="col">Runde</th><th scope="col">Best of</th><th scope="col">Faktor</th></tr></thead><tbody>${rounds.map((r) => `<tr><th scope="row">${esc(r.name)}</th><td>${r.best_of}</td><td><span class="mult${r.multiplier > 1 ? ' x2' : ''}">×${r.multiplier}</span></td></tr>`).join('')}</tbody></table></section>`;
    loadBotLog();
  }

  const BOT_KIND = { neu: 'Neu', update: 'Update', ergebnis: 'Ergebnis', korrektur: 'Korrektur', konflikt: 'Konflikt', fehler: 'Fehler' };

  async function loadBotLog() {
    if (!document.getElementById('botlog')) return;
    let html;
    try {
      const r = await rpc('admin_bot_log', { ...auth(), p_limit: 60 });
      const item = (x) => `<li class="k-${esc(x.kind)}"><span class="kind">${x.kind === 'konflikt' || x.kind === 'fehler' ? ICON.warn : ''}${esc(BOT_KIND[x.kind] || x.kind)}</span><span class="when">${fmtStamp.format(new Date(x.at))}</span><span class="what">${esc(darts(x.label))}${x.detail ? `<small>${esc(darts(x.detail))}</small>` : ''}</span></li>`;
      const head = r.log.slice(0, 5); const more = r.log.slice(5);
      html = r.log.length
        ? `<ul class="loglist" aria-label="Protokoll der Automatik">${head.map(item).join('')}</ul>${more.length ? `<details class="log-more"><summary>Ältere Einträge (${more.length})</summary><ul class="loglist" aria-label="Ältere Einträge">${more.map(item).join('')}</ul></details>` : ''}`
        : '<p class="adm-empty">Noch keine automatischen Einträge.</p>';
    } catch (e) {
      html = `<p class="adm-err" role="alert">${ICON.warn}<span>${isNetwork(e) ? 'Keine Verbindung. Das Protokoll konnte nicht geladen werden.' : esc(errText(e))}</span></p>`;
    }
    const el = document.getElementById('botlog');
    if (el) el.innerHTML = html;
  }

  // ------------------------------------------------------------------
  // Rahmen, Routing, Laden
  // ------------------------------------------------------------------

  const VIEWS = { tippen: renderTippen, ergebnisse: renderErgebnisse, rangliste: renderRangliste, admin: renderAdmin };

  function renderFrame() {
    document.getElementById('brandTitle').textContent = CFG.title || 'WM-Tippspiel';
    document.getElementById('brandSub').textContent = CFG.subtitle || '';
    document.title = CFG.title || 'WM-Tippspiel';
    if (!state.session) return;
    document.body.classList.remove('auth-shell');
    tabs.hidden = false;
    document.getElementById('adminTab').hidden = !state.session.is_admin;
    if (!who.querySelector('[data-action="refresh"]')) {
      who.innerHTML = `<span class="me">${esc(state.session.name)}</span><button type="button" class="icon-btn" data-action="refresh" aria-label="Aktualisieren">${ICON.refresh}</button><button type="button" class="icon-btn" data-action="logout" aria-label="Abmelden">${ICON.logout}</button>`;
    } else {
      who.querySelector('.me').textContent = state.session.name;
    }
  }

  function currentView() {
    const v = location.hash.replace('#', '');
    return VIEWS[v] ? v : 'tippen';
  }

  function route() {
    if (!configured) return renderSetup();
    renderFrame();
    if (!state.loaded) return state.loadError ? renderOffline(state.loadError) : renderLoading();
    view.removeAttribute('aria-busy');
    if (!state.session) return renderAuth();
    const v = currentView();
    for (const a of tabs.querySelectorAll('a')) a.setAttribute('aria-current', a.dataset.tab === v ? 'page' : 'false');
    view.className = 'view';
    VIEWS[v]();
  }

  function setBusy(on) {
    const b = who.querySelector('[data-action="refresh"]');
    if (!b) return;
    b.classList.toggle('is-busy', on);
    b.setAttribute('aria-label', on ? 'Wird aktualisiert' : 'Aktualisieren');
    on ? b.setAttribute('aria-busy', 'true') : b.removeAttribute('aria-busy');
  }

  let loading = null;
  async function reload(silent) {
    if (loading) return loading;
    setBusy(true);
    loading = (async () => {
      try {
        await loadAll();
      } catch (e) {
        if (!state.loaded) { state.loadError = e; route(); return false; }
        if (!silent) toast('Keine Verbindung. Die Daten sind vom letzten Laden.', true, { label: 'Erneut versuchen', fn: () => reload() });
        return false;
      } finally {
        setBusy(false);
        loading = null;
      }
      const y = window.scrollY;
      route();
      window.scrollTo(0, y);
      return true;
    })();
    return loading;
  }

  const isEditing = () => view.contains(document.activeElement) &&
    /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  const isSaving = () => Object.keys(state.savePhase).length > 0;

  // ------------------------------------------------------------------
  // Rückmeldungen
  // ------------------------------------------------------------------

  let toastTimer; let toastAction = null;
  function toast(msg, isErr, action) {
    clearTimeout(toastTimer);
    toastAction = action?.fn || null;
    toastEl.innerHTML = `${isErr ? ICON.warn : ''}<span>${esc(msg)}</span>${action ? `<button type="button" class="toast-action">${esc(action.label)}</button>` : ''}`;
    toastEl.className = `toast show${isErr ? ' err' : ''}`;
    toastTimer = setTimeout(hideToast, action ? 5000 : isErr ? 4200 : 1800);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    toastEl.classList.remove('show');
    toastAction = null;
    toastTimer = setTimeout(() => { if (!toastEl.classList.contains('show')) toastEl.innerHTML = ''; }, 260);
  }
  toastEl.addEventListener('click', (ev) => {
    if (!ev.target.closest('.toast-action')) return;
    const fn = toastAction;
    hideToast();
    fn?.();
  });

  function announce(msg) {
    liveEl.textContent = '';
    setTimeout(() => { liveEl.textContent = msg; }, 30);
  }

  function setButtonBusy(btn, text) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spin" aria-hidden="true"></span>${text}`;
  }
  function resetButton(btn) {
    if (btn.dataset.label != null) btn.innerHTML = btn.dataset.label;
    btn.disabled = false;
  }

  // ------------------------------------------------------------------
  // Aktionen
  // ------------------------------------------------------------------

  view.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-action]');
    if (!b || b.tagName === 'SELECT') return;
    const a = b.dataset.action;
    const id = b.dataset.id ? Number(b.dataset.id) : null;

    if (a === 'authmode') { state.authMode = b.dataset.mode; renderAuth(); view.querySelector(`[data-mode="${b.dataset.mode}"]`)?.focus(); return; }
    if (a === 'filter') {
      state.filter = b.dataset.f;
      state.filterIds = state.filter === 'offen' ? untippedIds() : null;
      renderTippen();
      view.querySelector(`.chip[data-f="${state.filter}"]`)?.focus();
      return;
    }
    if (a === 'retry') {
      b.disabled = true;
      const ok = await reload();
      if (ok) view.querySelector('h1, [tabindex="-1"], button')?.focus();
      else view.querySelector('[data-action="retry"]')?.focus();
      return;
    }
    if (a === 'myplace') {
      ev.preventDefault();
      const me = document.getElementById('me');
      me?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      me?.focus({ preventScroll: true });
      return;
    }

    if (a === 'pick') {
      const m = state.matches.find((x) => x.id === id);
      if (!m) return;
      const t = state.myTips[id];
      const pick = Number(b.dataset.pick);
      if (t?.pick === pick) return saveTip(id, null, null);
      // Entschieden: Beim Wechsel des Siegers wird das exakte Ergebnis zurückgesetzt.
      return saveTip(id, pick, null);
    }
    if (a === 'exact') {
      const t = state.myTips[id];
      const card = b.closest('.match');
      if (card?.classList.contains('locked')) return;
      if (!t) { nudge(id); return; }
      const l = Number(b.dataset.l);
      return saveTip(id, t.pick, t.loser_sets === l ? null : l);
    }

    if (a === 'admin-delete-match') {
      if (!confirm('Spiel samt aller Tipps löschen?')) return;
      try { await rpc('admin_delete_match', { ...auth(), p_match: id }); toast('Spiel gelöscht'); reload(true); }
      catch (e) { toast(errText(e), true); }
      return;
    }
    if (a === 'admin-reset') {
      const pin = prompt(`Neue 4-stellige PIN für ${b.dataset.name}:`);
      if (pin == null) return;
      try {
        await rpc('admin_reset_pin', { ...auth(), p_target: id, p_new_pin: pin.trim() });
        if (id === state.session.id) writeSession({ ...state.session, pin: pin.trim() });
        toast('PIN zurückgesetzt');
      } catch (e) { toast(errText(e), true); }
      return;
    }
    if (a === 'admin-del-player') {
      if (!confirm(`${b.dataset.name} und alle Tipps löschen? Das lässt sich nicht rückgängig machen.`)) return;
      try { await rpc('admin_delete_player', { ...auth(), p_target: id }); toast('Profil gelöscht'); reload(true); }
      catch (e) { toast(errText(e), true); }
    }
  });

  view.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-action="admin-day"]')) {
      state.adminDay = ev.target.value;
      renderAdmin();
      view.querySelector('[data-action="admin-day"]')?.focus();
    }
  });

  // Auf- und Zuklappen der Ergebnisse merken (toggle bubbelt nicht).
  view.addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (d.matches?.('details[data-result]')) state.resultOpen[d.dataset.result] = d.open;
  }, true);

  who.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-action]');
    if (!b) return;
    if (b.dataset.action === 'logout') {
      writeSession(null); state.myTips = {}; state.resultOpen = {};
      who.innerHTML = ''; location.hash = ''; route();
    }
    if (b.dataset.action === 'refresh') reload();
  });

  view.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const fd = Object.fromEntries(new FormData(f));
    const btn = f.querySelector('[type="submit"]');

    if (f.id === 'authForm') {
      const mode = state.players.length ? state.authMode : 'register';
      const name = (fd.name || '').trim();
      if (!name) return authError(f, mode === 'login' ? 'Bitte wähle deinen Namen.' : ERRORS.name_invalid, 'name');
      if (!/^\d{4}$/.test(fd.pin || '')) return authError(f, ERRORS.pin_invalid, 'pin');
      if (mode === 'register' && fd.pin !== fd.pin2) return authError(f, 'Die beiden PINs stimmen nicht überein.', 'pin2');
      setButtonBusy(btn, mode === 'login' ? 'Anmelden …' : 'Profil anlegen …');
      try {
        const r = await rpc(mode === 'login' ? 'login' : 'register_player', { p_name: name, p_pin: fd.pin });
        writeSession({ id: r.player_id, name: r.name, pin: fd.pin, is_admin: r.is_admin });
        lastName.set(r.name);
        location.hash = '#tippen';
        await reload(true);
        window.scrollTo(0, 0);
      } catch (e) {
        resetButton(btn);
        const field = e.code === 'name_taken' || e.code === 'name_invalid' || e.code === 'unknown' ? 'name' : 'pin';
        authError(f, errText(e), field);
      }
      return;
    }

    if (!state.session?.is_admin) return;
    setButtonBusy(btn, 'Speichert …');
    try {
      if (f.id === 'newMatch') {
        await rpc('admin_save_match', {
          ...auth(), p_round: Number(fd.round), p_pos: Number(fd.pos),
          p_player1: fd.player1 || null, p_player2: fd.player2 || null, p_starts_at: fd.starts_at || null
        });
        toast('Gespeichert');
      } else if (f.id === 'importForm') {
        let list;
        try { list = JSON.parse(fd.json); } catch { throw Object.assign(new Error('Das ist kein gültiges JSON.'), { code: '' }); }
        const r = await rpc('admin_import', { ...auth(), p_matches: list });
        toast(`${plural(r.count, 'Spiel', 'Spiele')} importiert`);
      } else if (f.dataset.adminMatch) {
        const m = state.matches.find((x) => x.id === Number(f.dataset.adminMatch));
        const changedMeta = (fd.player1 || '') !== (m.player1 || '') || (fd.player2 || '') !== (m.player2 || '') ||
          fd.starts_at !== toLocalInput(m.start);
        if (changedMeta) {
          await rpc('admin_save_match', {
            ...auth(), p_round: m.round_id, p_pos: m.pos,
            p_player1: fd.player1 || null, p_player2: fd.player2 || null, p_starts_at: fd.starts_at || null
          });
        }
        const s1 = fd.sets1 === '' ? null : Number(fd.sets1);
        const s2 = fd.sets2 === '' ? null : Number(fd.sets2);
        const changedRes = s1 !== m.sets1 || s2 !== m.sets2;
        if (changedRes) await rpc('admin_set_result', { ...auth(), p_match: m.id, p_sets1: s1, p_sets2: s2 });
        toast(changedMeta || changedRes ? 'Gespeichert' : 'Keine Änderung');
      }
      await reload(true);
    } catch (e) {
      resetButton(btn);
      toast(errText(e), true);
    }
  });

  window.addEventListener('hashchange', () => {
    if (location.hash === '#me') return;
    route();
    window.scrollTo(0, 0);
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && configured && state.loaded && !isEditing() && !isSaving()) reload(true);
  });

  // Countdown und Tippschluss aktuell halten, Daten regelmäßig nachladen.
  setInterval(() => {
    if (!state.loaded || document.hidden || !state.session) return;
    const wasOpen = openMatches().length;
    refreshStatus();
    if (isEditing() || isSaving()) return;
    if (wasOpen !== openMatches().length) reload(true);
    else if (currentView() === 'tippen' && !view.contains(document.activeElement)) {
      const y = window.scrollY; renderTippen(); window.scrollTo(0, y);
    }
  }, 60000);
  setInterval(() => { if (state.loaded && !document.hidden && !isEditing() && !isSaving()) reload(true); }, 180000);

  route();
  if (configured) reload(true);
})();
