import { ReactNode, useEffect, useId, useRef } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  testId: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Modal built on the native <dialog> element: showModal() makes the rest of the page inert,
 * Escape closes it, and focus returns to whatever opened it.
 */
export function Modal({ open, title, onClose, testId, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      (opener.current as HTMLElement | null)?.focus?.();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <header className="modal-header">
            <h2 id={titleId} className="h3">
              {title}
            </h2>
            <button type="button" className="link-button" aria-label="Close" onClick={onClose} data-testid={`${testId}-close`}>
              ×
            </button>
          </header>
          <div className="modal-body">{children}</div>
          {footer && <footer className="modal-footer">{footer}</footer>}
        </>
      )}
    </dialog>
  );
}
