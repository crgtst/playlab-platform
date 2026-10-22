import { useEffect, useRef, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { copyText } from '../lib/clipboard';

interface Props {
  /** What is written to the clipboard. */
  text: string;
  /** What the toast says was copied (defaults to `text`). */
  shown?: string;
  label: string;
  testId: string;
}

export function CopyButton({ text, shown, label, testId }: Props) {
  const { show } = useToast();
  const [copied, setCopied] = useState(false);
  // PLS-15.3: when the Clipboard API is missing or denied, show the text selected so the shopper can copy it by hand.
  const [fallback, setFallback] = useState(false);
  const fallbackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fallback) fallbackRef.current?.select();
  }, [fallback]);

  const onClick = async () => {
    try {
      await copyText(text);
      setFallback(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      show(`Copied ${shown ?? text}`, 'success');
    } catch {
      if (fallback) fallbackRef.current?.select();
      setFallback(true);
    }
  };

  return (
    <>
      <button type="button" className="secondary copy-button" onClick={onClick} data-testid={testId} data-copied={copied}>
        {copied ? 'Copied' : label}
      </button>
      {fallback && (
        <span className="copy-fallback">
          <input
            ref={fallbackRef}
            readOnly
            value={text}
            size={Math.max(text.length, 4)}
            aria-label={`${label}: press Ctrl+C to copy`}
            onFocus={(e) => e.currentTarget.select()}
            data-testid={`${testId}-fallback`}
          />{' '}
          <span className="muted small" role="status" data-testid={`${testId}-fallback-hint`}>
            Press Ctrl+C to copy
          </span>
        </span>
      )}
    </>
  );
}
