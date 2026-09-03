import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setMasterVolume } from '@/hooks/useSound';

export type TubeSkin = 'default' | 'neon' | 'crystal';

interface Settings {
  colorblind: boolean;
  volume: number;           // 0.0 – 1.0
  skin: TubeSkin;
  firstInstallDate: string | null;
  starterPackSeen: boolean;
}

interface SettingsContextType extends Settings {
  setColorblind: (v: boolean) => void;
  setVolume: (v: number) => void;
  setSkin: (v: TubeSkin) => void;
  markStarterPackSeen: () => void;
}

const SETTINGS_KEY = '@color_sort_settings_v1';

const DEFAULT: Settings = {
  colorblind: false,
  volume: 1.0,
  skin: 'default',
  firstInstallDate: null,
  starterPackSeen: false,
};

const Ctx = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<Settings>(DEFAULT);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        let parsed: Settings;
        if (raw) {
          try { parsed = { ...DEFAULT, ...JSON.parse(raw) }; } catch { parsed = DEFAULT; }
        } else {
          parsed = { ...DEFAULT, firstInstallDate: new Date().toISOString() };
          AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed)).catch(() => {});
        }
        setS(parsed);
        setMasterVolume(parsed.volume);
      })
      .catch(() => {});
  }, []);

  const update = (patch: Partial<Settings>) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  return (
    <Ctx.Provider
      value={{
        ...s,
        setColorblind:      (v) => update({ colorblind: v }),
        setVolume:          (v) => { update({ volume: v }); setMasterVolume(v); },
        setSkin:            (v) => update({ skin: v }),
        markStarterPackSeen: () => update({ starterPackSeen: true }),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings must be inside SettingsProvider');
  return ctx;
}
