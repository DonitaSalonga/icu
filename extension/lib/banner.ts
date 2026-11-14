// Warning banner injected into the exam page (R17, DSD.md § Components "Warning banner").
// Plain DOM in a closed shadow root so the page's CSS can't affect it and it can't affect the page.
// It never takes focus, auto-hides after 10 s (paused while hovered or focused), and is announced
// by screen readers through role="alert".

const AUTO_HIDE_MS = 10_000;

const STYLE = `
  :host { all: initial; }
  .bar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
    display: flex; align-items: center; gap: 12px; max-height: 64px; overflow: hidden;
    padding: 10px 16px; box-sizing: border-box;
    background: #fef3c7; color: #92400e; border-bottom: 2px solid #92400e;
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.12);
    font: 14px/20px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    transform: translateY(0); transition: transform 200ms ease-out;
  }
  .bar.hidden { transform: translateY(-110%); transition: transform 150ms ease-in; }
  .text { flex: 1; }
  .text strong { font-weight: 600; }
  button {
    min-width: 24px; min-height: 32px; padding: 0 12px; border-radius: 8px; cursor: pointer;
    border: 1px solid #92400e; background: #ffffff; color: #92400e; font: inherit; font-weight: 600;
  }
  button:focus-visible { outline: 2px solid #1d4ed8; outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .bar, .bar.hidden { transition: none; } }
`;

export interface Banner {
  show(n: number, limit: number, text: string, limitReached: boolean): void;
  destroy(): void;
}

export function createBanner(): Banner {
  const host = document.createElement('icu-warning-banner');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>${STYLE}</style>
    <div class="bar hidden" role="alert" aria-live="assertive">
      <span class="text"></span>
      <button type="button">Dismiss</button>
    </div>`;
  const bar = root.querySelector<HTMLDivElement>('.bar')!;
  const textEl = root.querySelector<HTMLSpanElement>('.text')!;
  const button = root.querySelector<HTMLButtonElement>('button')!;
  document.documentElement.appendChild(host);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let paused = false;
  const hide = () => bar.classList.add('hidden');
  const schedule = () => {
    if (timer) clearTimeout(timer);
    if (!paused) timer = setTimeout(hide, AUTO_HIDE_MS);
  };
  const pause = () => { paused = true; if (timer) clearTimeout(timer); };
  const resume = () => { paused = false; schedule(); };

  button.addEventListener('click', hide);
  bar.addEventListener('mouseenter', pause);
  bar.addEventListener('mouseleave', resume);
  bar.addEventListener('focusin', pause);
  bar.addEventListener('focusout', resume);

  return {
    show(n, limit, text, limitReached) {
      const label = limitReached ? 'Warning limit reached' : `Warning ${n} of ${limit}`;
      textEl.innerHTML = '';
      const strong = document.createElement('strong');
      strong.textContent = `⚠️ ${label}: `;
      textEl.append(strong, document.createTextNode(text));
      bar.classList.remove('hidden');
      schedule();
    },
    destroy() {
      if (timer) clearTimeout(timer);
      host.remove();
    },
  };
}
