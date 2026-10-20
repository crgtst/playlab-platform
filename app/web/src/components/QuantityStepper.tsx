import { KeyboardEvent, useEffect, useState } from 'react';

interface Props {
  id: string;
  label: string;
  value: number;
  max?: number;
  disabled?: boolean;
  onCommit: (quantity: number) => Promise<boolean> | boolean;
  onInvalid?: (message: string) => void;
}

/**
 * Quantity control. Typed values are validated on blur or Enter: anything that is not a whole
 * number of at least 1 is rejected and the previous quantity is restored (PLS-4.2).
 */
export function QuantityStepper({ id, label, value, max = 99, disabled, onCommit, onInvalid }: Props) {
  const [text, setText] = useState(String(value));

  useEffect(() => setText(String(value)), [value]);

  const commit = async (raw: string) => {
    const trimmed = raw.trim();
    const n = Number(trimmed);
    if (trimmed === '' || !Number.isInteger(n) || n < 1) {
      setText(String(value));
      onInvalid?.('Quantity must be at least 1');
      return;
    }
    if (n > max) {
      setText(String(value));
      onInvalid?.(`Quantity must be ${max} or fewer`);
      return;
    }
    if (n === value) return;
    const ok = await onCommit(n);
    if (!ok) setText(String(value));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(text);
    }
  };

  return (
    <div className="stepper" role="group" aria-label={label} data-testid="qty-stepper">
      <button type="button" className="secondary" aria-label="Decrease quantity" disabled={disabled || value <= 1} onClick={() => commit(String(value - 1))} data-testid="qty-decrement">
        −
      </button>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step={1}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={onKeyDown}
        data-testid="qty-input"
      />
      <button type="button" className="secondary" aria-label="Increase quantity" disabled={disabled || value >= max} onClick={() => commit(String(value + 1))} data-testid="qty-increment">
        +
      </button>
    </div>
  );
}
