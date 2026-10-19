import test from "node:test";
import assert from "node:assert/strict";
import { createGame, advance } from "../src/simulation/market.ts";
import {
  DAY,
  MINUTE,
  isOpen,
  nextOpen,
  nextQuote,
} from "../src/simulation/clock.ts";
import { checkMargin, execute, metrics } from "../src/trading/engine.ts";
import { validateSave } from "../src/storage/validate.ts";
const time = (s: string) => Date.parse(s + "+08:00");
const monday = time("2026-10-19T10:00:00");
const template = createGame(monday, 72549);
const fresh = () => {
  const g = structuredClone(template);
  g.stocks[0].price = 100;
  return g;
};
const near = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected}`,
  );

test("calendar: sessions, lunch, weekends, and next open use UTC+8", () => {
  assert.equal(isOpen(time("2026-10-19T09:29:59")), false);
  assert.equal(isOpen(time("2026-10-19T09:30:00")), true);
  assert.equal(isOpen(time("2026-10-19T11:30:00")), false);
  assert.equal(isOpen(time("2026-10-19T13:00:00")), true);
  assert.equal(isOpen(time("2026-10-19T15:00:00")), false);
  assert.equal(isOpen(time("2026-10-24T10:00:00")), false);
  assert.equal(
    nextOpen(time("2026-10-23T15:00:00")),
    time("2026-10-26T09:30:00"),
  );
  assert.equal(
    nextQuote(time("2026-10-19T11:29:00")),
    time("2026-10-19T13:00:00"),
  );
  assert.equal(
    nextOpen(time("2026-10-19T12:00:00")),
    time("2026-10-19T13:00:00"),
  );
});
test("same seed recreates 15 distinct stocks and valid OHLC history", () => {
  const other = createGame(monday, 72549);
  assert.deepEqual(other.stocks, template.stocks);
  assert.equal(new Set(other.stocks.map((s) => s.price)).size, 15);
  for (const regime of ["calm", "growth", "volatile"])
    assert.equal(other.stocks.filter((s) => s.regime === regime).length, 5);
  assert.equal(validateSave(other), other);
  for (const stock of other.stocks) {
    assert.ok(stock.candles.length === 480);
    for (const bar of stock.candles)
      assert.ok(
        bar.high >= Math.max(bar.open, bar.close) &&
          bar.low <= Math.min(bar.open, bar.close),
      );
  }
});
test("long trade preserves accounting, proportional debt and partial-close costs", () => {
  const g = fresh(),
    id = g.stocks[0].id;
  const buy = execute(g, id, "buy", 100, 3);
  near(g.positions[0].debt, (100 * buy.price * 2) / 3);
  near(metrics(g).equity, 100000 - buy.fee - 100 * (buy.price - 100));
  g.stocks[0].price = 110;
  const debt = g.positions[0].debt;
  execute(g, id, "sell", 40);
  near(g.positions[0].debt, debt * 0.6);
  assert.equal(g.positions[0].quantity, 60);
  execute(g, id, "sell", 60);
  assert.equal(g.positions.length, 0);
  near(metrics(g).equity, g.cash);
  near(g.cash, 100000 - buy.price * 100 + 110 * 0.9997 * 100 - g.fees);
});
test("short sale locks proceeds and margin instead of increasing spendable cash", () => {
  const g = fresh(),
    id = g.stocks[0].id;
  const sell = execute(g, id, "short", 100, 2);
  near(g.cash, 100000 - (sell.price * 100) / 2 - sell.fee);
  near(metrics(g).proceeds, sell.price * 100);
  near(metrics(g).collateral, (sell.price * 100) / 2);
  g.stocks[0].price = 80;
  const cover = execute(g, id, "cover", 40);
  near(metrics(g).proceeds, sell.price * 60);
  near(metrics(g).collateral, (sell.price * 60) / 2);
  execute(g, id, "cover", 60);
  near(g.cash, 100000 + (sell.price - cover.price) * 100 - g.fees);
  assert.ok(g.cash > 100000);
});
test("invalid, unaffordable, opposite, overselling and closed-market orders are atomic", () => {
  const g = fresh(),
    id = g.stocks[0].id;
  for (const n of [0, -1, 1.5, Infinity, NaN, 1e9])
    assert.throws(() => execute(g, id, "buy", n));
  assert.throws(() => execute(g, id, "buy", 999999));
  assert.throws(() => execute(g, id, "buy", 100, 4));
  assert.equal(g.positions.length, 0);
  execute(g, id, "buy", 50);
  const before = structuredClone(g);
  assert.throws(() => execute(g, id, "short", 10));
  assert.throws(() => execute(g, id, "sell", 51));
  assert.deepEqual(g, before);
  g.simTime = time("2026-10-19T12:00:00");
  assert.throws(() => execute(g, id, "buy", 1));
});
test("3x gross limit applies across positions, including fees and slippage", () => {
  const g = fresh();
  execute(g, g.stocks[0].id, "buy", 2900, 3);
  assert.throws(() => execute(g, g.stocks[1].id, "short", 100000, 3));
  assert.ok(metrics(g).leverage <= 3);
});
test("margin liquidation is permanent even if the price subsequently recovers", () => {
  const g = fresh(),
    id = g.stocks[0].id;
  execute(g, id, "buy", 2900, 3);
  g.stocks[0].price = 85;
  checkMargin(g);
  assert.equal(g.liquidations, 1);
  assert.equal(g.positions.length, 0);
  assert.equal(g.trades[0].forced, true);
  const after = g.cash;
  g.stocks[0].price = 120;
  checkMargin(g);
  near(g.cash, after);
  assert.equal(g.liquidations, 1);
});
test("opening gap can bankrupt a leveraged account and block new orders", () => {
  const g = fresh(),
    id = g.stocks[0].id;
  execute(g, id, "buy", 2900, 3);
  g.stocks[0].price = 60;
  checkMargin(g);
  assert.ok(g.cash < 0);
  assert.equal(g.bankrupt, true);
  assert.throws(() => execute(g, id, "buy", 1));
});
test("short loss and force-close have the correct direction", () => {
  const g = fresh(),
    id = g.stocks[0].id;
  execute(g, id, "short", 2900, 3);
  g.stocks[0].price = 125;
  checkMargin(g);
  assert.equal(g.liquidations, 1);
  assert.ok(g.cash > 0 && g.cash < 30000);
  assert.equal(g.trades[0].side, "cover");
});
test("natural-time financing accrues through weekends without generating quotes", () => {
  const g = fresh();
  g.simTime = time("2026-10-23T14:59:00");
  execute(g, g.stocks[0].id, "buy", 100, 2);
  g.simTime = time("2026-10-23T15:00:00");
  const debt = metrics(g).debt,
    cash = g.cash,
    rng = g.rng;
  advance(g, g.simTime + 2 * DAY);
  near(g.cash, cash - (debt * 0.1 * 2) / 365);
  assert.equal(g.rng, rng);
});
test("offline batch and segmented online time have identical market and settlement outcomes", () => {
  const online = fresh(),
    id = online.stocks[0].id;
  execute(online, id, "buy", 2900, 3);
  const offline = structuredClone(online),
    target = monday + 8 * DAY + 12345;
  for (let t = monday + 37123; t < target; t += 37123) advance(online, t);
  advance(online, target);
  advance(offline, target);
  assert.equal(online.rng, offline.rng);
  assert.deepEqual(online.stocks, offline.stocks);
  assert.deepEqual(online.positions, offline.positions);
  assert.deepEqual(online.trades, offline.trades);
  assert.equal(online.liquidations, offline.liquidations);
  near(online.cash, offline.cash, 1e-5);
  near(online.interest, offline.interest, 1e-5);
});
test("market random path does not depend on trading choices or refreshed save", () => {
  const one = fresh(),
    two = fresh();
  execute(one, one.stocks[0].id, "buy", 100);
  advance(one, monday + DAY);
  advance(two, monday + DAY);
  assert.deepEqual(one.stocks, two.stocks);
  const restored = validateSave(JSON.parse(JSON.stringify(one)));
  advance(one, one.simTime + MINUTE * 80);
  advance(restored, restored.simTime + MINUTE * 80);
  assert.deepEqual(one, restored);
});
test("import rejects malformed values, mismatched stocks and incompatible versions", () => {
  for (const mutate of [
    (g: any) => (g.version = 2),
    (g: any) => (g.cash = NaN),
    (g: any) => (g.rng = 0),
    (g: any) => g.stocks.pop(),
    (g: any) => (g.stocks[0].price = -1),
    (g: any) => g.positions.push({ id: "unknown" }),
    (g: any) => g.favorites.push("unknown"),
    (g: any) => (g.stocks[0].candles[0].high = 0),
    (g: any) => (g.stocks[0].daily = []),
    (g: any) => (g.equity = []),
  ]) {
    const g = fresh();
    mutate(g);
    assert.throws(() => validateSave(g));
  }
  assert.throws(() => validateSave(null));
});
