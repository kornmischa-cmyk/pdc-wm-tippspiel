/* WM-Tippspiel · App-Logik (Vanilla JS, Supabase via RPC) */
(() => {
  'use strict';

  const CFG = window.TIPPSPIEL_CONFIG || {};
  const TZ = 'Europe/Berlin';
  const SESSION_KEY = 'wm-tippspiel-session';
  const view = document.getElementById('view');
  const tabs = document.getElementById('tabs');
  const who = document.getElementById('who');

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ERRORS = {
    wrong: 'Die PIN stimmt nicht.',
    locked: 'Zu viele Fehlversuche. Das Profil ist 15 Minuten gesperrt.',
    unknown: 'Dieses Profil gibt es nicht.',
    name_taken: 'Diesen Namen gibt es schon. Melde dich an oder wähle einen anderen.',
    name_invalid: 'Der Name braucht 2 bis 24 Zeichen.',
    pin_invalid: 'Die PIN muss aus genau 4 Ziffern bestehen.',
    locked_match: 'Tippschluss: Das Spiel hat schon begonnen.',
    match_not_ready: 'Für dieses Spiel fehlen noch Paarung oder Anstoßzeit.',
    match_unknown: 'Dieses Spiel gibt es nicht mehr.',
    sets_invalid: 'Dieses Satzergebnis ist nicht möglich.',
    pick_invalid: 'Ungültiger Tipp.',
    not_admin: 'Dafür brauchst du Admin-Rechte.',
    next_match_played: 'Das Folgespiel hat schon ein Ergebnis. Lösche zuerst das Ergebnis dort.',
    round_unknown: 'Diese Runde gibt es nicht.',
    import_format: 'Der Import muss eine JSON-Liste sein.',
    self_delete: 'Du kannst dein eigenes Profil nicht löschen.'
  };
  const errText = (e) => {
    if (e?.code === 'result_invalid') return `Ergebnis ungültig: Eine Seite braucht genau ${e.data.first_to} Sätze, die andere weniger.`;
    return ERRORS[e?.code] || e?.message || 'Unbekannter Fehler.';
  };

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
    filter: 'alle',
    adminDay: null,
    authMode: 'login',
    saving: new Set()
  };

  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
  }
  function writeSession(s) {
    state.session = s;
    try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* privat */ }
  }

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
  }

  function refreshStatus() {
    state.matches = state.matches.map(enrich);
  }

  // ------------------------------------------------------------------
  // Formatierung
  // ------------------------------------------------------------------

  const fmtTime = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const fmtDay = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
  const fmtDayLong = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  const dayKey = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d); // YYYY-MM-DD

  function toLocalInput(d) {
    if (!d) return '';
    const p = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }

  function deadline(m) {
    const diff = m.start.getTime() - Date.now();
    const min = Math.round(diff / 60000);
    if (min < 60) return { text: `Tippschluss in ${Math.max(min, 1)} Min`, soon: true };
    const h = Math.round(min / 60);
    if (h < 24) return { text: `Tippschluss in ${h} Std`, soon: h < 3 };
    return { text: '', soon: false };
  }

  const pName = (m, side) => (side === 1 ? m.player1 : m.player2) || 'offen';
  const tipLabel = (m, t) => {
    if (!t) return 'kein Tipp';
    const n = pName(m, t.pick);
    return t.loser_sets != null ? `${n} ${m.ft}:${t.loser_sets}` : n;
  };
  function ptsBadge(t) {
    if (!t || !t.finished) return '';
    const cls = t.exact ? 'exact' : t.points > 0 ? 'plus' : '';
    return `<span class="pts ${cls}">${t.points > 0 ? '+' : ''}${t.points}</span>`;
  }

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
  // Ansichten
  // ------------------------------------------------------------------

  function renderSetup() {
    tabs.hidden = true; who.innerHTML = '';
    view.innerHTML = `
      <section class="auth">
        <h1>Fast fertig</h1>
        <p class="sub">Trage in <code>config.js</code> die URL und den anon key deines Supabase-Projekts ein und lade die Seite neu. Die Schritte stehen in der README.</p>
      </section>`;
  }

  function renderAuth() {
    tabs.hidden = true; who.innerHTML = '';
    const hasPlayers = state.players.length > 0;
    const mode = hasPlayers ? state.authMode : 'register';
    view.innerHTML = `
      <section class="auth">
        <h1>Wer tippt mit?</h1>
        <p class="sub">Tippe auf jedes WM-Spiel den Sieger. Für das exakte Satzergebnis gibt es Extrapunkte.</p>
        ${hasPlayers ? `
        <div class="seg" role="group" aria-label="Anmelden oder neues Profil">
          <button type="button" data-action="authmode" data-mode="login" aria-pressed="${mode === 'login'}">Anmelden</button>
          <button type="button" data-action="authmode" data-mode="register" aria-pressed="${mode === 'register'}">Neues Profil</button>
        </div>` : ''}
        <form class="form" id="authForm" novalidate>
          ${mode === 'login' ? `
            <label class="f">Name
              <select name="name" required>
                <option value="">Bitte wählen</option>
                ${state.players.map((p) => `<option>${esc(p.name)}</option>`).join('')}
              </select>
            </label>` : `
            <label class="f">Dein Name, wie ihn das Team kennt
              <input name="name" maxlength="24" autocomplete="nickname" required>
            </label>`}
          <label class="f">PIN (4 Ziffern)
            <input name="pin" class="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required>
          </label>
          ${mode === 'register' ? `
          <label class="f">PIN wiederholen
            <input name="pin2" class="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required>
          </label>` : ''}
          <p class="error" id="authError"></p>
          <button class="btn primary" type="submit">${mode === 'login' ? 'Anmelden' : 'Profil anlegen'}</button>
        </form>
        <p class="note">Die PIN schützt dein Profil, damit niemand für dich tippt. Sie wird verschlüsselt gespeichert.
        ${mode === 'login' ? `PIN vergessen? ${esc(CFG.admin || 'Der Admin')} kann sie zurücksetzen.` : ''}</p>
      </section>`;
  }

  function matchCard(m) {
    const t = state.myTips[m.id];
    const dl = deadline(m);
    const mult = m.round.multiplier > 1 ? `<span class="badge">×${m.round.multiplier}</span>` : '';
    const saving = state.saving.has(m.id) ? '<span class="saving">speichert …</span>' : '';
    const side = (s) => `
      <button type="button" class="side ${t && t.pick !== s ? 'other' : ''}" data-action="pick" data-id="${m.id}" data-pick="${s}"
        aria-pressed="${t?.pick === s}">${esc(pName(m, s))}</button>`;
    const scores = Array.from({ length: m.ft }, (_, l) => `
      <button type="button" class="score" data-action="exact" data-id="${m.id}" data-l="${l}" aria-pressed="${t?.loser_sets === l}"
        aria-label="${esc(pName(m, t?.pick))} gewinnt ${m.ft} zu ${l}">${m.ft}:${l}</button>`).join('');
    return `
      <article class="match ${t ? 'tipped' : ''}" data-card="${m.id}">
        <div class="meta">
          <span class="time">${fmtTime.format(m.start)}</span>
          <span>${esc(m.round.name)}</span><span>Best of ${m.round.best_of}</span>${mult}
          ${dl.text ? `<span class="deadline ${dl.soon ? 'soon' : ''}">${dl.text}</span>` : ''}
        </div>
        <div class="pick">${side(1)}<span class="vs">vs</span>${side(2)}</div>
        ${t ? `<div class="exact"><span class="label">Exakt (+2)</span>${scores}${saving}</div>`
            : `<p class="hint">Wer gewinnt? ${saving}</p>`}
      </article>`;
  }

  function renderTippen() {
    const open = state.matches.filter((m) => m.ready && !m.started && !m.finished);
    const pending = state.matches.filter((m) => !m.ready && !m.finished).length;
    const tipped = open.filter((m) => state.myTips[m.id]).length;
    const shown = state.filter === 'offen' ? open.filter((m) => !state.myTips[m.id]) : open;

    if (!state.matches.length) {
      view.innerHTML = `
        <div class="page-head"><h1>Tippen</h1></div>
        <div class="empty"><h2>Noch keine Spiele</h2><p>Sobald Auslosung und Spielplan feststehen, erscheinen die Partien hier.</p></div>`;
      return;
    }

    let html = `
      <div class="page-head">
        <div><h1>Tippen</h1><p class="sub">${tipped} von ${open.length} offenen Spielen getippt</p></div>
        <div class="chips" role="group" aria-label="Filter">
          <button type="button" class="chip" data-action="filter" data-f="alle" aria-pressed="${state.filter === 'alle'}">Alle</button>
          <button type="button" class="chip" data-action="filter" data-f="offen" aria-pressed="${state.filter === 'offen'}">Ohne Tipp</button>
        </div>
      </div>`;

    if (!shown.length) {
      html += open.length
        ? `<div class="empty"><h2>Alles getippt</h2><p>Du hast auf jedes offene Spiel getippt.</p></div>`
        : `<div class="empty"><h2>Gerade nichts zu tippen</h2><p>Die nächsten Partien erscheinen, sobald Paarung und Anstoßzeit feststehen.</p></div>`;
    } else {
      for (const [, list] of groupByDay(shown)) {
        html += `<h2 class="day">${fmtDay.format(list[0].start)}</h2><div class="stack">${list.map(matchCard).join('')}</div>`;
      }
    }
    if (pending) html += `<p class="note">${pending} weitere ${pending === 1 ? 'Spiel folgt' : 'Spiele folgen'}, sobald Paarung und Anstoßzeit feststehen.</p>`;
    view.innerHTML = html;
  }

  function renderErgebnisse() {
    const list = state.matches.filter((m) => m.started || m.finished)
      .sort((a, b) => (b.start?.getTime() || 0) - (a.start?.getTime() || 0));
    if (!list.length) {
      view.innerHTML = `
        <div class="page-head"><h1>Ergebnisse</h1></div>
        <div class="empty"><h2>Noch nichts gespielt</h2><p>Sobald ein Spiel beginnt, siehst du hier alle Tipps und später das Ergebnis.</p></div>`;
      return;
    }
    const byMatch = new Map();
    for (const t of state.publicTips) {
      if (!byMatch.has(t.match_id)) byMatch.set(t.match_id, []);
      byMatch.get(t.match_id).push(t);
    }
    let html = `<div class="page-head"><div><h1>Ergebnisse</h1><p class="sub">Tippe auf ein Spiel für alle Tipps</p></div></div>`;
    for (const [, ms] of groupByDay(list)) {
      html += `<h2 class="day">${ms[0].start ? fmtDay.format(ms[0].start) : 'Ohne Termin'}</h2><div class="stack">`;
      for (const m of ms) {
        const tips = byMatch.get(m.id) || [];
        const mine = tips.find((t) => t.player_id === state.session?.id);
        const cls = (s) => (m.finished ? (m.winner === s ? 'win' : 'lose') : '');
        html += `
          <details class="result" data-result="${m.id}">
            <summary>
              <div class="meta">
                ${m.start ? `<span class="time">${fmtTime.format(m.start)}</span>` : ''}
                <span>${esc(m.round.name)}</span>
                ${m.finished ? '' : '<span class="badge live">läuft</span>'}
                ${m.round.multiplier > 1 ? `<span class="badge">×${m.round.multiplier}</span>` : ''}
              </div>
              <div class="scoreline">
                <span class="p ${cls(1)}">${esc(pName(m, 1))}</span>
                <span class="sets">${m.finished ? `${m.sets1}:${m.sets2}` : '–:–'}</span>
                <span class="p r ${cls(2)}">${esc(pName(m, 2))}</span>
              </div>
              <div class="mytip">Dein Tipp: ${esc(tipLabel(m, mine))} ${ptsBadge(mine) || '<span class="grow"></span>'}<span class="chev" aria-hidden="true">▼</span></div>
            </summary>
            <ul class="tiplist">
              ${tips.length ? tips.map((t) => `
                <li class="${t.player_id === state.session?.id ? 'me' : ''}">
                  <span class="n">${esc(t.name)}</span>
                  <span class="t">${esc(tipLabel(m, t))}</span>
                  ${ptsBadge(t)}
                </li>`).join('') : '<li><span class="t">Niemand hat getippt.</span></li>'}
            </ul>
          </details>`;
      }
      html += '</div>';
    }
    view.innerHTML = html;
  }

  function renderRangliste() {
    const rows = state.board;
    let rank = 0; let prev = null;
    const items = rows.map((r, i) => {
      const key = `${r.points}|${r.exacts}`;
      if (key !== prev) { rank = i + 1; prev = key; }
      const me = r.player_id === state.session?.id;
      return `
        <li class="${me ? 'me' : ''}">
          <span class="rank ${rank <= 3 && r.points > 0 ? 'top' : ''}">${rank}</span>
          <div>
            <div class="pname">${esc(r.name)}${me ? ' <span class="sub">· du</span>' : ''}</div>
            <div class="pstats">${r.hits} Treffer · ${r.exacts} exakt · ${r.tipped} gewertet</div>
          </div>
          <div class="ppoints">${r.points}<small>Punkte</small></div>
        </li>`;
    }).join('');
    const firstMult = Object.values(state.rounds).sort((a, b) => a.id - b.id).find((r) => r.multiplier > 1);
    view.innerHTML = `
      <div class="page-head"><div><h1>Rangliste</h1><p class="sub">${rows.length} Tipper</p></div></div>
      ${rows.length ? `<ol class="board-list">${items}</ol>` : '<div class="empty"><p>Noch keine Tipper.</p></div>'}
      <section class="rules">
        <h2>So wird gezählt</h2>
        <ul>
          <li>Richtiger Sieger: <strong>1 Punkt</strong></li>
          <li>Dazu das exakte Satzergebnis: <strong>+2 Punkte</strong></li>
          ${firstMult ? `<li>Ab ${esc(firstMult.name)} zählen alle Punkte <strong>×${firstMult.multiplier}</strong></li>` : ''}
          <li>Tippschluss ist der Anpfiff. Danach sind alle Tipps sichtbar.</li>
          <li>Bei Punktgleichheit entscheiden die exakten Tipps.</li>
        </ul>
      </section>`;
  }

  function adminRow(m) {
    return `
      <form class="arow" data-admin-match="${m.id}">
        <small>${esc(m.round.name)} · Position ${m.pos} · Best of ${m.round.best_of}</small>
        <div class="grid2">
          <input name="player1" value="${esc(m.player1 || '')}" placeholder="Spieler 1" aria-label="Spieler 1">
          <input name="player2" value="${esc(m.player2 || '')}" placeholder="Spieler 2" aria-label="Spieler 2">
        </div>
        <input name="starts_at" type="datetime-local" value="${toLocalInput(m.start)}" aria-label="Anstoß (deutsche Zeit)">
        <div class="res">
          <span class="nm">${esc(m.player1 || 'Spieler 1')}</span>
          <input name="sets1" type="number" min="0" max="${m.ft}" inputmode="numeric" value="${m.sets1 ?? ''}" aria-label="Sätze Spieler 1">
          <span class="colon">:</span>
          <input name="sets2" type="number" min="0" max="${m.ft}" inputmode="numeric" value="${m.sets2 ?? ''}" aria-label="Sätze Spieler 2">
          <span class="nm r">${esc(m.player2 || 'Spieler 2')}</span>
        </div>
        <div class="actions">
          <button type="button" class="btn small danger" data-action="admin-delete-match" data-id="${m.id}">Löschen</button>
          <button type="submit" class="btn small primary">Speichern</button>
        </div>
      </form>`;
  }

  function renderAdmin() {
    if (!state.session?.is_admin) { location.hash = '#tippen'; return; }
    const days = [...new Set(state.matches.map((m) => (m.start ? dayKey(m.start) : 'offen')))];
    if (!state.adminDay || !days.includes(state.adminDay)) {
      const today = dayKey(new Date());
      state.adminDay = days.includes(today) ? today
        : days.find((d) => d !== 'offen' && d >= today) || days[0] || null;
    }
    const dayMatches = state.matches.filter((m) => (m.start ? dayKey(m.start) : 'offen') === state.adminDay);
    const roundOpts = Object.values(state.rounds).sort((a, b) => a.id - b.id)
      .map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
    const dayLabel = (d) => d === 'offen' ? 'Ohne Termin' : fmtDayLong.format(new Date(`${d}T12:00:00`));

    view.innerHTML = `
      <div class="page-head"><div><h1>Admin</h1><p class="sub">Spiele, Ergebnisse und Profile verwalten</p></div></div>

      <section class="admin-section">
        <h2>Automatik</h2>
        <p class="sub">Was der automatische Abgleich zuletzt eingetragen hat. Konflikte werden nie überschrieben.</p>
        <div id="botlog" class="botlog"><p class="sub">Lädt …</p></div>
      </section>

      <section class="admin-section">
        <h2>Spieltag</h2>
        <p class="sub">Nur nötig, wenn die Automatik etwas nicht schafft. Der Sieger rückt automatisch in die nächste Runde.</p>
        ${days.length ? `
          <select data-action="admin-day" aria-label="Spieltag wählen">
            ${days.map((d) => `<option value="${d}" ${d === state.adminDay ? 'selected' : ''}>${esc(dayLabel(d))} (${state.matches.filter((m) => (m.start ? dayKey(m.start) : 'offen') === d).length})</option>`).join('')}
          </select>
          <div class="stack" style="margin-top:10px">${dayMatches.map(adminRow).join('')}</div>`
        : '<div class="empty"><p>Noch keine Spiele. Lege unten welche an oder importiere sie.</p></div>'}
      </section>

      <section class="admin-section">
        <h2>Spiel anlegen</h2>
        <p class="sub">Gibt es Runde und Position schon, wird das Spiel aktualisiert.</p>
        <form class="arow" id="newMatch">
          <div class="grid2">
            <select name="round" aria-label="Runde">${roundOpts}</select>
            <input name="pos" type="number" min="1" inputmode="numeric" placeholder="Position im Baum" aria-label="Position im Turnierbaum" required>
          </div>
          <div class="grid2">
            <input name="player1" placeholder="Spieler 1" aria-label="Spieler 1">
            <input name="player2" placeholder="Spieler 2" aria-label="Spieler 2">
          </div>
          <input name="starts_at" type="datetime-local" aria-label="Anstoß (deutsche Zeit)">
          <div class="actions"><button class="btn small primary" type="submit">Anlegen</button></div>
        </form>
      </section>

      <section class="admin-section">
        <h2>Import</h2>
        <p class="sub">JSON-Liste mit round, pos, player1, player2, starts_at (deutsche Zeit). Leere Felder bleiben unverändert.</p>
        <form class="arow" id="importForm">
          <textarea name="json" spellcheck="false" placeholder='[{"round":1,"pos":1,"player1":"…","player2":"…","starts_at":"2026-12-11 20:00"}]'></textarea>
          <div class="actions"><button class="btn small primary" type="submit">Importieren</button></div>
        </form>
      </section>

      <section class="admin-section">
        <h2>Profile</h2>
        <p class="sub">PIN zurücksetzen oder Profile entfernen. Beim Löschen verschwinden auch die Tipps.</p>
        <ul class="plist">
          ${state.players.map((p) => `
            <li><span>${esc(p.name)}</span>
              <button type="button" class="btn small" data-action="admin-reset" data-id="${p.id}" data-name="${esc(p.name)}">PIN neu</button>
              ${p.id === state.session.id ? '' : `<button type="button" class="btn small danger" data-action="admin-del-player" data-id="${p.id}" data-name="${esc(p.name)}">Löschen</button>`}
            </li>`).join('')}
        </ul>
      </section>

      <section class="admin-section">
        <h2>Runden</h2>
        <p class="sub">Ändern im Supabase Table Editor (Tabelle rounds).</p>
        <table class="rounds">
          <thead><tr><th>Runde</th><th>Best of</th><th>Faktor</th></tr></thead>
          <tbody>${Object.values(state.rounds).sort((a, b) => a.id - b.id).map((r) =>
            `<tr><td>${esc(r.name)}</td><td>${r.best_of}</td><td>×${r.multiplier}</td></tr>`).join('')}</tbody>
        </table>
      </section>`;    loadBotLog();
  }

  const BOT_KIND = { neu: 'Neu', update: 'Update', ergebnis: 'Ergebnis', korrektur: 'Korrektur', konflikt: 'Konflikt', fehler: 'Fehler' };
  const fmtStamp = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  async function loadBotLog() {
    const box = document.getElementById('botlog');
    if (!box) return;
    try {
      const r = await rpc('admin_bot_log', { ...auth(), p_limit: 40 });
      const el = document.getElementById('botlog');
      if (!el) return;
      el.innerHTML = r.log.length ? `<ul class="loglist">${r.log.map((x) => `
        <li class="k-${esc(x.kind)}">
          <span class="when">${fmtStamp.format(new Date(x.at))}</span>
          <span class="kind">${esc(BOT_KIND[x.kind] || x.kind)}</span>
          <span class="what">${esc(x.label)}${x.detail ? `<small>${esc(x.detail)}</small>` : ''}</span>
        </li>`).join('')}</ul>`
        : '<div class="empty"><p>Noch keine automatischen Einträge.</p></div>';
    } catch (e) {
      const el = document.getElementById('botlog');
      if (el) el.innerHTML = `<p class="error">${esc(errText(e))}</p>`;
    }
  }

  // ------------------------------------------------------------------
  // Routing & Rahmen
  // ------------------------------------------------------------------

  const VIEWS = { tippen: renderTippen, ergebnisse: renderErgebnisse, rangliste: renderRangliste, admin: renderAdmin };

  function renderFrame() {
    document.getElementById('brandTitle').textContent = CFG.title || 'WM-Tippspiel';
    document.getElementById('brandSub').textContent = CFG.subtitle || '';
    document.title = CFG.title || 'WM-Tippspiel';
    if (!state.session) return;
    tabs.hidden = false;
    document.getElementById('adminTab').hidden = !state.session.is_admin;
    who.innerHTML = `
      <span class="me">${esc(state.session.name)}</span>
      <button type="button" class="icon-btn" data-action="refresh" aria-label="Aktualisieren" title="Aktualisieren">
        <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/></svg>
      </button>
      <button type="button" class="icon-btn" data-action="logout" aria-label="Abmelden" title="Abmelden">
        <svg viewBox="0 0 24 24"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4"/></svg>
      </button>`;
  }

  function currentView() {
    const v = location.hash.replace('#', '');
    return VIEWS[v] ? v : 'tippen';
  }

  function route() {
    if (!configured) return renderSetup();
    if (!state.loaded) { view.innerHTML = '<p class="loading">Lädt …</p>'; return; }
    renderFrame();
    if (!state.session) return renderAuth();
    const v = currentView();
    for (const a of tabs.querySelectorAll('a')) a.setAttribute('aria-current', a.dataset.tab === v ? 'page' : 'false');
    VIEWS[v]();
  }

  async function reload(silent) {
    try {
      await loadAll();
    } catch (e) {
      if (!silent) toast(errText(e), true);
      if (!state.loaded) {
        view.innerHTML = `<div class="empty"><h2>Keine Verbindung</h2><p>${esc(errText(e))}</p><p><button class="btn" data-action="refresh">Erneut versuchen</button></p></div>`;
      }
      return;
    }
    const y = window.scrollY;
    const openIds = [...view.querySelectorAll('details[open][data-result]')].map((d) => d.dataset.result);
    route();
    for (const oid of openIds) view.querySelector(`details[data-result="${oid}"]`)?.setAttribute('open', '');
    window.scrollTo(0, y);
  }

  const isEditing = () => view.contains(document.activeElement) &&
    /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);

  let toastTimer;
  function toast(msg, isErr) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast show ${isErr ? 'err' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, isErr ? 4200 : 1800);
  }

  // ------------------------------------------------------------------
  // Aktionen
  // ------------------------------------------------------------------

  function rerenderCard(id) {
    const m = state.matches.find((x) => x.id === id);
    const el = view.querySelector(`[data-card="${id}"]`);
    if (!m || !el) return renderTippen();
    el.outerHTML = matchCard(m);
    const head = view.querySelector('.page-head .sub');
    if (head) {
      const open = state.matches.filter((x) => x.ready && !x.started && !x.finished);
      head.textContent = `${open.filter((x) => state.myTips[x.id]).length} von ${open.length} offenen Spielen getippt`;
    }
  }

  async function saveTip(id, pick, loserSets) {
    const before = state.myTips[id];
    if (pick == null) delete state.myTips[id];
    else state.myTips[id] = { ...(before || {}), match_id: id, pick, loser_sets: loserSets };
    state.saving.add(id);
    rerenderCard(id);
    try {
      await rpc('save_tip', { ...auth(), p_match: id, p_pick: pick, p_loser_sets: loserSets });
      state.saving.delete(id);
      rerenderCard(id);
      toast(pick == null ? 'Tipp entfernt' : 'Tipp gespeichert');
    } catch (e) {
      state.saving.delete(id);
      if (before) state.myTips[id] = before; else delete state.myTips[id];
      if (e.code === 'locked_match') { await reload(true); } else { rerenderCard(id); }
      toast(errText(e), true);
    }
  }

  view.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-action]');
    if (!b || b.tagName === 'SELECT') return;
    const a = b.dataset.action;
    const id = b.dataset.id ? Number(b.dataset.id) : null;

    if (a === 'authmode') { state.authMode = b.dataset.mode; renderAuth(); return; }
    if (a === 'filter') { state.filter = b.dataset.f; renderTippen(); return; }
    if (a === 'refresh') { reload(); return; }

    if (a === 'pick') {
      const m = state.matches.find((x) => x.id === id);
      if (!m || m.started) { toast(ERRORS.locked_match, true); return reload(true); }
      const t = state.myTips[id];
      const pick = Number(b.dataset.pick);
      if (t?.pick === pick) return saveTip(id, null, null);
      return saveTip(id, pick, t?.loser_sets ?? null);
    }
    if (a === 'exact') {
      const t = state.myTips[id];
      if (!t) return;
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
    if (ev.target.matches('[data-action="admin-day"]')) { state.adminDay = ev.target.value; renderAdmin(); }
  });

  who.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-action]');
    if (!b) return;
    if (b.dataset.action === 'logout') { writeSession(null); state.myTips = {}; location.hash = ''; route(); }
    if (b.dataset.action === 'refresh') reload();
  });

  view.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const fd = Object.fromEntries(new FormData(f));
    const btn = f.querySelector('[type="submit"]');

    if (f.id === 'authForm') {
      const err = f.querySelector('#authError');
      const mode = state.players.length ? state.authMode : 'register';
      if (!fd.name?.trim()) { err.textContent = mode === 'login' ? 'Bitte wähle deinen Namen.' : ERRORS.name_invalid; return; }
      if (!/^\d{4}$/.test(fd.pin || '')) { err.textContent = ERRORS.pin_invalid; return; }
      if (mode === 'register' && fd.pin !== fd.pin2) { err.textContent = 'Die beiden PINs stimmen nicht überein.'; return; }
      btn.disabled = true; err.textContent = '';
      try {
        const r = await rpc(mode === 'login' ? 'login' : 'register_player', { p_name: fd.name.trim(), p_pin: fd.pin });
        writeSession({ id: r.player_id, name: r.name, pin: fd.pin, is_admin: r.is_admin });
        location.hash = '#tippen';
        await reload(true);
        toast(mode === 'login' ? `Hallo ${r.name}!` : 'Profil angelegt. Viel Glück!');
      } catch (e) {
        err.textContent = errText(e);
        btn.disabled = false;
      }
      return;
    }

    if (!state.session?.is_admin) return;
    btn.disabled = true;
    try {
      if (f.id === 'newMatch') {
        await rpc('admin_save_match', {
          ...auth(), p_round: Number(fd.round), p_pos: Number(fd.pos),
          p_player1: fd.player1 || null, p_player2: fd.player2 || null, p_starts_at: fd.starts_at || null
        });
        toast('Spiel gespeichert');
        f.reset();
      } else if (f.id === 'importForm') {
        let list;
        try { list = JSON.parse(fd.json); } catch { throw Object.assign(new Error('Das ist kein gültiges JSON.'), { code: '' }); }
        const r = await rpc('admin_import', { ...auth(), p_matches: list });
        toast(`${r.count} ${r.count === 1 ? "Spiel" : "Spiele"} importiert`);
        f.reset();
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
        if (s1 !== m.sets1 || s2 !== m.sets2) {
          await rpc('admin_set_result', { ...auth(), p_match: m.id, p_sets1: s1, p_sets2: s2 });
        }
        toast(changedMeta || s1 !== m.sets1 || s2 !== m.sets2 ? 'Gespeichert' : 'Keine Änderung');
      }
      await reload(true);
    } catch (e) {
      toast(errText(e), true);
      btn.disabled = false;
    }
  });

  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && configured && !isEditing()) reload(true); });

  // Countdown und Tippschluss aktuell halten, Daten regelmäßig nachladen.
  setInterval(() => {
    if (!state.loaded || document.hidden) return;
    const wasOpen = state.matches.filter((m) => m.ready && !m.started).length;
    refreshStatus();
    const nowOpen = state.matches.filter((m) => m.ready && !m.started).length;
    if (isEditing()) return;
    if (wasOpen !== nowOpen) reload(true);
    else if (currentView() === 'tippen' && state.session) { const y = window.scrollY; renderTippen(); window.scrollTo(0, y); }
  }, 60000);
  setInterval(() => { if (state.loaded && !document.hidden && !isEditing()) reload(true); }, 180000);

  route();
  if (configured) reload();
})();
