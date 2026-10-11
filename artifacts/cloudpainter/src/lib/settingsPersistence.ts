import type { CloudPainterSettings } from "@workspace/api-client-react";

export const DEFAULT_SETTINGS: CloudPainterSettings = {
  textSize: 100,
  drawingTool: "brush",
  brushStyle: "round",
  brushSize: 8,
};

export type SettingsTransport = {
  load(signal: AbortSignal): Promise<CloudPainterSettings>;
  save(settings: CloudPainterSettings, signal: AbortSignal): Promise<CloudPainterSettings>;
};

export type SettingsState = {
  settings: CloudPainterSettings;
  ready: boolean;
  busy: boolean;
  error: string;
  expired: boolean;
};

export function editorDefaultsFromSettings(
  settings: CloudPainterSettings,
  currentSizes: Record<"brush" | "pencil" | "pen" | "eraser", number>,
) {
  return {
    tool: settings.drawingTool,
    brushStyle: settings.brushStyle,
    toolSizes: { ...currentSizes, [settings.drawingTool]: settings.brushSize },
  };
}

export class SettingsPersistence {
  state: SettingsState = { settings: DEFAULT_SETTINGS, ready: false, busy: false, error: "", expired: false };
  private generation = 0;
  private controller: AbortController | null = null;
  private listeners = new Set<() => void>();
  private transport: SettingsTransport;

  constructor(transport: SettingsTransport) {
    this.transport = transport;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  snapshot = () => this.state;

  private update(patch: Partial<SettingsState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }

  dispose() {
    ++this.generation;
    this.controller?.abort();
    this.state = { settings: DEFAULT_SETTINGS, ready: false, busy: false, error: "", expired: false };
  }

  async load() {
    await this.request("load");
  }

  async save(settings: CloudPainterSettings) {
    if (this.state.busy || !this.state.ready) return false;
    return this.request("save", settings);
  }

  async retry() {
    await this.request("load");
  }

  private async request(operation: "load" | "save", settings?: CloudPainterSettings): Promise<boolean> {
    if (this.state.busy) return false;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    this.update({ busy: true, error: "", expired: false });
    try {
      const saved = operation === "save"
        ? await this.transport.save(settings!, controller.signal)
        : await this.transport.load(controller.signal);
      if (generation !== this.generation) return false;
      this.update({ settings: saved, ready: true, busy: false, error: "" });
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      const status = (error as { status?: number })?.status;
      this.update({
        ...(status === 401 ? { settings: DEFAULT_SETTINGS } : {}),
        ready: true,
        busy: false,
        expired: status === 401,
        error: status === 401
          ? "Your session expired or changed. Sign in again; your drawing is safe."
          : operation === "save"
            ? "Settings could not be saved. Your drawing is safe; retry to load the saved settings."
            : "Settings could not load. Retry, or continue with the defaults. Your drawing is safe.",
      });
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
