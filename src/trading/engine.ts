import type { Game, Side, Trade } from "../simulation/types.ts";
import { isOpen } from "../simulation/clock.ts";
export const COMMISSION = 0.001;
export const SLIPPAGE = 0.0003;
export const MAINTENANCE = 0.25;
export const INITIAL = 100_000;
export function metrics(g: Game) {
  let longValue = 0,
    shortValue = 0,
    debt = 0,
    collateral = 0,
    proceeds = 0,
    unrealized = 0;
  for (const p of g.positions) {
    const price = g.stocks.find((s) => s.id === p.id)!.price;
    if (p.quantity > 0) {
      longValue += p.quantity * price;
      debt += p.debt;
    } else {
      shortValue += -p.quantity * price;
      collateral += p.collateral;
      proceeds += p.proceeds;
    }
    unrealized += p.quantity * (price - p.average);
  }
  const equity = g.cash + longValue - debt + collateral + proceeds - shortValue;
  const gross = longValue + shortValue;
  return {
    equity,
    gross,
    longValue,
    shortValue,
    debt,
    collateral,
    proceeds,
    unrealized,
    available: Math.max(0, g.cash),
    margin: gross > 0 ? equity / gross : Infinity,
    leverage: equity > 0 ? gross / equity : gross ? Infinity : 0,
    pnl: equity - g.initial,
  };
}
export function quote(
  g: Game,
  id: string,
  side: Side,
  quantity: number,
  leverage: number,
) {
  const stock = g.stocks.find((s) => s.id === id);
  if (!stock) throw new Error("找不到这家公司");
  const price =
    stock.price *
    (side === "buy" || side === "cover" ? 1 + SLIPPAGE : 1 - SLIPPAGE);
  const value = price * quantity;
  const fee = Math.max(1, value * COMMISSION);
  return { price, value, fee, required: value / leverage + fee };
}
export function execute(
  g: Game,
  id: string,
  side: Side,
  quantity: number,
  leverage = 1,
  forced = false,
): Trade {
  if (!forced && !isOpen(g.simTime))
    throw new Error("市场休市中，开市后可以交易");
  if (g.bankrupt && !forced)
    throw new Error("本轮已结束，请在复盘中开启新一轮");
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1e8)
    throw new Error("请输入有效的整数股数");
  if (![1, 2, 3].includes(leverage)) throw new Error("杠杆仅支持 1、2、3 倍");
  const q = quote(g, id, side, quantity, leverage);
  let p = g.positions.find((p) => p.id === id);
  let pnl: number | null = null;
  if (side === "buy" || side === "short") {
    const direction = side === "buy" ? 1 : -1;
    if (p && Math.sign(p.quantity) !== direction)
      throw new Error("请先平掉该股票的反向持仓");
    if (q.required > g.cash + 1e-7) throw new Error("可用资金不足，请减少股数");
    const m = metrics(g);
    const equityAfter =
      m.equity -
      q.fee -
      Math.abs(q.price - g.stocks.find((s) => s.id === id)!.price) * quantity;
    const grossAfter =
      m.gross + quantity * g.stocks.find((s) => s.id === id)!.price;
    if (grossAfter > 3 * equityAfter + 1e-7)
      throw new Error("成交后账户总敞口将超过净资产的 3 倍");
    if (!p) {
      p = { id, quantity: 0, average: 0, debt: 0, collateral: 0, proceeds: 0 };
      g.positions.push(p);
    }
    p.average =
      (Math.abs(p.quantity) * p.average + q.value) /
      (Math.abs(p.quantity) + quantity);
    p.quantity += direction * quantity;
    g.cash -= q.required;
    if (side === "buy") p.debt += q.value * (1 - 1 / leverage);
    else {
      p.collateral += q.value / leverage;
      p.proceeds += q.value;
    }
  } else {
    if (!p || (side === "sell" ? p.quantity <= 0 : p.quantity >= 0))
      throw new Error("没有可平仓的对应持仓");
    if (quantity > Math.abs(p.quantity))
      throw new Error("平仓数量不能超过持仓股数");
    const ratio = quantity / Math.abs(p.quantity);
    if (side === "sell") {
      g.cash += q.value - p.debt * ratio - q.fee;
      p.debt *= 1 - ratio;
      pnl = (q.price - p.average) * quantity - q.fee;
    } else {
      g.cash += (p.collateral + p.proceeds) * ratio - q.value - q.fee;
      p.collateral *= 1 - ratio;
      p.proceeds *= 1 - ratio;
      pnl = (p.average - q.price) * quantity - q.fee;
    }
    p.quantity += side === "sell" ? -quantity : quantity;
    if (p.quantity === 0)
      g.positions = g.positions.filter((other) => other !== p);
  }
  g.fees += q.fee;
  g.tradeCount++;
  const trade: Trade = {
    id: g.nextId++,
    time: g.simTime,
    stockId: id,
    side,
    quantity,
    price: q.price,
    fee: q.fee,
    pnl,
    forced,
    leverage,
  };
  g.trades.unshift(trade);
  g.trades = g.trades.slice(0, 1000);
  recordEquity(g, true);
  return trade;
}
export function recordEquity(g: Game, force = false) {
  const value = metrics(g).equity;
  g.peak = Math.max(g.peak, value);
  g.drawdown = Math.max(g.drawdown, (g.peak - value) / g.peak);
  if (
    force ||
    !g.equity.length ||
    g.simTime - g.equity[g.equity.length - 1].time >= 30 * 60_000
  ) {
    if (g.equity.at(-1)?.time === g.simTime)
      g.equity[g.equity.length - 1].value = value;
    else g.equity.push({ time: g.simTime, value });
    if (g.equity.length > 1500) {
      g.equity = g.equity.filter((_, i) => i % 2 === 0 || i >= 1400);
    }
  }
}
export function checkMargin(g: Game) {
  const m = metrics(g);
  if (m.gross && m.margin <= MAINTENANCE) {
    g.liquidations++;
    for (const p of [...g.positions])
      execute(
        g,
        p.id,
        p.quantity > 0 ? "sell" : "cover",
        Math.abs(p.quantity),
        1,
        true,
      );
    g.news.unshift({
      id: g.nextId++,
      time: g.simTime,
      stockId: "",
      title: "账户通知 · 保证金不足，已执行强制平仓",
      body: "净资产与总敞口之比达到 25% 的维持保证金线，全部持仓已按当前可成交价格结算，包含费用与滑点。",
    });
  }
  if (metrics(g).equity <= 0) g.bankrupt = true;
  recordEquity(g);
}
