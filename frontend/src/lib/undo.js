// Deferred-action helpers backed by Sonner toasts.
//
// The canonical "undo" pattern for destructive actions in modern UIs:
// don't hit the destructive endpoint immediately — show a toast with an
// Undo button and wait N seconds. If the user clicks Undo, cancel the
// scheduled action and fire `onUndo` (optional). Otherwise execute the
// action when the timer expires.
//
// This gives a much better UX than `confirm()` because:
// - The action feels instant (no modal blocks the flow).
// - Mistakes are recoverable for a few seconds.
// - The component code stays declarative ("schedule this") instead of
//   wiring its own state machine.

import { toast } from 'sonner';

const DEFAULT_DELAY = 5000;

/**
 * Show an undo toast that fires `onConfirm` after a delay unless the user
 * clicks Undo. Optionally calls `onUndo` if the user undoes.
 *
 * @param {object} opts
 * @param {string} opts.message    — main toast message (e.g. "Transação apagada")
 * @param {string} [opts.undoLabel] — label on the undo button (default "Anular")
 * @param {number} [opts.delayMs]  — ms before firing onConfirm (default 5000)
 * @param {() => Promise<any> | any} opts.onConfirm — runs when the timer expires
 * @param {() => Promise<any> | any} [opts.onUndo]  — runs when user clicks Undo
 * @param {() => any} [opts.onComplete] — runs after either branch settles
 */
export function deferWithUndo({
  message,
  undoLabel = 'Anular',
  delayMs = DEFAULT_DELAY,
  onConfirm,
  onUndo,
  onComplete,
}) {
  let undone = false;
  const timeout = setTimeout(async () => {
    if (undone) return;
    try {
      await onConfirm();
    } catch (err) {
      toast.error(`Falhou: ${err.message}`);
    } finally {
      onComplete?.();
    }
  }, delayMs);

  toast(message, {
    duration: delayMs,
    action: {
      label: undoLabel,
      onClick: async () => {
        undone = true;
        clearTimeout(timeout);
        try {
          await onUndo?.();
        } catch (err) {
          toast.error(`Anular falhou: ${err.message}`);
        } finally {
          onComplete?.();
        }
      },
    },
  });
}

/**
 * Run an async action and surface its outcome via toasts. Use for actions
 * where undo doesn't apply (success/error feedback only).
 */
export async function withToast(promise, { loading, success, error } = {}) {
  return toast.promise(promise, {
    loading: loading ?? 'A processar...',
    success: success ?? 'Concluído',
    error: (err) => `${error ?? 'Erro'}: ${err.message || err}`,
  });
}
