import { FormEvent, useState } from 'react';
import { errorMessage } from '../api/client';
import { useCart } from '../context/CartContext';

export function DiscountForm() {
  const { cart, applyCode, removeCode } = useCart();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const onApply = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!code.trim()) {
      setError('Enter a discount code');
      return;
    }
    setBusy(true);
    try {
      const c = await applyCode(code);
      setSuccess(`Discount applied: ${c.discount?.code}`);
      setCode('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setError('');
    setSuccess('');
    try {
      await removeCode();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <section className="discount" aria-labelledby="discount-heading" data-testid="discount-section">
      <h2 id="discount-heading" className="h3">
        Discount code
      </h2>
      {cart?.discount && (
        <p className="applied" data-testid="discount-applied">
          <strong data-testid="discount-applied-code">{cart.discount.code}</strong> – {cart.discount.description}{' '}
          <button type="button" className="link-button" onClick={onRemove} data-testid="discount-remove-button">
            Remove
          </button>
        </p>
      )}
      <form onSubmit={onApply} noValidate className="inline-form" data-testid="discount-form">
        <label htmlFor="discount-code">Enter a code</label>
        <input
          id="discount-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'discount-error' : undefined}
          data-testid="discount-code-input"
        />
        <button type="submit" disabled={busy} data-testid="discount-apply-button">
          Apply
        </button>
      </form>
      {error && (
        <p id="discount-error" className="field-error" role="alert" data-testid="discount-error">
          {error}
        </p>
      )}
      {success && (
        <p className="success" role="status" data-testid="discount-success">
          {success}
        </p>
      )}
    </section>
  );
}
