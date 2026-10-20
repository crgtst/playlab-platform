import { HTMLAttributes, useEffect, useRef } from 'react';
import './review-stars';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'review-stars': HTMLAttributes<HTMLElement> & {
        ref?: React.Ref<HTMLElement>;
        value?: string;
        readonly?: string;
        label?: string;
        'data-testid'?: string;
      };
    }
  }
}

interface Props {
  value: number;
  readOnly?: boolean;
  label?: string;
  testId: string;
  onChange?: (value: number) => void;
}

/** React wrapper for the <review-stars> web component (the stars live in its shadow DOM). */
export function ReviewStars({ value, readOnly, label, testId, onChange }: Props) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onChange) return;
    const handler = (e: Event) => onChange((e as CustomEvent<{ value: number }>).detail.value);
    el.addEventListener('change', handler);
    return () => el.removeEventListener('change', handler);
  }, [onChange]);
  return <review-stars ref={ref} value={String(value)} readonly={readOnly ? '' : undefined} label={label} data-testid={testId} />;
}
