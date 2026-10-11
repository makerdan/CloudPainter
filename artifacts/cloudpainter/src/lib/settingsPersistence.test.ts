import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, editorDefaultsFromSettings, SettingsPersistence } from "./settingsPersistence.ts";

test("account settings survive a fresh client and stay isolated between users", async () => {
  const records = new Map<string, typeof DEFAULT_SETTINGS>();
  const forAccount = (userId: string) => new SettingsPersistence({
    load: async () => records.get(userId) ?? DEFAULT_SETTINGS,
    save: async settings => {
      const saved = { ...settings };
      records.set(userId, saved);
      return saved;
    },
  });
  const userA = forAccount("user_a");
  const userB = forAccount("user_b");
  await Promise.all([userA.load(), userB.load()]);
  const preferred = { textSize: 120, drawingTool: "pen", brushStyle: "soft", brushSize: 23 } as const;
  assert.equal(await userA.save(preferred), true);
  assert.deepEqual(userB.state.settings, DEFAULT_SETTINGS);

  const restoredUserA = forAccount("user_a");
  await restoredUserA.load();
  assert.deepEqual(restoredUserA.state.settings, preferred);
  assert.deepEqual(userB.state.settings, DEFAULT_SETTINGS);
});

test("disposing an old account discards late settings responses", async () => {
  let resolve!: (settings: typeof DEFAULT_SETTINGS) => void;
  let signal!: AbortSignal;
  const previous = new SettingsPersistence({
    load: s => { signal = s; return new Promise(resolveRequest => { resolve = resolveRequest; }); },
    save: async settings => settings,
  });
  const loading = previous.load();
  previous.dispose();
  assert.equal(signal.aborted, true);
  resolve({ ...DEFAULT_SETTINGS, textSize: 140, drawingTool: "pencil" });
  await loading;
  assert.deepEqual(previous.state.settings, DEFAULT_SETTINGS);
  assert.equal(previous.state.ready, false);
});

test("editor defaults initialize the preferred instrument and its size without changing other sizes", () => {
  const sizes = { brush: 8, pencil: 3, pen: 3, eraser: 16 };
  assert.deepEqual(editorDefaultsFromSettings({
    ...DEFAULT_SETTINGS, drawingTool: "pen", brushStyle: "chisel", brushSize: 31,
  }, sizes), {
    tool: "pen",
    brushStyle: "chisel",
    toolSizes: { brush: 8, pencil: 3, pen: 31, eraser: 16 },
  });
  assert.deepEqual(sizes, { brush: 8, pencil: 3, pen: 3, eraser: 16 });
});

test("failed settings saves report failure and a later retry can load the saved values", async () => {
  let failSave = true;
  const store = new SettingsPersistence({
    load: async () => DEFAULT_SETTINGS,
    save: async settings => {
      if (failSave) throw new Error("offline");
      return settings;
    },
  });
  await store.load();
  assert.equal(await store.save({ ...DEFAULT_SETTINGS, textSize: 110 }), false);
  assert.match(store.state.error, /could not be saved/i);
  failSave = false;
  assert.equal(await store.save({ ...DEFAULT_SETTINGS, textSize: 110 }), true);
  assert.equal(store.state.settings.textSize, 110);
  assert.equal(store.state.error, "");
});
