import { InputHTMLAttributes, ReactNode } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  testId: string;
  error?: string;
  hint?: ReactNode;
  /** Renders the label text without associating it with the input (the missing-label defect). */
  unlabelled?: boolean;
}

/** A labelled input with an associated error message. The error's test id is `${testId}-error`. */
export function Field({ id, label, testId, error, hint, unlabelled, ...input }: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      {unlabelled ? <span className="label">{label}</span> : <label htmlFor={id}>{label}</label>}
      <input id={id} name={id} data-testid={testId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {hint && (
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error" role="alert" data-testid={`${testId}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
