// Review economics engine (browser + Node). Mirrors pipeline/wp.py and pipeline/drs.py.
// WP comes from lookup tables exported by the Python model; option values from the DRS pipeline.

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function loadGrid(g) {
  return { env: g.env, scale: g.scale, t1: b64(g.inn1.data), t2: b64(g.inn2.data), t3: b64(g.inn2_fine.data) };
}

// linear interpolation over the environment axis
function envMix(grid, env, f) {
  const E = grid.env;
  if (env <= E[0]) return f(0);
  if (env >= E[E.length - 1]) return f(E.length - 1);
  let i = 0;
  while (env > E[i + 1]) i++;
  const t = (env - E[i]) / (E[i + 1] - E[i]);
  return f(i) * (1 - t) + f(i + 1) * t;
}

/** WP of the chasing side. ballsRem = legal balls left, need = runs still required. */
export function chase(grid, ballsRem, wkts, need, env) {
  if (need <= 0) return 1;
  if (ballsRem <= 0 || wkts >= 10) return need === 1 ? 0.5 : 0;
  need = Math.min(need, 250);
  const n = need - 1;
  if (ballsRem <= 12) {
    return envMix(grid, env, (e) => grid.t3[((e * 12 + ballsRem - 1) * 10 + wkts) * 250 + n] / grid.scale);
  }
  const x = (120 - ballsRem) / 6; // overs completed, 0..18
  const o0 = Math.floor(x), o1 = Math.min(o0 + 1, 19), t = x - o0;
  const at = (e, o) => grid.t2[((e * 20 + o) * 10 + wkts) * 250 + n] / grid.scale;
  return envMix(grid, env, (e) => at(e, o0) * (1 - t) + at(e, o1) * t);
}

/** WP of the side batting first. */
export function first(grid, ballsUsed, wkts, runs, env) {
  if (ballsUsed >= 120 || wkts >= 10) return 1 - chase(grid, 120, 0, runs + 1, env);
  runs = Math.min(runs, 250);
  const x = ballsUsed / 6;
  const o0 = Math.floor(x), t = x - o0;
  const at = (e, o) => grid.t1[((e * 20 + o) * 10 + wkts) * 251 + runs] / grid.scale;
  return envMix(grid, env, (e) => {
    const a = at(e, o0);
    // between over 19 and the end of the innings, blend towards the exact terminal value
    const b = o0 + 1 <= 19 ? at(e, o0 + 1) : 1 - chase(grid, 120, 0, runs + 1, grid.env[e]);
    return a * (1 - t) + b * t;
  });
}

/** WP of the batting side in innings `inn` (target used only for innings 2). */
export function wpBat(grid, inn, ballsUsed, wkts, runs, target, env) {
  return inn === 1 ? first(grid, ballsUsed, wkts, runs, env) : chase(grid, 120 - ballsUsed, wkts, target - runs, env);
}

/** G: win-probability swing of one wicket at this state (always >= 0). */
export function wicketValue(grid, s) {
  const no = wpBat(grid, s.inning, s.balls, s.wkts, s.runs, s.target, s.env);
  const out = wpBat(grid, s.inning, s.balls, s.wkts + 1, s.runs, s.target, s.env);
  return Math.max(0, no - out);
}

/** V(k): option value of holding k unsuccessful reviews, interpolated at `balls` legal balls bowled. */
export function optionValue(curves, side, inn, k, balls) {
  if (k <= 0) return 0;
  const c = (curves[`${side}|${inn}|${Math.min(k, 2)}`] || curves[`${side}|${inn}|1`]).smooth;
  const x = Math.min(balls, 120) / 6, i = Math.min(Math.floor(x), 19);
  return c[i] + (c[i + 1] - c[i]) * (x - i);
}

/** L: value lost if this review fails outright (k = unsuccessful reviews left before it). */
export function lostValue(curves, side, inn, k, balls) {
  return optionValue(curves, side, inn, k, balls) - optionValue(curves, side, inn, k - 1, balls);
}

/** p*: belief that the on-field call is wrong above which reviewing has positive expected WP. */
export function breakEven(G, L, s) {
  const cost = (1 - s) * L;
  return G + cost > 0 ? cost / (G + cost) : 0;
}

/** Expected WP change from reviewing when you believe the call is wrong with probability b. */
export function expectedValue(b, G, L, s) {
  return b * G - (1 - b) * (1 - s) * L;
}

/** Everything the decision panel needs for one situation. */
export function assess(grid, curves, ucGivenFail, s) {
  const G = wicketValue(grid, s);
  const L = lostValue(curves, s.side, s.inning, s.k, s.balls);
  const u = ucGivenFail[s.side];
  const wp = wpBat(grid, s.inning, s.balls, s.wkts, s.runs, s.target, s.env);
  return { G, L, u, pStar: breakEven(G, L, u), wpBat: wp, decided: G < 0.002 };
}
