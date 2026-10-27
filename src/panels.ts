import Phaser from 'phaser';
import { DIFFICULTIES } from './config';
import { NAME_PATTERN, RunStats, submitScore, SubmitResult, topScores } from './leaderboard';
import { saveSettings, settings } from './settings';
import { formatNumber } from './ui';

// HTML overlays for the online leaderboard, shown over the game canvas. All player-supplied
// text is inserted with textContent, never as HTML.

const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

interface Turnstile {
  render(element: HTMLElement, options: { sitekey: string; theme: string; callback: (token: string) => void }): string;
  reset(widgetId: string): void;
}

let current: { root: HTMLElement; close: () => void } | null = null;

/** True while a panel is open; scenes ignore their own controls meanwhile. */
export const panelOpen = () => current !== null;

export function closePanel(): void {
  current?.close();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Shows a panel and pauses the scene's keyboard so typing doesn't trigger game shortcuts. */
function show(scene: Phaser.Scene, root: HTMLElement, onClose: () => void): void {
  closePanel();
  const keyboard = scene.input.keyboard;
  if (keyboard) keyboard.enabled = false;
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  const close = () => {
    if (current?.root !== root) return;
    current = null;
    root.remove();
    document.removeEventListener('keydown', onKey);
    if (keyboard) keyboard.enabled = true;
    onClose();
  };
  document.addEventListener('keydown', onKey);
  document.body.append(root);
  current = { root, close };
}

let turnstileScript: Promise<Turnstile | null> | null = null;

function loadTurnstile(): Promise<Turnstile | null> {
  turnstileScript ??= new Promise((resolve) => {
    const script = el('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve((window as unknown as { turnstile?: Turnstile }).turnstile ?? null);
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
  return turnstileScript;
}

/** Asks for a name and submits the run. Resolves with the server's result, or null if cancelled. */
export function openSubmitPanel(scene: Phaser.Scene, runId: string, score: number, stats: RunStats): Promise<SubmitResult | null> {
  return new Promise((resolve) => {
    let result: SubmitResult | null = null;
    const root = el('div', 'pq-overlay');
    const form = el('form', 'pq-panel');
    const input = el('input', 'pq-input');
    input.maxLength = 12;
    input.setAttribute('autocomplete', 'nickname');
    input.placeholder = 'Your name';
    input.value = settings.playerName;
    input.setAttribute('aria-label', 'Your name');
    const bot = el('div', 'pq-turnstile');
    const message = el('p', 'pq-message');
    message.setAttribute('role', 'status');
    const submit = el('button', 'pq-button', 'SUBMIT');
    submit.type = 'submit';
    const cancel = el('button', 'pq-button', 'CANCEL');
    cancel.type = 'button';
    const buttons = el('div', 'pq-row');
    buttons.append(submit, cancel);
    form.append(
      el('h2', 'pq-title', 'SUBMIT SCORE'),
      el('p', 'pq-score', formatNumber(score)),
      input,
      el('p', 'pq-hint', '3–12 letters, numbers, spaces, - or _'),
      bot,
      message,
      buttons,
    );
    root.append(form);

    let token: string | undefined;
    let widget: string | undefined;
    let turnstile: Turnstile | null = null;
    if (TURNSTILE_SITE_KEY) {
      void loadTurnstile().then((api) => {
        turnstile = api;
        if (!api) message.textContent = 'Could not load the bot check. Try again later.';
        else widget = api.render(bot, { sitekey: TURNSTILE_SITE_KEY, theme: 'dark', callback: (t) => (token = t) });
      });
    }

    cancel.addEventListener('click', () => closePanel());
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = input.value.trim().replace(/\s+/g, ' ');
      if (!NAME_PATTERN.test(name)) {
        message.textContent = 'Names are 3–12 letters, numbers, spaces, - or _';
        return;
      }
      if (TURNSTILE_SITE_KEY && !token) {
        message.textContent = 'Please complete the bot check';
        return;
      }
      submit.disabled = true;
      message.textContent = 'Submitting…';
      try {
        result = await submitScore(runId, name, stats, token);
        settings.playerName = name;
        saveSettings();
        closePanel();
      } catch (error) {
        message.textContent = error instanceof Error ? error.message : 'Something went wrong';
        submit.disabled = false;
        // Turnstile tokens are single-use, so get a fresh one for the retry.
        if (turnstile && widget) {
          token = undefined;
          turnstile.reset(widget);
        }
      }
    });

    show(scene, root, () => resolve(result));
    input.focus();
    input.select();
  });
}

/** Shows the top 20 for a difficulty, with ‹ › to browse the others. */
export function openBoardPanel(scene: Phaser.Scene, difficulty: number): void {
  const root = el('div', 'pq-overlay');
  const panel = el('div', 'pq-panel pq-board');
  const prev = el('button', 'pq-button pq-small', '<');
  const next = el('button', 'pq-button pq-small', '>');
  const label = el('span', 'pq-difficulty');
  const tabs = el('div', 'pq-row');
  tabs.append(prev, label, next);
  const list = el('ol', 'pq-list');
  const status = el('p', 'pq-message');
  const close = el('button', 'pq-button', 'CLOSE');
  panel.append(el('h2', 'pq-title', 'LEADERBOARD'), tabs, status, list, close);
  root.append(panel);

  let shown = difficulty;
  let request = 0;
  const load = async () => {
    const id = ++request;
    const info = DIFFICULTIES[shown];
    label.textContent = info.name.toUpperCase();
    label.style.color = info.color;
    list.replaceChildren();
    status.textContent = 'Loading…';
    try {
      const scores = await topScores(shown);
      if (id !== request) return; // a newer tab was picked meanwhile
      status.textContent = scores.length === 0 ? 'No scores yet. Be the first!' : '';
      list.replaceChildren(
        ...scores.map((entry) => {
          const row = el('li');
          row.append(el('span', 'pq-name', entry.name), el('span', 'pq-points', formatNumber(entry.score)));
          return row;
        }),
      );
    } catch (error) {
      if (id === request) status.textContent = error instanceof Error ? error.message : 'Could not load scores';
    }
  };
  const step = (by: number) => {
    shown = (shown + by + DIFFICULTIES.length) % DIFFICULTIES.length;
    void load();
  };
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  close.addEventListener('click', () => closePanel());
  root.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });

  show(scene, root, () => undefined);
  close.focus();
  void load();
}
