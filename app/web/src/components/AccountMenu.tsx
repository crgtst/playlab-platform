import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { t } from '../lib/i18n';
import { isStaff } from './RequireRole';

/**
 * Account menu: opens on hover (pointer devices), on click, and on Enter/Space/ArrowDown.
 * Escape closes it and returns focus to the button.
 */
/** `onLogout` lives in the Header, which stays mounted after this menu disappears on logout. */
export function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number>();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user) return null;

  const items = () => Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const openAndFocus = (index: 0 | -1) => {
    setOpen(true);
    window.setTimeout(() => {
      const list = items();
      (index === 0 ? list[0] : list[list.length - 1])?.focus();
    });
  };

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openAndFocus(0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openAndFocus(-1);
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Escape') {
      setOpen(false);
      button.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const hoverOpen = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // A short delay so the pointer can travel from the button to the menu.
  const hoverClose = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 200);
  };

  return (
    <div className="account-menu" ref={wrap} onMouseEnter={hoverOpen} onMouseLeave={hoverClose} data-testid="account-menu-wrap">
      <button
        ref={button}
        type="button"
        className="account-menu-button secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKey}
        data-testid="account-menu-button"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" width={24} height={24} className="avatar-small" data-testid="header-avatar" />
        ) : (
          <span className="avatar-small initials" aria-hidden="true">
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <span className="user-name" data-testid="header-user-name" dir="auto">
          {user.name}
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      <ul id="account-menu" role="menu" aria-label="Account" className="menu" hidden={!open} onKeyDown={onMenuKey} data-testid="account-menu">
        <li role="none">
          <Link role="menuitem" to="/account" onClick={() => setOpen(false)} data-testid="account-menu-item-account">
            {t('nav.account')}
          </Link>
        </li>
        <li role="none">
          <Link role="menuitem" to="/account#orders" onClick={() => setOpen(false)} data-testid="account-menu-item-orders">
            {t('nav.orders')}
          </Link>
        </li>
        <li role="none">
          <Link role="menuitem" to="/wishlist" onClick={() => setOpen(false)} data-testid="account-menu-item-wishlist">
            {t('nav.wishlist')}
          </Link>
        </li>
        {isStaff(user.role) && (
          <li role="none">
            <Link role="menuitem" to="/admin/orders" onClick={() => setOpen(false)} data-testid="account-menu-item-admin">
              {t('nav.admin')}
            </Link>
          </li>
        )}
        <li role="none">
          <button
            role="menuitem"
            type="button"
            className="menu-button"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            data-testid="logout-button"
          >
            {t('nav.logout')}
          </button>
        </li>
      </ul>
    </div>
  );
}
