import { useState } from 'react';
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

  const onClick = async () => {
    try {
      await copyText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      show(`Copied ${shown ?? text}`, 'success');
    } catch {
      show('Could not copy to the clipboard', 'error');
    }
  };

  return (
    <button type="button" className="secondary copy-button" onClick={onClick} data-testid={testId} data-copied={copied}>
      {copied ? 'Copied' : label}
    </button>
  );
}
