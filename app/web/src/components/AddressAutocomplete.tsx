import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { AddressSuggestion } from '../api/types';

interface Props {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onSelect: (address: AddressSuggestion) => void;
}

/** ARIA 1.2 combobox: type 2+ characters, pick with the mouse or Arrow keys + Enter, Escape to close. */
export function AddressAutocomplete({ value, error, onChange, onSelect }: Props) {
  const [options, setOptions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setOptions([]);
      setOpen(false);
      return;
    }
    const t = window.setTimeout(() => {
      api<{ data: AddressSuggestion[] }>(`/addresses/suggest?q=${encodeURIComponent(q)}`)
        .then((r) => {
          setOptions(r.data);
          setOpen(r.data.length > 0);
          setActive(-1);
        })
        .catch(() => setOptions([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [value]);

  const choose = (a: AddressSuggestion) => {
    skipNext.current = true;
    onSelect(a);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || options.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="field autocomplete">
      <label htmlFor="ship-line1">Address line 1</label>
      <input
        id="ship-line1"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="address-listbox"
        aria-activedescendant={active >= 0 ? options[active]?.id : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'ship-line1-error' : 'ship-line1-hint'}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        data-testid="shipping-line1"
      />
      <p id="ship-line1-hint" className="hint">
        Start typing to search addresses
      </p>
      {open && (
        <ul id="address-listbox" role="listbox" aria-label="Address suggestions" className="listbox" data-testid="address-suggestions">
          {options.map((a, i) => (
            <li
              key={a.id}
              id={a.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(a);
              }}
              data-testid="address-option"
            >
              {a.label}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id="ship-line1-error" className="field-error" role="alert" data-testid="shipping-line1-error">
          {error}
        </p>
      )}
    </div>
  );
}
