import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ShippingAddress } from '../../api/types';
import { AddressAutocomplete } from '../../components/AddressAutocomplete';
import { CheckoutSteps } from '../../components/CheckoutSteps';
import { Field } from '../../components/Field';
import { useAuth } from '../../context/AuthContext';
import { deliveryWindow, useCheckoutState } from '../../lib/checkoutState';
import { t } from '../../lib/i18n';

const INSTRUCTIONS_MAX = 200;

type Errors = Partial<Record<keyof ShippingAddress | 'deliveryDate' | 'instructions', string>>;

export function Shipping() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [state, update] = useCheckoutState();
  const [errors, setErrors] = useState<Errors>({});
  const { min, max } = deliveryWindow();
  const s = state.shipping;

  useEffect(() => {
    document.title = 'Checkout: shipping – PlayLab Shop';
    if (!s.fullName && user) update({ shipping: { ...s, fullName: user.name } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (key: keyof ShippingAddress, value: string) =>
    update({ shipping: { ...state.shipping, [key]: value }, shippingComplete: false });

  const validate = (): Errors => {
    const e: Errors = {};
    if (!s.fullName.trim()) e.fullName = t('shipping.err.fullName');
    if (!s.line1.trim()) e.line1 = t('shipping.err.line1');
    if (!s.city.trim()) e.city = t('shipping.err.city');
    if (!s.postcode.trim()) e.postcode = t('shipping.err.postcode');
    if (!state.deliveryDate) e.deliveryDate = t('shipping.err.date');
    else if (state.deliveryDate < min || state.deliveryDate > max) e.deliveryDate = t('shipping.err.dateRange', { min, max });
    if (state.instructions.length > INSTRUCTIONS_MAX) e.instructions = t('shipping.err.instructions', { max: INSTRUCTIONS_MAX });
    return e;
  };

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      const first = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
      return;
    }
    update({ shippingComplete: true });
    navigate('/checkout/review');
  };

  const remaining = INSTRUCTIONS_MAX - state.instructions.length;

  return (
    <div className="checkout">
      <h1>{t('checkout.title')}</h1>
      <CheckoutSteps current={1} />
      <form onSubmit={onSubmit} noValidate className="checkout-form" data-testid="shipping-form" aria-labelledby="shipping-heading">
        <h2 id="shipping-heading">{t('shipping.heading')}</h2>
        <Field
          id="ship-name"
          label={t('shipping.fullName')}
          autoComplete="name"
          dir="auto"
          value={s.fullName}
          onChange={(e) => setField('fullName', e.target.value)}
          error={errors.fullName}
          testId="shipping-full-name"
        />
        <AddressAutocomplete
          value={s.line1}
          error={errors.line1}
          onChange={(v) => setField('line1', v)}
          onSelect={(a) =>
            update({
              shipping: { ...state.shipping, line1: a.line1, city: a.city, county: a.county, postcode: a.postcode, country: a.country },
              shippingComplete: false,
            })
          }
        />
        <Field
          id="ship-line2"
          label={t('shipping.line2')}
          autoComplete="address-line2"
          value={s.line2}
          onChange={(e) => setField('line2', e.target.value)}
          testId="shipping-line2"
        />
        <div className="row">
          <Field
            id="ship-city"
            label={t('shipping.city')}
            autoComplete="address-level2"
            value={s.city}
            onChange={(e) => setField('city', e.target.value)}
            error={errors.city}
            testId="shipping-city"
          />
          <Field
            id="ship-county"
            label={t('shipping.county')}
            autoComplete="address-level1"
            value={s.county}
            onChange={(e) => setField('county', e.target.value)}
            testId="shipping-county"
          />
        </div>
        <div className="row">
          <Field
            id="ship-postcode"
            label={t('shipping.postcode')}
            autoComplete="postal-code"
            value={s.postcode}
            onChange={(e) => setField('postcode', e.target.value)}
            error={errors.postcode}
            testId="shipping-postcode"
          />
          <Field
            id="ship-phone"
            label={t('shipping.phone')}
            type="tel"
            autoComplete="tel"
            value={s.phone}
            onChange={(e) => setField('phone', e.target.value)}
            testId="shipping-phone"
          />
        </div>
        <Field
          id="ship-date"
          label={t('shipping.date')}
          type="date"
          min={min}
          max={max}
          value={state.deliveryDate}
          onChange={(e) => update({ deliveryDate: e.target.value, shippingComplete: false })}
          error={errors.deliveryDate}
          testId="shipping-delivery-date"
          hint={t('shipping.dateHint', { min, max })}
        />
        <div className="field">
          <label htmlFor="ship-instructions">{t('shipping.instructions')}</label>
          <textarea
            id="ship-instructions"
            rows={3}
            maxLength={INSTRUCTIONS_MAX}
            value={state.instructions}
            onChange={(e) => update({ instructions: e.target.value })}
            aria-describedby="ship-instructions-counter"
            aria-invalid={errors.instructions ? true : undefined}
            data-testid="shipping-instructions"
          />
          <p
            id="ship-instructions-counter"
            className={remaining < 20 ? 'hint warn' : 'hint'}
            aria-live="polite"
            data-testid="shipping-instructions-counter"
          >
            {t('shipping.counter', { n: state.instructions.length, max: INSTRUCTIONS_MAX })}
          </p>
          {errors.instructions && (
            <p className="field-error" role="alert" data-testid="shipping-instructions-error">
              {errors.instructions}
            </p>
          )}
        </div>
        <div className="form-actions">
          <button type="submit" data-testid="shipping-continue-button">
            {t('shipping.continue')}
          </button>
        </div>
      </form>
    </div>
  );
}
