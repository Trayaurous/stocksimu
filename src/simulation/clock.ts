export const MINUTE = 60_000;
export const DAY = 86_400_000;
const OFFSET = 8 * 60 * MINUTE;
export function parts(time: number) {
  const d = new Date(time + OFFSET);
  return {
    day: d.getUTCDay(),
    minute: d.getUTCHours() * 60 + d.getUTCMinutes(),
    key: d.toISOString().slice(0, 10),
  };
}
export function dayStart(time: number) {
  return Math.floor((time + OFFSET) / DAY) * DAY - OFFSET;
}
export function isOpen(time: number) {
  const { day, minute } = parts(time);
  return (
    day >= 1 &&
    day <= 5 &&
    ((minute >= 570 && minute < 690) || (minute >= 780 && minute < 900))
  );
}
export function nextOpen(time: number) {
  let start = dayStart(time);
  for (let i = 0; i < 8; i++, start += DAY) {
    if ([0, 6].includes(parts(start).day)) continue;
    for (const min of [570, 780]) {
      const candidate = start + min * MINUTE;
      if (candidate > time) return candidate;
    }
  }
  throw new Error("交易日历异常");
}
export function nextQuote(time: number) {
  const next = (Math.floor(time / MINUTE) + 1) * MINUTE;
  return isOpen(next) ? next : nextOpen(time);
}
export function formatDate(time: number, full = false) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    ...(full ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(time);
}
export function formatClock(time: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(time);
}
