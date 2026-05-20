import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import type { NrmUiAppearanceMode } from '@/lib/nrmUiAppearanceSettings';
import {
  getNrmUiAppearanceMode,
  setNrmUiAppearanceMode,
} from '@/lib/nrmUiAppearanceSettings';

export type NrmUiAppearanceContextValue = {
  /** 현재 화면에 적용된 다크 여부 (저장값 또는 OS) */
  isDark: boolean;
  /** `null`이면 아직 저장된 선택이 없어 OS 테마를 따름 */
  preference: NrmUiAppearanceMode | null;
  setAppearanceMode: (mode: NrmUiAppearanceMode) => Promise<void>;
  /** AsyncStorage에서 초기값을 읽었는지 */
  hydrated: boolean;
};

const NrmUiAppearanceContext =
  createContext<NrmUiAppearanceContextValue | null>(null);

export function NrmUiAppearanceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<NrmUiAppearanceMode | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getNrmUiAppearanceMode().then((p) => {
      if (cancelled) return;
      setPreference(p);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isDark = useMemo(() => {
    if (preference === 'light') return false;
    if (preference === 'dark') return true;
    return systemScheme !== 'light';
  }, [preference, systemScheme]);

  const setAppearanceMode = useCallback(async (mode: NrmUiAppearanceMode) => {
    setPreference(mode);
    await setNrmUiAppearanceMode(mode);
  }, []);

  const value = useMemo<NrmUiAppearanceContextValue>(
    () => ({
      isDark,
      preference,
      setAppearanceMode,
      hydrated,
    }),
    [hydrated, isDark, preference, setAppearanceMode],
  );

  return (
    <NrmUiAppearanceContext.Provider value={value}>
      {children}
    </NrmUiAppearanceContext.Provider>
  );
}

export function useNrmUiAppearance(): NrmUiAppearanceContextValue {
  const ctx = useContext(NrmUiAppearanceContext);
  if (!ctx) {
    throw new Error(
      'useNrmUiAppearance는 NrmUiAppearanceProvider 안에서만 사용하세요.',
    );
  }
  return ctx;
}
