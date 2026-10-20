import type { Currency } from '../api/types';
import { usePrefs } from '../context/PrefsContext';
import { Lang, LANGUAGES, t } from '../lib/i18n';

export function PrefsControls() {
  const { lang, currency, theme, setLang, setCurrency, setTheme } = usePrefs();
  return (
    <div className="prefs" data-testid="prefs-controls">
      <label htmlFor="language-select" className="visually-hidden">
        {t('prefs.language')}
      </label>
      <select id="language-select" value={lang} onChange={(e) => setLang(e.target.value as Lang)} data-testid="language-select">
        {LANGUAGES.map((l) => (
          <option key={l.value} value={l.value} lang={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <label htmlFor="currency-select" className="visually-hidden">
        {t('prefs.currency')}
      </label>
      <select id="currency-select" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} data-testid="currency-select">
        <option value="EUR">€ EUR</option>
        <option value="GBP">£ GBP</option>
      </select>
      <button
        type="button"
        className="secondary theme-toggle"
        aria-pressed={theme === 'dark'}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        data-testid="theme-toggle"
      >
        <span aria-hidden="true">{theme === 'dark' ? '☾' : '☀'}</span> {t('prefs.dark')}
      </button>
    </div>
  );
}
