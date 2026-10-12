import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { getSettings, saveSettings } from "@workspace/api-client-react";
import type { CloudPainterSettings } from "@workspace/api-client-react";
import { SettingsPersistence, DEFAULT_SETTINGS, type SettingsSaveResult } from "@/lib/settingsPersistence";
import { TextScaleController } from "./TextScaleController";
import { usePaletteAccount } from "./Account";

type AccountSettingsValue = {
  settings: CloudPainterSettings;
  ready: boolean;
  busy: boolean;
  error: string;
  saveError: string;
  conflict: boolean;
  expired: boolean;
  signedIn: boolean;
  save: (settings: CloudPainterSettings) => Promise<SettingsSaveResult>;
  retry: () => Promise<{ revision: number; settings: CloudPainterSettings } | null>;
};

const guestValue: AccountSettingsValue = {
  settings: DEFAULT_SETTINGS,
  ready: true,
  busy: false,
  error: "",
  saveError: "",
  conflict: false,
  expired: false,
  signedIn: false,
  save: async () => "failed",
  retry: async () => null,
};
const SettingsContext = createContext<AccountSettingsValue>({
  ...guestValue,
  ready: false,
});

export function useAccountSettings() {
  return useContext(SettingsContext);
}

export function AccountSettingsProvider({ children }: { children: ReactNode }) {
  const { isLoaded, userId, sessionId } = usePaletteAccount();
  if (!isLoaded) {
    return <SettingsShell value={{ ...guestValue, ready: false }}>{children}</SettingsShell>;
  }
  if (!userId || !sessionId) {
    return <SettingsShell value={guestValue}>{children}</SettingsShell>;
  }
  return <SignedInSettings key={`${userId}:${sessionId}`} sessionId={sessionId}>{children}</SignedInSettings>;
}

function SettingsShell({ value, children }: { value: AccountSettingsValue; children: ReactNode }) {
  return <SettingsContext.Provider value={value}>
    <TextScaleController textSize={value.settings.textSize} />
    {children}
  </SettingsContext.Provider>;
}

function SignedInSettings({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const [store] = useState(() => new SettingsPersistence({
    load: signal => getSettings({
      signal,
      headers: { "X-Settings-Session": sessionId },
      credentials: "same-origin",
    }),
    save: (settings, revision, signal) => saveSettings({ revision, settings }, {
      signal,
      headers: { "X-Settings-Session": sessionId },
      credentials: "same-origin",
    }),
  }));
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);
  const value: AccountSettingsValue = {
    settings: state.settings,
    ready: state.ready,
    busy: state.busy,
    error: state.error,
    saveError: state.saveError,
    conflict: state.conflict,
    expired: state.expired,
    signedIn: true,
    save: settings => store.save(settings),
    retry: () => store.retry(),
  };
  return <SettingsShell value={value}>{children}</SettingsShell>;
}

