import { forwardRef } from 'react';

interface Props {
  src: string;
}

/** The hosted payment form. It lives on the payment provider's origin (the API), so it is cross-origin. */
export const PaymentFrame = forwardRef<HTMLIFrameElement, Props>(function PaymentFrame({ src }, ref) {
  return (
    <iframe
      ref={ref}
      src={src}
      title="Secure payment form"
      name="payment-frame"
      className="payment-frame"
      width="100%"
      height={380}
      data-testid="payment-frame"
    />
  );
});
