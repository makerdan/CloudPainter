import type { CloudPainterSettings } from "@workspace/api-client-react";

export const DEFAULT_SETTINGS: CloudPainterSettings = {
  textSize: 100,
  drawingTool: "brush",
  brushStyle: "round",
  brushSize: 8,
};

export type SettingsTransport = {
  load(signal: AbortSignal): Promise<{ revision: number; settings: CloudPainterSettings }>;
  save(
    settings: CloudPainterSettings,
    revision: number,
    signal: AbortSignal,
  ): Promise<{ revision: number; settings: CloudPainterSettings }>;
};

export type SettingsState = {
  settings: CloudPainterSettings;
  revision: number;
  ready: boolean;
  busy: boolean;
  error: string;
  saveError: string;
  conflict: boolean;
  expired: boolean;
};

export type SettingsSaveResult = "saved" | "conflict" | "failed" | "expired";

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
  state: SettingsState = {
    settings: DEFAULT_SETTINGS,
    revision: 0,
    ready: false,
    busy: false,
    error: "",
    saveError: "",
    conflict: false,
    expired: false,
  };
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
    this.state = {
      settings: DEFAULT_SETTINGS,
      revision: 0,
      ready: false,
      busy: false,
      error: "",
      saveError: "",
      conflict: false,
      expired: false,
    };
  }

  async load() {
    await this.request();
  }

  async save(settings: CloudPainterSettings): Promise<SettingsSaveResult> {
    if (this.state.busy || !this.state.ready) return "failed";
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    const revision = this.state.revision;
    this.update({ busy: true, saveError: "", conflict: false, expired: false });
    try {
      const snapshot = await this.transport.save(settings, revision, controller.signal);
      if (generation !== this.generation) return "failed";
      this.update({
        settings: snapshot.settings,
        revision: snapshot.revision,
        ready: true,
        busy: false,
        saveError: "",
        conflict: false,
        expired: false,
      });
      return "saved";
    } catch (error) {
      if (generation !== this.generation) return "failed";
      const status = (error as { status?: number })?.status;
      if (status === 409) {
        const current = (error as { data?: { current?: { revision?: unknown; settings?: unknown } } })?.data?.current;
        const currentRevision = current?.revision;
        if (Number.isInteger(currentRevision) && (currentRevision as number) >= 0) {
          this.update({
            revision: currentRevision as number,
            busy: false,
            saveError: "Your settings changed on another device. Your edits are still here; save again to keep them, or load the latest settings.",
            conflict: true,
            expired: false,
          });
          return "conflict";
        }
      }
      this.update({
        busy: false,
        saveError: status === 401
          ? "Your session expired. Your edits are still here; sign in again before saving."
          : "Settings could not be saved. Your edits are still here; check your connection and try again.",
        conflict: false,
        expired: status === 401,
      });
      return status === 401 ? "expired" : "failed";
    } finally {
      clearTimeout(timer);
    }
  }

  async retry() {
    return this.request();
  }

  private async request(): Promise<{ revision: number; settings: CloudPainterSettings } | null> {
    if (this.state.busy) return null;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    this.update({ busy: true, error: "", expired: false });
    try {
      const snapshot = await this.transport.load(controller.signal);
      if (generation !== this.generation) return null;
      this.update({
        settings: snapshot.settings,
        revision: snapshot.revision,
        ready: true,
        busy: false,
        error: "",
        saveError: "",
        conflict: false,
        expired: false,
      });
      return snapshot;
    } catch (error) {
      if (generation !== this.generation) return null;
      const status = (error as { status?: number })?.status;
      this.update({
        ready: true,
        busy: false,
        expired: status === 401,
        error: status === 401
          ? "Your session expired or changed. Sign in again; your drawing is safe."
          : "Settings could not load. Retry, or continue with the defaults. Your drawing is safe.",
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
