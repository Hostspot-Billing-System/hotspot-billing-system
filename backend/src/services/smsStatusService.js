let lastSmsSendAtMs = null;
let lastSmsErrorAtMs = null;

export function recordSmsSendSuccess() {
  lastSmsSendAtMs = Date.now();
}

export function recordSmsSendError() {
  lastSmsErrorAtMs = Date.now();
}

export function getSmsStatus({ windowMs = 5 * 60 * 1000 } = {}) {
  if (lastSmsSendAtMs == null) return false;

  const now = Date.now();
  const isRecent = now - lastSmsSendAtMs < windowMs;
  const noErrorSinceSend = lastSmsErrorAtMs == null || lastSmsErrorAtMs <= lastSmsSendAtMs;

  return Boolean(isRecent && noErrorSinceSend);
}
