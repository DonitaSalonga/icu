// Warning banner injected into the exam page (R17, DSD.md § Components "Warning banner").
// Plain DOM in a closed shadow root so the page's CSS can't affect it and it can't affect the page.
// It never takes focus, auto-hides after 10 s (paused while hovered or focused), and is announced
// by screen readers through role="alert".

const AUTO_HIDE_MS = 10_000;

const STYLE = `
  :host { all: initial; }
  .bar {
    position: fixed; top: 12px; left: 50%; z-index: 2147483647;
    display: flex; align-items: flex-start; gap: 12px; box-sizing: border-box;
    width: min(560px, calc(100vw - 16px)); max-height: 72px; overflow: hidden;
    padding: 12px 16px; border-radius: 16px;
    background: #faefc5; color: #7a5200; border-left: 4px solid #7a5200;
    box-shadow: 0 6px 16px rgb(28 25 23 / 0.08);
    font: 14px/20px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    transform: translate(-50%, 0); opacity: 1; transition: transform 200ms ease-out, opacity 200ms ease-out;
  }
  .bar.hidden { transform: translate(-50%, -140%); opacity: 0; pointer-events: none; transition: transform 150ms ease-in, opacity 150ms ease-in; }
  @media (max-width: 480px) { .bar { max-height: 84px; } }
  .text { flex: 1; }
  .text strong { font-weight: 600; }
  .extra { display: block; }
  button {
    min-width: 24px; min-height: 32px; padding: 0 12px; border-radius: 10px; cursor: pointer;
    border: 1px solid #7a5200; background: #fffdf9; color: #7a5200; font: inherit; font-weight: 600;
  }
  button:focus-visible { outline: 2px solid #b4501e; outline-offset: 2px; }
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
      strong.textContent = `${label}: `;
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
