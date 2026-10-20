import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, editorDefaultsFromSettings, SettingsPersistence } from "./settingsPersistence.ts";

test("account settings survive a fresh client and stay isolated between users", async () => {
  const records = new Map<string, { revision: number; settings: typeof DEFAULT_SETTINGS }>();
  const forAccount = (userId: string) => new SettingsPersistence({
    load: async () => records.get(userId) ?? { revision: 0, settings: DEFAULT_SETTINGS },
    save: async (settings, revision) => {
      if ((records.get(userId)?.revision ?? 0) !== revision) throw new Error("revision conflict");
      const saved = { revision: revision + 1, settings: { ...settings } };
      records.set(userId, saved);
      return saved;
    },
  });
  const userA = forAccount("user_a");
  const userB = forAccount("user_b");
  await Promise.all([userA.load(), userB.load()]);
  const preferred = { textSize: 120, drawingTool: "pen", brushStyle: "soft", brushSize: 23 } as const;
  assert.equal(await userA.save(preferred), "saved");
  assert.deepEqual(userB.state.settings, DEFAULT_SETTINGS);

  const restoredUserA = forAccount("user_a");
  await restoredUserA.load();
  assert.deepEqual(restoredUserA.state.settings, preferred);
  assert.deepEqual(userB.state.settings, DEFAULT_SETTINGS);
});

test("disposing an old account discards late settings responses", async () => {
  let resolve!: (snapshot: { revision: number; settings: typeof DEFAULT_SETTINGS }) => void;
  let signal!: AbortSignal;
  const previous = new SettingsPersistence({
    load: s => { signal = s; return new Promise(resolveRequest => { resolve = resolveRequest; }); },
    save: async (settings, revision) => ({ revision: revision + 1, settings }),
  });
  const loading = previous.load();
  previous.dispose();
  assert.equal(signal.aborted, true);
  resolve({ revision: 3, settings: { ...DEFAULT_SETTINGS, textSize: 140, drawingTool: "pencil" } });
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

test("failed settings saves report failure and preserve the same values for a later retry", async () => {
  let failSave = true;
  const store = new SettingsPersistence({
    load: async () => ({ revision: 0, settings: DEFAULT_SETTINGS }),
    save: async (settings, revision) => {
      if (failSave) throw new Error("offline");
      return { revision: revision + 1, settings };
    },
  });
  await store.load();
  const edited = { ...DEFAULT_SETTINGS, textSize: 110 };
  assert.equal(await store.save(edited), "failed");
  assert.match(store.state.saveError, /could not be saved/i);
  assert.deepEqual(store.state.settings, DEFAULT_SETTINGS);
  failSave = false;
  assert.equal(await store.save(edited), "saved");
  assert.equal(store.state.settings.textSize, 110);
  assert.equal(store.state.saveError, "");
});

test("revision conflicts preserve the draft and advance the retry revision", async () => {
  const latest = { revision: 5, settings: { ...DEFAULT_SETTINGS, brushSize: 19 } };
  const attempts: Array<{ settings: typeof DEFAULT_SETTINGS; revision: number }> = [];
  const store = new SettingsPersistence({
    load: async () => ({ revision: 4, settings: DEFAULT_SETTINGS }),
    save: async (settings, revision) => {
      attempts.push({ settings, revision });
      if (attempts.length === 1) {
        throw Object.assign(new Error("conflict"), {
          status: 409,
          data: { current: latest },
        });
      }
      return { revision: revision + 1, settings };
    },
  });
  await store.load();
  const draft = { ...DEFAULT_SETTINGS, textSize: 130, drawingTool: "pen" as const };
  assert.equal(await store.save(draft), "conflict");
  assert.equal(store.state.conflict, true);
  assert.equal(store.state.revision, latest.revision);
  assert.deepEqual(store.state.settings, DEFAULT_SETTINGS);
  assert.match(store.state.saveError, /changed on another device/i);
  assert.equal(await store.save(draft), "saved");
  assert.deepEqual(attempts, [
    { settings: draft, revision: 4 },
    { settings: draft, revision: 5 },
  ]);
  assert.deepEqual(store.state.settings, draft);
  assert.equal(store.state.revision, 6);
});

test("expired sessions report a recoverable failure without clearing saved settings", async () => {
  const store = new SettingsPersistence({
    load: async () => ({ revision: 2, settings: { ...DEFAULT_SETTINGS, brushSize: 21 } }),
    save: async () => {
      throw Object.assign(new Error("expired"), { status: 401 });
    },
  });
  await store.load();
  const saved = store.state.settings;
  assert.equal(await store.save({ ...saved, textSize: 120 }), "expired");
  assert.equal(store.state.expired, true);
  assert.deepEqual(store.state.settings, saved);
  assert.match(store.state.saveError, /session expired/i);
});
