import type { Game } from "../simulation/types.ts";
import { COMPANIES } from "../simulation/companies.ts";
export function validateSave(input: unknown): Game {
  const fail = () => {
    throw new Error("存档格式不完整或版本不受支持，当前存档未被覆盖");
  };
  if (!input || typeof input !== "object") return fail();
  const g = input as Game;
  const finite = (x: unknown): x is number =>
    typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 1e15;
  const nonneg = (x: unknown) => finite(x) && x >= 0;
  const timestamp = (x: unknown) => finite(x) && x >= 946684800000 && x <= 8e12;
  const int = (x: unknown) => nonneg(x) && Number.isSafeInteger(x);
  const id = (x: unknown) => COMPANIES.some((c) => c.id === x);
  if (
    g.version !== 1 ||
    !int(g.seed) ||
    !int(g.rng) ||
    g.rng === 0 ||
    g.rng > 4294967295 ||
    !timestamp(g.simTime) ||
    !timestamp(g.realAt) ||
    !timestamp(g.started) ||
    g.started > g.simTime
  )
    return fail();
  if (
    !finite(g.cash) ||
    g.initial !== 100000 ||
    !nonneg(g.fees) ||
    !nonneg(g.interest) ||
    !nonneg(g.peak) ||
    g.peak < g.initial ||
    !nonneg(g.drawdown) ||
    !int(g.tradeCount) ||
    !int(g.nextId) ||
    !int(g.liquidations) ||
    typeof g.bankrupt !== "boolean"
  )
    return fail();
  if (
    !Array.isArray(g.stocks) ||
    g.stocks.length !== 15 ||
    new Set(g.stocks.map((s) => s.id)).size !== 15
  )
    return fail();
  for (const s of g.stocks) {
    if (
      !id(s.id) ||
      !finite(s.price) ||
      s.price < 0.5 ||
      s.price > 1e6 ||
      !finite(s.previousClose) ||
      s.previousClose <= 0 ||
      !["calm", "growth", "volatile"].includes(s.regime) ||
      !finite(s.trend)
    )
      return fail();
    for (const bars of [s.candles, s.daily]) {
      if (!Array.isArray(bars) || bars.length === 0 || bars.length > 500)
        return fail();
      let previous = 0;
      for (const b of bars) {
        if (
          !timestamp(b.time) ||
          b.time <= previous ||
          b.time > g.simTime ||
          ![b.open, b.close, b.high, b.low].every(
            (v) => finite(v) && v >= 0.5 && v <= 1e6,
          ) ||
          b.high < Math.max(b.open, b.close) ||
          b.low > Math.min(b.open, b.close) ||
          !nonneg(b.volume)
        )
          return fail();
        previous = b.time;
      }
    }
  }
  if (
    !Array.isArray(g.positions) ||
    g.positions.length > 15 ||
    new Set(g.positions.map((p) => p.id)).size !== g.positions.length
  )
    return fail();
  for (const p of g.positions) {
    if (
      !id(p.id) ||
      !Number.isSafeInteger(p.quantity) ||
      !p.quantity ||
      Math.abs(p.quantity) > 1e8 ||
      !finite(p.average) ||
      p.average <= 0 ||
      ![p.debt, p.collateral, p.proceeds].every(nonneg)
    )
      return fail();
    if (
      p.quantity > 0
        ? p.collateral !== 0 || p.proceeds !== 0
        : p.debt !== 0 || p.proceeds <= 0
    )
      return fail();
  }
  if (
    !Array.isArray(g.trades) ||
    g.trades.length > 1000 ||
    !Array.isArray(g.news) ||
    g.news.length > 100 ||
    !Array.isArray(g.equity) ||
    g.equity.length === 0 ||
    g.equity.length > 1600 ||
    !Array.isArray(g.rounds) ||
    g.rounds.length > 50
  )
    return fail();
  for (const t of g.trades)
    if (
      !int(t.id) ||
      !timestamp(t.time) ||
      t.time > g.simTime ||
      !id(t.stockId) ||
      !["buy", "sell", "short", "cover"].includes(t.side) ||
      !int(t.quantity) ||
      !t.quantity ||
      !finite(t.price) ||
      t.price <= 0 ||
      !nonneg(t.fee) ||
      (t.pnl !== null && !finite(t.pnl)) ||
      typeof t.forced !== "boolean" ||
      ![1, 2, 3].includes(t.leverage)
    )
      return fail();
  for (const n of g.news)
    if (
      !int(n.id) ||
      !timestamp(n.time) ||
      n.time > g.simTime ||
      (n.stockId !== "" && !id(n.stockId)) ||
      typeof n.title !== "string" ||
      n.title.length > 300 ||
      typeof n.body !== "string" ||
      n.body.length > 2000
    )
      return fail();
  for (const e of g.equity)
    if (!timestamp(e.time) || e.time > g.simTime || !finite(e.value))
      return fail();
  for (const r of g.rounds)
    if (
      !timestamp(r.started) ||
      !timestamp(r.ended) ||
      !finite(r.equity) ||
      !int(r.trades) ||
      !nonneg(r.drawdown) ||
      typeof r.bankrupt !== "boolean"
    )
      return fail();
  if (
    !Array.isArray(g.seen) ||
    g.seen.length > 20 ||
    !g.seen.every((v) => typeof v === "string" && v.length < 30) ||
    !Array.isArray(g.favorites) ||
    g.favorites.length > 15 ||
    !g.favorites.every(id)
  )
    return fail();
  return g;
}
