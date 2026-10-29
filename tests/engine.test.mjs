// node --test tests/  — checks the browser engine reproduces the Python pipeline's numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadGrid, wicketValue, lostValue, breakEven, expectedValue, chase, first } from "../web/engine.js";

const read = (f) => JSON.parse(readFileSync(new URL(`../web/data/${f}`, import.meta.url)));
const grid = loadGrid(read("wp_grid.json"));
const summary = read("drs_summary.json");
const rev = read("reviews.json");
const col = Object.fromEntries(rev.columns.map((c, i) => [c, i]));

test("break-even and expected value are consistent", () => {
  const G = 0.06, L = 0.002, s = 0.2;
  const p = breakEven(G, L, s);
  assert.ok(Math.abs(expectedValue(p, G, L, s)) < 1e-12);
  assert.ok(expectedValue(p + 0.01, G, L, s) > 0 && expectedValue(p - 0.01, G, L, s) < 0);
  assert.equal(breakEven(0.05, 0, 0.2), 0); // a review with no option value should always be used
});

test("terminal states are exact", () => {
  assert.equal(chase(grid, 10, 3, 0, 170), 1);
  assert.equal(chase(grid, 0, 3, 5, 170), 0);
  assert.equal(chase(grid, 6, 10, 5, 170), 0);
  assert.equal(chase(grid, 0, 4, 1, 170), 0.5);
  assert.ok(first(grid, 120, 10, 60, 170) < 0.1); // all out for 60: batting-first side almost certainly loses
});

test("WP is monotone in wickets and runs", () => {
  for (const env of [150, 185]) {
    for (let w = 0; w < 9; w++) {
      assert.ok(chase(grid, 40, w, 60, env) >= chase(grid, 40, w + 1, 60, env));
      assert.ok(first(grid, 60, w, 90, env) >= first(grid, 60, w + 1, 90, env));
    }
    assert.ok(chase(grid, 40, 3, 50, env) >= chase(grid, 40, 3, 70, env));
  }
});

test("JS wicket value and break-even track the Python pipeline", () => {
  const errG = [], errP = [];
  for (const r of rev.rows) {
    const s = { inning: r[col.inning], balls: r[col.balls_after], wkts: r[col.w_notout], runs: r[col.runs_after],
                target: r[col.target], env: r[col.env] };
    const G = wicketValue(grid, s);
    const side = r[col.rev_side];
    const L = lostValue(summary.option_value, side, s.inning, r[col.k], s.balls);
    errG.push(Math.abs(G - r[col.G]));
    if (r[col.G] < 0.01) continue; // near-decided: break-even is ill-conditioned and flagged as low-stakes in the UI
    errP.push(Math.abs(breakEven(G, L, summary.uc_given_fail[side]) - r[col.p_star]));
  }
  const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(p * (a.length - 1))];
  // grid interpolation (over-level, 0.5-point quantisation) vs exact model: small, bounded error
  assert.ok(q(errG, 0.5) < 0.005, `median |dG| = ${q(errG, 0.5)}`);
  assert.ok(q(errG, 0.95) < 0.02, `p95 |dG| = ${q(errG, 0.95)}`);
  assert.ok(q(errP, 0.95) < 0.02, `p95 |dp*| = ${q(errP, 0.95)}`);
});
