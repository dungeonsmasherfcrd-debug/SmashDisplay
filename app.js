/* SmashDisplay — read-only CRG penalty board (stand-alone) */
(function () {
  'use strict';

  // ---------- Persistent settings ----------
  // Stand-alone config lives in localStorage so the app needs no URL params:
  // set the CRG host once in the Settings panel and it sticks. URL params
  // still work and take precedence (handy for one-off overrides / demos).
  const SETTINGS_KEY = 'smashdisplay.settings';
  const DEFAULTS = { host: '', port: '8000', layout: 'blocks', names: true, scale: 1, nameScale: 1, codes: false };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (e) {
      return { ...DEFAULTS };
    }
  }
  function saveSettings(patch) {
    const next = { ...loadSettings(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  }

  // ---------- Config (URL param → saved setting → default) ----------
  const params = new URLSearchParams(location.search);
  const saved = loadSettings();

  const HOST = params.get('host') || saved.host || location.hostname || 'localhost';
  const PORT = params.get('port') || saved.port || '8000';
  const DEMO = params.get('demo') === '1';
  const layoutParam = params.get('layout');
  const LAYOUT = layoutParam === 'grid' ? 'grid'
    : layoutParam === 'blocks' ? 'blocks'
    : (saved.layout === 'grid' ? 'grid' : 'blocks');
  const WS_URL = `ws://${HOST}:${PORT}/WS/`;

  const DEFAULT_FOULOUT = 7;
  // CRG Flags values that mean "don't show on in-game screens": ALT = Not Skating,
  // B = Bench Staff, BA = Bench Alt Captain. Matches CRG's own in-game hiding.
  const HIDDEN_FLAGS = new Set(['ALT', 'B', 'BA']);
  const MIN_NAME_PX = 7; // floor for auto-shrinking long names before ellipsis takes over
  document.body.classList.toggle('layout-blocks', LAYOUT === 'blocks');

  // Apply saved display preferences before first paint
  let scale = Number(saved.scale) || 1;
  document.documentElement.style.setProperty('--scale', scale.toFixed(2));
  let nameScale = Number(saved.nameScale) || 1;
  document.documentElement.style.setProperty('--name-scale', nameScale.toFixed(2));
  document.body.classList.toggle('hide-names', saved.names === false);
  let showCodes = saved.codes === true; // show penalty-code letters in the blocks layout
  document.body.classList.toggle('show-codes', showCodes);

  // ---------- State ----------
  const state = {
    foulOutLimit: DEFAULT_FOULOUT,
    period: '—',
    jam: '—',
    jamByPeriod: {}, // periodNumber -> current jam number, so we show the jam for the active period
    teams: {
      1: { name: 'Team 1', fg: '#ffffff', bg: '#1f3a8a', skaters: {} },
      2: { name: 'Team 2', fg: '#ffffff', bg: '#7a1f1f', skaters: {} },
    },
  };

  function ensureSkater(teamId, skaterId) {
    const team = state.teams[teamId];
    if (!team) return null;
    if (!team.skaters[skaterId]) {
      team.skaters[skaterId] = { id: skaterId, number: '', name: '', count: 0, foulOut: false, penalties: {}, flags: '' };
    }
    return team.skaters[skaterId];
  }

  // ---------- Render loop (rAF-coalesced) ----------
  let renderQueued = false;
  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  const els = {
    ctx: document.getElementById('ctx'),
    status: document.getElementById('status'),
    team1Name: document.getElementById('team1-name'),
    team2Name: document.getElementById('team2-name'),
    team1Grid: document.getElementById('team1-grid'),
    team2Grid: document.getElementById('team2-grid'),
  };

  function setStatus(stateName, text) {
    els.status.dataset.state = stateName;
    els.status.textContent = text;
  }

  // Pick a column count that makes a roughly rectangular grid for a typical
  // half-screen panel (slightly wider than tall). Tuned for derby roster sizes.
  // Only used by the default 'grid' layout — 'blocks' is always 1 col.
  function chooseCols(n) {
    if (LAYOUT === 'blocks') return 1;
    if (n <= 4) return Math.max(1, n);
    if (n <= 6) return 3;     // 5→3+2, 6→3+3
    if (n <= 8) return 4;     // 7→4+3, 8→4+4
    if (n === 9) return 3;    // 3+3+3
    if (n <= 12) return 4;    // 10–12 → 4 cols
    return 5;                 // 13–15 → 5x3
  }

  // A roster entry is shown only if it has a number and isn't flagged as a
  // non-skater (Not Skating / Bench Staff / Bench Alt Captain).
  function isShown(s) {
    return s.number !== '' && s.number != null && !HIDDEN_FLAGS.has(s.flags);
  }

  function rosterSize(teamId) {
    return Object.values(state.teams[teamId].skaters).filter(isShown).length;
  }

  function render() {
    els.ctx.textContent = `PERIOD ${state.period} · JAM ${state.jam}`;

    document.documentElement.style.setProperty('--team1-bg', state.teams[1].bg);
    document.documentElement.style.setProperty('--team1-fg', state.teams[1].fg);
    document.documentElement.style.setProperty('--team2-bg', state.teams[2].bg);
    document.documentElement.style.setProperty('--team2-fg', state.teams[2].fg);

    // Both panels share the same column count (driven by the larger roster)
    // so the two teams always look symmetric.
    const cols = chooseCols(Math.max(rosterSize(1), rosterSize(2), 1));
    document.documentElement.style.setProperty('--cols', cols);

    els.team1Name.textContent = state.teams[1].name || 'Team 1';
    els.team2Name.textContent = state.teams[2].name || 'Team 2';

    renderTeam(1, els.team1Grid);
    renderTeam(2, els.team2Grid);
  }

  function renderTeam(teamId, gridEl) {
    const team = state.teams[teamId];
    const skaters = Object.values(team.skaters)
      .filter(isShown)
      .sort(byRosterNumber);

    // Reconcile children by skater id (avoid full rebuild)
    const existing = new Map();
    Array.from(gridEl.children).forEach(el => existing.set(el.dataset.skaterId, el));

    const wanted = new Set();
    skaters.forEach(s => {
      wanted.add(s.id);
      let card = existing.get(s.id);
      if (!card) {
        card = buildCard(s);
        gridEl.appendChild(card);
      }
      updateCard(card, s);
    });

    // Remove cards no longer in roster
    existing.forEach((el, id) => {
      if (!wanted.has(id)) el.remove();
    });

    // Reorder DOM to match sort order
    skaters.forEach((s, i) => {
      const card = gridEl.children[i];
      if (card && card.dataset.skaterId !== s.id) {
        const target = gridEl.querySelector(`[data-skater-id="${cssEscape(s.id)}"]`);
        if (target) gridEl.insertBefore(target, gridEl.children[i]);
      }
    });
  }

  function buildCard(s) {
    const card = document.createElement('div');
    card.className = 'skater';
    card.dataset.skaterId = s.id;
    card.innerHTML = `
      <div class="number"></div>
      <div class="count"></div>
      <div class="pips"></div>
      <div class="name"></div>
      <div class="count-label">FO</div>
    `;
    return card;
  }

  function updateCard(card, s) {
    const limit = state.foulOutLimit || DEFAULT_FOULOUT;
    const severity = Math.min(6, Math.max(0, s.count));
    card.dataset.severity = String(severity);
    card.dataset.foulout = s.foulOut ? 'true' : 'false';

    card.querySelector('.number').textContent = s.number || '—';
    card.querySelector('.count').textContent = s.foulOut ? '' : String(s.count);
    const nameEl = card.querySelector('.name');
    nameEl.textContent = s.name || '';
    fitName(nameEl);

    const pips = card.querySelector('.pips');
    const desired = Math.max(limit, 7);
    if (pips.children.length !== desired) {
      pips.innerHTML = '';
      for (let i = 0; i < desired; i++) {
        const p = document.createElement('span');
        p.className = 'pip';
        pips.appendChild(p);
      }
    }
    // Penalty-code letters only make sense in the blocks layout (the grid pips
    // are tiny dots), and only when the operator turned the option on.
    const showLetters = showCodes && LAYOUT === 'blocks';
    const codes = showLetters ? orderedCodes(s) : null;
    Array.from(pips.children).forEach((p, i) => {
      const filled = i < s.count;
      p.style.background = filled ? pipColor(i, limit) : '#2b2c38';
      p.textContent = (showLetters && filled) ? (codes[i] || '') : '';
    });
  }

  // Shrink a skater name's font until the whole name fits its box, so long
  // names don't get truncated or run off. Resets to the CSS base size first
  // (which is container/viewport-relative), then scales down only if needed,
  // down to MIN_NAME_PX — past that the CSS ellipsis takes over.
  function fitName(el) {
    el.style.fontSize = '';
    if (!el.textContent) return;
    const avail = el.clientWidth;
    if (!avail) return;
    // Aim a couple px inside the box: scrollWidth/clientWidth are integer-rounded,
    // so a name landing exactly at the edge still trips the ellipsis from
    // sub-pixel / letter-spacing overflow. The margin leaves breathing room.
    const target = avail - 2;
    const full = el.scrollWidth;
    if (full <= target) return;
    const base = parseFloat(getComputedStyle(el).fontSize) || 12;
    let size = Math.max(MIN_NAME_PX, base * (target / full));
    el.style.fontSize = size + 'px';
    // Second pass to absorb letter-spacing / sub-pixel rounding.
    if (el.scrollWidth > target && size > MIN_NAME_PX) {
      size = Math.max(MIN_NAME_PX, size * (target / el.scrollWidth));
      el.style.fontSize = size + 'px';
    }
  }

  // Penalty cue letters in the order received (sorted by CRG's penalty index).
  function orderedCodes(s) {
    return Object.keys(s.penalties)
      .map(k => ({ i: parseInt(k, 10), code: s.penalties[k] }))
      .filter(x => !Number.isNaN(x.i) && x.code)
      .sort((a, b) => a.i - b.i)
      .map(x => x.code);
  }

  function pipColor(i, limit) {
    const ratio = (i + 1) / limit;
    if (ratio >= 0.85) return '#e23b3b';
    if (ratio >= 0.55) return '#f4b740';
    return '#4ec26a';
  }

  function byRosterNumber(a, b) {
    // Derby Number order: lexicographic string compare on the roster number,
    // matching CRG's own resort=RosterNumber behavior (alphaCompare in
    // html/javascript/windowfunctions.js — `return a > b`). So "13" sorts
    // before "7" because '1' < '7'.
    const an = String(a.number);
    const bn = String(b.number);
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  }

  function cssEscape(s) {
    return String(s).replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch.charCodeAt(0).toString(16) + ' ');
  }

  // ---------- Path parser ----------
  // Accepts CRG dotted paths like:
  //   ScoreBoard.CurrentGame.Team(1).Skater(abc-123).PenaltyCount
  //   ScoreBoard.CurrentGame.Team(2).Skater(xyz).Penalty(0).Code
  //   ScoreBoard.CurrentGame.Rule(Penalties.NumberToFoulout)
  function parsePath(path) {
    const parts = [];
    const re = /([A-Za-z][A-Za-z0-9_]*)(?:\(([^)]*)\))?/g;
    let m;
    while ((m = re.exec(path)) !== null) {
      parts.push({ key: m[1], arg: m[2] !== undefined ? m[2] : null });
    }
    return parts;
  }

  function applyUpdate(path, value) {
    const parts = parsePath(path);
    if (parts.length < 2) return false;
    if (parts[0].key !== 'ScoreBoard') return false;

    // ScoreBoard.CurrentGame.*
    if (parts[1].key !== 'CurrentGame') return false;

    // CurrentPeriodNumber
    if (parts[2] && parts[2].key === 'CurrentPeriodNumber') {
      state.period = value == null ? '—' : String(value);
      updateJam();
      return true;
    }

    // Period(N).CurrentJamNumber — the human-readable jam number (not the jam UUID).
    // CRG keeps one per period (Period(0) is the pre-game period), so we stash it by
    // period and updateJam() picks the one matching the current period for display.
    if (parts[2] && parts[2].key === 'Period' && parts[2].arg != null &&
        parts[3] && parts[3].key === 'CurrentJamNumber') {
      state.jamByPeriod[String(parts[2].arg)] = value == null ? null : String(value);
      updateJam();
      return true;
    }

    // Rule(Penalties.NumberToFoulout)
    if (parts[2] && parts[2].key === 'Rule' && parts[2].arg === 'Penalties.NumberToFoulout') {
      const n = parseInt(value, 10);
      if (!Number.isNaN(n)) state.foulOutLimit = n;
      return true;
    }

    // Team(N).*
    if (parts[2] && parts[2].key === 'Team' && parts[2].arg) {
      const teamId = parts[2].arg;
      const team = state.teams[teamId];
      if (!team) return false;

      const f = parts[3];
      if (!f) return false;

      if (f.key === 'Name') { team.name = value || ''; return true; }
      if (f.key === 'Color' && f.arg === 'fg') { team.fg = value || team.fg; return true; }
      if (f.key === 'Color' && f.arg === 'bg') { team.bg = value || team.bg; return true; }

      if (f.key === 'Skater' && f.arg) {
        const sk = ensureSkater(teamId, f.arg);
        if (!sk) return false;
        const g = parts[4];
        if (!g) return false;

        if (g.key === 'RosterNumber') { sk.number = value == null ? '' : String(value); return true; }
        if (g.key === 'Name') { sk.name = value == null ? '' : String(value); return true; }
        if (g.key === 'Flags') { sk.flags = value == null ? '' : String(value); return true; }
        if (g.key === 'PenaltyCount') {
          const n = parseInt(value, 10);
          sk.count = Number.isNaN(n) ? 0 : n;
          recomputeFoulOut(sk);
          return true;
        }
        // Penalty(N).Code — the cue letter for each penalty the skater received.
        // Indexed by N; we store every non-empty code and render them in order.
        if (g.key === 'Penalty' && g.arg != null && parts[5] && parts[5].key === 'Code') {
          const idx = String(g.arg);
          if (value == null || value === '') delete sk.penalties[idx];
          else sk.penalties[idx] = String(value);
          return true;
        }
      }
    }

    return false;
  }

  function recomputeFoulOut(sk) {
    const limit = state.foulOutLimit || DEFAULT_FOULOUT;
    sk.foulOut = sk.count >= limit;
  }

  // Resolve the displayed jam number from the active period's stored value.
  function updateJam() {
    const j = state.jamByPeriod[state.period];
    state.jam = (j == null || j === '') ? '—' : String(j);
  }

  // ---------- WS client ----------
  const PATHS = [
    'ScoreBoard.CurrentGame.CurrentPeriodNumber',
    'ScoreBoard.CurrentGame.Period(*).CurrentJamNumber',
    'ScoreBoard.CurrentGame.Rule(Penalties.NumberToFoulout)',
    'ScoreBoard.CurrentGame.Team(*).Name',
    'ScoreBoard.CurrentGame.Team(*).Color(fg)',
    'ScoreBoard.CurrentGame.Team(*).Color(bg)',
    'ScoreBoard.CurrentGame.Team(*).Skater(*).RosterNumber',
    'ScoreBoard.CurrentGame.Team(*).Skater(*).Name',
    'ScoreBoard.CurrentGame.Team(*).Skater(*).Flags',
    'ScoreBoard.CurrentGame.Team(*).Skater(*).PenaltyCount',
    'ScoreBoard.CurrentGame.Team(*).Skater(*).Penalty(*).Code',
  ];

  let ws = null;
  let pingTimer = null;
  let reconnectTimer = null;

  function connect() {
    if (DEMO) { startDemo(); return; }
    setStatus('connecting', 'connecting…');
    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      console.error('WS construct failed', e);
      scheduleReconnect();
      return;
    }
    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', onClose);
    ws.addEventListener('error', onError);
  }

  function onOpen() {
    setStatus('connected', 'connected');
    ws.send(JSON.stringify({ action: 'Register', paths: PATHS }));
    pingTimer = setInterval(() => {
      try { ws.send(JSON.stringify({ action: 'Ping' })); } catch (e) {}
    }, 30000);
  }

  function onMessage(ev) {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    // CRG sends { state: { 'path': value, ... } } among other shapes; handle defensively
    const stateObj = msg && (msg.state || msg.State);
    if (stateObj && typeof stateObj === 'object') {
      let touched = false;
      for (const path of Object.keys(stateObj)) {
        if (applyUpdate(path, stateObj[path])) touched = true;
      }
      if (touched) queueRender();
    }
  }

  function onClose() {
    cleanup();
    setStatus('disconnected', 'disconnected');
    scheduleReconnect();
  }

  function onError() {
    setStatus('error', 'error');
  }

  function cleanup() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (ws) {
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('close', onClose);
      ws.removeEventListener('error', onError);
      ws = null;
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 2000);
  }

  // ---------- Demo mode ----------
  function startDemo() {
    setStatus('demo', 'demo mode');
    state.foulOutLimit = 7;
    state.period = '2';
    state.jamByPeriod = { '2': '14' };
    updateJam();
    state.teams[1].name = 'Rose City Rollers';
    state.teams[1].bg = '#5a1d6b';
    state.teams[1].fg = '#ffffff';
    state.teams[2].name = 'Gotham Girls';
    state.teams[2].bg = '#1f3a8a';
    state.teams[2].fg = '#ffffff';

    const roster1 = [
      { n: '227', name: 'Smasher McGee' },
      { n: '88',  name: 'Wreck-it Ruth' },
      { n: '13',  name: 'Hex Vex' },
      { n: '42',  name: 'Quark Star' },
      { n: '500', name: 'Mach Five' },
      { n: '7',   name: 'Lucky Strike' },
      { n: '9',   name: 'Nina Nightmare' },
      { n: '21',  name: 'Blackjack' },
      { n: '314', name: 'Pi Force' },
      { n: '66',  name: 'Route Runner' },
      { n: '8',   name: 'Knockout Kate' },
      { n: '11',  name: 'Spinal Tap' },
      { n: '37',  name: 'Curveball' },
      { n: '99',  name: 'Sudden Death' },
      { n: '00',  name: 'Double Zero' },
      { n: '101', name: 'Dalmatian' },
      { n: '5',   name: 'High Five' },
      { n: '72',  name: 'Seventy Two' },
      { n: '4',   name: 'Fender Bender' },
      { n: '180', name: 'U-Turn' },
    ];
    const roster2 = [
      { n: '1',   name: 'One-Hit Wendy' },
      { n: '2',   name: 'Twos Day' },
      { n: '6',   name: 'Sixth Sense' },
      { n: '12',  name: 'Dozen Damage' },
      { n: '17',  name: 'Stealth' },
      { n: '23',  name: 'Air Jordan' },
      { n: '99',  name: 'Crash Wayne' },
      { n: '404', name: 'Page Knot Found' },
      { n: '108', name: 'Buddha Body' },
      { n: '3',   name: 'Triple Threat' },
      { n: '4',   name: 'Fourtitude' },
      { n: '15',  name: 'Quinceanera' },
      { n: '50',  name: 'Half Century' },
      { n: '77',  name: 'Lucky Sevens' },
      { n: '256', name: 'Byte Force' },
      { n: '64',  name: 'Checkmate' },
      { n: '19',  name: 'Teen Spirit' },
      { n: '88',  name: 'Double Trouble' },
      { n: '33',  name: 'Snake Eyes' },
      { n: '911', name: 'Emergency' },
    ];

    // Allow ?demo=1&n=8 to trim each roster — handy for previewing layouts
    const demoN = parseInt(params.get('n'), 10);
    const trim = (arr) => Number.isFinite(demoN) && demoN > 0 ? arr.slice(0, demoN) : arr;

    const forceFo = params.get('fo') === '1';
    const DEMO_CODES = ['B', 'C', 'A', 'L', 'E', 'F', 'M', 'P', 'N', 'X'];
    const randCode = () => DEMO_CODES[Math.floor(Math.random() * DEMO_CODES.length)];
    function seed(teamId, roster) {
      roster.forEach((r, i) => {
        const id = `demo-${teamId}-${i}`;
        const sk = ensureSkater(teamId, id);
        sk.number = r.n;
        sk.name = r.name;
        sk.count = forceFo && i === 0 ? 7 : Math.floor(Math.random() * 5);
        sk.penalties = {};
        for (let p = 1; p <= sk.count; p++) sk.penalties[String(p)] = randCode();
        recomputeFoulOut(sk);
      });
    }
    seed(1, trim(roster1));
    seed(2, trim(roster2));
    queueRender();

    // Slowly tick penalties up so you can watch the colors and foul-out animate
    setInterval(() => {
      const teamId = Math.random() < 0.5 ? '1' : '2';
      const ids = Object.keys(state.teams[teamId].skaters);
      if (!ids.length) return;
      const sk = state.teams[teamId].skaters[ids[Math.floor(Math.random() * ids.length)]];
      if (sk.foulOut) return;
      sk.count += 1;
      sk.penalties[String(sk.count)] = randCode();
      recomputeFoulOut(sk);
      queueRender();
    }, 1500);
  }

  // ---------- Settings panel ----------
  const settingsEls = {
    overlay: document.getElementById('settings-overlay'),
    gear: document.getElementById('gear'),
    host: document.getElementById('set-host'),
    port: document.getElementById('set-port'),
    layout: document.getElementById('set-layout'),
    names: document.getElementById('set-names'),
    codes: document.getElementById('set-codes'),
    scale: document.getElementById('set-scale'),
    scaleVal: document.getElementById('set-scale-val'),
    nameScale: document.getElementById('set-name-scale'),
    nameScaleVal: document.getElementById('set-name-scale-val'),
    demo: document.getElementById('set-demo'),
    cancel: document.getElementById('set-cancel'),
    save: document.getElementById('set-save'),
  };

  function openSettings() {
    const s = loadSettings();
    settingsEls.host.value = s.host || '';
    settingsEls.port.value = s.port || '8000';
    settingsEls.layout.value = s.layout === 'grid' ? 'grid' : 'blocks';
    settingsEls.names.checked = s.names !== false;
    settingsEls.codes.checked = s.codes === true;
    settingsEls.scale.value = String(Number(s.scale) || 1);
    settingsEls.scaleVal.textContent = (Number(s.scale) || 1).toFixed(1);
    settingsEls.nameScale.value = String(Number(s.nameScale) || 1);
    settingsEls.nameScaleVal.textContent = (Number(s.nameScale) || 1).toFixed(1);
    settingsEls.overlay.hidden = false;
    settingsEls.host.focus();
  }
  function closeSettings() {
    settingsEls.overlay.hidden = true;
  }

  if (settingsEls.gear) {
    settingsEls.gear.addEventListener('click', openSettings);
    settingsEls.cancel.addEventListener('click', () => {
      // Undo any live preview by restoring the saved values.
      const s = loadSettings();
      scale = Number(s.scale) || 1;
      document.documentElement.style.setProperty('--scale', scale.toFixed(2));
      nameScale = Number(s.nameScale) || 1;
      document.documentElement.style.setProperty('--name-scale', nameScale.toFixed(2));
      showCodes = s.codes === true;
      document.body.classList.toggle('show-codes', showCodes);
      queueRender();
      closeSettings();
    });
    settingsEls.overlay.addEventListener('click', (e) => {
      if (e.target === settingsEls.overlay) closeSettings();
    });
    settingsEls.scale.addEventListener('input', () => {
      const v = Number(settingsEls.scale.value) || 1;
      settingsEls.scaleVal.textContent = v.toFixed(1);
      // Live preview: apply immediately so the operator sees the numbers resize.
      scale = v;
      document.documentElement.style.setProperty('--scale', v.toFixed(2));
    });
    settingsEls.nameScale.addEventListener('input', () => {
      const v = Number(settingsEls.nameScale.value) || 1;
      settingsEls.nameScaleVal.textContent = v.toFixed(1);
      nameScale = v;
      document.documentElement.style.setProperty('--name-scale', v.toFixed(2));
      // Re-fit names against the new base size (long names still cap to the box).
      queueRender();
    });
    settingsEls.codes.addEventListener('change', () => {
      showCodes = settingsEls.codes.checked;
      document.body.classList.toggle('show-codes', showCodes);
      queueRender(); // re-render so the code letters appear/disappear in the blocks
    });
    settingsEls.save.addEventListener('click', () => {
      saveSettings({
        host: settingsEls.host.value.trim(),
        port: settingsEls.port.value.trim() || '8000',
        layout: settingsEls.layout.value === 'grid' ? 'grid' : 'blocks',
        names: settingsEls.names.checked,
        codes: settingsEls.codes.checked,
        scale: Number(settingsEls.scale.value) || 1,
        nameScale: Number(settingsEls.nameScale.value) || 1,
      });
      // Reload so host/port/layout take effect cleanly (drops to live mode).
      location.search = '';
    });
    settingsEls.demo.addEventListener('click', () => {
      location.search = '?demo=1';
    });
  }

  // ---------- Keyboard ----------
  document.addEventListener('keydown', (e) => {
    // Ignore shortcuts while typing in the settings panel
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

    if (e.key === 'f' || e.key === 'F') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
      document.body.classList.toggle('fullscreen');
    } else if (e.key === 'n' || e.key === 'N') {
      const hidden = document.body.classList.toggle('hide-names');
      saveSettings({ names: !hidden });
    } else if (e.key === '+' || e.key === '=') {
      scale = Math.min(2.0, scale + 0.1);
      document.documentElement.style.setProperty('--scale', scale.toFixed(2));
      saveSettings({ scale });
    } else if (e.key === '-' || e.key === '_') {
      scale = Math.max(0.5, scale - 0.1);
      document.documentElement.style.setProperty('--scale', scale.toFixed(2));
      saveSettings({ scale });
    } else if (e.key === 's' || e.key === 'S') {
      if (settingsEls.overlay.hidden) openSettings();
      else closeSettings();
    } else if (e.key === 'Escape') {
      closeSettings();
    }
  });

  // Re-fit names when the viewport changes (card sizes — and thus the base
  // name font — change with it).
  window.addEventListener('resize', queueRender);

  // ---------- Boot ----------
  render();
  connect();

  // First-run convenience: if there's no live game configured yet and we're
  // not already in demo mode, open Settings so the operator can point at CRG.
  if (!DEMO && !saved.host) {
    // Defer so the board paints behind the panel first.
    requestAnimationFrame(openSettings);
  }
})();
