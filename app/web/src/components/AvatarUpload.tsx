import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { ApiRequestError, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

/**
 * Avatar upload. The server is the only judge of size (2 MB) and type (PNG/JPG by content),
 * so oversized or renamed files reach the API and its 413/415 responses are shown here.
 */
export function AvatarUpload() {
  const { user, reload } = useAuth();
  const { show } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError('');
    setFile(e.target.files?.[0] ?? null);
  };

  const onUpload = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!file) {
      setError('Choose an image to upload');
      return;
    }
    const form = new FormData();
    form.append('avatar', file);
    setBusy(true);
    try {
      // multipart: let the browser set the Content-Type boundary, so this bypasses the JSON api() helper.
      const res = await fetch('/api/v1/users/me/avatar', { method: 'POST', body: form, credentials: 'same-origin' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiRequestError(res.status, body?.error?.code ?? 'HTTP_ERROR', body?.error?.message ?? `Upload failed (${res.status})`);
      }
      await reload();
      show('Your avatar has been updated', 'success');
      setFile(null);
      if (input.current) input.current.value = '';
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setError('');
    try {
      const res = await fetch('/api/v1/users/me/avatar', { method: 'DELETE', credentials: 'same-origin' });
      if (!res.ok) throw new ApiRequestError(res.status, 'HTTP_ERROR', 'Could not remove your avatar');
      await reload();
      show('Your avatar has been removed', 'info');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section aria-labelledby="avatar-heading" className="panel avatar-panel" data-testid="avatar-section">
      <h2 id="avatar-heading" className="h3">
        Avatar
      </h2>
      <div className="avatar-row">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={`Avatar for ${user.name}`} width={96} height={96} className="avatar-large" data-testid="avatar-image" />
        ) : (
          <span className="avatar-large initials" role="img" aria-label="No avatar yet" data-testid="avatar-placeholder">
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <form onSubmit={onUpload} noValidate className="avatar-form" data-testid="avatar-form">
          <div className="field">
            <label htmlFor="avatar-input">Choose an image</label>
            <input
              ref={input}
              id="avatar-input"
              type="file"
              accept="image/png,image/jpeg"
              onChange={onChange}
              aria-describedby={error ? 'avatar-hint avatar-error' : 'avatar-hint'}
              aria-invalid={error ? true : undefined}
              data-testid="avatar-input"
            />
            <p id="avatar-hint" className="hint">
              PNG or JPG, up to 2 MB
            </p>
          </div>
          {error && (
            <p id="avatar-error" className="field-error" role="alert" data-testid="avatar-error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" disabled={busy} data-testid="avatar-upload-button">
              {busy ? 'Uploading…' : 'Upload'}
            </button>
            {user.avatarUrl && (
              <button type="button" className="secondary" onClick={onRemove} data-testid="avatar-remove-button">
                Remove avatar
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
