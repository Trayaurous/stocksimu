/// <reference lib="webworker" />
import { createGame, advance } from "./market.ts";
import { execute, metrics, checkMargin } from "../trading/engine.ts";
import { validateSave } from "../storage/validate.ts";
import type { Game, Side } from "./types.ts";
let game: Game;
self.onmessage = (event: MessageEvent) => {
  const { id, command, payload, wall } = event.data;
  try {
    if (command === "create") game = createGame(wall, payload.seed);
    else if (command === "restore") {
      const candidate = validateSave(payload);
      advance(
        candidate,
        candidate.simTime + Math.max(0, wall - candidate.realAt),
        (time) => self.postMessage({ progress: time }),
      );
      game = candidate;
    } else if (command === "advance")
      advance(game, payload.target, (time) =>
        self.postMessage({ progress: time }),
      );
    else if (command === "trade") {
      execute(
        game,
        payload.id,
        payload.side as Side,
        payload.quantity,
        payload.leverage,
      );
      checkMargin(game);
    } else if (command === "seen") {
      game.seen = [...new Set([...game.seen, ...payload])];
    } else if (command === "favorite")
      game.favorites = game.favorites.includes(payload)
        ? game.favorites.filter((x) => x !== payload)
        : [...game.favorites, payload];
    else if (command === "reset") {
      const round = {
        started: game.started,
        ended: game.simTime,
        equity: metrics(game).equity,
        trades: game.tradeCount,
        drawdown: game.drawdown,
        bankrupt: game.bankrupt,
      };
      const seen = game.seen;
      game = createGame(
        wall,
        payload.seed,
        [round, ...game.rounds].slice(0, 50),
      );
      game.seen = seen;
    } else throw new Error("未知操作");
    game.realAt = wall;
    self.postMessage({ id, game });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "模拟处理失败",
    });
  }
};
