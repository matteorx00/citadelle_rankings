/* =========================================================
   CITADELLES RANKINGS
   Logique applicative — JavaScript vanilla + Supabase
   ========================================================= */

/* ---------------------------------------------------------
   1. CONFIGURATION  ← à renseigner
   --------------------------------------------------------- */
const SUPABASE_URL = "https://xofdsnavjnwhgjquoqel.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_b-mDWagtKRvrJ-z8zaV5Vg_v0TKhRRA";

const ACCESS_PASSWORD = "CITADELLE LOVERS"; // accès à l'application
const ADMIN_PASSWORD  = "Motdepasse07";     // accès administrateur

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 7;

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------------------------------------------------------
   2. MOTEUR DE POINTS
   Les barèmes sont stockés en centièmes de point pour rester
   sur des entiers exacts. Chaque barème est une suite
   arithmétique, donc la moyenne d'un groupe d'ex aequo vaut
   toujours (première place + dernière place) / 2, un nombre
   fini à 2 décimales maximum et la somme d'une partie est
   toujours nulle.
   --------------------------------------------------------- */
const BAREMES = {
  3: [300,   0, -300],
  4: [300, 100, -100, -300],
  5: [300, 150,    0, -150, -300],
  6: [300, 180,   60,  -60, -180, -300],
  7: [300, 200,  100,    0, -100, -200, -300]
};

/**
 * Calcule le classement d'une partie.
 * @param {Array<{score:number}>} entries joueurs avec leur score de jeu
 * @returns {Array} même objets enrichis de rank et cents, triés du 1er au dernier
 */
function computeRanking(entries) {
  const n = entries.length;
  const bareme = BAREMES[n];
  if (!bareme) throw new Error("Nombre de joueurs non géré : " + n);

  const sorted = entries.slice().sort((a, b) => b.score - a.score);
  const out = [];
  let i = 0;

  while (i < n) {
    // On regroupe toutes les places à égalité
    let j = i;
    while (j + 1 < n && sorted[j + 1].score === sorted[i].score) j++;
    const size = j - i + 1;

    // Le groupe se partage les points des places qu'il occupe
    let sum = 0;
    for (let k = i; k <= j; k++) sum += bareme[k];
    const cents = Math.round(sum / size);

    for (let k = i; k <= j; k++) {
      out.push(Object.assign({}, sorted[k], { rank: i + 1, cents: cents }));
    }
    i = j + 1;
  }
  return out;
}

/* ---------------------------------------------------------
   3. ÉTAT
   --------------------------------------------------------- */
const state = {
  players: [],   // { id, name, name_key, hidden }
  games: [],     // { id, played_at, player_count, status, archived, starting_player_id, game_players[] }
  view: "parties",
  admin: sessionStorage.getItem("cr_admin") === "1",
  draft: null    // partie en cours de création
};

/* ---------------------------------------------------------
   4. UTILITAIRES
   --------------------------------------------------------- */
const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/** Clé de comparaison des noms : minuscules, sans accent, sans espaces superflus */
function nameKey(name) {
  return name.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/** Points en centièmes → texte signé, 2 décimales maximum */
function fmtPts(cents) {
  const v = cents / 100;
  const s = v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return v > 0 ? "+" + s : s;
}
function ptsClass(cents) { return cents > 0 ? "pos" : cents < 0 ? "neg" : ""; }

function fmtDate(iso) {
  const d = new Date(iso);
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
}
function toLocalInput(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

function openModal(id) { $("#" + id).hidden = false; }
function closeModal(id) { $("#" + id).hidden = true; }

document.addEventListener("click", e => {
  const btn = e.target.closest("[data-close]");
  if (btn) closeModal(btn.dataset.close);
});
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const open = $$(".modal").filter(m => !m.hidden);
  if (open.length) open[open.length - 1].hidden = true;
});

const ICON_CROWN = '<svg class="crown" viewBox="0 0 24 24" fill="currentColor"><path d="M3 7l4.2 3.2L12 4l4.8 6.2L21 7l-1.6 11H4.6L3 7z"/></svg>';

/* ---------------------------------------------------------
   5. THÈME
   --------------------------------------------------------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("cr_theme", theme);
  const label = $("#themeLabelDesktop");
  if (label) label.textContent = theme === "dark" ? "Mode clair" : "Mode sombre";
}
function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}
applyTheme(localStorage.getItem("cr_theme") ||
  (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

/* ---------------------------------------------------------
   6. ÉCRAN D'ACCÈS
   --------------------------------------------------------- */
function checkGate() {
  if (localStorage.getItem("cr_access") === "ok") { enterApp(); return; }
  $("#gateInput").focus();
}
function submitGate() {
  const val = $("#gateInput").value.trim();
  if (nameKey(val) === nameKey(ACCESS_PASSWORD)) {
    localStorage.setItem("cr_access", "ok");
    enterApp();
  } else {
    $("#gateError").textContent = "Mot de passe incorrect. Réessayez.";
    $("#gateInput").select();
  }
}
function enterApp() {
  $("#gate").hidden = true;
  $("#gate").style.display = "none";
  $("#app").hidden = false;
  refreshAdminUI();
  loadAll();
}
$("#gateBtn").addEventListener("click", submitGate);
$("#gateInput").addEventListener("keydown", e => { if (e.key === "Enter") submitGate(); });

/* ---------------------------------------------------------
   7. ACCÈS AUX DONNÉES
   --------------------------------------------------------- */
async function loadAll() {
  const [pRes, gRes] = await Promise.all([
    sb.from("players").select("*").order("name"),
    sb.from("games").select("*, game_players(*)").order("played_at", { ascending: false })
  ]);
  if (pRes.error) return toast("Erreur de chargement des joueurs.");
  if (gRes.error) return toast("Erreur de chargement des parties.");
  state.players = pRes.data || [];
  state.games = gRes.data || [];
  render();
}

function playerById(id) { return state.players.find(p => p.id === id); }
function playerName(id) { const p = playerById(id); return p ? p.name : "Joueur supprimé"; }

/** Retrouve ou crée un joueur à partir d'un nom saisi */
async function ensurePlayer(rawName) {
  const key = nameKey(rawName);
  const found = state.players.find(p => p.name_key === key);
  if (found) return found;
  const { data, error } = await sb.from("players")
    .insert({ name: rawName.trim().replace(/\s+/g, " "), name_key: key })
    .select().single();

  if (error) {
    // Un autre appareil vient peut-être de créer le même joueur
    const { data: again } = await sb.from("players").select("*").eq("name_key", key).single();
    if (again) { state.players.push(again); return again; }
    throw error;
  }
  state.players.push(data);
  return data;
}

/* ---------------------------------------------------------
   8. STATISTIQUES
   --------------------------------------------------------- */
/** Parties prises en compte dans le classement */
function scoredGames() {
  return state.games.filter(g => g.status === "terminee" && !g.archived);
}

function computeStats() {
  const map = new Map();
  const get = id => {
    if (!map.has(id)) map.set(id, {
      id, cents: 0, games: 0, wins: 0, losses: 0,
      podiums: 0, podiumGames: 0, scoreSum: 0, bestScore: null
    });
    return map.get(id);
  };

  for (const g of scoredGames()) {
    const rows = g.game_players || [];
    if (!rows.length) continue;
    const scores = rows.map(r => r.score);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const allTied = max === min;

    for (const r of rows) {
      const s = get(r.player_id);
      s.games++;
      s.cents += Math.round(Number(r.points) * 100);
      s.scoreSum += r.score;
      if (s.bestScore === null || r.score > s.bestScore) s.bestScore = r.score;
      if (!allTied && r.score === max) s.wins++;
      if (!allTied && r.score === min) s.losses++;
      if (g.player_count >= 4) {
        s.podiumGames++;
        if (r.rank <= 3) s.podiums++;
      }
    }
  }
  return map;
}

/* ---------------------------------------------------------
   9. RENDU
   --------------------------------------------------------- */
function render() {
  renderParties();
  renderStats();
}

function setView(view) {
  state.view = view;
  $("#view-parties").classList.toggle("hidden", view !== "parties");
  $("#view-stats").classList.toggle("hidden", view !== "stats");
  $("#viewTitle").textContent = view === "parties" ? "Parties" : "Statistiques";
  $$("[data-view]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === view)));
  $("#btnNewGame").classList.toggle("hidden", view !== "parties");
  window.scrollTo({ top: 0 });
}
$$("[data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));

/* --- onglet Parties --- */
function renderParties() {
  const live = state.games.filter(g => g.status === "en_cours" && !g.archived);
  const done = state.games.filter(g => g.status === "terminee" && !g.archived);

  $("#liveGames").innerHTML = live.length ? `
    <div class="banner">
      <div class="banner-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      </div>
      <div class="banner-body">
        <div class="banner-title">${live.length > 1 ? live.length + " parties en cours" : "Une partie en cours"}</div>
        <div class="banner-text">Les scores n'ont pas encore été saisis. <b>Reprenez la saisie</b> pour l'ajouter au classement.</div>
      </div>
      <button class="btn btn-gold btn-sm" data-resume="${live[0].id}">Reprendre</button>
    </div>` : "";

  if (!done.length) {
    $("#gamesList").innerHTML = `
      <div class="empty">
        <strong>Aucune partie enregistrée</strong>
        Lancez une partie de Citadelles, puis saisissez les scores finaux avec le bouton Nouvelle partie.
      </div>`;
    return;
  }

  $("#gamesList").innerHTML = done.map(g => {
    const rows = (g.game_players || []).slice().sort((a, b) => a.rank - b.rank);
    const winners = rows.filter(r => r.rank === 1).map(r => playerName(r.player_id));
    const allTied = rows.length && rows.every(r => r.rank === 1);
    return `
      <button class="game-card" data-game="${g.id}">
        <div class="game-date">
          <strong>${esc(fmtDate(g.played_at))}</strong>
          <span>${fmtTime(g.played_at)} · ${g.player_count} joueurs</span>
        </div>
        <div class="game-winner">${allTied ? "Égalité générale" : ICON_CROWN + esc(winners.join(", "))}</div>
      </button>`;
  }).join("");
}

document.addEventListener("click", e => {
  const g = e.target.closest("[data-game]");
  if (g) openGame(g.dataset.game);
  const r = e.target.closest("[data-resume]");
  if (r) resumeGame(r.dataset.resume);
});

/* --- onglet Statistiques --- */
function renderStats() {
  const stats = computeStats();
  const rows = state.players
    .filter(p => !p.hidden && stats.has(p.id))
    .map(p => Object.assign({ name: p.name }, stats.get(p.id)))
    .sort((a, b) =>
      b.cents - a.cents ||
      b.wins - a.wins ||
      b.games - a.games ||
      a.name.localeCompare(b.name, "fr")
    );

  if (!rows.length) {
    $("#statsContent").innerHTML = `
      <div class="empty">
        <strong>Le classement est vide</strong>
        Il se remplira dès la première partie enregistrée.
      </div>`;
    return;
  }

  // Rangs avec ex aequo sur le cumul de points
  let rank = 0, prev = null;
  rows.forEach((r, i) => {
    if (prev === null || r.cents !== prev) rank = i + 1;
    r.pos = rank; prev = r.cents;
  });

  const hidden = state.players.filter(p => p.hidden && stats.has(p.id));

  $("#statsContent").innerHTML = `
    <div class="card" style="overflow:hidden">
      <table class="table">
        <thead>
          <tr>
            <th style="width:56px">#</th>
            <th>Joueur</th>
            <th class="r" style="width:76px">Parties</th>
            <th class="r" style="width:82px">Victoires</th>
            <th class="r" style="width:88px">Points</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr data-player="${r.id}">
              <td><span class="rank-badge rank-${r.pos <= 3 ? r.pos : "n"}">${r.pos}</span></td>
              <td><b>${esc(r.name)}</b></td>
              <td class="r num">${r.games}</td>
              <td class="r num">${r.wins}</td>
              <td class="r num ${ptsClass(r.cents)}"><b>${fmtPts(r.cents)}</b></td>
            </tr>`).join("")}
        </tbody>
      </table>
      ${hidden.length ? `<div class="unranked-note">${hidden.length} joueur(s) masqué(s) du classement.</div>` : ""}
    </div>
    <p class="hint" style="margin-top:14px">Cliquez sur un joueur pour voir sa fiche détaillée.</p>`;
}

document.addEventListener("click", e => {
  const tr = e.target.closest("[data-player]");
  if (tr) openPlayer(tr.dataset.player);
});

/* ---------------------------------------------------------
   10. AUTOCOMPLÉTION DES JOUEURS
   --------------------------------------------------------- */
function attachAutocomplete(input, list, getTaken) {
  function close() { list.hidden = true; }
  function open() {
    const q = nameKey(input.value);
    const taken = getTaken().filter(k => k && k !== nameKey(input.value));
    let opts = state.players
      .filter(p => !taken.includes(p.name_key))
      .filter(p => !q || p.name_key.includes(q))
      .slice(0, 40);

    let html = opts.map(p => `<button type="button" class="ac-opt" data-name="${esc(p.name)}">${esc(p.name)}</button>`).join("");
    const exact = state.players.some(p => p.name_key === q);
    if (q && !exact) {
      html = `<button type="button" class="ac-opt" data-name="${esc(input.value.trim())}"><span class="new">Créer « ${esc(input.value.trim())} »</span></button>` + html;
    }
    list.innerHTML = html || `<div class="ac-opt" style="color:var(--muted)">Saisissez un nom</div>`;
    list.hidden = false;
  }
  input.addEventListener("focus", open);
  input.addEventListener("input", open);
  input.addEventListener("blur", () => setTimeout(close, 140));
  list.addEventListener("mousedown", e => {
    const opt = e.target.closest("[data-name]");
    if (!opt) return;
    e.preventDefault();
    input.value = opt.dataset.name;
    close();
    input.dispatchEvent(new Event("change"));
  });
}

/* ---------------------------------------------------------
   11. NOUVELLE PARTIE
   --------------------------------------------------------- */
$("#btnNewGame").addEventListener("click", () => {
  state.draft = { count: 4, names: ["", "", "", ""] };
  openModal("modalNew");
  renderStep1();
});

function renderStep1() {
  $("#newStepLabel").textContent = "Étape 1 sur 3";
  $("#newTitle").textContent = "Nouvelle partie";
  const d = state.draft;

  $("#newBody").innerHTML = `
    <div class="field">
      <label>Nombre de joueurs</label>
      <div class="segmented" id="segCount">
        ${[3,4,5,6,7].map(n => `<button type="button" class="seg" data-n="${n}" aria-pressed="${n === d.count}">${n}</button>`).join("")}
      </div>
    </div>
    <div class="field" style="margin-bottom:0">
      <label>Joueurs</label>
      <div class="player-rows" id="playerRows"></div>
      <p class="hint">Les noms déjà enregistrés apparaissent dans la liste. Saisissez un nouveau nom pour créer un joueur.</p>
    </div>`;

  $("#newFoot").innerHTML = `
    <button class="btn btn-ghost" data-close="modalNew">Annuler</button>
    <button class="btn btn-gold" id="step1Next">Confirmer</button>`;

  $$("#segCount .seg").forEach(b => b.addEventListener("click", () => {
    d.count = Number(b.dataset.n);
    d.names = Array.from({ length: d.count }, (_, i) => d.names[i] || "");
    renderStep1();
  }));

  renderPlayerRows();
  $("#step1Next").addEventListener("click", startGame);
}

function renderPlayerRows() {
  const d = state.draft;
  const wrap = $("#playerRows");
  wrap.innerHTML = d.names.map((v, i) => `
    <div class="player-row">
      <span class="idx">${i + 1}</span>
      <div class="ac">
        <input class="input" type="text" autocomplete="off" placeholder="Nom du joueur ${i + 1}" value="${esc(v)}" data-i="${i}">
        <div class="ac-list" hidden></div>
      </div>
    </div>`).join("");

  $$("#playerRows .player-row").forEach(row => {
    const input = $("input", row);
    const list = $(".ac-list", row);
    input.addEventListener("input", () => { d.names[Number(input.dataset.i)] = input.value; });
    input.addEventListener("change", () => { d.names[Number(input.dataset.i)] = input.value; });
    attachAutocomplete(input, list, () => d.names.map(nameKey));
  });
}

async function startGame() {
  const d = state.draft;
  const names = d.names.map(n => n.trim());

  if (names.some(n => !n)) return toast("Renseignez le nom de chaque joueur.");
  const keys = names.map(nameKey);
  if (new Set(keys).size !== keys.length) return toast("Un même joueur est saisi deux fois.");

  const btn = $("#step1Next");
  btn.disabled = true; btn.textContent = "Enregistrement…";

  try {
    const players = [];
    for (const n of names) players.push(await ensurePlayer(n));

    const starter = players[Math.floor(Math.random() * players.length)];

    const { data: game, error } = await sb.from("games").insert({
      player_count: players.length,
      status: "en_cours",
      starting_player_id: starter.id
    }).select().single();
    if (error) throw error;

    const rows = players.map(p => ({ game_id: game.id, player_id: p.id }));
    const { error: e2 } = await sb.from("game_players").insert(rows);
    if (e2) throw e2;

    await loadAll();
    state.draft = { gameId: game.id, players, starter, scores: players.map(() => "") };
    renderStep2();
  } catch (err) {
    console.error(err);
    toast("Impossible d'enregistrer la partie.");
    btn.disabled = false; btn.textContent = "Confirmer";
  }
}

function renderStep2() {
  const d = state.draft;
  $("#newStepLabel").textContent = "Étape 2 sur 3";
  $("#newTitle").textContent = "Premier joueur";

  $("#newBody").innerHTML = `
    <div class="draw rolling" id="draw">
      <svg class="crown-big" viewBox="0 0 24 24" fill="currentColor"><path d="M3 7l4.2 3.2L12 4l4.8 6.2L21 7l-1.6 11H4.6L3 7z"/></svg>
      <div class="draw-name" id="drawName">…</div>
      <p class="hint" id="drawHint">Tirage au sort en cours</p>
    </div>`;
  $("#newFoot").innerHTML = `<button class="btn btn-gold" id="step2Next" disabled>Saisir les scores</button>`;

  const names = d.players.map(p => p.name);
  const el = $("#drawName");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ticks = reduce ? 0 : 16;

  const finish = () => {
    $("#draw").classList.remove("rolling");
    el.textContent = d.starter.name;
    $("#drawHint").textContent = "commence la partie";
    const b = $("#step2Next");
    b.disabled = false;
    b.addEventListener("click", renderStep3);
  };

  if (!ticks) return finish();
  const timer = setInterval(() => {
    el.textContent = names[Math.floor(Math.random() * names.length)];
    if (--ticks <= 0) { clearInterval(timer); finish(); }
  }, 80);
}

function renderStep3() {
  const d = state.draft;
  $("#newStepLabel").textContent = "Étape 3 sur 3";
  $("#newTitle").textContent = "Scores de fin de partie";

  $("#newBody").innerHTML = `
    <div class="field" style="margin-bottom:0">
      <label>Points marqués dans le jeu</label>
      <div id="scoreRows">
        ${d.players.map((p, i) => `
          <div class="score-row">
            <span class="score-name">${esc(p.name)}${p.id === d.starter.id ? ' <span class="chip">1er à jouer</span>' : ""}</span>
            <input class="input score-input num" type="number" inputmode="numeric" min="0" step="1" data-i="${i}" value="${esc(d.scores[i])}" placeholder="0">
          </div>`).join("")}
      </div>
      <div class="preview" id="preview"></div>
    </div>`;

  $("#newFoot").innerHTML = `
    <button class="btn btn-ghost" data-close="modalNew">Plus tard</button>
    <button class="btn btn-gold" id="step3Save" disabled>Enregistrer la partie</button>`;

  $$("#scoreRows input").forEach(inp => inp.addEventListener("input", () => {
    d.scores[Number(inp.dataset.i)] = inp.value;
    updatePreview();
  }));
  $("#step3Save").addEventListener("click", saveScores);
  updatePreview();
}

function draftEntries() {
  const d = state.draft;
  if (d.scores.some(s => s === "" || s === null || isNaN(Number(s)))) return null;
  return d.players.map((p, i) => ({ id: p.id, name: p.name, score: Number(d.scores[i]) }));
}

function updatePreview() {
  const entries = draftEntries();
  const box = $("#preview");
  const save = $("#step3Save");

  if (!entries) {
    box.innerHTML = `<p class="hint" style="margin:0">Le classement s'affiche dès que tous les scores sont saisis.</p>`;
    save.disabled = true;
    return;
  }
  save.disabled = false;
  const ranked = computeRanking(entries);
  box.innerHTML = `
    <div class="eyebrow" style="margin-bottom:8px">Points attribués</div>
    ${ranked.map(r => `
      <div class="preview-row">
        <span class="p-rank">${r.rank}${r.rank === 1 ? "er" : "e"}</span>
        <span class="p-name">${esc(r.name)}</span>
        <span class="p-score">${r.score} pts</span>
        <span class="p-pts ${ptsClass(r.cents)}">${fmtPts(r.cents)}</span>
      </div>`).join("")}`;
}

async function saveScores() {
  const d = state.draft;
  const entries = draftEntries();
  if (!entries) return;

  const btn = $("#step3Save");
  btn.disabled = true; btn.textContent = "Enregistrement…";

  try {
    const ranked = computeRanking(entries);
    for (const r of ranked) {
      const { error } = await sb.from("game_players")
        .update({ score: r.score, rank: r.rank, points: r.cents / 100 })
        .eq("game_id", d.gameId).eq("player_id", r.id);
      if (error) throw error;
    }
    const { error } = await sb.from("games").update({ status: "terminee" }).eq("id", d.gameId);
    if (error) throw error;

    closeModal("modalNew");
    state.draft = null;
    await loadAll();
    toast("Partie enregistrée.");
  } catch (err) {
    console.error(err);
    toast("Impossible d'enregistrer les scores.");
    btn.disabled = false; btn.textContent = "Enregistrer la partie";
  }
}

/** Reprise d'une partie créée mais dont les scores manquent */
function resumeGame(gameId) {
  const g = state.games.find(x => x.id === gameId);
  if (!g) return;
  const players = (g.game_players || []).map(r => playerById(r.player_id)).filter(Boolean);
  state.draft = {
    gameId: g.id,
    players,
    starter: playerById(g.starting_player_id) || players[0],
    scores: players.map(() => "")
  };
  openModal("modalNew");
  renderStep3();
}

/* ---------------------------------------------------------
   12. DÉTAIL D'UNE PARTIE
   --------------------------------------------------------- */
function openGame(gameId) {
  const g = state.games.find(x => x.id === gameId);
  if (!g) return;
  const rows = (g.game_players || []).slice().sort((a, b) => a.rank - b.rank || b.score - a.score);

  $("#gameEyebrow").textContent = g.archived ? "Partie archivée" : "Partie";
  $("#gameTitle").textContent = fmtDate(g.played_at) + " · " + fmtTime(g.played_at);

  $("#gameBody").innerHTML = `
    <div class="eyebrow" style="margin-bottom:10px">${g.player_count} joueurs · ${esc(playerName(g.starting_player_id))} a commencé</div>
    ${rows.map(r => `
      <div class="detail-row">
        <span class="d-rank"><span class="rank-badge rank-${r.rank <= 3 ? r.rank : "n"}">${r.rank}</span></span>
        <span class="d-name"><b>${esc(playerName(r.player_id))}</b><small>${r.score} points dans la partie</small></span>
        <span class="d-pts ${ptsClass(Math.round(r.points * 100))}">${fmtPts(Math.round(r.points * 100))}</span>
      </div>`).join("")}
    <p class="hint">Le total des points attribués est toujours nul, un joueur ne gagne que ce qu'un autre perd.</p>`;

  $("#gameFoot").innerHTML = state.admin ? `
    <button class="btn btn-ghost btn-sm left" id="gameEdit">Modifier</button>
    ${g.archived
      ? `<button class="btn btn-ghost btn-sm" id="gameUnarchive">Restaurer</button>
         <button class="btn btn-danger btn-sm" id="gameDelete">Supprimer</button>`
      : `<button class="btn btn-ghost btn-sm" id="gameArchive">Archiver</button>`}
    <button class="btn btn-navy btn-sm" data-close="modalGame">Fermer</button>`
    : `<button class="btn btn-ghost" data-close="modalGame">Fermer</button>`;

  if (state.admin) {
    const on = (id, fn) => { const el = $("#" + id); if (el) el.addEventListener("click", fn); };
    on("gameEdit", () => { closeModal("modalGame"); openEditGame(g.id); });
    on("gameArchive", () => setArchived(g.id, true));
    on("gameUnarchive", () => setArchived(g.id, false));
    on("gameDelete", () => deleteGame(g.id));
  }
  openModal("modalGame");
}

async function setArchived(gameId, archived) {
  const { error } = await sb.from("games").update({ archived }).eq("id", gameId);
  if (error) return toast("Action impossible.");
  closeModal("modalGame");
  await loadAll();
  toast(archived ? "Partie archivée." : "Partie restaurée.");
}

async function deleteGame(gameId) {
  if (!confirm("Supprimer définitivement cette partie ? Cette action est irréversible.")) return;
  const { error } = await sb.from("games").delete().eq("id", gameId);
  if (error) return toast("Suppression impossible.");
  closeModal("modalGame");
  closeModal("modalAux");
  await loadAll();
  toast("Partie supprimée.");
}

/* ---------------------------------------------------------
   13. ÉDITION D'UNE PARTIE (administrateur)
   --------------------------------------------------------- */
function openEditGame(gameId) {
  const g = state.games.find(x => x.id === gameId);
  if (!g) return;
  const rows = (g.game_players || []).slice().sort((a, b) => a.rank - b.rank || b.score - a.score);

  const edit = {
    id: g.id,
    played_at: toLocalInput(g.played_at),
    names: rows.map(r => playerName(r.player_id)),
    scores: rows.map(r => String(r.score)),
    starter: playerName(g.starting_player_id)
  };

  $("#auxEyebrow").textContent = "Administration";
  $("#auxTitle").textContent = "Modifier la partie";
  $("#auxFoot").innerHTML = `
    <button class="btn btn-ghost" data-close="modalAux">Annuler</button>
    <button class="btn btn-gold" id="editSave">Enregistrer les modifications</button>`;

  function draw() {
    $("#auxBody").innerHTML = `
      <div class="field">
        <label>Date et heure</label>
        <input class="input" type="datetime-local" id="editDate" value="${edit.played_at}">
      </div>
      <div class="field">
        <label>Nombre de joueurs</label>
        <div class="segmented" id="editCount">
          ${[3,4,5,6,7].map(n => `<button type="button" class="seg" data-n="${n}" aria-pressed="${n === edit.names.length}">${n}</button>`).join("")}
        </div>
      </div>
      <div class="field">
        <label>Joueurs et scores</label>
        <div class="player-rows" id="editRows">
          ${edit.names.map((n, i) => `
            <div class="player-row">
              <span class="idx">${i + 1}</span>
              <div class="ac">
                <input class="input" type="text" autocomplete="off" value="${esc(n)}" data-i="${i}" placeholder="Nom">
                <div class="ac-list" hidden></div>
              </div>
              <input class="input score-input num" type="number" min="0" step="1" data-s="${i}" value="${esc(edit.scores[i])}" placeholder="0">
            </div>`).join("")}
        </div>
      </div>
      <div class="field" style="margin-bottom:0">
        <label>Premier joueur</label>
        <select class="input" id="editStarter">
          ${edit.names.map(n => `<option ${nameKey(n) === nameKey(edit.starter) ? "selected" : ""}>${esc(n)}</option>`).join("")}
        </select>
      </div>`;

    $$("#editCount .seg").forEach(b => b.addEventListener("click", () => {
      const n = Number(b.dataset.n);
      edit.names = Array.from({ length: n }, (_, i) => edit.names[i] || "");
      edit.scores = Array.from({ length: n }, (_, i) => edit.scores[i] || "");
      draw();
    }));
    $("#editDate").addEventListener("change", e => { edit.played_at = e.target.value; });
    $("#editStarter").addEventListener("change", e => { edit.starter = e.target.value; });
    $$("#editRows .player-row").forEach(row => {
      const input = $("input[data-i]", row);
      const list = $(".ac-list", row);
      const score = $("input[data-s]", row);
      input.addEventListener("input", () => { edit.names[Number(input.dataset.i)] = input.value; });
      input.addEventListener("change", () => { edit.names[Number(input.dataset.i)] = input.value; draw(); });
      score.addEventListener("input", () => { edit.scores[Number(score.dataset.s)] = score.value; });
      attachAutocomplete(input, list, () => edit.names.map(nameKey));
    });
  }

  draw();
  $("#editSave").addEventListener("click", () => saveEditGame(edit));
  openModal("modalAux");
}

async function saveEditGame(edit) {
  const names = edit.names.map(n => n.trim());
  if (names.some(n => !n)) return toast("Renseignez le nom de chaque joueur.");
  const keys = names.map(nameKey);
  if (new Set(keys).size !== keys.length) return toast("Un même joueur est saisi deux fois.");
  if (edit.scores.some(s => s === "" || isNaN(Number(s)))) return toast("Renseignez tous les scores.");

  const btn = $("#editSave");
  btn.disabled = true; btn.textContent = "Enregistrement…";

  try {
    const players = [];
    for (const n of names) players.push(await ensurePlayer(n));

    const entries = players.map((p, i) => ({ id: p.id, name: p.name, score: Number(edit.scores[i]) }));
    const ranked = computeRanking(entries);
    const starter = players.find(p => nameKey(p.name) === nameKey(edit.starter)) || players[0];

    await sb.from("game_players").delete().eq("game_id", edit.id);
    const { error: e1 } = await sb.from("game_players").insert(ranked.map(r => ({
      game_id: edit.id, player_id: r.id, score: r.score, rank: r.rank, points: r.cents / 100
    })));
    if (e1) throw e1;

    const { error: e2 } = await sb.from("games").update({
      played_at: new Date(edit.played_at).toISOString(),
      player_count: players.length,
      starting_player_id: starter.id,
      status: "terminee"
    }).eq("id", edit.id);
    if (e2) throw e2;

    closeModal("modalAux");
    await loadAll();
    toast("Partie modifiée.");
  } catch (err) {
    console.error(err);
    toast("Modification impossible.");
    btn.disabled = false; btn.textContent = "Enregistrer les modifications";
  }
}

/* ---------------------------------------------------------
   14. FICHE JOUEUR
   --------------------------------------------------------- */
function openPlayer(playerId) {
  const p = playerById(playerId);
  const s = computeStats().get(playerId);
  if (!p || !s) return;

  const avg = s.games ? (s.scoreSum / s.games) : 0;
  $("#playerTitle").textContent = p.name;
  $("#playerBody").innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="v ${ptsClass(s.cents)}">${fmtPts(s.cents)}</div><div class="k">Points cumulés</div></div>
      <div class="stat"><div class="v num">${s.games}</div><div class="k">Parties jouées</div></div>
      <div class="stat"><div class="v num">${s.wins}</div><div class="k">Victoires</div></div>
      <div class="stat"><div class="v num">${s.losses}</div><div class="k">Dernières places</div></div>
      <div class="stat"><div class="v num">${avg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</div><div class="k">Points moyens en jeu</div></div>
      <div class="stat"><div class="v num">${s.bestScore ?? "—"}</div><div class="k">Meilleur score en jeu</div></div>
      <div class="stat"><div class="v num">${s.podiums}</div><div class="k">Podiums${s.podiumGames ? " / " + s.podiumGames : ""}</div></div>
      <div class="stat"><div class="v num">${s.games ? (s.cents / s.games / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "—"}</div><div class="k">Points par partie</div></div>
    </div>
    <p class="hint">Les victoires et dernières places comptent les ex aequo. Les podiums ne sont comptés que sur les parties à 4 joueurs et plus.</p>`;
  openModal("modalPlayer");
}

/* ---------------------------------------------------------
   15. PARAMÈTRES ET ADMINISTRATION
   --------------------------------------------------------- */
function refreshAdminUI() {
  $("#adminPill").classList.toggle("hidden", !state.admin);
}

function openSettings() {
  $("#settingsTitle").textContent = "Paramètres";
  const dark = document.documentElement.dataset.theme === "dark";

  $("#settingsBody").innerHTML = `
    <div class="switch-row" style="border-bottom:1px solid var(--border)">
      <div><b>Apparence</b><small style="display:block;color:var(--muted);font-size:12.5px">Mode ${dark ? "sombre" : "clair"} actif</small></div>
      <button class="btn btn-ghost btn-sm" id="setTheme">Basculer</button>
    </div>
    ${state.admin ? `
      <div style="padding-top:16px">
        <div class="eyebrow" style="margin-bottom:10px">Administration</div>
        <div class="list-row"><span class="grow"><b>Joueurs</b><small>Renommer, fusionner, masquer</small></span>
          <button class="btn btn-ghost btn-sm" id="setPlayers">Gérer</button></div>
        <div class="list-row"><span class="grow"><b>Parties archivées</b><small>Restaurer ou supprimer définitivement</small></span>
          <button class="btn btn-ghost btn-sm" id="setArchives">Ouvrir</button></div>
        <div class="list-row"><span class="grow"><b>Session administrateur</b><small>Active sur cet onglet</small></span>
          <button class="btn btn-ghost btn-sm" id="setLogout">Quitter</button></div>
      </div>`
    : `
      <div style="padding-top:16px">
        <div class="field" style="margin-bottom:0">
          <label>Accès administrateur</label>
          <input class="input" type="password" id="adminPwd" autocomplete="off" placeholder="Mot de passe">
          <p class="hint">L'accès administrateur permet de modifier, archiver et supprimer des parties.</p>
          <p id="adminErr" class="hint neg"></p>
        </div>
      </div>`}`;

  $("#settingsFoot").innerHTML = state.admin
    ? `<button class="btn btn-ghost" data-close="modalSettings">Fermer</button>`
    : `<button class="btn btn-ghost" data-close="modalSettings">Fermer</button>
       <button class="btn btn-gold" id="adminGo">Se connecter</button>`;

  $("#setTheme").addEventListener("click", () => { toggleTheme(); openSettings(); });

  if (state.admin) {
    $("#setPlayers").addEventListener("click", () => { closeModal("modalSettings"); openPlayersAdmin(); });
    $("#setArchives").addEventListener("click", () => { closeModal("modalSettings"); openArchives(); });
    $("#setLogout").addEventListener("click", () => {
      state.admin = false; sessionStorage.removeItem("cr_admin");
      refreshAdminUI(); openSettings(); toast("Session administrateur fermée.");
    });
  } else {
    const go = () => {
      if ($("#adminPwd").value === ADMIN_PASSWORD) {
        state.admin = true; sessionStorage.setItem("cr_admin", "1");
        refreshAdminUI(); openSettings(); toast("Accès administrateur activé.");
      } else {
        $("#adminErr").textContent = "Mot de passe incorrect.";
      }
    };
    $("#adminGo").addEventListener("click", go);
    $("#adminPwd").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  }
  openModal("modalSettings");
}
$("#btnSettingsDesktop").addEventListener("click", openSettings);
$("#btnSettingsMobile").addEventListener("click", openSettings);
$("#btnThemeDesktop").addEventListener("click", toggleTheme);
$("#btnThemeMobile").addEventListener("click", toggleTheme);

/* --- gestion des joueurs --- */
function openPlayersAdmin() {
  const stats = computeStats();
  $("#auxEyebrow").textContent = "Administration";
  $("#auxTitle").textContent = "Joueurs";
  $("#auxFoot").innerHTML = `<button class="btn btn-ghost" data-close="modalAux">Fermer</button>`;

  $("#auxBody").innerHTML = state.players.length ? state.players.map(p => {
    const n = stats.get(p.id) ? stats.get(p.id).games : 0;
    return `
      <div class="list-row">
        <span class="grow"><b>${esc(p.name)}</b><small>${n} partie(s)${p.hidden ? " · masqué du classement" : ""}</small></span>
        <button class="btn btn-ghost btn-sm" data-rename="${p.id}">Renommer</button>
        <button class="btn btn-ghost btn-sm" data-merge="${p.id}">Fusionner</button>
        <button class="btn btn-ghost btn-sm" data-hide="${p.id}">${p.hidden ? "Afficher" : "Masquer"}</button>
      </div>`;
  }).join("") : `<p class="hint" style="margin:0">Aucun joueur enregistré.</p>`;

  $$("[data-rename]").forEach(b => b.addEventListener("click", () => renamePlayer(b.dataset.rename)));
  $$("[data-merge]").forEach(b => b.addEventListener("click", () => mergePlayer(b.dataset.merge)));
  $$("[data-hide]").forEach(b => b.addEventListener("click", () => toggleHidden(b.dataset.hide)));
  openModal("modalAux");
}

async function renamePlayer(id) {
  const p = playerById(id);
  const val = prompt("Nouveau nom pour " + p.name, p.name);
  if (!val || !val.trim()) return;
  const key = nameKey(val);
  if (state.players.some(x => x.id !== id && x.name_key === key))
    return toast("Ce nom existe déjà, utilisez plutôt la fusion.");
  const { error } = await sb.from("players")
    .update({ name: val.trim().replace(/\s+/g, " "), name_key: key }).eq("id", id);
  if (error) return toast("Renommage impossible.");
  await loadAll(); openPlayersAdmin(); toast("Joueur renommé.");
}

async function mergePlayer(id) {
  const p = playerById(id);
  const others = state.players.filter(x => x.id !== id);
  if (!others.length) return toast("Aucun autre joueur avec qui fusionner.");
  const target = prompt(
    `Fusionner « ${p.name} » dans quel joueur ?\nSaisissez exactement l'un de ces noms :\n\n` +
    others.map(o => "· " + o.name).join("\n")
  );
  if (!target) return;
  const dest = state.players.find(x => nameKey(x.name) === nameKey(target) && x.id !== id);
  if (!dest) return toast("Nom introuvable.");

  // Parties où les deux joueurs sont présents, la fusion créerait un doublon
  const conflict = state.games.some(g => {
    const ids = (g.game_players || []).map(r => r.player_id);
    return ids.includes(id) && ids.includes(dest.id);
  });
  if (conflict) return toast("Les deux joueurs apparaissent dans une même partie, fusion impossible.");

  if (!confirm(`Toutes les parties de « ${p.name} » seront attribuées à « ${dest.name} », puis « ${p.name} » sera supprimé. Continuer ?`)) return;

  const { error } = await sb.from("game_players").update({ player_id: dest.id }).eq("player_id", id);
  if (error) return toast("Fusion impossible.");
  await sb.from("games").update({ starting_player_id: dest.id }).eq("starting_player_id", id);
  await sb.from("players").delete().eq("id", id);
  await loadAll(); openPlayersAdmin(); toast("Joueurs fusionnés.");
}

async function toggleHidden(id) {
  const p = playerById(id);
  const { error } = await sb.from("players").update({ hidden: !p.hidden }).eq("id", id);
  if (error) return toast("Action impossible.");
  await loadAll(); openPlayersAdmin();
}

/* --- parties archivées --- */
function openArchives() {
  const archived = state.games.filter(g => g.archived);
  $("#auxEyebrow").textContent = "Administration";
  $("#auxTitle").textContent = "Parties archivées";
  $("#auxFoot").innerHTML = `<button class="btn btn-ghost" data-close="modalAux">Fermer</button>`;

  $("#auxBody").innerHTML = archived.length ? `
    <p class="hint" style="margin:0 0 14px">Les parties archivées ne comptent plus dans le classement. La suppression est définitive.</p>
    ${archived.map(g => `
      <div class="list-row">
        <span class="grow"><b>${esc(fmtDate(g.played_at))}</b><small>${fmtTime(g.played_at)} · ${g.player_count} joueurs</small></span>
        <button class="btn btn-ghost btn-sm" data-unarch="${g.id}">Restaurer</button>
        <button class="btn btn-danger btn-sm" data-del="${g.id}">Supprimer</button>
      </div>`).join("")}`
    : `<p class="hint" style="margin:0">Aucune partie archivée.</p>`;

  $$("[data-unarch]").forEach(b => b.addEventListener("click", async () => {
    await sb.from("games").update({ archived: false }).eq("id", b.dataset.unarch);
    await loadAll(); openArchives(); toast("Partie restaurée.");
  }));
  $$("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Supprimer définitivement cette partie ?")) return;
    await sb.from("games").delete().eq("id", b.dataset.del);
    await loadAll(); openArchives(); toast("Partie supprimée.");
  }));
  openModal("modalAux");
}

/* ---------------------------------------------------------
   16. DÉMARRAGE
   --------------------------------------------------------- */
setView("parties");
checkGate();
