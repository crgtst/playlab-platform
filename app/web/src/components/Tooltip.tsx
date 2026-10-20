import { cloneElement, ReactElement, useEffect, useId, useState } from 'react';

interface Props {
  content: string;
  testId: string;
  children: ReactElement;
}

/** Shows on hover and keyboard focus, hides on Escape. The trigger is described by the tooltip text. */
export function Tooltip({ content, testId, children }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <span
      className="tooltip-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      data-testid={`${testId}-trigger`}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span id={id} role="tooltip" className="tooltip" hidden={!open} data-testid={testId}>
        {content}
      </span>
    </span>
  );
}
