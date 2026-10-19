import type { Game } from "../simulation/types.ts";
import { validateSave } from "./validate.ts";
const KEY = "paper-market-save-v1";
let dbPromise: Promise<IDBDatabase> | undefined;
function database() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("paper-market", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("saves");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
export async function loadSave(): Promise<Game | null> {
  let local: Game | null = null,
    dbSave: Game | null = null,
    broken = false;
  try {
    const text = localStorage.getItem(KEY);
    if (text) local = validateSave(JSON.parse(text));
  } catch {
    broken = true;
  }
  try {
    const db = await database();
    const data = await new Promise<unknown>((resolve, reject) => {
      const r = db.transaction("saves").objectStore("saves").get("current");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (data) dbSave = validateSave(data);
  } catch {
    broken = true;
  }
  if (!local && !dbSave && broken)
    throw new Error(
      "无法读取本地存档。为避免覆盖已有数据，请检查浏览器存储权限，或导入备份。",
    );
  return local && dbSave
    ? local.realAt >= dbSave.realAt
      ? local
      : dbSave
    : local || dbSave;
}
export async function saveGame(g: Game): Promise<void> {
  let localOk = false;
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
    localOk = true;
  } catch {
    /* IndexedDB remains available on some browsers. */
  }
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("saves", "readwrite");
      tx.objectStore("saves").put(g, "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    if (!localOk)
      throw new Error("自动保存失败，请导出存档备份，并检查浏览器存储空间");
  }
}
export function exportSave(g: Game) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(g)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `纸上交易所-${new Date(g.simTime).toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
