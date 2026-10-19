import { useEffect, useState } from "react";
import { ArrowDownUp, ArrowRight, Info, LockKeyhole } from "lucide-react";
import type { Game, Side } from "../simulation/types.ts";
import { company } from "../simulation/companies.ts";
import { isOpen } from "../simulation/clock.ts";
import { metrics, quote } from "../trading/engine.ts";
export const sideLabels: Record<Side, string> = {
  buy: "买入",
  sell: "卖出",
  short: "做空",
  cover: "平空",
};
export const money = (v: number) =>
  v.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export function OrderPanel({
  game,
  selected,
  busy,
  onTrade,
  requestedSide,
}: {
  game: Game;
  selected: string;
  busy: boolean;
  onTrade: (side: Side, quantity: number, leverage: number) => Promise<void>;
  requestedSide: { side: Side; token: number } | null;
}) {
  const [side, setSide] = useState<Side>("buy");
  const [quantity, setQuantity] = useState("100");
  const [leverage, setLeverage] = useState(1);
  const [message, setMessage] = useState("");
  const m = metrics(game),
    stock = game.stocks.find((s) => s.id === selected)!,
    c = company(selected);
  const position = game.positions.find((p) => p.id === selected);
  const opening = side === "buy" || side === "short";
  const shares = Number(quantity);
  const valid = Number.isSafeInteger(shares) && shares > 0;
  const q = quote(game, selected, side, valid ? shares : 0, leverage);
  useEffect(() => {
    setMessage("");
  }, [selected, side, quantity, leverage]);
  useEffect(() => {
    if (requestedSide) {
      setSide(requestedSide.side);
      const p = game.positions.find((p) => p.id === selected);
      if (p) setQuantity(String(Math.abs(p.quantity)));
    }
  }, [requestedSide]);
  const maxShares = () => {
    if (!opening)
      return position &&
        (side === "sell" ? position.quantity > 0 : position.quantity < 0)
        ? Math.abs(position.quantity)
        : 0;
    if (position && Math.sign(position.quantity) !== (side === "buy" ? 1 : -1))
      return 0;
    let lo = 0,
      hi = Math.min(1e8, Math.floor((m.available * leverage) / stock.price));
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2),
        estimate = quote(game, selected, side, mid, leverage);
      const eq =
        m.equity - estimate.fee - Math.abs(estimate.price - stock.price) * mid;
      if (
        estimate.required <= m.available &&
        m.gross + mid * stock.price <= 3 * eq
      )
        lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const submit = async () => {
    if (!valid) {
      setMessage("请输入大于零的整数股数");
      return;
    }
    try {
      await onTrade(side, shares, opening ? leverage : 1);
      setMessage("");
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const open = isOpen(game.simTime);
  const shortPosition = side === "short";
  const riskChange = stock.price * shares * (shortPosition ? 0.1 : -0.1);
  return (
    <section className="panel order-panel">
      <div className="panel-heading">
        <h2>交易委托</h2>
        <span className="subtle-label">
          市价单 <ArrowDownUp size={12} />
        </span>
      </div>
      <div className="order-tabs">
        {(["buy", "sell", "short", "cover"] as Side[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={
              side === s
                ? `active ${s === "short" || s === "sell" ? "orange" : ""}`
                : ""
            }
          >
            {sideLabels[s]}
          </button>
        ))}
      </div>
      <div className="order-stock">
        <span>
          {c.name}
          <small>{c.symbol}</small>
        </span>
        <strong>¥ {stock.price.toFixed(2)}</strong>
      </div>
      <label className="field-label" htmlFor="quantity">
        {opening ? "委托数量" : "平仓数量"}
        <span>股</span>
      </label>
      <div className="number-field">
        <button
          aria-label="减少股数"
          onClick={() =>
            setQuantity(String(Math.max(1, (Number(quantity) || 0) - 100)))
          }
        >
          −
        </button>
        <input
          id="quantity"
          type="number"
          inputMode="numeric"
          min="1"
          max="100000000"
          step="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <button
          aria-label="增加股数"
          onClick={() =>
            setQuantity(String(Math.min(1e8, (Number(quantity) || 0) + 100)))
          }
        >
          +
        </button>
      </div>
      <div className="quantity-presets">
        {[0.25, 0.5, 1].map((f) => (
          <button
            key={f}
            onClick={() => setQuantity(String(Math.floor(maxShares() * f)))}
          >
            {f === 1 ? "最大数量" : `${f * 100}%`}
          </button>
        ))}
      </div>
      {opening && (
        <>
          <div className="field-label">
            开仓杠杆 <span>最高 3×</span>
          </div>
          <div className="leverage-options">
            {[1, 2, 3].map((l) => (
              <button
                key={l}
                className={leverage === l ? "selected" : ""}
                onClick={() => setLeverage(l)}
              >
                {l}×{l === 1 && <small>自有资金</small>}
              </button>
            ))}
          </div>
        </>
      )}
      <dl className="order-details">
        <div>
          <dt>可用资金</dt>
          <dd>¥ {money(m.available)}</dd>
        </div>
        <div>
          <dt>预计成交额</dt>
          <dd>¥ {money(valid ? q.value : 0)}</dd>
        </div>
        <div>
          <dt>预计手续费</dt>
          <dd>¥ {money(valid ? q.fee : 0)}</dd>
        </div>
        {opening && (
          <div className="order-total">
            <dt>{side === "short" ? "保证金及费用" : "本次现金投入"}</dt>
            <dd>¥ {money(valid ? q.required : 0)}</dd>
          </div>
        )}
      </dl>
      {opening && valid && (
        <div className="order-scenario">
          <Info size={14} />
          <p>
            若价格下跌 10%，本次持仓价差损益约{" "}
            <strong className={riskChange >= 0 ? "up" : "down"}>
              {riskChange >= 0 ? "+" : "−"}¥ {money(Math.abs(riskChange))}
            </strong>
            <small>未计费用、资金成本及可能提前发生的强平。</small>
          </p>
        </div>
      )}
      {message && (
        <p role="alert" className="form-error">
          {message}
        </p>
      )}
      <button
        className={`button order-submit ${side === "short" || side === "sell" ? "orange-button" : "primary"}`}
        disabled={!open || busy || game.bankrupt || !valid}
        onClick={submit}
      >
        {!open ? (
          <>
            <LockKeyhole size={16} />
            休市中，暂不可交易
          </>
        ) : game.bankrupt ? (
          "本轮已结束"
        ) : busy ? (
          "处理中…"
        ) : (
          <>
            {sideLabels[side]} {c.name}
            <ArrowRight size={16} />
          </>
        )}
      </button>
      <p className="order-disclaimer">虚拟资金 · 不连接任何真实市场</p>
    </section>
  );
}
