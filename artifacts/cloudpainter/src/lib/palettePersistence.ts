import type { Palette } from '@workspace/api-client-react';

export type PaletteTransport = {
  load(signal: AbortSignal): Promise<Palette>;
  save(palette: Palette, signal: AbortSignal): Promise<Palette>;
};
export type PaletteState = {
  palette: Palette | null;
  busy: boolean;
  error: string;
  expired: boolean;
  conflict: boolean;
  pending: Palette | null;
};

// Each controller belongs to exactly one account AND session; never reuse it across identities.
export class PalettePersistence {
  state: PaletteState = { palette: null, busy: false, error: '', expired: false, conflict: false, pending: null };
  private generation = 0;
  private controller: AbortController | null = null;
  private listeners = new Set<() => void>();
  private transport: PaletteTransport;
  constructor(transport: PaletteTransport) { this.transport = transport; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private update(patch: Partial<PaletteState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  dispose() {
    ++this.generation;
    this.controller?.abort();
    this.state = { palette: null, busy: false, error: '', expired: false, conflict: false, pending: null };
  }
  async load() { await this.request(null); }
  async save(colors: Palette['colors']) {
    if (this.state.busy || !this.state.palette || this.state.expired || this.state.conflict || this.state.pending) return;
    // Only these fields can ever leave the drawing editor.
    const pending = {
      revision: this.state.palette.revision,
      colors: colors.map(({ id, name, hex }) => ({ id, name, hex })),
    };
    await this.request(pending);
  }
  async retry() { await this.request(this.state.pending); }
  private async request(pending: Palette | null) {
    if (this.state.busy) return;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    this.update({ busy: true, error: '', expired: false, conflict: false, pending });
    try {
      const palette = pending
        ? await this.transport.save(pending, controller.signal)
        : await this.transport.load(controller.signal);
      if (generation !== this.generation) return;
      this.update({ palette, busy: false, pending: null });
    } catch (error) {
      if (generation !== this.generation) return;
      const status = (error as { status?: number })?.status;
      this.update({
        busy: false,
        expired: status === 401,
        conflict: status === 409,
        // Hide stale private data when the verified session is gone.
        ...(status === 401 ? { palette: null, pending: null } : {}),
        error: status === 401 ? 'Your session expired or changed. Sign in again; your drawing is safe.'
          : status === 409 ? 'Your palette changed on another device. Reload the palette before editing.'
          : pending ? 'Palette save failed. Retry your change or reload the saved palette. Your drawing is safe.'
          : 'Palette could not load. Retry without changing your drawing.',
      });
    } finally { clearTimeout(timer); }
  }
}
