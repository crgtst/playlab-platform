import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, ApiRequestError, errorMessage } from '../api/client';
import type { ReviewList } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../lib/format';
import { ReviewStars } from './ReviewStars';

const BODY_MAX = 1000;

/** Product reviews. Review text is always rendered as text (React escapes it), never as HTML. */
export function Reviews({ productId }: { productId: number }) {
  const { user } = useAuth();
  const location = useLocation();
  const [list, setList] = useState<ReviewList | null>(null);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<ReviewList>(`/products/${productId}/reviews`)
      .then(setList)
      .catch(() => setList({ data: [], meta: { count: 0, average: null } }));
  }, [productId]);

  useEffect(load, [load]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const next: Record<string, string> = {};
    if (!rating) next.rating = 'Choose a rating';
    if (!title.trim()) next.title = 'Title is required';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api(`/products/${productId}/reviews`, { method: 'POST', body: { rating, title: title.trim(), body: body.trim() } });
      setSubmitted(true);
      load();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 422) setErrors(err.fieldErrors());
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const average = list?.meta.average ?? null;

  return (
    <section aria-labelledby="reviews-heading" className="reviews" data-testid="reviews">
      <h2 id="reviews-heading">Reviews</h2>
      {list && (
        <p className="reviews-summary" data-testid="reviews-summary" data-count={list.meta.count} data-average={average ?? ''}>
          {average !== null ? (
            <>
              <ReviewStars value={Math.round(average)} readOnly testId="reviews-average-stars" /> {average} out of 5 ({list.meta.count}{' '}
              {list.meta.count === 1 ? 'review' : 'reviews'})
            </>
          ) : (
            'No reviews yet.'
          )}
        </p>
      )}
      {list && list.data.length > 0 && (
        <ul className="review-list" data-testid="review-list">
          {list.data.map((r) => (
            <li key={r.id}>
              <article className="review" data-testid="review" data-review-id={r.id} data-rating={r.rating}>
                <h3 className="h3" dir="auto" data-testid="review-title">
                  {r.title}
                </h3>
                <ReviewStars value={r.rating} readOnly testId="review-stars" />
                <p dir="auto" data-testid="review-body">
                  {r.body}
                </p>
                <p className="muted small">
                  <span dir="auto" data-testid="review-author">
                    {r.author.name}
                  </span>{' '}
                  · <time dateTime={r.createdAt}>{formatDate(r.createdAt)}</time>
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}

      {!user ? (
        <p>
          <Link to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} data-testid="review-login-link">
            Log in to write a review
          </Link>
        </p>
      ) : submitted ? (
        <p className="alert success" role="status" data-testid="review-submitted">
          Thanks for your review.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="review-form" data-testid="review-form" aria-labelledby="review-form-heading">
          <h3 id="review-form-heading">Write a review</h3>
          {formError && (
            <p className="alert error" role="alert" data-testid="review-form-error">
              {formError}
            </p>
          )}
          <div className="field">
            <span id="review-rating-label" className="label">
              Your rating
            </span>
            <ReviewStars value={rating} label="Your rating" testId="review-rating" onChange={setRating} />
            {errors.rating && (
              <p className="field-error" role="alert" data-testid="review-rating-error">
                {errors.rating}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="review-title">Title</label>
            <input
              id="review-title"
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={errors.title ? true : undefined}
              data-testid="review-title-input"
            />
            {errors.title && (
              <p className="field-error" role="alert" data-testid="review-title-input-error">
                {errors.title}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="review-body">Review (optional)</label>
            <textarea
              id="review-body"
              rows={4}
              maxLength={BODY_MAX}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-describedby="review-body-counter"
              data-testid="review-body-input"
            />
            <p id="review-body-counter" className="hint" aria-live="polite" data-testid="review-body-counter">
              {body.length}/{BODY_MAX} characters
            </p>
          </div>
          <button type="submit" disabled={busy} data-testid="review-submit">
            {busy ? 'Posting…' : 'Post review'}
          </button>
        </form>
      )}
    </section>
  );
}
