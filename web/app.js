import { loadGrid, assess, expectedValue } from "./engine.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (x, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
const pts = (x, d = 1) => `${(x * 100).toFixed(d)}`;
const pStarTxt = (p) => (p < 0.01 ? (p * 100).toFixed(2) : p < 0.1 ? (p * 100).toFixed(1) : (p * 100).toFixed(0)) + "%";
const lin = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
const PHASE = (o) => (o <= 5 ? "powerplay" : o <= 14 ? "middle" : "death");
const OUTCOME = {
  upheld: ["NOT OUT", "notout", "Overturned"], struck_down: ["OUT", "out", "Call stands"],
  umpires_call: ["UMPIRE'S CALL", "uc", "Umpire's call"], not_reviewed: ["NOT REVIEWED", "none", "Not reviewed"],
};

// ---------- tooltip
const tip = $("#tip");
function showTip(e, html) {
  tip.innerHTML = html; tip.hidden = false;
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8), y = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8);
  tip.style.left = `${x}px`; tip.style.top = `${y}px`;
}
const hideTip = () => (tip.hidden = true);
function bindTips(root) {
  root.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mousemove", (e) => showTip(e, el.dataset.tip));
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("focus", (e) => { const r = el.getBoundingClientRect(); showTip({ clientX: r.right, clientY: r.top }, el.dataset.tip); });
    el.addEventListener("blur", hideTip);
  });
}
function table(cols, rows, cls = "") {
  return `<table class="data ${cls}"><thead><tr>${cols.map((c) => `<th class="${c.n ? "n" : ""}">${esc(c.h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${cols.map((c) => `<td class="${c.n ? "n" : ""}">${c.f ? c.f(r) : esc(r[c.k])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

// ---------- data
const J = (f) => fetch(`data/${f}`).then((r) => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); });
let GRID, S, SCEN, REV, WPV, ROWS;

async function main() {
  const [g, s, sc, rv, wpv] = await Promise.all([J("wp_grid.json"), J("drs_summary.json"), J("scenarios.json"), J("reviews.json"), J("wp_validation.json")]);
  GRID = loadGrid(g); S = s; SCEN = sc; WPV = wpv;
  const c = Object.fromEntries(rv.columns.map((k, i) => [k, i]));
  ROWS = rv.rows.map((r) => Object.fromEntries(Object.keys(c).map((k) => [k, r[c[k]]])));
  hero(); room(); heatmap(); behaviour(); audit(); evidence();
}

function baseRate(side, over) {
  const row = S.base_rates.side_phase.find((b) => b.rev_side === side && b.phase === PHASE(over));
  return row ? row.upheld : null;
}

// ---------- hero
function hero() {
  const live = S.sensitivity.base, lbw = S.unreviewed_lbw;
  $("#hud-g").textContent = `${pts(S.median_G)} pts`;
  $("#hud-l").textContent = `${pts(S.median_L, 2)} pts`;
  $("#hud-p").textContent = pStarTxt(live.median_p_star);
  $("#hud-o").textContent = pct(S.upheld);
  $("#lede").innerHTML = `A wicket in question typically swings <strong>${pts(S.median_G)} win-% points</strong>. A review held in reserve is typically worth <strong>${pts(S.median_L, 2)}</strong>. So in <strong>${pct(live.share_p_star_below_10, 0)}</strong> of ${(S.n_reviews - S.decided_reviews).toLocaleString()} real review decisions with something at stake, a captain needed to be less than 10% sure the umpire was wrong for reviewing to pay.`;
  const tiles = [
    [S.n_reviews.toLocaleString(), `DRS reviews priced, from ${S.n_matches.toLocaleString()} matches in ${S.comps.length} competitions (${S.seasons[0]}–${S.seasons[1]})`],
    [pct(S.upheld), "of reviews overturn the on-field call"],
    [pStarTxt(live.median_p_star), "median break-even confidence across live review decisions"],
    [lbw.live.toLocaleString(), `LBW dismissals walked off without a review — with one still in hand`],
  ];
  $("#tiles").innerHTML = tiles.map(([v, k]) => `<li><div class="v">${v}</div><div class="k">${esc(k)}</div></li>`).join("");
}

// ---------- normalise a situation for the room
function fromScenario(x) {
  return { ...x, title: x.title, pStar: x.p_star, pHat: x.p_hat ?? baseRate(x.side, x.over), u: S.uc_given_fail[x.side], decided: x.G < 0.002 };
}
function fromRow(r) {
  const outcome = r.uc ? "umpires_call" : r.upheld ? "upheld" : "struck_down";
  return {
    kind: "review", title: `${r.bat_team} v ${r.bowl_team}`, comp: r.comp, season: r.season, date: r.date, event: r.event,
    inning: r.inning, over: r.over, bat_team: r.bat_team, bowl_team: r.bowl_team, by: r.rev_by, side: r.rev_side,
    batter: r.rev_batter, bowler: r.bowler, umpire: r.rev_umpire, runs: r.runs_before, wkts: r.wkts_before, legal: r.legal_before,
    target: r.inning === 2 ? r.target : null, env: r.env, k: r.k, limit: r.limit, G: r.G, L: r.L, pStar: r.p_star, pHat: r.p_hat,
    u: S.uc_given_fail[r.rev_side], outcome, decided: !!r.decided,
  };
}

// ---------- room
let current;
function room() {
  // mode tabs
  document.querySelectorAll(".modes button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".modes button").forEach((x) => x.setAttribute("aria-selected", x === b));
    ["cases", "browse", "custom"].forEach((m) => ($(`#mode-${m}`).hidden = m !== b.dataset.mode));
    if (b.dataset.mode === "custom") customRun();
  }));
  // case chips
  $("#chips").innerHTML = SCEN.map((x, i) => `<button class="chip" data-i="${i}" aria-pressed="${i === 0}">${esc(x.title)}<small>${esc(x.comp)} ${x.season} · ${esc(x.bat_team)} v ${esc(x.bowl_team)}</small></button>`).join("");
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    document.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", x === b));
    show(fromScenario(SCEN[+b.dataset.i]));
  });
  browse(); custom();
  show(fromScenario(SCEN[0]));
}

function show(sc) { current = sc; renderState(sc); renderDecide(sc); }

function overTxt(legal) { return `${Math.floor(legal / 6)}.${legal % 6}`; }

function renderState(sc) {
  const need = sc.inning === 2 ? sc.target - sc.runs : null;
  const sideTxt = sc.side === "bat" ? "batting side" : "fielding side";
  const dots = Array.from({ length: sc.limit || 2 }, (_, i) => `<i class="${i < sc.k ? "on" : ""}"></i>`).join("");
  const meta = sc.kind === "custom" ? "Custom situation" : `${esc(sc.comp)} · ${sc.season} · ${esc(sc.date || "")}${sc.event ? " · " + esc(sc.event) : ""}`;
  $("#state").innerHTML = `
    <div class="meta">${meta}</div>
    <h3 class="title">${sc.kind === "custom" ? "Your situation" : `${esc(sc.bat_team)} <span style="color:var(--muted)">v</span> ${esc(sc.bowl_team)}`}</h3>
    <div class="score"><span class="big mono">${sc.runs}/${sc.wkts}</span><span class="sub">after ${overTxt(sc.legal)} overs · innings ${sc.inning}</span>
      ${need != null ? `<span class="sub">need <b>${need}</b> off <b>${120 - sc.legal}</b>${sc.target ? ` · target ${sc.target}` : ""}</span>` : ""}</div>
    <dl class="facts">
      <div><dt>${sc.kind === "unreviewed" ? "Not reviewed by" : "Review by"}</dt><dd>${esc(sc.by || (sc.side === "bat" ? "Batting side" : "Fielding side"))} <span style="color:var(--muted)">(${sideTxt})</span></dd></div>
      ${sc.batter ? `<div><dt>Batter</dt><dd>${esc(sc.batter)}</dd></div>` : ""}
      ${sc.bowler ? `<div><dt>Bowler</dt><dd>${esc(sc.bowler)}</dd></div>` : ""}
      ${sc.umpire ? `<div><dt>On-field umpire</dt><dd>${esc(sc.umpire)}</dd></div>` : ""}
      <div><dt>Unsuccessful reviews left</dt><dd><span class="dots" aria-label="${sc.k} of ${sc.limit || 2}">${dots}</span> ${sc.k} of ${sc.limit || 2}</dd></div>
      <div><dt>Scoring environment</dt><dd class="mono">${Math.round(sc.env)} <span style="color:var(--muted)">avg 1st-inns</span></dd></div>
    </dl>
    ${sc.worm ? worm(sc) : `<p class="note">${sc.kind === "custom" ? `Batting side's win probability now: <b>${pct(sc.wpBat)}</b>.` : "Ball-by-ball win-probability curves are drawn for the case files."}</p>`}`;
  bindTips($("#state"));
}

function worm(sc) {
  const W = 640, H = 230, m = { l: 40, r: 12, t: 14, b: 26 };
  const x = lin(0, 40, m.l, W - m.r), y = lin(0, 1, H - m.b, m.t);
  const xs = sc.worm.map((_, i) => (sc.worm_inning[i] - 1) * 20 + Math.min(sc.worm_over[i], 20));
  const path = (inn) => sc.worm.map((v, i) => [xs[i], v, sc.worm_inning[i]]).filter((p) => p[2] === inn).map((p, j) => `${j ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  const i = sc.worm_index, xv = xs[i], actual = sc.worm[i];
  const outFinal = sc.kind === "unreviewed" || (sc.side === "bat" ? sc.outcome !== "upheld" : sc.outcome === "upheld");
  const firstBatting = sc.inning === 1; // the curve is from the batting-first side's view
  const sign = firstBatting ? (outFinal ? +1 : -1) : (outFinal ? -1 : +1);
  const alt = Math.min(1, Math.max(0, actual + sign * sc.G));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => `<line class="gridl" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="lbl" x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${t * 100}%</text>`).join("");
  const xt = [0, 5, 10, 15, 20, 25, 30, 35, 40].map((t) => `<text class="lbl" x="${x(t)}" y="${H - 8}" text-anchor="middle">${t % 20 === 0 && t ? "20" : t % 20}</text>`).join("");
  const tipTxt = `<b>${outFinal ? "Out" : "Not out"}</b> (actual): ${pct(actual)}<br>${outFinal ? "Not out" : "Out"} instead: ${pct(alt)}<br>Swing at stake: <b>${pts(sc.G)} pts</b>`;
  return `<div class="chart" aria-label="Win probability curve for ${esc(sc.first_team)}">
    <div class="meta" style="margin:14px 0 4px">Win probability — ${esc(sc.first_team)} (batting first) · ${esc(sc.winner || "")} won</div>
    <svg viewBox="0 0 ${W} ${H}" role="img">
      ${ticks}${xt}
      <line x1="${x(20)}" x2="${x(20)}" y1="${m.t}" y2="${H - m.b}" stroke="var(--line)" stroke-dasharray="3 3"/>
      <text class="lbl" x="${x(10)}" y="${m.t - 2}" text-anchor="middle">INNINGS 1</text><text class="lbl" x="${x(30)}" y="${m.t - 2}" text-anchor="middle">INNINGS 2</text>
      <path d="${path(1)}" fill="none" stroke="var(--chalk)" stroke-width="2"/><path d="${path(2)}" fill="none" stroke="var(--chalk)" stroke-width="2"/>
      <line x1="${x(xv)}" x2="${x(xv)}" y1="${y(actual)}" y2="${y(alt)}" stroke="var(--uc)" stroke-width="3"/>
      <circle cx="${x(xv)}" cy="${y(alt)}" r="5" fill="var(--panel)" stroke="var(--uc)" stroke-width="2"/>
      <circle cx="${x(xv)}" cy="${y(actual)}" r="6" fill="var(--uc)" stroke="var(--panel)" stroke-width="2"/>
      <text class="lbl" x="${x(xv) + (xv > 30 ? -10 : 10)}" y="${(y(actual) + y(alt)) / 2 + 4}" text-anchor="${xv > 30 ? "end" : "start"}" class="halo" style="fill:var(--uc);font:600 12px var(--mono)">${pts(sc.G)} pts at stake</text>
      <rect x="${x(xv) - 14}" y="${m.t}" width="28" height="${H - m.b - m.t}" fill="transparent" data-tip="${esc(tipTxt)}" tabindex="0"/>
    </svg></div>`;
}

let belief = 0.1;
function renderDecide(sc) {
  belief = Math.min(0.99, Math.max(0.005, sc.pHat ?? 0.25));
  const ratio = sc.pHat && sc.pStar > 0 ? sc.pHat / sc.pStar : null;
  const verdict = sc.decided
    ? `<b>Low stakes.</b> This wicket moves the match by under 0.2 win-% points, so the review barely matters either way.`
    : `<b>Review if you are at least ${pStarTxt(sc.pStar)} sure the umpire is wrong.</b> ${sc.pHat ? `Reviews like this have been overturned <b>${pct(sc.pHat, 0)}</b> of the time${ratio ? ` — ${ratio >= 10 ? "more than ten times" : ratio.toFixed(1) + "×"} the bar` : ""}.` : ""}`;
  $("#decide").innerHTML = `
    <div class="eqrow">
      <div><div class="lab">Wicket swing · G</div><div class="val">${pts(sc.G)} <small>pts</small></div><div class="note" style="margin:0">gained if the call is overturned</div></div>
      <div><div class="lab">Review at risk · L</div><div class="val">${pts(sc.L, 2)} <small>pts</small></div><div class="note" style="margin:0">lost if it fails outright</div></div>
      <div><div class="lab">Umpire's call · u</div><div class="val">${pct(sc.u, 0)}</div><div class="note" style="margin:0">of failures keep the review</div></div>
    </div>
    <div class="threshold"><div class="lab">Break-even confidence · p*</div><div class="p">${sc.decided ? "—" : pStarTxt(sc.pStar)} <small>${sc.decided ? "undefined: nothing at stake" : "sure the call is wrong"}</small></div></div>
    <div class="belief">
      <div id="bbar"></div>
      <label class="note" for="bslider" style="display:block">Your confidence that the on-field call is wrong: <b id="bval"></b></label>
      <input id="bslider" type="range" min="0" max="1000" step="1" value="${Math.round(Math.sqrt(belief) * 1000)}">
      <div class="ev"><span id="evtxt"></span><span class="note" style="margin:0">Scale is square-root so small thresholds stay visible.</span></div>
    </div>
    <div class="verdict"><p>${verdict}</p></div>
    ${sc.kind === "custom" ? "" : `<div class="reveal"><button class="btn" id="reveal">${sc.kind === "unreviewed" ? "What happened" : "Reveal the decision"}</button><span id="stamp"></span></div>`}`;
  const sl = $("#bslider");
  const upd = () => { belief = (sl.value / 1000) ** 2; drawBelief(sc); };
  sl.addEventListener("input", upd); upd();
  const rb = $("#reveal");
  if (rb) rb.addEventListener("click", () => {
    const [txt, cls, lab] = OUTCOME[sc.outcome];
    const gain = sc.outcome === "upheld" ? `+${pts(sc.G)} pts won back` : sc.outcome === "struck_down" ? `−${pts(sc.L, 2)} pts of review value spent` : sc.outcome === "umpires_call" ? "review retained, no cost" : `a ${pStarTxt(sc.pStar)} bar left unchallenged`;
    $("#stamp").innerHTML = `<span class="stamp ${cls}">${txt}</span> <span class="note" style="margin:0">${lab} · ${gain}</span>`;
  });
}

function drawBelief(sc) {
  const W = 600, H = 64, l = 6, r = 6, x = (b) => l + Math.sqrt(b) * (W - l - r);
  const ps = sc.decided ? 0 : sc.pStar;
  const ticks = [0, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1].map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="36" y2="41" stroke="var(--muted)"/><text class="lbl" x="${x(t)}" y="54" text-anchor="middle">${t * 100}%</text>`).join("");
  const ph = sc.pHat;
  $("#bbar").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Belief scale with break-even at ${pStarTxt(ps)}">
    <rect x="${x(0)}" y="10" width="${x(ps) - x(0)}" height="26" rx="4" fill="var(--out)" opacity=".35"/>
    <rect x="${x(ps)}" y="10" width="${x(1) - x(ps)}" height="26" rx="4" fill="var(--notout)" opacity=".28"/>
    <text class="lbl" x="${x(1) - 8}" y="27" text-anchor="end" style="fill:var(--ink)">REVIEW</text>
    ${x(ps) - x(0) > 70 ? `<text class="lbl" x="${x(0) + 8}" y="27" style="fill:var(--ink)">STAY</text>` : ""}
    <line x1="${x(ps)}" x2="${x(ps)}" y1="4" y2="40" stroke="var(--uc)" stroke-width="2.5"/>
    <text class="lbl" x="${x(ps) + 4}" y="6" style="fill:var(--uc)">p* ${pStarTxt(ps)}</text>
    ${ph ? `<path d="M${x(ph)} 36 l-5 8 h10z" fill="var(--chalk)"/><text class="lbl" x="${x(ph)}" y="64" text-anchor="middle" style="fill:var(--chalk)">history ${pct(ph, 0)}</text>` : ""}
    ${ticks}
    <circle cx="${x(belief)}" cy="23" r="8" fill="var(--chalk)" stroke="var(--bg)" stroke-width="2"/>
  </svg>`;
  $("#bval").textContent = pct(belief, belief < 0.1 ? 1 : 0);
  const ev = expectedValue(belief, sc.G, sc.L, sc.u);
  $("#evtxt").innerHTML = `Expected value of reviewing: <b class="${ev >= 0 ? "pos" : "neg"}">${ev >= 0 ? "+" : "−"}${pts(Math.abs(ev), 2)} win-% pts</b>`;
}

// ---------- browse all reviews
function browse() {
  const comps = [...new Set(ROWS.map((r) => r.comp))].sort();
  const seasons = [...new Set(ROWS.map((r) => r.season))].sort((a, b) => b - a);
  $("#browse-filters").innerHTML = `
    <label>Competition<select id="f-comp"><option value="">All</option>${comps.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
    <label>Season<select id="f-season"><option value="">All</option>${seasons.map((c) => `<option>${c}</option>`).join("")}</select></label>
    <label>Reviewing side<select id="f-side"><option value="">Both</option><option value="bat">Batting</option><option value="bowl">Fielding</option></select></label>
    <label>Outcome<select id="f-out"><option value="">Any</option><option value="upheld">Overturned</option><option value="struck_down">Call stands</option><option value="umpires_call">Umpire's call</option></select></label>
    <label>Search<input id="f-q" type="search" placeholder="team, batter, umpire"></label>
    <label>Sort<select id="f-sort"><option value="G">Biggest swing</option><option value="p_star">Highest break-even</option><option value="date">Most recent</option></select></label>`;
  let limit = 40;
  const run = () => {
    const comp = $("#f-comp").value, season = $("#f-season").value, side = $("#f-side").value, out = $("#f-out").value, q = $("#f-q").value.toLowerCase(), sort = $("#f-sort").value;
    let rows = ROWS.filter((r) => (!comp || r.comp === comp) && (!season || r.season == season) && (!side || r.rev_side === side) &&
      (!out || (out === "umpires_call" ? r.uc : out === "upheld" ? r.upheld : !r.upheld && !r.uc)) &&
      (!q || `${r.bat_team} ${r.bowl_team} ${r.rev_batter} ${r.rev_umpire}`.toLowerCase().includes(q)));
    rows.sort((a, b) => (sort === "date" ? (a.date < b.date ? 1 : -1) : b[sort] - a[sort]));
    $("#browse-count").innerHTML = `${rows.length.toLocaleString()} reviews match. Showing ${Math.min(limit, rows.length)}. ${rows.length > limit ? '<button class="btn" id="more">Show more</button>' : ""}`;
    $("#browse-table").innerHTML = `<thead><tr><th>Date</th><th>Comp</th><th>Match</th><th>Inns · over</th><th>By</th><th>Batter</th><th>Outcome</th><th class="n">Swing G</th><th class="n">Break-even</th></tr></thead><tbody>${rows.slice(0, limit).map((r) => {
      const o = OUTCOME[r.uc ? "umpires_call" : r.upheld ? "upheld" : "struck_down"];
      return `<tr class="click" tabindex="0" data-i="${ROWS.indexOf(r)}"><td>${esc(r.date)}</td><td>${esc(r.comp)}</td><td>${esc(r.bat_team)} v ${esc(r.bowl_team)}</td><td>${r.inning} · ${r.over + 1}</td><td>${r.rev_side === "bat" ? "Bat" : "Field"}</td><td>${esc(r.rev_batter)}</td><td><span class="tag ${o[1]}">${o[2]}</span></td><td class="n">${pts(r.G)}</td><td class="n">${r.decided ? "—" : pStarTxt(r.p_star)}</td></tr>`;
    }).join("")}</tbody>`;
    const more = $("#more"); if (more) more.onclick = () => { limit += 80; run(); };
  };
  $("#browse-filters").addEventListener("input", () => { limit = 40; run(); });
  const pick = (e) => {
    const tr = e.target.closest("tr.click"); if (!tr || (e.type === "keydown" && e.key !== "Enter")) return;
    show(fromRow(ROWS[+tr.dataset.i])); $("#state").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  $("#browse-table").addEventListener("click", pick); $("#browse-table").addEventListener("keydown", pick);
  run();
}

// ---------- custom situation
function custom() {
  const f = $("#mode-custom");
  f.innerHTML = `
    <label>Innings<select name="inning"><option value="1">1st (setting)</option><option value="2" selected>2nd (chasing)</option></select></label>
    <label>Overs completed<input name="overs" type="number" min="0" max="19" value="16"></label>
    <label>Balls into over<input name="balls" type="number" min="0" max="5" value="2"></label>
    <label>Runs<input name="runs" type="number" min="0" max="250" value="148"></label>
    <label>Wickets down<input name="wkts" type="number" min="0" max="9" value="5"></label>
    <label>Target<input name="target" type="number" min="1" max="250" value="185"></label>
    <label>Reviewing side<select name="side"><option value="bat">Batting (given out)</option><option value="bowl">Fielding (given not out)</option></select></label>
    <label>Unsuccessful reviews left<select name="k"><option>2</option><option selected>1</option></select></label>
    <label>Scoring environment<select name="env"><option value="190">IPL 2024–26 (≈190)</option><option value="170">IPL 2018–23 (≈170)</option><option value="155">T20Is (≈155)</option><option value="165">Other leagues (≈165)</option></select></label>`;
  f.addEventListener("input", customRun);
  f.addEventListener("submit", (e) => e.preventDefault());
}
function customRun() {
  const f = $("#mode-custom"), v = (n) => f.elements[n].value;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
  const inning = +v("inning"), legal = clamp(+v("overs"), 0, 19) * 6 + clamp(+v("balls"), 0, 5);
  const runs = clamp(+v("runs"), 0, 250), wkts = clamp(+v("wkts"), 0, 9), target = clamp(+v("target"), 1, 250), side = v("side"), k = +v("k"), env = +v("env");
  f.elements.target.disabled = inning === 1;
  if (inning === 2 && runs >= target) { $("#decide").innerHTML = `<p class="note">The chase is already complete — set runs below the target.</p>`; return; }
  const s = { inning, balls: legal + 1, wkts, runs, target, env, side, k };
  const a = assess(GRID, S.option_value, S.uc_given_fail, s);
  show({ kind: "custom", inning, runs, wkts, legal, target: inning === 2 ? target : null, env, side, k, limit: 2,
         G: a.G, L: a.L, u: a.u, pStar: a.pStar, pHat: baseRate(side, Math.floor(legal / 6)), wpBat: a.wpBat, decided: a.decided });
}

// ---------- heatmap
const BINS = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2];
const binOf = (p) => { let i = 0; while (i < BINS.length && p >= BINS[i]) i++; return i; };
const binLabels = ["< 0.5%", "0.5–1%", "1–2%", "2–5%", "5–10%", "10–20%", "≥ 20%"];
function heatmap() {
  const st = { inning: 2, role: "bat", k: 1 };
  const seg = (name, opts) => `<label>${name}<span class="seg" data-key="${opts.key}">${opts.items.map(([v, t]) => `<button type="button" data-v="${v}" aria-pressed="${st[opts.key] == v}">${t}</button>`).join("")}</span></label>`;
  $("#map-filters").innerHTML = seg("Innings", { key: "inning", items: [[1, "1st"], [2, "2nd"]] }) + seg("Reviewing side", { key: "role", items: [["bat", "Batting"], ["bowl", "Fielding"]] }) + seg("Reviews left", { key: "k", items: [[2, "Two"], [1, "Last one"]] });
  $("#map-filters").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const key = b.parentElement.dataset.key; st[key] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
    b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    draw();
  });
  $("#heat-legend").innerHTML = `<span>Break-even confidence</span><span class="ramp">${binLabels.map((t, i) => `<i style="background:var(--seq${i})" title="${t}"></i>`).join("")}</span><span>${binLabels[0]} → ${binLabels[6]}</span><span><i style="background:var(--panel2);border:1px dashed var(--line)"></i>too few states</span>`;
  const draw = () => {
    const cells = S.threshold_map.filter((c) => c.inning === st.inning && c.role === st.role && c.k === st.k);
    const W = 760, H = 250, m = { l: 92, r: 8, t: 8, b: 40 }, cw = (W - m.l - m.r) / 20, ch = (H - m.t - m.b) / 5;
    const byKey = Object.fromEntries(cells.map((c) => [`${c.over}|${c.wp_bucket}`, c]));
    let out = "";
    for (let o = 0; o < 20; o++) for (let b = 0; b < 5; b++) {
      const c = byKey[`${o}|${b}`], X = m.l + o * cw, Y = m.t + (4 - b) * ch;
      if (!c) { out += `<rect x="${X + 1}" y="${Y + 1}" width="${cw - 2}" height="${ch - 2}" rx="3" fill="var(--panel2)" stroke="var(--line)" stroke-dasharray="2 2"/>`; continue; }
      const t = `<b>Over ${o + 1}</b> · batting side ${b * 20}–${b * 20 + 20}% to win<br>Wicket swing G: ${pts(c.G)} pts · review at risk L: ${pts(c.L, 2)} pts<br><b>Break-even: ${pStarTxt(c.p_star)}</b> · ${c.n.toLocaleString()} ball states`;
      out += `<rect class="cell" x="${X}" y="${Y}" width="${cw}" height="${ch}" rx="4" fill="var(--seq${binOf(c.p_star)})" data-tip="${esc(t)}" tabindex="0"/>`;
    }
    const yl = [0, 1, 2, 3, 4].map((b) => `<text class="lbl" x="${m.l - 8}" y="${m.t + (4 - b) * ch + ch / 2 + 4}" text-anchor="end">${b * 20}–${b * 20 + 20}%</text>`).join("");
    const xl = Array.from({ length: 20 }, (_, o) => (o % 2 === 0 || o === 19 ? `<text class="lbl" x="${m.l + o * cw + cw / 2}" y="${H - m.b + 16}" text-anchor="middle">${o + 1}</text>` : "")).join("");
    $("#heatmap").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Heatmap of break-even confidence by over and win probability">${out}${yl}${xl}
      <text class="lbl" x="${m.l + (W - m.l - m.r) / 2}" y="${H - 4}" text-anchor="middle">OVER</text>
      <text class="lbl" x="12" y="${m.t + (H - m.t - m.b) / 2}" transform="rotate(-90 12 ${m.t + (H - m.t - m.b) / 2})" text-anchor="middle">BATTING SIDE WIN PROB.</text></svg>`;
    bindTips($("#heatmap"));
    const ps = cells.map((c) => c.p_star), under5 = ps.filter((p) => p < 0.05).length / ps.length, mx = cells.reduce((a, c) => (c.p_star > a.p_star ? c : a), cells[0]);
    $("#map-takeaway").innerHTML = `With ${st.k === 1 ? "only the last review" : "two reviews"} left, ${st.role === "bat" ? "a batting side" : "a fielding side"} in the ${st.inning === 1 ? "first" : "second"} innings needs less than 5% confidence in <b>${pct(under5, 0)}</b> of game states. The bar is highest (${pStarTxt(mx.p_star)}) in over ${mx.over + 1} when the batting side is ${mx.wp_bucket * 20}–${mx.wp_bucket * 20 + 20}% to win, where a wicket matters least.`;
    $("#heat-table").innerHTML = table([{ h: "Over", f: (c) => c.over + 1 }, { h: "Batting side WP", f: (c) => `${c.wp_bucket * 20}–${c.wp_bucket * 20 + 20}%` }, { h: "G (pts)", n: 1, f: (c) => pts(c.G, 2) }, { h: "L (pts)", n: 1, f: (c) => pts(c.L, 3) }, { h: "Break-even", n: 1, f: (c) => pStarTxt(c.p_star) }, { h: "States", n: 1, f: (c) => c.n.toLocaleString() }], cells);
  };
  draw();
}

// ---------- behaviour charts
function dotRows({ el, rows, series, max = 0.5, extra }) {
  const W = 640, rowH = 46, m = { l: 96, r: 16, t: 10, b: 28 }, H = m.t + m.b + rows.length * rowH;
  const x = lin(0, max, m.l, W - m.r);
  let s = [0, 0.1, 0.2, 0.3, 0.4, 0.5].filter((t) => t <= max).map((t) => `<line class="gridl" x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${H - m.b}"/><text class="lbl" x="${x(t)}" y="${H - 8}" text-anchor="middle">${t * 100}%</text>`).join("");
  rows.forEach((r, i) => {
    const cy = m.t + i * rowH + rowH / 2;
    s += `<text class="lbl" x="${m.l - 10}" y="${cy + 4}" text-anchor="end" style="fill:var(--ink2);font-size:12px">${esc(r.label)}</text>`;
    series.forEach((se, j) => {
      const d = r[se.key]; if (!d) return;
      const yy = cy + (j - (series.length - 1) / 2) * 11;
      const t = `<b>${esc(r.label)} · ${esc(se.name)}</b><br>${pct(d.v)} overturned (95% CI ${pct(d.ci[0], 0)}–${pct(d.ci[1], 0)})<br>${d.n.toLocaleString()} reviews`;
      s += `<line x1="${x(d.ci[0])}" x2="${x(d.ci[1])}" y1="${yy}" y2="${yy}" stroke="${se.color}" stroke-width="2" stroke-linecap="round"/>
            <circle cx="${x(d.v)}" cy="${yy}" r="5.5" fill="${se.color}" stroke="var(--panel)" stroke-width="2" data-tip="${esc(t)}" tabindex="0"/>`;
    });
    if (extra) s += extra(r, cy, x);
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
  bindTips(el);
}

function behaviour() {
  const sp = (side, ph) => { const b = S.base_rates.side_phase.find((x) => x.rev_side === side && x.phase === ph); return b && { v: b.upheld, ci: b.ci, n: b.n }; };
  const phases = [["powerplay", "Powerplay"], ["middle", "Overs 7–15"], ["death", "Overs 16–20"]];
  const rows = phases.map(([k, label]) => ({ label, bat: sp("bat", k), bowl: sp("bowl", k), pstar: S.phase_table.find((p) => p.phase === k) }));
  dotRows({
    el: $("#phase-chart"), rows,
    series: [{ key: "bat", name: "Batting-side reviews", color: "var(--bat)" }, { key: "bowl", name: "Fielding-side reviews", color: "var(--bowl)" }],
    extra: (r, cy, x) => `<path d="M${x(r.pstar.p_star_median)} ${cy - 8} l6 8 -6 8 -6 -8z" fill="var(--chalk)" data-tip="${esc(`<b>${r.label}</b><br>Median break-even: ${pStarTxt(r.pstar.p_star_median)}<br>Median wicket swing ${pts(r.pstar.G_median)} pts`)}" tabindex="0"/>`,
  });
  $("#phase-legend").innerHTML = `<span><i style="background:var(--bat)"></i>Batting-side reviews (overturn rate)</span><span><i style="background:var(--bowl)"></i>Fielding-side reviews</span><span><i style="background:var(--chalk);transform:rotate(45deg) scale(.8)"></i>Median break-even confidence</span>`;
  $("#phase-table").innerHTML = table([{ h: "Phase", k: "label" }, { h: "Bat overturn", n: 1, f: (r) => `${pct(r.bat.v)} (n=${r.bat.n})` }, { h: "Field overturn", n: 1, f: (r) => `${pct(r.bowl.v)} (n=${r.bowl.n})` }, { h: "Median break-even", n: 1, f: (r) => pStarTxt(r.pstar.p_star_median) }], rows);

  const sl = (side, last) => { const b = S.base_rates.side_last.find((x) => x.rev_side === side && x.last_review === String(last)); return b && { v: b.upheld, ci: b.ci, n: b.n }; };
  dotRows({
    el: $("#last-chart"), max: 0.5,
    rows: [{ label: "Batting side", spare: sl("bat", 0), last: sl("bat", 1) }, { label: "Fielding side", spare: sl("bowl", 0), last: sl("bowl", 1) }],
    series: [{ key: "spare", name: "Spare review in hand", color: "#199e70" }, { key: "last", name: "Last review", color: "#9085e9" }],
  });
  const lr = S.coefficients.find((c) => c.term === "last_review");
  $("#last-note").innerHTML = `<span style="color:#199e70">●</span> spare review in hand &nbsp; <span style="color:#9085e9">●</span> last review. On their last review, teams are pickier: odds of an overturn are <b>${lr.odds_ratio.toFixed(2)}×</b> higher (95% CI ${Math.exp(lr.lo).toFixed(2)}–${Math.exp(lr.hi).toFixed(2)}, controlling for phase, side and context). Yet the last review is still cheap: its median break-even is ${pStarTxt(medianP((r) => r.k === 1))}.`;

  const u = S.unreviewed_lbw;
  $("#lbw-stat").innerHTML = `<div class="v">${u.live}</div><p>LBW dismissals in DRS-recorded seasons where the batter walked off <b>without reviewing</b>, though their side still held a review. Median break-even at those moments: <b>${pStarTxt(u.median_p_star)}</b>.</p>
    <p>We cannot see how many were plumb. But if the batter's belief had been even 10%, reviewing all of them would have been worth <b>+${u.ev_if_belief["0.1"].toFixed(1)} wins</b> of expected win probability (+${u.ev_if_belief["0.05"].toFixed(1)} at 5%).</p>`;
  $("#lbw-table").innerHTML = table([
    { h: "Date", k: "date" }, { h: "Comp", k: "comp" }, { h: "Batter", k: "player_out" }, { h: "Match", f: (r) => `${esc(r.bat_team)} v ${esc(r.bowl_team)}` },
    { h: "Situation", f: (r) => `inns ${r.inning} · over ${r.over + 1} · ${r.runs_before}/${r.wkts_before}${r.inning === 2 ? ` chasing ${r.target}` : ""}` },
    { h: "Swing G", n: 1, f: (r) => `${pts(r.G)} pts` }, { h: "Break-even", n: 1, f: (r) => pStarTxt(r.p_star) }], u.examples.slice(0, 10));
}
function medianP(pred) { const a = ROWS.filter((r) => !r.decided && pred(r)).map((r) => r.p_star).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; }

// ---------- audit
function audit() {
  const comps = [...new Set(S.teams.map((t) => t.comp))].sort();
  $("#audit-filters").innerHTML = `<label>Competition<select id="a-comp"><option value="">All</option>${comps.map((c) => `<option ${c === "IPL" ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>`;
  let sortKey = "net_wp";
  const cols = [
    { h: "Team", k: "team" }, { h: "Comp", k: "comp" }, { h: "Seasons", k: "seasons" }, { h: "Reviews", k: "n", n: 1, s: 1 },
    { h: "Overturned", k: "upheld", n: 1, s: 1, f: (t) => `${pct(t.upheld)} <span class="note">(${pct(t.ci[0], 0)}–${pct(t.ci[1], 0)})</span>` },
    { h: "Expected", k: "expected", n: 1, s: 1, f: (t) => pct(t.expected) },
    { h: "vs expected", k: "over_expected", n: 1, s: 1, f: (t) => `${t.over_expected >= 0 ? "+" : "−"}${pts(Math.abs(t.over_expected))}` },
    { h: "Net gain (wins)", k: "net_wp", n: 1, s: 1, f: (t) => `${t.net_wp >= 0 ? "+" : "−"}${Math.abs(t.net_wp).toFixed(2)}` },
    { h: "Pts per review", k: "per_review", n: 1, s: 1, f: (t) => `${pts(t.per_review, 2)}` },
  ];
  const run = () => {
    const c = $("#a-comp").value;
    const rows = S.teams.filter((t) => !c || t.comp === c).sort((a, b) => b[sortKey] - a[sortKey]);
    $("#audit-table").innerHTML = `<thead><tr>${cols.map((x) => `<th class="${x.n ? "n" : ""}" ${x.s ? `data-sort="${x.k}"` : ""} aria-sort="${x.k === sortKey ? "descending" : "none"}">${esc(x.h)}${x.k === sortKey ? " ↓" : ""}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((t) => `<tr>${cols.map((x) => `<td class="${x.n ? "n" : ""}">${x.f ? x.f(t) : esc(t[x.k])}</td>`).join("")}</tr>`).join("")}</tbody>`;
  };
  $("#audit-filters").addEventListener("input", run);
  $("#audit-table").addEventListener("click", (e) => { const th = e.target.closest("th[data-sort]"); if (th) { sortKey = th.dataset.sort; run(); } });
  run();
}

// ---------- evidence
function evidence() {
  // calibration
  const W = 420, H = 320, m = { l: 44, r: 12, t: 10, b: 36 }, x = lin(0, 1, m.l, W - m.r), y = lin(0, 1, H - m.b, m.t);
  let s = [0, 0.25, 0.5, 0.75, 1].map((t) => `<line class="gridl" x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${H - m.b}"/><line class="gridl" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text class="lbl" x="${x(t)}" y="${H - m.b + 16}" text-anchor="middle">${t * 100}%</text><text class="lbl" x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${t * 100}%</text>`).join("");
  s += `<line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="var(--muted)" stroke-dasharray="4 4"/>`;
  [["1", "var(--bat)", "1st innings"], ["2", "var(--bowl)", "2nd innings"]].forEach(([k, col, name]) => {
    const c = WPV.innings[k].calibration_gbm;
    s += `<path d="${c.map((p, i) => `${i ? "L" : "M"}${x(p.pred)},${y(p.obs)}`).join("")}" fill="none" stroke="${col}" stroke-width="2"/>`;
    s += c.map((p) => `<circle cx="${x(p.pred)}" cy="${y(p.obs)}" r="5" fill="${col}" stroke="var(--panel)" stroke-width="2" data-tip="${esc(`<b>${name}</b><br>Predicted ${pct(p.pred)} · observed ${pct(p.obs)}<br>${p.n.toLocaleString()} ball states`)}" tabindex="0"/>`).join("");
  });
  s += `<text class="lbl" x="${(W + m.l) / 2}" y="${H - 4}" text-anchor="middle">PREDICTED WIN PROBABILITY</text><text class="lbl" x="12" y="${H / 2}" transform="rotate(-90 12 ${H / 2})" text-anchor="middle">OBSERVED WIN RATE</text>`;
  $("#calib-chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calibration plot">${s}</svg>`;
  $("#calib-legend").innerHTML = `<span><i style="background:var(--bat)"></i>1st innings</span><span><i style="background:var(--bowl)"></i>2nd innings</span><span>Dashed: perfect calibration</span>`;
  bindTips($("#calib-chart"));

  const I = WPV.innings, f4 = (v) => v.toFixed(4);
  const models = [["constant", "Constant base rate"], ["logistic", "Logistic regression"], ["gbm_absolute", "Boosted trees, absolute runs"], ["gbm", "Boosted trees, par-relative (ours)"]];
  $("#wp-table").innerHTML = table([
    { h: "Model", f: (r) => esc(r[1]) },
    { h: "1st inns log loss", n: 1, f: (r) => f4(I["1"][r[0]].log_loss) }, { h: "2nd inns log loss", n: 1, f: (r) => f4(I["2"][r[0]].log_loss) },
    { h: "1st Brier", n: 1, f: (r) => f4(I["1"][r[0]].brier) }, { h: "2nd Brier", n: 1, f: (r) => f4(I["2"][r[0]].brier) },
    { h: "IPL-only 2nd log loss", n: 1, f: (r) => (I["2"].ipl_only[r[0]] ? f4(I["2"].ipl_only[r[0]].log_loss) : "—") },
  ], models);
  $("#wp-table tbody tr:last-child")?.classList.add("ours");
  const d1 = I["1"].logloss_diff_gbm_minus_lr, d2 = I["2"].logloss_diff_gbm_minus_lr, a2 = I["2"].logloss_diff_gbm_minus_absolute;
  $("#wp-note").innerHTML = `Test set: ${I["1"].test_matches.toLocaleString()} matches from 2024–26 (${(I["1"].test_rows + I["2"].test_rows).toLocaleString()} ball states). Lower is better. Our model vs logistic: Δ log loss ${f4(d1.est)} [${f4(d1.ci95[0])}, ${f4(d1.ci95[1])}] (1st), ${f4(d2.est)} [${f4(d2.ci95[0])}, ${f4(d2.ci95[1])}] (2nd), 95% match-bootstrap CIs. Why par-relative features: IPL's 2024–26 scoring environment (${I["2"].env_test_ipl_range.map(Math.round).join("–")}) lies largely beyond the training data (99% of training states below ${Math.round(I["2"].env_train_q99 ?? 182)}, max ${Math.round(I["2"].env_train_range[1])}); trees on absolute runs cannot extrapolate (Δ vs absolute ${f4(a2.est)} [${f4(a2.ci95[0])}, ${f4(a2.ci95[1])}]).`;

  // review model
  const R = S.review_model, rm = [["constant", "Constant base rate"], ["side_only", "Reviewing side only"], ["logistic", "Full context model"]];
  $("#rev-table").innerHTML = table([{ h: "Model", f: (r) => r[1] }, { h: "Log loss", n: 1, f: (r) => f4(R.models[r[0]].log_loss) }, { h: "Brier", n: 1, f: (r) => f4(R.models[r[0]].brier) }, { h: "AUC", n: 1, f: (r) => R.models[r[0]].auc.toFixed(3) }], rm);
  const dd = R.logloss_diff_logistic_minus_side;
  $("#rev-note").innerHTML = `Trained on ${R.train_n.toLocaleString()} reviews before 2025, tested on ${R.test_n.toLocaleString()} from 2025–26. Context beyond the reviewing side adds no reliable predictive power (Δ log loss ${f4(dd.est)}, 95% CI ${f4(dd.ci95[0])} to ${f4(dd.ci95[1])}). Without ball-tracking data, the captain's own read of the delivery is the information that matters — which is why the Review Room asks for your confidence rather than pretending to predict it.`;

  // forest plot
  const names = { bowl: "Fielding side reviewing", last_review: "Last review in hand", middle: "Overs 7–15 (vs powerplay)", death: "Overs 16–20 (vs powerplay)", pos_4_7: "Batter at 4–7 (vs 1–3)", pos_8_11: "Batter at 8–11", inn2: "Second innings", t20i: "T20I (vs IPL)", other: "Other leagues (vs IPL)", season: "Per 4 seasons later", p_star: "Break-even p* (per +10 pts)", G: "Wicket swing G (per +10 pts)", bowl_x_death: "Fielding side × death overs" };
  // continuous terms live on a 0-1 scale: report them per +0.1 (10 win-% points) so the intervals are readable
  const co = S.coefficients.filter((c) => c.term !== "const").map((c) => (["p_star", "G"].includes(c.term)
    ? { ...c, coef: c.coef / 10, lo: c.lo / 10, hi: c.hi / 10, odds_ratio: Math.exp(c.coef / 10) } : c));
  const FW = 640, rh = 24, fm = { l: 200, r: 16, t: 8, b: 30 }, FH = fm.t + fm.b + co.length * rh;
  const lx = (v) => fm.l + ((Math.log(Math.max(0.2, Math.min(5, v))) - Math.log(0.2)) / (Math.log(5) - Math.log(0.2))) * (FW - fm.l - fm.r);
  let fs = [0.25, 0.5, 1, 2, 4].map((t) => `<line class="gridl" x1="${lx(t)}" x2="${lx(t)}" y1="${fm.t}" y2="${FH - fm.b}" ${t === 1 ? 'stroke="var(--muted)"' : ""}/><text class="lbl" x="${lx(t)}" y="${FH - 10}" text-anchor="middle">${t}×</text>`).join("");
  co.forEach((c, i) => {
    const cy = fm.t + i * rh + rh / 2, lo = Math.exp(c.lo), hi = Math.exp(c.hi), sig = lo > 1 || hi < 1;
    fs += `<text class="lbl" x="${fm.l - 10}" y="${cy + 4}" text-anchor="end" style="fill:${sig ? "var(--ink)" : "var(--muted)"};font-size:11.5px">${esc(names[c.term] || c.term)}</text>
      <line x1="${lx(lo)}" x2="${lx(hi)}" y1="${cy}" y2="${cy}" stroke="var(--chalk)" stroke-width="2" opacity="${sig ? 1 : 0.45}"/>
      <circle cx="${lx(c.odds_ratio)}" cy="${cy}" r="5" fill="${sig ? "var(--chalk)" : "var(--panel)"}" stroke="var(--chalk)" stroke-width="2" data-tip="${esc(`<b>${names[c.term] || c.term}</b><br>Odds ratio ${c.odds_ratio.toFixed(2)} (95% CI ${lo.toFixed(2)}–${hi.toFixed(2)})<br>p = ${c.p < 0.001 ? c.p.toExponential(1) : c.p.toFixed(3)}`)}" tabindex="0"/>`;
  });
  $("#forest").innerHTML = `<svg viewBox="0 0 ${FW} ${FH}" role="img" aria-label="Odds ratios for review overturn">${fs}</svg>`;
  bindTips($("#forest"));

  const sn = S.sensitivity, srows = [["base", "Base estimate (all matches in DRS-recorded seasons)"], ["upper_option_value", "Upper bound (only matches with a recorded review)"], ["option_value_x3", "Stress test: option value × 3"]];
  $("#sens-table").innerHTML = table([{ h: "Option-value estimate", f: (r) => r[1] }, { h: "Break-even < 10%", n: 1, f: (r) => pct(sn[r[0]].share_p_star_below_10) }, { h: "Median break-even", n: 1, f: (r) => pStarTxt(sn[r[0]].median_p_star) }], srows);
}

main().catch((e) => {
  console.error(e);
  document.querySelector("main").insertAdjacentHTML("afterbegin", `<p class="card" style="margin:24px">Could not load the model data (${esc(e.message)}). Serve this folder over HTTP, e.g. <code>python -m http.server</code> inside <code>web/</code>.</p>`);
});
