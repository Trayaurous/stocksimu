import type { Game, Regime, Stock } from "./types.ts";
import { COMPANIES, company } from "./companies.ts";
import { DAY, MINUTE, dayStart, nextQuote, parts } from "./clock.ts";
import {
  checkMargin,
  INITIAL,
  metrics,
  recordEquity,
} from "../trading/engine.ts";
const profiles: Record<Regime, { vol: number; drift: number }> = {
  calm: { vol: 0.0008, drift: 0.000008 },
  growth: { vol: 0.0016, drift: 0.000035 },
  volatile: { vol: 0.0032, drift: 0.000005 },
};
export function random(g: Game) {
  let x = g.rng;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  g.rng = x >>> 0;
  return g.rng / 4294967296;
}
function noise(g: Game) {
  return (random(g) + random(g) + random(g) - 1.5) * 2;
}
const EVENTS = [
  [
    "公布新一轮产品计划",
    "公司公布了新的研发与产品日程。投入、交付时间和市场接受程度仍有不确定性。",
  ],
  [
    "调整供应链合作方案",
    "部分采购与交付安排发生变化，公司正在重新评估未来成本与产能。",
  ],
  [
    "披露业务整合进展",
    "公司正在调整业务组合。转型可能改变未来经营表现，也带来新的不确定性。",
  ],
  [
    "更新季度经营展望",
    "公司发布了新的经营说明。收入结构和资金安排出现变化，市场正在消化这些信息。",
  ],
  [
    "签订区域合作协议",
    "公司与新的区域合作伙伴签订框架协议，后续执行规模尚未确定。",
  ],
  [
    "公布融资与扩张计划",
    "公司提出新的资金安排，计划拓展业务。项目投入与回报的时间仍不确定。",
  ],
];
function quoteTick(g: Game, regimeChanges: boolean) {
  const market = noise(g) * 0.0005;
  const newSession = parts(g.simTime).minute === 570;
  for (const [index, s] of g.stocks.entries()) {
    const old = s.price;
    if (newSession) s.previousClose = old;
    let jump = 0;
    if (random(g) < 0.00055) {
      const item = EVENTS[Math.floor(random(g) * EVENTS.length)];
      const regime = (["calm", "growth", "volatile"] as Regime[])[
        Math.floor(random(g) * 3)
      ];
      if (regimeChanges) s.regime = regime;
      jump = noise(g) * 0.025;
      s.trend = noise(g) * 0.00008;
      g.news.unshift({
        id: g.nextId++,
        time: g.simTime,
        stockId: s.id,
        title: company(s.id).name + item[0],
        body: item[1],
      });
      g.news = g.news.slice(0, 80);
    }
    const profile = profiles[s.regime];
    const individual = 0.75 + index * 0.037;
    s.trend = s.trend * 0.999 + noise(g) * 0.000001;
    const change =
      market * (0.55 + (index % 5) * 0.2) +
      noise(g) * profile.vol * individual +
      profile.drift +
      s.trend +
      jump +
      (newSession ? noise(g) * profile.vol * 4 : 0);
    s.price = Math.max(0.5, Math.min(1e6, old * Math.exp(change)));
    // Opening gaps are not tradable at yesterday's close.
    const open = newSession ? s.price : old;
    const wick = Math.abs(noise(g)) * profile.vol * old * 0.45;
    const bar = {
      time: g.simTime,
      open,
      high: Math.min(1e6, Math.max(open, s.price) + wick),
      low: Math.max(0.5, Math.min(open, s.price) - wick),
      close: s.price,
      volume: Math.floor(
        (800 + random(g) * 5000) * (1 + Math.abs(change) * 150),
      ),
    };
    s.candles.push(bar);
    if (s.candles.length > 480) s.candles.shift();
    const daily = s.daily.at(-1);
    if (daily && dayStart(daily.time) === dayStart(g.simTime)) {
      daily.high = Math.max(daily.high, bar.high);
      daily.low = Math.min(daily.low, bar.low);
      daily.close = bar.close;
      daily.volume += bar.volume;
    } else {
      s.daily.push({ ...bar });
      if (s.daily.length > 120) s.daily.shift();
    }
  }
}
function accrue(g: Game, elapsed: number) {
  if (!g.positions.length || !elapsed) return;
  const m = metrics(g);
  const cost = ((m.debt * 0.1 + m.shortValue * 0.05) * elapsed) / (365 * DAY);
  g.cash -= cost;
  g.interest += cost;
}
export function advance(
  g: Game,
  target: number,
  progress?: (time: number) => void,
  regimeChanges = true,
) {
  if (!Number.isFinite(target) || target < g.simTime) return g;
  if (target > 8e12) throw new Error("游戏日期超出支持范围");
  let tick = nextQuote(g.simTime),
    n = 0;
  while (tick <= target) {
    accrue(g, tick - g.simTime);
    g.simTime = tick;
    quoteTick(g, regimeChanges);
    checkMargin(g);
    if (++n % 5000 === 0) progress?.(tick);
    tick = nextQuote(g.simTime);
  }
  accrue(g, target - g.simTime);
  g.simTime = target;
  recordEquity(g);
  return g;
}
export function createGame(
  now = Date.now(),
  seed = 123456789,
  rounds: Game["rounds"] = [],
): Game {
  const stocks: Stock[] = COMPANIES.map((c) => ({
    id: c.id,
    price: c.initial,
    previousClose: c.initial,
    regime: c.regime,
    trend: 0,
    candles: [],
    daily: [],
  }));
  const start = Math.floor((now - 35 * DAY) / MINUTE) * MINUTE;
  const g: Game = {
    version: 1,
    seed: seed >>> 0 || 1,
    rng: seed >>> 0 || 1,
    simTime: start,
    realAt: now,
    started: now,
    cash: INITIAL,
    initial: INITIAL,
    fees: 0,
    interest: 0,
    tradeCount: 0,
    nextId: 1,
    stocks,
    positions: [],
    trades: [],
    news: [],
    equity: [],
    peak: INITIAL,
    drawdown: 0,
    bankrupt: false,
    liquidations: 0,
    seen: [],
    favorites: ["yunjia", "songwan", "xingqiao"],
    rounds,
  };
  advance(g, now, undefined, false);
  g.equity = [{ time: now, value: INITIAL }];
  return g;
}
