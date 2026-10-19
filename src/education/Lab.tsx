import { useState } from "react";
import {
  ArrowRight,
  Check,
  FlaskConical,
  Play,
  RotateCcw,
  BookOpen,
} from "lucide-react";
import { LESSONS } from "./lessons.ts";
import { createGame } from "../simulation/market.ts";
import {
  checkMargin,
  execute,
  metrics,
  recordEquity,
} from "../trading/engine.ts";
import type { Game } from "../simulation/types.ts";
import { Sparkline } from "../components/Chart.tsx";
const money = (v: number) =>
  v.toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
function setup(lesson: (typeof LESSONS)[number], leverage: number) {
  const g = createGame(Date.parse("2026-10-19T10:00:00+08:00"), 20261019);
  g.stocks[0].price = 100;
  g.stocks[0].previousClose = 100;
  const qty =
    lesson.id === "margin" || lesson.id === "gap"
      ? Math.floor((2900 * leverage) / 3)
      : 300 * leverage;
  execute(g, g.stocks[0].id, lesson.side, qty, leverage);
  return g;
}
export function Lab() {
  const [selected, setSelected] = useState(0);
  const lesson = LESSONS[selected];
  const [leverage, setLeverage] = useState(1);
  const [step, setStep] = useState(0);
  const [game, setGame] = useState<Game>(() => setup(LESSONS[0], 1));
  const [baseline, setBaseline] = useState<Game>(() => setup(LESSONS[0], 1));
  const [closed, setClosed] = useState(false);
  const [done, setDone] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem("paper-market-lessons") || "[]",
      );
      return Array.isArray(saved)
        ? [
            ...new Set(
              saved.filter(
                (id: unknown): id is string =>
                  typeof id === "string" && LESSONS.some((l) => l.id === id),
              ),
            ),
          ]
        : [];
    } catch {
      return [];
    }
  });
  const reset = (index = selected, lev = LESSONS[index].leverage) => {
    setSelected(index);
    setLeverage(lev);
    setStep(0);
    setClosed(false);
    setGame(setup(LESSONS[index], lev));
    setBaseline(setup(LESSONS[index], 1));
  };
  const next = () => {
    const n = step + 1;
    if (n >= lesson.prices.length) return;
    const update = (old: Game) => {
      const g = structuredClone(old);
      g.simTime += 60000;
      g.stocks[0].price = lesson.prices[n];
      if (lesson.id === "costs") {
        if (g.positions[0])
          execute(g, g.stocks[0].id, "sell", g.positions[0].quantity);
        if (n < lesson.prices.length - 1)
          execute(g, g.stocks[0].id, "buy", 300, 1);
      }
      checkMargin(g);
      recordEquity(g, true);
      return g;
    };
    setGame(update(game));
    setBaseline(update(baseline));
    setStep(n);
    if (n === lesson.prices.length - 1) {
      const completed = [...new Set([...done, lesson.id])];
      setDone(completed);
      try {
        localStorage.setItem("paper-market-lessons", JSON.stringify(completed));
      } catch {
        /* Completion is optional metadata. */
      }
    }
  };
  const close = () => {
    const g = structuredClone(game);
    for (const p of [...g.positions])
      execute(g, p.id, p.quantity > 0 ? "sell" : "cover", Math.abs(p.quantity));
    setGame(g);
    setClosed(true);
  };
  const m = metrics(game);
  const completed = step === lesson.prices.length - 1;
  return (
    <div className="lab-page">
      <div className="page-title">
        <div>
          <div className="eyebrow">LEARN BY DOING</div>
          <h1>让概念，发生在眼前。</h1>
          <p>在可以重来的小实验里，观察交易的每一种可能。</p>
        </div>
        <div className="lab-isolated">
          <FlaskConical size={20} />
          <div>
            <strong>独立实验账户</strong>
            <span>操作不影响主存档 · 主市场按 1× 运行</span>
          </div>
        </div>
      </div>
      <div className="lab-layout">
        <aside className="lesson-list">
          <div className="section-label">
            交易实验室 <span>{done.length} / 6</span>
          </div>
          {LESSONS.map((l, i) => (
            <button
              key={l.id}
              className={`lesson-item ${i === selected ? "selected" : ""}`}
              onClick={() => reset(i)}
            >
              <span className="lesson-number">
                {done.includes(l.id) ? <Check size={17} /> : `0${i + 1}`}
              </span>
              <span>
                <strong>{l.name}</strong>
                <small>{l.tag}</small>
              </span>
              <ArrowRight size={15} />
            </button>
          ))}
          <div className="lab-note">
            <BookOpen size={19} />
            <p>
              没有标准交易答案。
              <br />
              理解规则，再做自己的选择。
            </p>
          </div>
        </aside>
        <section className="lesson-main">
          <div className="lesson-intro">
            <span className="pill purple">
              实验 0{selected + 1} · {lesson.tag}
            </span>
            <h2>{lesson.subtitle}</h2>
            <p>{lesson.description}</p>
          </div>
          <div className="experiment-card">
            <div className="experiment-toolbar">
              <span>
                <i className="live-dot" />
                预设行情 · 可以重播
              </span>
              {lesson.id === "leverage" && (
                <div className="segment">
                  {[1, 2, 3].map((l) => (
                    <button
                      className={leverage === l ? "active" : ""}
                      key={l}
                      onClick={() => reset(selected, l)}
                    >
                      {l}×
                    </button>
                  ))}
                </div>
              )}
              <button
                className="text-button"
                onClick={() => reset(selected, leverage)}
              >
                <RotateCcw size={14} />
                重置实验
              </button>
            </div>
            <div className="experiment-price">
              <span>实验股票</span>
              <strong>
                {lesson.prices[step].toFixed(2)}
                <small>元 / 股</small>
              </strong>
              <span className={lesson.prices[step] >= 100 ? "up" : "down"}>
                {((lesson.prices[step] / 100 - 1) * 100).toFixed(2)}%{" "}
                <small>相对起点</small>
              </span>
            </div>
            <div className="lab-chart">
              <svg
                viewBox="0 0 700 190"
                role="img"
                aria-label={`预设行情，第 ${step + 1} 步，价格 ${lesson.prices[step]} 元`}
              >
                <defs>
                  <linearGradient id="lab-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4c9383" stopOpacity=".18" />
                    <stop offset="100%" stopColor="#4c9383" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[35, 85, 135].map((y) => (
                  <line
                    key={y}
                    x1="25"
                    x2="675"
                    y1={y}
                    y2={y}
                    className="gridline"
                  />
                ))}
                {(() => {
                  const min = Math.min(...lesson.prices) - 8,
                    max = Math.max(...lesson.prices) + 8;
                  const points = lesson.prices
                    .slice(0, step + 1)
                    .map(
                      (p, i) =>
                        `${25 + (i / (lesson.prices.length - 1)) * 650},${155 - ((p - min) / (max - min)) * 130}`,
                    );
                  return (
                    <>
                      <polygon
                        points={`25,170 ${points.join(" ")} ${25 + (step / (lesson.prices.length - 1)) * 650},170`}
                        fill="url(#lab-fill)"
                      />
                      <polyline
                        points={points.join(" ")}
                        fill="none"
                        stroke="#348b76"
                        strokeWidth="3"
                      />
                      {points.map((p, i) => (
                        <circle
                          key={i}
                          cx={p.split(",")[0]}
                          cy={p.split(",")[1]}
                          r={i === step ? 5 : 3}
                          fill={i === step ? "#348b76" : "white"}
                          stroke="#348b76"
                          strokeWidth="2"
                        />
                      ))}
                      {lesson.prices.map((_, i) => (
                        <text
                          key={i}
                          x={25 + (i / (lesson.prices.length - 1)) * 650}
                          y="188"
                          textAnchor="middle"
                          className="axis-text"
                        >
                          {i === 0 ? "开仓" : `第 ${i} 步`}
                        </text>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
            <div className="experiment-metrics">
              <div>
                <span>账户净资产</span>
                <strong>¥ {money(m.equity)}</strong>
              </div>
              <div>
                <span>累计盈亏</span>
                <strong className={m.pnl >= 0 ? "up" : "down"}>
                  {m.pnl >= 0 ? "+" : ""}
                  {money(m.pnl)}
                </strong>
              </div>
              <div>
                <span>保证金比例</span>
                <strong>
                  {Number.isFinite(m.margin)
                    ? (m.margin * 100).toFixed(1) + "%"
                    : "—"}
                </strong>
              </div>
              <div>
                <span>已收手续费</span>
                <strong>¥ {money(game.fees)}</strong>
              </div>
            </div>
            {lesson.id === "leverage" && (
              <div className="comparison">
                <span>相同自有投入 · 1× 对照账户</span>
                <Sparkline
                  values={baseline.equity.map((e) => e.value)}
                  positive={metrics(baseline).pnl >= 0}
                />
                <strong>¥ {money(metrics(baseline).equity)}</strong>
              </div>
            )}
            {game.liquidations > 0 && (
              <div className="experiment-event">
                <strong>
                  {game.bankrupt ? "本轮已资不抵债" : "已触发强制平仓"}
                </strong>
                <span>
                  所有持仓按触发时的可成交报价结算。后续价格变化不会撤销这笔成交。
                </span>
              </div>
            )}
            {closed && (
              <div className="experiment-event">
                <strong>已手动平仓</strong>
                <span>
                  本次持仓结束，实际成交价格已包含滑点，手续费单独计入账户。
                </span>
              </div>
            )}
            <div className="experiment-actions">
              <span>
                {completed
                  ? "实验已完成，可以重播或切换场景"
                  : `步骤 ${step + 1} / ${lesson.prices.length} · 点击后才推进`}
              </span>
              <div>
                {lesson.id === "basics" && game.positions.length > 0 && (
                  <button className="button secondary" onClick={close}>
                    卖出并结算
                  </button>
                )}
                <button
                  className="button primary"
                  onClick={completed ? () => reset(selected, leverage) : next}
                >
                  {completed ? <RotateCcw size={15} /> : <Play size={15} />}{" "}
                  {completed ? "再试一次" : "推进下一步"}
                </button>
              </div>
            </div>
          </div>
          <div className="term-grid">
            {lesson.terms.map(([term, definition]) => (
              <article key={term}>
                <span className="term-mark" />
                <h3>{term}</h3>
                <p>{definition}</p>
              </article>
            ))}
          </div>
          <p className="footnote">
            实验使用固定价格路径与主游戏相同的结算引擎。除费用实验外不自动加仓；为了便于观察，短实验不累计时间利息。分钟行情的影线仅作区间展示，撮合与强平以实际分钟报价为准。
          </p>
        </section>
      </div>
    </div>
  );
}
