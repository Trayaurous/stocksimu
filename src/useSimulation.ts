import { useEffect, useRef, useState } from "react";
import type { Game } from "./simulation/types.ts";
import { formatDate, nextOpen } from "./simulation/clock.ts";
import { loadSave, saveGame } from "./storage/save.ts";
import { validateSave } from "./storage/validate.ts";
export function useSimulation() {
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [speed, setSpeedState] = useState(1);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [saved, setSaved] = useState(0);
  const gameRef = useRef<Game | null>(null);
  const worker = useRef<Worker | null>(null);
  const pending = useRef(
    new Map<
      number,
      { resolve: (g: Game) => void; reject: (e: Error) => void }
    >(),
  );
  const nextId = useRef(0);
  const active = useRef(false);
  const time = useRef({ wall: Date.now(), speed: 1, hidden: document.hidden });
  const lastSave = useRef(0);
  const request = (command: string, payload: unknown): Promise<Game> =>
    new Promise((resolve, reject) => {
      if (!worker.current) {
        reject(new Error("模拟引擎尚未就绪"));
        return;
      }
      const id = ++nextId.current;
      pending.current.set(id, { resolve, reject });
      worker.current.postMessage({ id, command, payload, wall: Date.now() });
    });
  const persist = async (g: Game) => {
    try {
      await saveGame(g);
      setSaved(Date.now());
      lastSave.current = Date.now();
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const settle = async () => {
    const now = Date.now();
    if (!gameRef.current) {
      time.current.wall = now;
      return;
    }
    const elapsed = Math.max(0, now - time.current.wall);
    const multiplier = time.current.hidden ? 1 : time.current.speed;
    const target = gameRef.current.simTime + elapsed * multiplier;
    time.current.wall = now;
    await request("advance", { target });
  };
  useEffect(() => {
    let disposed = false,
      interval: ReturnType<typeof setInterval> | undefined;
    let unlock: (() => void) | undefined;
    const start = async () => {
      worker.current = new Worker(
        new URL("./simulation/worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current.onmessage = (e) => {
        if (disposed) return;
        if (e.data.progress) {
          setNotice(`正在补算离线行情：${formatDate(e.data.progress, true)}`);
          return;
        }
        const p = pending.current.get(e.data.id);
        pending.current.delete(e.data.id);
        if (e.data.error) p?.reject(new Error(e.data.error));
        else {
          gameRef.current = e.data.game;
          setGame(e.data.game);
          p?.resolve(e.data.game);
        }
      };
      worker.current.onerror = () => {
        const error = new Error("模拟引擎加载失败，请刷新页面重试");
        for (const p of pending.current.values()) p.reject(error);
        pending.current.clear();
        setError(error.message);
        setReady(false);
      };
      try {
        const savedGame = await loadSave();
        const elapsed = savedGame
          ? Math.max(0, Date.now() - savedGame.realAt)
          : 0;
        const oldForced = savedGame?.liquidations ?? 0;
        const loaded = await request(
          savedGame ? "restore" : "create",
          savedGame ?? { seed: crypto.getRandomValues(new Uint32Array(1))[0] },
        );
        if (savedGame && elapsed > 60_000)
          setNotice(
            `欢迎回来。已按 1× 补算离线 ${elapsed >= 3600000 ? (elapsed / 3600000).toFixed(1) + " 小时" : Math.floor(elapsed / 60000) + " 分钟"}${loaded.liquidations > oldForced ? "，期间发生了强制平仓，请查看成交记录" : ""}。`,
          );
        else if (savedGame && savedGame.realAt > Date.now() + 60000)
          setNotice(
            "检测到现实时间回拨；游戏不会倒退，将从本次打开的时间重新计时。",
          );
        else setNotice("");
        await persist(loaded);
        setReady(true);
      } catch (e) {
        setError((e as Error).message);
      }
      time.current.wall = Date.now();
      interval = setInterval(async () => {
        if (!gameRef.current || active.current || disposed) return;
        active.current = true;
        try {
          await settle();
          if (Date.now() - lastSave.current > 5000)
            await persist(gameRef.current!);
        } catch (e) {
          setNotice((e as Error).message);
        } finally {
          active.current = false;
        }
      }, 1000);
    };
    if (navigator.locks) {
      void navigator.locks.request(
        "paper-market-active-tab",
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            setLocked(true);
            setError(
              "交易所已在另一个标签页运行。请关闭那个标签页后刷新，避免两份存档互相覆盖。",
            );
            return;
          }
          await new Promise<void>((resolve) => {
            unlock = resolve;
            if (!disposed) void start();
            else resolve();
          });
        },
      );
    } else {
      setLocked(true);
      setError(
        "此浏览器不支持存档互斥锁，请使用新版 Chrome、Edge、Safari 或 Firefox 打开。",
      );
    }
    const visibility = () => {
      // Settle the foreground interval before switching to normal-speed background time.
      if (!active.current && gameRef.current) {
        active.current = true;
        void settle()
          .then(() => persist(gameRef.current!))
          .catch((e) => setNotice(e.message))
          .finally(() => {
            active.current = false;
          });
      }
      time.current.hidden = document.hidden;
      if (document.hidden) {
        time.current.speed = 1;
        setSpeedState(1);
      }
    };
    const hide = () => {
      if (gameRef.current) void persist(gameRef.current);
    };
    const show = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      disposed = true;
      clearInterval(interval);
      worker.current?.terminate();
      unlock?.();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
    };
  }, []);
  const run = async (command: string, payload: unknown) => {
    if (locked) return;
    // Wait for the short periodic tick, rather than dropping a user action.
    while (active.current) await new Promise((r) => setTimeout(r, 30));
    active.current = true;
    setBusy(true);
    try {
      if (gameRef.current && command !== "restore" && command !== "reset")
        await settle();
      const result = await request(command, payload);
      time.current.wall = Date.now();
      await persist(result);
      setError("");
      setReady(true);
      return result;
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  const setSpeed = async (value: number) => {
    while (active.current) await new Promise((r) => setTimeout(r, 30));
    active.current = true;
    try {
      await settle();
      time.current.speed = value;
      setSpeedState(value);
    } finally {
      active.current = false;
    }
  };
  const skip = async () => {
    if (gameRef.current) {
      await setSpeed(1);
      await run("advance", { target: nextOpen(gameRef.current.simTime) });
    }
  };
  const importGame = async (file: File) => {
    if (file.size > 8_000_000) throw new Error("存档文件过大（最多 8 MB）");
    const parsed = validateSave(JSON.parse(await file.text()));
    await run("restore", parsed);
    time.current.speed = 1;
    setSpeedState(1);
    setNotice("已导入存档，并按现实离开时长补算行情。");
  };
  return {
    game,
    error,
    notice,
    setNotice,
    speed,
    setSpeed,
    busy,
    ready,
    locked,
    saved,
    run,
    skip,
    importGame,
  };
}
