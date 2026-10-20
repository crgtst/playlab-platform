/**
 * <review-stars> — a star rating web component rendered in an OPEN shadow root (practice for piercing shadow DOM).
 *
 *   <review-stars value="4" readonly></review-stars>         display only: "4 out of 5 stars"
 *   <review-stars value="0" label="Your rating"></review-stars> input: a radiogroup of 5 stars
 *
 * Input mode supports click, Arrow keys, Home/End, and fires a `change` CustomEvent with `detail.value`
 * (bubbles and is composed). Test ids inside the shadow root: stars-display, stars-input, star-1..star-5, stars-value.
 */
const STYLE = `
  :host { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 1.25rem; line-height: 1; }
  .display { color: #b45309; letter-spacing: 0.1em; }
  .group { display: inline-flex; gap: 0.15rem; }
  button { font: inherit; background: none; border: none; padding: 0.1rem; cursor: pointer; color: #b8b8b0; border-radius: 4px; }
  button.on { color: #b45309; }
  button:focus-visible { outline: 3px solid #f2b705; outline-offset: 1px; }
  .value { font-size: 0.85rem; color: inherit; }
`;

function starsLabel(n: number): string {
  return `${n} ${n === 1 ? 'star' : 'stars'}`;
}

export class ReviewStarsElement extends HTMLElement {
  static observedAttributes = ['value', 'readonly', 'label'];
  private root: ShadowRoot;
  private mode: 'display' | 'input' | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  get value(): number {
    const n = Number(this.getAttribute('value') ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.min(5, Math.round(n))) : 0;
  }

  set value(v: number) {
    this.setAttribute('value', String(v));
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  private render() {
    const mode = this.hasAttribute('readonly') ? 'display' : 'input';
    if (mode !== this.mode) {
      this.mode = mode;
      this.root.innerHTML = `<style>${STYLE}</style>` + (mode === 'display' ? this.displayMarkup() : this.inputMarkup());
      if (mode === 'input') this.wireInput();
    }
    this.update();
  }

  private displayMarkup() {
    return `<span class="display" role="img" data-testid="stars-display"></span>`;
  }

  private inputMarkup() {
    const buttons = [1, 2, 3, 4, 5]
      .map((n) => `<button type="button" role="radio" data-value="${n}" data-testid="star-${n}" aria-label="${starsLabel(n)}">★</button>`)
      .join('');
    return `<div class="group" role="radiogroup" data-testid="stars-input">${buttons}</div><span class="value" data-testid="stars-value" aria-hidden="true"></span>`;
  }

  private update() {
    const v = this.value;
    if (this.mode === 'display') {
      const el = this.root.querySelector('.display')!;
      el.textContent = '★'.repeat(v) + '☆'.repeat(5 - v);
      el.setAttribute('aria-label', `${v} out of 5 stars`);
      return;
    }
    const group = this.root.querySelector('[role="radiogroup"]')!;
    group.setAttribute('aria-label', this.getAttribute('label') ?? 'Rating');
    this.root.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const n = Number(b.dataset.value);
      b.classList.toggle('on', n <= v);
      b.setAttribute('aria-checked', String(n === v));
      // Roving tabindex: one tab stop for the whole group.
      b.tabIndex = n === (v || 1) ? 0 : -1;
    });
    this.root.querySelector('.value')!.textContent = v ? `${v}/5` : '';
  }

  private select(n: number, focus: boolean) {
    this.value = n;
    if (focus) this.root.querySelector<HTMLButtonElement>(`button[data-value="${n}"]`)?.focus();
    this.dispatchEvent(new CustomEvent('change', { detail: { value: n }, bubbles: true, composed: true }));
  }

  private wireInput() {
    this.root.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.addEventListener('click', () => this.select(Number(b.dataset.value), true));
      b.addEventListener('keydown', (e) => {
        const current = this.value || 0;
        const next =
          e.key === 'ArrowRight' || e.key === 'ArrowUp'
            ? Math.min(5, current + 1)
            : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
              ? Math.max(1, current - 1)
              : e.key === 'Home'
                ? 1
                : e.key === 'End'
                  ? 5
                  : null;
        if (next !== null) {
          e.preventDefault();
          this.select(next, true);
        }
      });
    });
  }
}

if (!customElements.get('review-stars')) customElements.define('review-stars', ReviewStarsElement);
