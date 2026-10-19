import { useEffect, useRef, useState } from "react";
import { Clock3, SkipForward, X } from "lucide-react";
import { formatDate, isOpen, nextOpen } from "../simulation/clock.ts";

type Props = {
  time: number;
  speed: number;
  busy: boolean;
  inLab: boolean;
  onSpeed: (speed: number) => Promise<void>;
  onSkip: () => Promise<void>;
  onRules: () => void;
};

export function GameClock({
  time,
  speed,
  busy,
  inLab,
  onSpeed,
  onSkip,
  onRules,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const stamp = formatDate(time, true);
  const open = isOpen(time);
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setExpanded(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [expanded]);
  return (
    <div className="header-clock" ref={root}>
      <button
        ref={trigger}
        className={`clock-trigger ${expanded ? "expanded" : ""}`}
        aria-label={`游戏时间 ${stamp}，点击展开时间设置`}
        aria-expanded={expanded}
        aria-controls="game-clock-details"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="clock-year">{stamp.slice(0, 5)}</span>
        {stamp.slice(5)}
      </button>
      {expanded && (
        <section
          id="game-clock-details"
          className="clock-popover"
          role="dialog"
          aria-label="游戏时间设置"
        >
          <div className="clock-popover-heading">
            <span>
              <Clock3 size={16} />
              游戏时钟
            </span>
            <button
              className="icon-button"
              aria-label="收起时间设置"
              onClick={() => {
                setExpanded(false);
                trigger.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          </div>
          <div className="clock-full-time">
            {stamp}
            <span>UTC+8</span>
          </div>
          <div className="clock-market-info">
            <span className={`market-status ${open ? "is-open" : ""}`}>
              <i />
              {open ? "交易中" : "休市中"}
            </span>
            <span>
              {open
                ? "周一至周五 · 09:30–11:30 / 13:00–15:00"
                : `下次开市 ${formatDate(nextOpen(time))}`}
            </span>
          </div>
          <div className="time-controls">
            <span>时间流速</span>
            {[1, 10, 60, 600].map((value) => (
              <button
                key={value}
                disabled={busy || inLab}
                className={speed === value ? "selected" : ""}
                onClick={() => void onSpeed(value)}
              >
                {value}×
              </button>
            ))}
          </div>
          <p className="clock-explanation">
            {inLab
              ? "实验室使用独立时间轴，主市场保持 1× 运行。"
              : "加速仅在前台生效。切到后台会回到 1×，下次进入按现实离开时长补算。"}
          </p>
          <div className="clock-popover-footer">
            <button
              className="text-button"
              onClick={() => {
                setExpanded(false);
                onRules();
              }}
            >
              完整时间规则
            </button>
            {!open && (
              <button
                className="clock-skip"
                disabled={busy || inLab}
                onClick={() => void onSkip()}
              >
                前往开市
                <SkipForward size={14} />
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
