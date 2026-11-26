import { h } from './dom';
import { toAppError } from '../errors';

type Kind = 'info' | 'ok' | 'warn' | 'error';

export function toast(message: string, kind: Kind = 'info', opts: { hint?: string; detail?: string; ms?: number } = {}): void {
  const host = document.getElementById('toasts');
  if (!host) return;
  const close = h('button', { class: 'toast-x', type: 'button', 'aria-label': 'Dismiss' }, '\u00D7');
  const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    h('div', { class: 'toast-body' },
      h('strong', {}, message),
      opts.hint ? h('span', { class: 'toast-hint' }, opts.hint) : null,
      opts.detail ? h('details', {}, h('summary', {}, 'Technical details'), h('pre', {}, opts.detail)) : null),
    close);
  const remove = (): void => el.remove();
  close.addEventListener('click', remove);
  host.append(el);
  window.setTimeout(remove, opts.ms ?? (kind === 'error' ? 15_000 : 6_000));
}

export function showError(e: unknown): void {
  const err = toAppError(e);
  toast(err.message, 'error', { hint: err.hint, detail: err.detail });
}
