import { useId, useState } from "react";
import type { Candle, Trade } from "../simulation/types.ts";
import { DAY, dayStart, formatClock, formatDate } from "../simulation/clock.ts";
export function Sparkline({
  values,
  positive = true,
  width = 80,
  height = 30,
}: {
  values: number[];
  positive?: boolean;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || 1;
  const points = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * width},${height - 3 - ((v - min) / range) * (height - 6)}`,
    )
    .join(" ");
  return (
    <svg
      className={`sparkline ${positive ? "up" : "down"}`}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
export function CandleChart({
  candles,
  trades = [],
  previousClose,
  mode = "candle",
  maxBars = 72,
}: {
  candles: Candle[];
  trades?: Trade[];
  previousClose: number;
  mode?: "candle" | "line";
  maxBars?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const bars = candles.slice(-maxBars);
  const gradientId = useId();
  const W = 820,
    H = 320,
    left = 10,
    right = 63,
    top = 28,
    bottom = 248;
  if (!bars.length) return <div className="empty">正在等待第一笔行情</div>;
  const low = Math.min(...bars.map((b) => b.low)),
    high = Math.max(...bars.map((b) => b.high));
  const pad = Math.max((high - low) * 0.15, high * 0.001);
  const min = low - pad,
    max = high + pad;
  const y = (v: number) => top + ((max - v) / (max - min)) * (bottom - top);
  const step = (W - left - right) / bars.length;
  const x = (i: number) => left + (i + 0.5) * step;
  const last = bars.at(-1)!;
  const volume = Math.max(1, ...bars.map((b) => b.volume));
  const daily = bars.length > 1 && bars[1].time - bars[0].time >= DAY;
  const multipleDays = dayStart(bars[0].time) !== dayStart(last.time);
  const lastEnd = daily
    ? dayStart(last.time) + DAY
    : last.time +
      (bars.length > 1
        ? Math.min(5 * 60000, bars[1].time - bars[0].time)
        : 60000);
  const index =
    hover !== null ? Math.min(bars.length - 1, hover) : bars.length - 1;
  const selected = bars[index];
  const positive = last.close >= previousClose;
  const points = bars.map((b, i) => `${x(i)},${y(b.close)}`).join(" ");
  return (
    <div className="chart-wrap">
      <div className="ohlc">
        <span>{formatDate(selected.time)}</span>
        <span>
          开 <b>{selected.open.toFixed(2)}</b>
        </span>
        <span>
          高 <b>{selected.high.toFixed(2)}</b>
        </span>
        <span>
          低 <b>{selected.low.toFixed(2)}</b>
        </span>
        <span>
          收{" "}
          <b className={selected.close >= selected.open ? "up" : "down"}>
            {selected.close.toFixed(2)}
          </b>
        </span>
      </div>
      <svg
        className="candle-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`价格图，最近 ${bars.length} 个周期，最新价格 ${last.close.toFixed(2)}`}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          setHover(
            Math.max(
              0,
              Math.min(bars.length - 1, Math.floor((px - left) / step)),
            ),
          );
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--up)" stopOpacity=".17" />
            <stop offset="100%" stopColor="var(--up)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((i) => {
          const value = max - (i / 4) * (max - min);
          return (
            <g key={i}>
              <line
                x1={left}
                x2={W - right + 3}
                y1={y(value)}
                y2={y(value)}
                className="gridline"
              />
              <text x={W - right + 12} y={y(value) + 4} className="axis-text">
                {value.toFixed(2)}
              </text>
            </g>
          );
        })}
        {previousClose >= min && previousClose <= max && (
          <line
            x1={left}
            x2={W - right}
            y1={y(previousClose)}
            y2={y(previousClose)}
            stroke="var(--muted)"
            strokeDasharray="3 5"
            opacity=".4"
          />
        )}
        {mode === "line" ? (
          <g>
            <polygon
              points={`${x(0)},${bottom} ${points} ${x(bars.length - 1)},${bottom}`}
              fill={`url(#${gradientId})`}
            />
            <polyline
              points={points}
              stroke={positive ? "var(--up)" : "var(--down)"}
              strokeWidth="2"
              fill="none"
            />
          </g>
        ) : (
          bars.map((b, i) => (
            <g
              key={b.time}
              fill={b.close >= b.open ? "var(--up)" : "var(--down)"}
              stroke={b.close >= b.open ? "var(--up)" : "var(--down)"}
            >
              <line
                x1={x(i)}
                x2={x(i)}
                y1={y(b.high)}
                y2={y(b.low)}
                strokeWidth="1"
              />
              <rect
                x={x(i) - step * 0.29}
                width={step * 0.58}
                y={Math.min(y(b.open), y(b.close))}
                height={Math.max(1.5, Math.abs(y(b.open) - y(b.close)))}
                rx=".8"
                stroke="none"
              />
            </g>
          ))
        )}
        {bars.map((b, i) => (
          <rect
            key={`v-${b.time}`}
            x={x(i) - step * 0.3}
            y={294 - (b.volume / volume) * 30}
            width={step * 0.6}
            height={(b.volume / volume) * 30}
            fill={b.close >= b.open ? "var(--up)" : "var(--down)"}
            opacity=".28"
            rx="1"
          />
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const i = Math.floor(f * (bars.length - 1));
          return (
            <text
              key={f}
              x={x(i)}
              y={313}
              textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
              className="axis-text"
            >
              {daily
                ? formatDate(bars[i].time).slice(0, 5)
                : multipleDays
                  ? formatDate(bars[i].time)
                  : formatClock(bars[i].time)}
            </text>
          );
        })}
        <line
          x1={left}
          x2={W - right}
          y1={y(last.close)}
          y2={y(last.close)}
          stroke={positive ? "var(--up)" : "var(--down)"}
          strokeDasharray="3 4"
          opacity=".6"
        />
        <rect
          x={W - right + 2}
          y={y(last.close) - 10}
          width="60"
          height="20"
          rx="4"
          fill={positive ? "var(--up)" : "var(--down)"}
        />
        <text
          x={W - right + 32}
          y={y(last.close) + 4}
          textAnchor="middle"
          fill="white"
          fontSize="10"
        >
          {last.close.toFixed(2)}
        </text>
        {trades
          .filter((t) => t.time >= bars[0].time && t.time < lastEnd)
          .slice(0, 20)
          .map((t) => {
            const i = bars.findIndex(
              (b, i) =>
                b.time <= t.time && (!bars[i + 1] || bars[i + 1].time > t.time),
            );
            if (i < 0) return null;
            return (
              <g key={t.id}>
                <circle
                  cx={x(i)}
                  cy={y(bars[i].low) + 11}
                  r="7"
                  fill="var(--ink)"
                />
                <text
                  x={x(i)}
                  y={y(bars[i].low) + 14}
                  fill="white"
                  textAnchor="middle"
                  fontSize="8"
                >
                  {t.side === "buy" || t.side === "cover" ? "B" : "S"}
                </text>
              </g>
            );
          })}
        {hover !== null && (
          <g>
            <line
              x1={x(index)}
              x2={x(index)}
              y1={top}
              y2={294}
              stroke="var(--muted)"
              strokeDasharray="4 4"
            />
            <circle
              cx={x(index)}
              cy={y(selected.close)}
              r="4"
              fill="var(--paper)"
              stroke="var(--ink)"
            />
          </g>
        )}
      </svg>
      <div className="chart-caption">
        <span>
          <i className="legend-dot" />
          成交量 <b>{(selected.volume / 10000).toFixed(2)} 万股</b>
        </span>
        <span>截至 {formatDate(last.time)} · UTC+8</span>
      </div>
    </div>
  );
}
