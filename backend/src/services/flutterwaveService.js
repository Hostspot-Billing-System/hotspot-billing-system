function hasValue(value) {
  return value != null && String(value).trim() !== '';
}

class FlutterwaveError extends Error {
  constructor(code, message, httpStatus, details) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

function getEnv(name, { fallback } = {}) {
  const value = process.env[name];
  if (hasValue(value)) return String(value).trim();
  if (fallback && hasValue(process.env[fallback])) return String(process.env[fallback]).trim();
  return null;
}

function requireEnv(name, { fallback } = {}) {
  const value = getEnv(name, { fallback });
  if (!value) {
    throw new FlutterwaveError('CONFIG_ERROR', `Missing required environment variable: ${name}`, 500);
  }
  return value;
}

function normalizeText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

// Accept: +2567XXXXXXXX, 2567XXXXXXXX, 07XXXXXXXX
// Return: { e164: +2567..., compact: 2567... }
export function normalizeUgPhoneForFlutterwave(phoneNumber) {
  const raw = normalizeText(phoneNumber);
  if (!raw) {
    throw new FlutterwaveError('BAD_REQUEST', 'phoneNumber is required', 400);
  }

  const digits = raw.replace(/\s+/g, '').replace(/^\+/, '');

  let compact = null;
  if (/^2567\d{8}$/.test(digits)) {
    compact = digits;
  } else if (/^07\d{8}$/.test(digits)) {
    compact = `256${digits.slice(1)}`;
  } else if (/^7\d{8}$/.test(digits)) {
    compact = `256${digits}`;
  }

  if (!compact) {
    throw new FlutterwaveError('BAD_REQUEST', 'Invalid Uganda phone number format', 400);
  }

  return {
    e164: `+${compact}`,
    compact,
  };
}

export function normalizeUgandaNetwork(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'MTN') return 'MTN';
  if (raw === 'AIRTEL') return 'AIRTEL';
  if (!raw) return 'MTN';
  throw new FlutterwaveError('BAD_REQUEST', 'network must be MTN or AIRTEL', 400);
}

async function fetchJson(url, { method, headers, body, timeoutMs } = {}) {
  if (typeof fetch !== 'function') {
    throw new FlutterwaveError('CONFIG_ERROR', 'Global fetch() is not available (requires Node.js 18+)', 500);
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(1, Number(timeoutMs ?? 15000)));

  try {
    const res = await fetch(url, {
      method: method ?? 'GET',
      headers,
      body: body == null ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const message =
        json?.message ||
        json?.data?.message ||
        json?.error ||
        `Flutterwave request failed (${res.status})`;
      throw new FlutterwaveError('FLW_HTTP_ERROR', message, 502, {
        httpStatus: res.status,
        url,
        response: json ?? text,
      });
    }

    return json;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new FlutterwaveError('FLW_TIMEOUT', 'Flutterwave request timed out', 504);
    }
    if (err instanceof FlutterwaveError) throw err;
    throw new FlutterwaveError('FLW_NETWORK_ERROR', 'Failed to reach Flutterwave', 502, { cause: err?.message ?? String(err) });
  } finally {
    clearTimeout(t);
  }
}

function getFlutterwaveBaseUrl() {
  return String(process.env.FLW_BASE_URL ?? 'https://api.flutterwave.com').replace(/\/+$/, '');
}

function getFlutterwaveSecretKey() {
  // Support both requested names + existing repo .env names.
  return requireEnv('FLW_SECRET_KEY', { fallback: 'FLW_CLIENT_SECRET' });
}

export async function flutterwaveChargeMobileMoneyUganda({
  tx_ref,
  amount,
  currency = 'UGX',
  network,
  phone_number,
  email,
  fullname,
}) {
  const secretKey = getFlutterwaveSecretKey();
  const baseUrl = getFlutterwaveBaseUrl();

  const ref = normalizeText(tx_ref);
  if (!ref) throw new FlutterwaveError('BAD_REQUEST', 'tx_ref is required', 400);

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new FlutterwaveError('BAD_REQUEST', 'amount must be a valid positive number', 400);
  }

  const net = normalizeUgandaNetwork(network);
  const phone = normalizeText(phone_number);
  if (!phone) throw new FlutterwaveError('BAD_REQUEST', 'phone_number is required', 400);

  const payload = {
    tx_ref: ref,
    amount: String(Math.floor(amt)),
    currency,
    network: net,
    email: normalizeText(email) ?? 'customer@hotspot.local',
    phone_number: phone,
    fullname: normalizeText(fullname) ?? 'Hotspot Customer',
  };

  const json = await fetchJson(`${baseUrl}/v3/charges?type=mobile_money_uganda`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: payload,
  });

  return {
    raw: json,
    status: json?.status ?? null,
    message: json?.message ?? null,
    data: json?.data ?? null,
  };
}

export async function flutterwaveVerifyTransaction({ id }) {
  const secretKey = getFlutterwaveSecretKey();
  const baseUrl = getFlutterwaveBaseUrl();
  const txId = normalizeText(id);
  if (!txId) throw new FlutterwaveError('BAD_REQUEST', 'id is required', 400);

  const json = await fetchJson(`${baseUrl}/v3/transactions/${encodeURIComponent(txId)}/verify`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
  });

  return {
    raw: json,
    status: json?.status ?? null,
    message: json?.message ?? null,
    data: json?.data ?? null,
  };
}

export function toFlutterwaveHttpError(err) {
  if (err instanceof FlutterwaveError) {
    const httpStatus = Number(err.httpStatus) || 500;
    if (httpStatus >= 500) {
      return {
        httpStatus: 502,
        body: { success: false, error: { code: err.code, message: 'Payment provider error' } },
      };
    }

    return {
      httpStatus,
      body: { success: false, error: { code: err.code, message: err.message } },
    };
  }

  return {
    httpStatus: 502,
    body: { success: false, error: { code: 'PAYMENT_PROVIDER_ERROR', message: 'Payment provider error' } },
  };
}
