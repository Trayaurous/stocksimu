import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  HardDrive,
  Download,
  FlaskConical,
  History,
  Leaf,
  Maximize2,
  MoreHorizontal,
  Search,
  Settings2,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Star,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { useSimulation } from "./useSimulation.ts";
import { company } from "./simulation/companies.ts";
import { formatDate, isOpen, nextOpen, parts } from "./simulation/clock.ts";
import type { Candle, Game, Side } from "./simulation/types.ts";
import { metrics } from "./trading/engine.ts";
import { exportSave } from "./storage/save.ts";
import { CandleChart, Sparkline } from "./components/Chart.tsx";
import { GameClock } from "./components/GameClock.tsx";
import { Modal } from "./components/Modal.tsx";
import { OrderPanel, money, sideLabels } from "./components/OrderPanel.tsx";
import { Lab } from "./education/Lab.tsx";
const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const HINTS: Record<string, [string, string]> = {
  buy: [
    "你拥有了第一笔持仓",
    "买入后，现金变成股票。持仓成本是平均成交价，手续费会另外扣除。",
  ],
  short: [
    "这是一笔做空持仓",
    "你借入股票并卖出，未来需要买回归还。卖出所得被锁定；股价上涨时，回补会更贵。",
  ],
  leverage: [
    "本次使用了借入资金或较低保证金",
    "杠杆扩大了价格变化对自有资金的影响。多头融资会产生利息，做空会产生借券费用。",
  ],
  movement: [
    "这就是浮盈浮亏",
    "价格变了，持仓的价值也变了。还未平仓的价差损益叫浮盈浮亏，已经计入账户净资产。",
  ],
};
function aggregate(bars: Candle[], size: number) {
  const result: Candle[] = [];
  for (const b of bars) {
    const last = result.at(-1),
      bucket = Math.floor(b.time / (size * 60000)) * size * 60000;
    if (last?.time === bucket) {
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume += b.volume;
    } else result.push({ ...b, time: bucket });
  }
  return result;
}
function Brand() {
  return (
    <a href="#market" className="brand">
      <span className="brand-icon">
        <BarChart3 size={25} strokeWidth={2.4} />
      </span>
      <span>
        纸上交易所<small>PAPER MARKET</small>
      </span>
      <span className="beta-tag">模拟</span>
    </a>
  );
}
function Review({ game, reset }: { game: Game; reset: () => void }) {
  const m = metrics(game);
  const max = Math.max(game.initial, ...game.equity.map((e) => e.value)),
    min = Math.min(game.initial, ...game.equity.map((e) => e.value));
  const range = max - min || 1000;
  const points = game.equity
    .map(
      (e, i) =>
        `${20 + (i / Math.max(1, game.equity.length - 1)) * 960},${180 - ((e.value - min) / range) * 130}`,
    )
    .join(" ");
  return (
    <div className="review-page">
      <div className="page-title">
        <div>
          <div className="eyebrow">YOUR MARKET STORY</div>
          <h1>每一笔交易，都留下痕迹。</h1>
          <p>回看数据和选择，不用一次盈亏定义整个过程。</p>
        </div>
        <button className="button secondary" onClick={reset}>
          <History size={16} />
          归档并开启新一轮
        </button>
      </div>
      <div className="review-stats">
        {[
          [
            "本轮总盈亏",
            `${m.pnl >= 0 ? "+" : "−"}¥ ${money(Math.abs(m.pnl))}`,
            "包含所有已收费用",
          ],
          [
            "最大回撤",
            `${(game.drawdown * 100).toFixed(2)}%`,
            "相对账户历史最高净资产",
          ],
          [
            "累计成交",
            `${game.tradeCount} 笔`,
            `其中强平触发 ${game.liquidations} 次`,
          ],
          [
            "累计成本",
            `¥ ${money(game.fees + game.interest)}`,
            `手续费 ${money(game.fees)} · 资金成本 ${money(game.interest)}`,
          ],
        ].map(([label, value, note]) => (
          <article className="panel review-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <section className="panel equity-panel">
        <div className="panel-heading">
          <h2>账户净资产曲线</h2>
          <span className="subtle-label">起始资金 ¥ 100,000.00</span>
        </div>
        <div className="review-chart">
          <svg
            viewBox="0 0 1000 215"
            role="img"
            aria-label="账户净资产历史曲线"
          >
            {[50, 115, 180].map((y) => (
              <line
                key={y}
                x1="20"
                x2="980"
                y1={y}
                y2={y}
                className="gridline"
              />
            ))}
            <line
              x1="20"
              x2="980"
              y1={180 - ((game.initial - min) / range) * 130}
              y2={180 - ((game.initial - min) / range) * 130}
              stroke="#aaa"
              strokeDasharray="4 5"
            />
            <polyline
              points={points}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
            />
            <text x="20" y="208" className="axis-text">
              {formatDate(game.started, true)}
            </text>
            <text x="980" y="208" textAnchor="end" className="axis-text">
              {formatDate(game.simTime, true)}
            </text>
            <text x="20" y="24" className="axis-text">
              最高 ¥ {money(max)} · 最低 ¥ {money(min)}
            </text>
          </svg>
        </div>
      </section>
      <div className="review-bottom">
        <section className="panel">
          <div className="panel-heading">
            <h2>结算明细</h2>
            <Wallet size={17} />
          </div>
          <dl className="review-ledger">
            {[
              ["起始净资产", game.initial],
              ["当前净资产", m.equity],
              ["未实现价差损益", m.unrealized],
              [
                "已实现价差损益（未扣费用）",
                m.pnl - m.unrealized + game.fees + game.interest,
              ],
              ["累计手续费", -game.fees],
              ["累计融资 / 借券费用", -game.interest],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>¥ {money(Number(value))}</dd>
              </div>
            ))}
          </dl>
          <p className="footnote">
            所有数据仅描述本轮模拟结果。历史曲线会保留较稀疏的早期采样，最大回撤按每次报价更新记录。
          </p>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>往期轮次</h2>
            <span className="subtle-label">最近 50 轮</span>
          </div>
          {game.rounds.length ? (
            <div className="round-list">
              {game.rounds.map((r, i) => (
                <div key={i}>
                  <span>
                    <strong>{formatDate(r.started, true).slice(0, 10)}</strong>
                    <small>
                      {r.bankrupt ? "资不抵债" : "主动归档"} · {r.trades} 笔成交
                    </small>
                  </span>
                  <strong className={r.equity >= 100000 ? "up" : "down"}>
                    ¥ {money(r.equity)}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <History size={28} />
              <strong>第一段市场故事，正在发生</strong>
              <p>开启下一轮时，本轮结算摘要会保留在这里。</p>
            </div>
          )}
        </section>
      </div>
      <section className="panel review-trades">
        <div className="panel-heading">
          <h2>成交档案</h2>
          <span className="subtle-label">保留最近 1,000 笔 · 最新在前</span>
        </div>
        <TradeTable game={game} />
      </section>
    </div>
  );
}
function TradeTable({ game }: { game: Game }) {
  if (!game.trades.length)
    return (
      <div className="empty small">
        <ArrowDownLeft size={23} />
        <strong>还没有成交记录</strong>
        <p>每一次买卖都会记录在这里。</p>
      </div>
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>游戏时间</th>
            <th>股票</th>
            <th>操作</th>
            <th>数量</th>
            <th>成交价格</th>
            <th>手续费</th>
            <th>平仓盈亏*</th>
          </tr>
        </thead>
        <tbody>
          {game.trades.slice(0, 1000).map((t) => (
            <tr key={t.id}>
              <td className="muted nowrap">{formatDate(t.time)}</td>
              <td>{company(t.stockId).name}</td>
              <td>
                <span
                  className={`trade-chip ${t.side === "buy" || t.side === "cover" ? "green" : "orange"}`}
                >
                  {t.forced ? "强平 · " : ""}
                  {sideLabels[t.side]}
                </span>
              </td>
              <td>{t.quantity}</td>
              <td>{money(t.price)}</td>
              <td>{money(t.fee)}</td>
              <td
                className={
                  t.pnl === null ? "muted" : t.pnl >= 0 ? "up" : "down"
                }
              >
                {t.pnl === null ? "—" : money(t.pnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="footnote">
        * 平仓盈亏扣除该次平仓手续费，未分摊开仓手续费和融资 /
        借券费用。账户总盈亏已包含全部费用。
      </p>
    </div>
  );
}
export default function App() {
  const sim = useSimulation();
  const { game, busy, ready } = sim;
  const [page, setPage] = useState(() =>
    ["lab", "review"].includes(location.hash.slice(1))
      ? location.hash.slice(1)
      : "market",
  );
  const [selected, setSelected] = useState("yunjia");
  const [search, setSearch] = useState("");
  const [watchTab, setWatchTab] = useState("all");
  const [sort, setSort] = useState("default");
  const [period, setPeriod] = useState("5m");
  const [chartMode, setChartMode] = useState<"candle" | "line">("candle");
  const [lowerTab, setLowerTab] = useState("positions");
  const [modal, setModal] = useState<
    "settings" | "rules" | "reset" | "company" | "chart" | null
  >(null);
  const [hint, setHint] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [requestedSide, setRequestedSide] = useState<{
    side: Side;
    token: number;
  } | null>(null);
  const [palette, setPalette] = useState(() => {
    try {
      return localStorage.getItem("paper-market-palette") || "green";
    } catch {
      return "green";
    }
  });
  const importInput = useRef<HTMLInputElement>(null);
  const movementPrice = useRef<number | null>(null);
  useEffect(() => {
    const change = () =>
      setPage(
        ["lab", "review"].includes(location.hash.slice(1))
          ? location.hash.slice(1)
          : "market",
      );
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    try {
      localStorage.setItem("paper-market-palette", palette);
    } catch {
      /* Optional setting. */
    }
  }, [palette]);
  useEffect(() => {
    if (page === "lab" && ready) void sim.setSpeed(1);
  }, [page, ready]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  useEffect(() => {
    if (
      !game ||
      !game.positions.length ||
      game.seen.includes("movement") ||
      hint.length ||
      page !== "market"
    )
      return;
    const value = metrics(game).unrealized;
    if (movementPrice.current === null) {
      movementPrice.current = value;
      return;
    }
    if (Math.abs(value - movementPrice.current) > 0.01) setHint(["movement"]);
  }, [game, hint.length, page]);
  const safe = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      setToast((e as Error).message);
    }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    if (
      game &&
      !window.confirm("导入将替换当前一轮存档。建议先导出备份。确认导入？")
    )
      return;
    await safe(async () => {
      await sim.importGame(file);
      setModal(null);
    });
  };
  const fileInput = (
    <input
      type="file"
      accept=".json,application/json"
      hidden
      ref={importInput}
      onChange={(e) => {
        void importFile(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );
  if (!game || !ready)
    return (
      <div className="loading-page">
        <Brand />
        <div className="loading-card">
          <div className="loading-icon">
            <BarChart3 size={32} />
          </div>
          <h1>{sim.error ? "存档需要一点照看" : "市场正在醒来"}</h1>
          <p>{sim.error || sim.notice || "准备虚构公司的行情与本地存档…"}</p>
          {sim.error && !sim.locked && (
            <button
              className="button primary"
              onClick={() => importInput.current?.click()}
            >
              <Upload size={16} />
              导入备份
            </button>
          )}
          {sim.error && (
            <button
              className="button primary"
              onClick={() => location.reload()}
            >
              重新加载
            </button>
          )}
          {!sim.error && <div className="loading-bar" />}
        </div>
        {fileInput}
        {toast && (
          <div className="toast" role="alert">
            {toast}
          </div>
        )}
      </div>
    );
  const m = metrics(game),
    stock = game.stocks.find((s) => s.id === selected)!,
    c = company(selected);
  const change = (stock.price / stock.previousClose - 1) * 100;
  const open = isOpen(game.simTime);
  const day = stock.daily.at(-1)!;
  const chartBars =
    period === "day"
      ? stock.daily
      : period === "1m"
        ? stock.candles
        : aggregate(stock.candles, 5);
  const todayBars = stock.candles.filter(
    (b) => parts(b.time).key === parts(game.simTime).key,
  );
  const marketAvg =
    game.stocks.reduce(
      (sum, s) => sum + (s.price / s.previousClose - 1) * 100,
      0,
    ) / 15;
  const stocks = game.stocks
    .filter(
      (s) =>
        (watchTab !== "favorites" || game.favorites.includes(s.id)) &&
        `${company(s.id).name}${company(s.id).symbol}${company(s.id).sector}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "change"
        ? b.price / b.previousClose - a.price / a.previousClose
        : sort === "price"
          ? b.price - a.price
          : 0,
    );
  const trade = async (side: Side, quantity: number, leverage: number) => {
    const oldCount = game.tradeCount;
    const result = await sim.run("trade", {
      id: selected,
      side,
      quantity,
      leverage,
    });
    if (result && result.tradeCount > oldCount) {
      const hints = [
        side === "buy" ? "buy" : side === "short" ? "short" : "",
        leverage > 1 && (side === "buy" || side === "short") ? "leverage" : "",
      ].filter((x) => x && !game.seen.includes(x));
      setHint(hints);
      movementPrice.current = metrics(result).unrealized;
      setToast(`${sideLabels[side]}成功 · ${c.name} ${quantity} 股`);
      setLowerTab("positions");
    }
  };
  const closeHint = () => {
    const key = hint[0];
    setHint(hint.slice(1));
    void safe(() => sim.run("seen", [key]));
  };
  return (
    <>
      <header className="app-header">
        <Brand />
        <nav aria-label="主导航">
          <a href="#market" className={page === "market" ? "active" : ""}>
            <Activity size={17} />
            交易市场
          </a>
          <a href="#lab" className={page === "lab" ? "active" : ""}>
            <FlaskConical size={17} />
            交易实验室<span className="nav-new">6</span>
          </a>
          <a href="#review" className={page === "review" ? "active" : ""}>
            <History size={17} />
            交易复盘
          </a>
        </nav>
        <div className="header-right">
          <GameClock
            time={game.simTime}
            speed={sim.speed}
            busy={busy}
            inLab={page === "lab"}
            onSpeed={(value) => safe(() => sim.setSpeed(value))}
            onSkip={() => safe(sim.skip)}
            onRules={() => setModal("rules")}
          />
          <span className="saved-state">
            <HardDrive size={15} />
            {sim.saved ? "已存于此浏览器" : "正在保存"}
          </span>
          <button
            className="icon-button"
            aria-label="设置与存档"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={19} />
          </button>
          <span className="user-avatar">纸</span>
        </div>
      </header>
      <main className={`app-main ${page === "market" ? "compact-market" : ""}`}>
        {sim.notice && (
          <div className="notice" role="status">
            <Bell size={16} />
            <span>{sim.notice}</span>
            <button
              className="icon-button"
              aria-label="关闭通知"
              onClick={() => sim.setNotice("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {page === "lab" ? (
          <Lab />
        ) : page === "review" ? (
          <Review game={game} reset={() => setModal("reset")} />
        ) : (
          <>
            <div className="account-cards">
              <section className="account-card balance">
                <div>
                  <span>
                    账户净资产{" "}
                    <button
                      className="inline-help"
                      aria-label="账户计算规则"
                      onClick={() => setModal("rules")}
                    >
                      <InfoIcon />
                    </button>
                  </span>
                  <Wallet size={18} />
                </div>
                <strong>
                  <small>¥</small> {money(m.equity)}
                </strong>
                <footer>
                  <span>本轮收益率</span>
                  <b className={m.pnl >= 0 ? "up" : "down"}>
                    {pct((m.pnl / game.initial) * 100)}
                  </b>
                  <Sparkline
                    values={game.equity.map((e) => e.value)}
                    positive={m.pnl >= 0}
                  />
                </footer>
              </section>
              <section className="account-card">
                <div>
                  <span>累计盈亏</span>
                  <ArrowUpRight size={18} />
                </div>
                <strong className={m.pnl >= 0 ? "up" : "down"}>
                  <small>{m.pnl >= 0 ? "+" : "−"} ¥</small>{" "}
                  {money(Math.abs(m.pnl))}
                </strong>
                <footer>
                  <span>浮动盈亏</span>
                  <b className={m.unrealized >= 0 ? "up" : "down"}>
                    {m.unrealized >= 0 ? "+" : ""}
                    {money(m.unrealized)}
                  </b>
                </footer>
              </section>
              <section className="account-card">
                <div>
                  <span>可用资金</span>
                  <Wallet size={18} />
                </div>
                <strong>
                  <small>¥</small> {money(m.available)}
                </strong>
                <footer>
                  <span>借款本金</span>
                  <b>¥ {money(m.debt + Math.max(0, -game.cash))}</b>
                </footer>
              </section>
              <section className="account-card">
                <div>
                  <span>账户敞口</span>
                  <ShieldCheck size={18} />
                </div>
                <strong>
                  {Number.isFinite(m.leverage) ? m.leverage.toFixed(2) : "∞"}
                  <small> × 净资产</small>
                </strong>
                <footer>
                  <span>保证金比例</span>
                  <b className={m.margin <= 0.3 ? "down" : ""}>
                    {Number.isFinite(m.margin)
                      ? (m.margin * 100).toFixed(1) + "%"
                      : "—"}
                  </b>
                </footer>
              </section>
            </div>
            {!open && (
              <div className="closed-banner">
                <span className="moon-icon">☾</span>
                <div>
                  <strong>市场也需要休息一下</strong>
                  <span>
                    下次开市 {formatDate(nextOpen(game.simTime))} ·
                    休市期间仍会计入资金成本
                  </span>
                </div>
                <button disabled={busy} onClick={() => void safe(sim.skip)}>
                  前往下一次开市 <SkipForward size={15} />
                </button>
              </div>
            )}
            {game.bankrupt && (
              <div className="bankrupt-banner">
                <strong>本轮已资不抵债，所有成交记录已保留。</strong>
                <a href="#review">
                  查看本轮复盘 <ArrowRight size={16} />
                </a>
                <button onClick={() => setModal("reset")}>开启新一轮</button>
              </div>
            )}
            <div className="dashboard">
              <aside className="panel watchlist">
                <div className="panel-heading">
                  <h2>
                    市场观察<span>15</span>
                  </h2>
                  <button
                    className="icon-button"
                    aria-label="市场规则"
                    onClick={() => setModal("rules")}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </div>
                <div className="watch-tabs">
                  <button
                    className={watchTab === "all" ? "active" : ""}
                    onClick={() => setWatchTab("all")}
                  >
                    全部股票
                  </button>
                  <button
                    className={watchTab === "favorites" ? "active" : ""}
                    onClick={() => setWatchTab("favorites")}
                  >
                    <Star size={13} />
                    自选
                  </button>
                </div>
                <div className="search-field">
                  <Search size={15} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索名称 / 代码"
                    aria-label="搜索股票"
                  />
                  <span>⌕</span>
                </div>
                <div className="watch-columns">
                  <span>公司 / 走势</span>
                  <select
                    aria-label="股票排序"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="default">价格 / 涨跌幅</option>
                    <option value="change">涨跌幅 ↓</option>
                    <option value="price">价格 ↓</option>
                  </select>
                </div>
                <div className="stock-list">
                  {stocks.map((s) => {
                    const co = company(s.id),
                      change = (s.price / s.previousClose - 1) * 100;
                    return (
                      <button
                        key={s.id}
                        className={`stock-row ${selected === s.id ? "selected" : ""}`}
                        onClick={() => {
                          setSelected(s.id);
                          setRequestedSide(null);
                        }}
                      >
                        <span className="stock-name">
                          <strong>{co.name}</strong>
                          <small>
                            {co.symbol}
                            {game.favorites.includes(s.id) && (
                              <Star size={9} fill="currentColor" />
                            )}
                          </small>
                        </span>
                        <Sparkline
                          values={s.candles.slice(-40).map((b) => b.close)}
                          positive={change >= 0}
                        />
                        <span className="stock-price">
                          <strong>{s.price.toFixed(2)}</strong>
                          <small className={change >= 0 ? "up" : "down"}>
                            {pct(change)}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                  {!stocks.length && (
                    <div className="empty small">
                      <Search size={22} />
                      <p>
                        {watchTab === "favorites"
                          ? "暂无匹配自选，点击公司名称旁的星标即可添加。"
                          : "没有匹配的公司"}
                      </p>
                    </div>
                  )}
                </div>
                <div className="market-breadth">
                  <span>
                    <i className="live-dot" />
                    全市场平均涨跌
                  </span>
                  <strong className={marketAvg >= 0 ? "up" : "down"}>
                    {pct(marketAvg)}
                  </strong>
                  <div>
                    <i
                      style={{
                        width: `${(game.stocks.filter((s) => s.price >= s.previousClose).length / 15) * 100}%`,
                      }}
                    />
                  </div>
                  <small>
                    {
                      game.stocks.filter((s) => s.price >= s.previousClose)
                        .length
                    }{" "}
                    家上涨{" "}
                    <span>
                      {
                        game.stocks.filter((s) => s.price < s.previousClose)
                          .length
                      }{" "}
                      家下跌
                    </span>
                  </small>
                </div>
              </aside>
              <div className="center-column">
                <section className="panel chart-panel">
                  <div className="stock-header">
                    <div
                      className="company-avatar"
                      style={{ background: c.color }}
                    >
                      {c.name[0]}
                    </div>
                    <div>
                      <h2>
                        <button onClick={() => setModal("company")}>
                          {c.name}
                          <ChevronRight size={16} />
                        </button>
                        <button
                          className={`favorite-button ${game.favorites.includes(selected) ? "favorited" : ""}`}
                          aria-label={
                            game.favorites.includes(selected)
                              ? "取消自选"
                              : "加入自选"
                          }
                          onClick={() =>
                            void safe(() => sim.run("favorite", selected))
                          }
                        >
                          <Star
                            size={17}
                            fill={
                              game.favorites.includes(selected)
                                ? "currentColor"
                                : "none"
                            }
                          />
                        </button>
                      </h2>
                      <span>
                        {c.symbol}
                        <i /> {c.sector}
                      </span>
                    </div>
                    <div className="stock-header-price">
                      <strong>{stock.price.toFixed(2)}</strong>
                      <span className={change >= 0 ? "up" : "down"}>
                        {change >= 0 ? "+" : ""}
                        {(stock.price - stock.previousClose).toFixed(2)}
                        <b>{pct(change)}</b>
                      </span>
                    </div>
                  </div>
                  <div className="quote-stats">
                    <div>
                      <span>
                        {parts(day.time).key === parts(game.simTime).key
                          ? "今开"
                          : "上次开"}
                      </span>
                      <b>{day.open.toFixed(2)}</b>
                    </div>
                    <div>
                      <span>最高</span>
                      <b className="up">{day.high.toFixed(2)}</b>
                    </div>
                    <div>
                      <span>最低</span>
                      <b className="down">{day.low.toFixed(2)}</b>
                    </div>
                    <div>
                      <span>昨收</span>
                      <b>{stock.previousClose.toFixed(2)}</b>
                    </div>
                    <div>
                      <span>成交量</span>
                      <b>
                        {(day.volume / 10000).toFixed(1)}
                        <small>万</small>
                      </b>
                    </div>
                  </div>
                  <div className="chart-toolbar">
                    <div className="chart-periods">
                      <button
                        className={period === "intraday" ? "active" : ""}
                        onClick={() => {
                          setPeriod("intraday");
                          setChartMode("line");
                        }}
                      >
                        分时
                      </button>
                      <button
                        className={period === "1m" ? "active" : ""}
                        onClick={() => {
                          setPeriod("1m");
                          setChartMode("candle");
                        }}
                      >
                        1 分钟
                      </button>
                      <button
                        className={period === "5m" ? "active" : ""}
                        onClick={() => {
                          setPeriod("5m");
                          setChartMode("candle");
                        }}
                      >
                        5 分钟
                      </button>
                      <button
                        className={period === "day" ? "active" : ""}
                        onClick={() => {
                          setPeriod("day");
                          setChartMode("candle");
                        }}
                      >
                        日 K
                      </button>
                    </div>
                    <div>
                      <button
                        className="icon-button"
                        aria-label="切换折线与K线"
                        onClick={() =>
                          setChartMode(
                            chartMode === "candle" ? "line" : "candle",
                          )
                        }
                      >
                        <BarChart3 size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="放大行情图"
                        onClick={() => setModal("chart")}
                      >
                        <Maximize2 size={15} />
                      </button>
                    </div>
                  </div>
                  <CandleChart
                    maxBars={period === "intraday" ? 240 : 72}
                    candles={
                      period === "intraday"
                        ? todayBars.length
                          ? todayBars
                          : stock.candles.slice(-240)
                        : chartBars
                    }
                    previousClose={stock.previousClose}
                    trades={game.trades.filter((t) => t.stockId === selected)}
                    mode={chartMode}
                  />
                  <div className="company-strip">
                    <span>
                      <Leaf size={14} />
                      {c.intro}
                    </span>
                    <button onClick={() => setModal("company")}>
                      公司档案
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </section>
                <section className="panel positions-panel">
                  <div className="positions-heading">
                    <div className="content-tabs">
                      <button
                        className={lowerTab === "positions" ? "active" : ""}
                        onClick={() => setLowerTab("positions")}
                      >
                        我的持仓 <span>{game.positions.length}</span>
                      </button>
                      <button
                        className={lowerTab === "trades" ? "active" : ""}
                        onClick={() => setLowerTab("trades")}
                      >
                        成交记录
                      </button>
                      <button
                        className={lowerTab === "account" ? "active" : ""}
                        onClick={() => setLowerTab("account")}
                      >
                        资金明细
                      </button>
                    </div>
                    <a href="#review" className="text-button">
                      复盘
                      <ArrowUpRight size={14} />
                    </a>
                  </div>
                  {lowerTab === "trades" ? (
                    <TradeTable game={game} />
                  ) : lowerTab === "account" ? (
                    <dl className="account-breakdown">
                      {[
                        ["现金余额", game.cash],
                        ["多头市值", m.longValue],
                        ["融资本金", m.debt],
                        ["做空保证金", m.collateral],
                        ["受限卖出所得", m.proceeds],
                        ["空头回补市值", m.shortValue],
                        ["累计资金成本", game.interest],
                        ["累计手续费", game.fees],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>¥ {money(Number(value))}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : game.positions.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>股票 / 方向</th>
                            <th>持仓 / 成本</th>
                            <th>现价</th>
                            <th>浮动盈亏</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {game.positions.map((p) => {
                            const s = game.stocks.find((s) => s.id === p.id)!,
                              pnl = p.quantity * (s.price - p.average);
                            return (
                              <tr key={p.id}>
                                <td>
                                  <button
                                    className="table-stock"
                                    onClick={() => setSelected(p.id)}
                                  >
                                    {company(p.id).name}
                                  </button>
                                  <small
                                    className={`position-direction ${p.quantity > 0 ? "up" : "down"}`}
                                  >
                                    {p.quantity > 0 ? "多头" : "空头"}
                                  </small>
                                </td>
                                <td>
                                  {Math.abs(p.quantity)} 股
                                  <small className="muted block">
                                    {p.average.toFixed(2)}
                                  </small>
                                </td>
                                <td>{s.price.toFixed(2)}</td>
                                <td className={pnl >= 0 ? "up" : "down"}>
                                  {pnl >= 0 ? "+" : ""}
                                  {money(pnl)}
                                </td>
                                <td>
                                  <button
                                    className="close-position"
                                    onClick={() => {
                                      setSelected(p.id);
                                      setRequestedSide({
                                        side: p.quantity > 0 ? "sell" : "cover",
                                        token: Date.now(),
                                      });
                                    }}
                                  >
                                    {p.quantity > 0 ? "卖出" : "平空"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty-position">
                      <span className="empty-position-icon">
                        <Wallet size={26} />
                        <i>
                          <Sparkles size={12} />
                        </i>
                      </span>
                      <div>
                        <strong>故事，从第一笔交易开始</strong>
                        <p>挑选一家感兴趣的公司，你的持仓会出现在这里。</p>
                        <a href="#lab">
                          先去实验室看看 <ArrowRight size={13} />
                        </a>
                      </div>
                    </div>
                  )}
                  {hint.length > 0 && (
                    <div className="context-hint" role="status">
                      <span>
                        <BookOpen size={17} />
                      </span>
                      <div>
                        <strong>{HINTS[hint[0]][0]}</strong>
                        <p>{HINTS[hint[0]][1]}</p>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="关闭本次说明"
                        onClick={closeHint}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}
                </section>
                <a href="#lab" className="lab-promo">
                  <span className="promo-icon">
                    <FlaskConical size={24} />
                  </span>
                  <div>
                    <span>好奇，是很好的起点</span>
                    <strong>在交易实验室，把「听说过」变成「看懂了」。</strong>
                  </div>
                  <span className="promo-arrow">
                    <ArrowRight size={20} />
                  </span>
                </a>
              </div>
              <aside className="right-column">
                <OrderPanel
                  game={game}
                  selected={selected}
                  busy={busy}
                  onTrade={trade}
                  requestedSide={requestedSide}
                />
                <section className="panel news-panel">
                  <div className="panel-heading">
                    <h2>市场来信</h2>
                    <span className="news-tag">虚构事件</span>
                  </div>
                  <div className="news-list">
                    {game.news.slice(0, 5).map((n) => (
                      <button
                        key={n.id}
                        className="news-item"
                        onClick={() => {
                          if (n.stockId) {
                            setSelected(n.stockId);
                            setModal("company");
                          } else setToast(n.body);
                        }}
                      >
                        <span className="news-time">
                          <i />
                          {formatDate(n.time)}
                        </span>
                        <strong>{n.title}</strong>
                        <p>{n.body}</p>
                      </button>
                    ))}
                  </div>
                  <div className="news-footer">
                    消息是故事的一部分，价格由市场演进。
                  </div>
                </section>
              </aside>
            </div>
          </>
        )}
        <footer className="app-footer">
          <span>
            <span className="footer-brand">纸上交易所</span>
            一个关于选择与可能性的模拟市场
          </span>
          <span>
            <i className="live-dot" />
            本地存档 <i />
            全部公司与行情均为虚构{" "}
            <button onClick={() => setModal("rules")}>
              游戏规则 <ChevronDown size={12} />
            </button>
          </span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal === "company" && (
        <Modal title={`${c.name} · 公司档案`} onClose={() => setModal(null)}>
          <div className="company-modal-head">
            <div className="company-avatar" style={{ background: c.color }}>
              {c.name[0]}
            </div>
            <div>
              <strong>
                {c.symbol} · {c.sector}
              </strong>
              <p>{c.intro}</p>
            </div>
          </div>
          <div className="company-facts">
            <span>
              当前报价<strong>¥ {stock.price.toFixed(2)}</strong>
            </span>
            <span>
              近 20 个交易日振幅
              <strong>
                {(() => {
                  const d = stock.daily.slice(-20);
                  return (
                    (Math.max(...d.map((b) => b.high)) /
                      Math.min(...d.map((b) => b.low)) -
                      1) *
                    100
                  ).toFixed(1);
                })()}
                %
              </strong>
            </span>
          </div>
          <h3 className="modal-subtitle">已发布的公司动态</h3>
          <div className="company-news">
            {game.news
              .filter((n) => n.stockId === selected)
              .slice(0, 8)
              .map((n) => (
                <article key={n.id}>
                  <small>{formatDate(n.time, true)}</small>
                  <h4>{n.title}</h4>
                  <p>{n.body}</p>
                </article>
              ))}
            {!game.news.some((n) => n.stockId === selected) && (
              <p className="muted">近期暂无公司公告。</p>
            )}
          </div>
          <p className="footnote">
            经营事件可能改变后续行情特征；公告本身不承诺涨跌方向。
          </p>
        </Modal>
      )}
      {modal === "chart" && (
        <Modal
          wide
          title={`${c.name} · ${period === "day" ? "日 K" : "行情图"}`}
          onClose={() => setModal(null)}
        >
          <CandleChart
            maxBars={period === "intraday" ? 240 : 72}
            candles={
              period === "intraday"
                ? todayBars.length
                  ? todayBars
                  : stock.candles.slice(-240)
                : chartBars
            }
            previousClose={stock.previousClose}
            trades={game.trades.filter((t) => t.stockId === selected)}
            mode={chartMode}
          />
        </Modal>
      )}
      {modal === "settings" && (
        <Modal title="偏好与本地存档" onClose={() => setModal(null)}>
          <div className="settings-section">
            <h3>行情配色</h3>
            <p>颜色之外，涨跌也会用正负号表达。</p>
            <div className="palette-options">
              <button
                className={palette === "green" ? "selected" : ""}
                onClick={() => setPalette("green")}
              >
                <i style={{ background: "#348b76" }} />
                <i style={{ background: "#d77f67" }} />
                青绿涨 · 珊瑚跌
              </button>
              <button
                className={palette === "red" ? "selected" : ""}
                onClick={() => setPalette("red")}
              >
                <i style={{ background: "#c65c60" }} />
                <i style={{ background: "#368b78" }} />
                红涨 · 绿跌
              </button>
            </div>
          </div>
          <div className="settings-section">
            <h3>存档管理</h3>
            <p>
              自动保存于当前浏览器，不会自动跨设备同步。清理网站数据会移除存档，导出文件可用于备份。
            </p>
            <div className="settings-buttons">
              <button
                className="button secondary"
                onClick={() => {
                  exportSave(game);
                  setToast("存档文件已生成");
                }}
              >
                <Download size={16} />
                导出存档
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => importInput.current?.click()}
              >
                <Upload size={16} />
                导入存档
              </button>
            </div>
            <small className="muted">
              存档版本 1 · {game.tradeCount} 笔成交 ·{" "}
              {formatDate(game.simTime, true)}
            </small>
          </div>
          <div className="settings-section">
            <h3>重新开始</h3>
            <p>
              归档本轮的结算摘要，以新的随机市场与 10
              万虚拟资金开始。教程完成进度会保留。
            </p>
            <button
              className="button secondary"
              onClick={() => setModal("reset")}
            >
              <History size={16} />
              归档并开启新一轮
            </button>
          </div>
          <button className="text-button" onClick={() => setModal("rules")}>
            查看完整游戏规则 <ArrowRight size={14} />
          </button>
        </Modal>
      )}
      {modal === "reset" && (
        <Modal title="开启一段新的市场故事？" onClose={() => setModal(null)}>
          <p className="modal-copy">
            本轮净资产 <strong>¥ {money(m.equity)}</strong>，共完成{" "}
            <strong>{game.tradeCount}</strong>{" "}
            笔交易。重新开始将清空当前持仓，保存结算摘要。新一轮从现实当前时间开始，使用全新行情。
          </p>
          <p className="footnote">
            完整成交明细不会进入轮次摘要；如需保留，可以先导出当前存档。
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => exportSave(game)}
            >
              <Download size={15} />
              先导出
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void safe(async () => {
                  await sim.run("reset", {
                    seed: crypto.getRandomValues(new Uint32Array(1))[0],
                  });
                  await sim.setSpeed(1);
                  setModal(null);
                  setHint([]);
                  movementPrice.current = null;
                  location.hash = "market";
                  setToast("新一轮已开启，初始资金 ¥ 100,000");
                })
              }
            >
              确认开启新一轮 <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
      {modal === "rules" && (
        <Modal title="这座交易所如何运行" onClose={() => setModal(null)} wide>
          <div className="rules-grid">
            <article>
              <Clock3 size={23} />
              <h3>时间与开休市</h3>
              <p>
                固定 UTC+8，周一至周五 09:30–11:30、13:00–15:00
                交易，不接入现实节假日。在线可加速；切到后台后倍率回到 1×。
              </p>
              <p>
                离线后，以已保存游戏时间加上现实离开时长恢复。推进到开市会真实补算中间的费用和行情；游戏日期不会重新对齐现实。
              </p>
            </article>
            <article>
              <ArrowDownUpIcon />
              <h3>成交与资金</h3>
              <p>
                整数股交易，市价单按当前分钟报价加 0.03%
                不利滑点成交。每笔手续费 0.1%，最低 1
                元。图表中的分钟影线不代表额外撮合报价。
              </p>
              <p>
                多头融资年费率 10%，空头借券年费率 5%，按 365
                天与游戏自然时间计算，休市照常计费。做空所得与保证金都锁定，平空后结算。
              </p>
            </article>
            <article>
              <ShieldCheck size={23} />
              <h3>保证金与轮次结束</h3>
              <p>
                开仓后总敞口不得超过净资产 3
                倍。同一股票不能同时持有多头和空头。
              </p>
              <p>
                保证金比例 = 净资产 ÷ 多空总敞口。小于等于 25%
                时在下一次可成交报价全部强平，包括离线期间；跳空可能导致资不抵债。净资产小于等于零时本轮结束。
              </p>
            </article>
            <article>
              <FlaskConical size={23} />
              <h3>行情与学习</h3>
              <p>
                15
                家公司及新闻均为虚构。个股与市场随机因素共同生成价格，事件可能改变后续波动特征，不会根据你的交易方向操纵行情。
              </p>
              <p>
                仅首次买入、做空、使用杠杆和浮盈浮亏变化有简短说明。其他机制在独立实验室演示，主游戏不提供买卖建议。
              </p>
            </article>
          </div>
          <div className="equity-formula">
            净资产 = 现金 + 多头市值 − 融资本金 + 做空保证金 + 受限卖出所得 −
            空头回补市值
          </div>
          <p className="footnote">
            本游戏为简化的教学规则，不复刻任何真实交易所。存档位于浏览器，无法防止自行修改系统时间或文件。每个存档仅允许一个标签页运行。
          </p>
        </Modal>
      )}
      {fileInput}
    </>
  );
}
function InfoIcon() {
  return <CircleHelp size={12} />;
}
function ArrowDownUpIcon() {
  return <Activity size={23} />;
}
