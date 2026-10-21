import { createContext, Fragment, ReactNode, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import type { Currency } from '../api/types';
import { setDisplay } from '../lib/format';
import { Lang, LANGUAGES, setLang } from '../lib/i18n';
import { useConfig } from './ConfigContext';

export type Theme = 'light' | 'dark';

interface Prefs {
  lang: Lang;
  currency: Currency;
  theme: Theme;
  setLang: (l: Lang) => void;
  setCurrency: (c: Currency) => void;
  setTheme: (t: Theme) => void;
}

const PrefsContext = createContext<Prefs | null>(null);
const KEY = 'playlab.prefs';

function stored(): Partial<Pick<Prefs, 'lang' | 'currency' | 'theme'>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function save(p: Pick<Prefs, 'lang' | 'currency' | 'theme'>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore: private mode or blocked storage */
  }
}

/** Defaults follow the browser (Playwright's `locale` and `colorScheme`) until the user picks something. */
function defaults(): Pick<Prefs, 'lang' | 'currency' | 'theme'> {
  const nav = (navigator.language || 'en').toLowerCase();
  const prefersDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    lang: nav.startsWith('ga') ? 'ga' : 'en',
    currency: nav === 'en-gb' ? 'GBP' : 'EUR',
    theme: prefersDark ? 'dark' : 'light',
  };
}

/** `initial` (used by the component harness) wins over saved choices and browser defaults. */
export function PrefsProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: Partial<Pick<Prefs, 'lang' | 'currency' | 'theme'>>;
}) {
  const config = useConfig();
  const [prefs, setPrefs] = useState(() => {
    const s = { ...stored(), ...initial };
    const d = defaults();
    return {
      lang: s.lang === 'en' || s.lang === 'ga' ? s.lang : d.lang,
      currency: s.currency === 'EUR' || s.currency === 'GBP' ? s.currency : d.currency,
      theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : d.theme,
    };
  });

  // Formatters and t() read module-level settings, so set them before children render.
  setLang(prefs.lang);
  setDisplay({
    locale: LANGUAGES.find((l) => l.value === prefs.lang)!.locale,
    currency: prefs.currency,
    rates: config.currencies,
    bugs: config.bugs,
  });

  useLayoutEffect(() => {
    document.documentElement.lang = prefs.lang;
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.lang, prefs.theme]);

  const update = useCallback((patch: Partial<typeof prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      save(next);
      return next;
    });
  }, []);

  const value = useMemo<Prefs>(
    () => ({
      ...prefs,
      setLang: (lang) => update({ lang }),
      setCurrency: (currency) => update({ currency }),
      setTheme: (theme) => update({ theme }),
    }),
    [prefs, update],
  );

  // Re-mount the tree when language or currency changes so every string and price re-renders.
  return (
    <PrefsContext.Provider value={value}>
      <Fragment key={`${prefs.lang}-${prefs.currency}`}>{children}</Fragment>
    </PrefsContext.Provider>
  );
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider');
  return ctx;
}
