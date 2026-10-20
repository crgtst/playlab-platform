import { KeyboardEvent, PointerEvent, useRef, useState } from 'react';

const SWIPE_PX = 40;
const TAP_PX = 10;

/**
 * Product image carousel. Swipe left or right (pointer events, so touch works with hasTouch),
 * tap the image to advance, or use the buttons, dots or arrow keys.
 */
export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [index, setIndex] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const count = images.length;
  const go = (i: number) => setIndex(((i % count) + count) % count);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    start.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
    else if (Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX) go(index + 1);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index - 1);
    }
  };

  if (count === 0) return null;
  return (
    <section
      className="gallery"
      aria-roledescription="carousel"
      aria-label={`${name} images`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid="product-gallery"
      data-index={index}
    >
      <div
        className="gallery-stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (start.current = null)}
        data-testid="gallery-stage"
      >
        <img
          src={images[index]}
          alt={`${name}, image ${index + 1} of ${count}`}
          width={480}
          height={320}
          draggable={false}
          data-testid="gallery-image"
          data-index={index}
        />
      </div>
      <div className="gallery-controls">
        <button type="button" className="secondary" onClick={() => go(index - 1)} aria-label="Previous image" data-testid="gallery-prev">
          ‹
        </button>
        <span className="gallery-dots">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              className={i === index ? 'dot active' : 'dot'}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => go(i)}
              data-testid={`gallery-dot-${i + 1}`}
            />
          ))}
        </span>
        <button type="button" className="secondary" onClick={() => go(index + 1)} aria-label="Next image" data-testid="gallery-next">
          ›
        </button>
      </div>
      <p className="muted small" role="status" aria-live="polite" data-testid="gallery-status">
        Image {index + 1} of {count}
      </p>
    </section>
  );
}
