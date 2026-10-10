import assert from 'node:assert/strict';
import test from 'node:test';
import { PalettePersistence } from './palettePersistence.ts';

const empty = { colors: [], revision: 0 };
const colors = [{ id: 'pine', name: 'Pine', hex: '#315d4d' }];
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
test('sign-out aborts requests and discards late account responses', async () => {
  const pending = deferred<typeof empty>();
  let signal!: AbortSignal;
  const store = new PalettePersistence({ load: s => { signal = s; return pending.promise; }, save: async p => p });
  const load = store.load();
  store.dispose();
  assert.equal(signal.aborted, true);
  pending.resolve(empty);
  await load;
  assert.equal(store.state.palette, null);
});
test('new account is isolated from late saves and failures belonging to old account', async () => {
  const pending = deferred<{ colors: typeof colors; revision: number }>();
  const old = new PalettePersistence({ load: async () => ({ colors, revision: 1 }), save: () => pending.promise });
  await old.load();
  const save = old.save(colors);
  old.dispose();
  const current = new PalettePersistence({ load: async () => empty, save: async p => p });
  await current.load();
  pending.reject({ status: 401 });
  await save;
  assert.deepEqual(current.state.palette, empty);
  assert.equal(current.state.error, '');
  assert.equal(old.state.palette, null);
});
test('failed changes remain retryable and payload never contains drawing/photo data', async () => {
  let attempts = 0;
  let payload: unknown;
  const store = new PalettePersistence({
    load: async () => empty,
    save: async p => { payload = p; if (++attempts === 1) throw new Error('offline'); return { ...p, revision: 1 }; },
  });
  await store.load();
  await store.save([{ ...colors[0], image: 'private-photo', projectTitle: 'private', strokes: ['private'] } as typeof colors[number]]);
  assert.equal(store.state.pending?.colors[0].name, 'Pine');
  assert.deepEqual(payload, { colors, revision: 0 });
  await store.retry();
  assert.equal(store.state.pending, null);
  assert.equal(store.state.palette?.revision, 1);
});
test('expired sessions clear private palette; conflicts require reload, never blind overwrite', async () => {
  let status = 409;
  const store = new PalettePersistence({ load: async () => ({ colors, revision: 2 }), save: async () => { throw { status }; } });
  await store.load();
  await store.save(colors);
  assert.equal(store.state.conflict, true);
  await store.load();
  assert.equal(store.state.conflict, false);
  status = 401;
  await store.save(colors);
  assert.equal(store.state.expired, true);
  assert.equal(store.state.palette, null);
  assert.equal(store.state.pending, null);
});
test('duplicate mutations are serialized', async () => {
  const pending = deferred<{ colors: typeof colors; revision: number }>();
  let count = 0;
  const store = new PalettePersistence({ load: async () => empty, save: () => { ++count; return pending.promise; } });
  await store.load();
  const save = store.save(colors);
  await store.save([]);
  assert.equal(count, 1);
  pending.resolve({ colors, revision: 1 });
  await save;
});
