class WithdrawalRuleError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const COMMISSION_RATE = 0.06;
const MIN_WITHDRAWAL_AMOUNT = 500;

function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function parseAmount(amount) {
  const raw = String(amount ?? '').trim();
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n)) {
    throw new WithdrawalRuleError('INVALID_AMOUNT', 'amount must be a valid number');
  }
  return round2(n);
}

function getWithdrawalFee(amount) {
  if (amount >= 500 && amount <= 60000) return 600;
  if (amount >= 60001 && amount <= 500000) return 1200;
  if (amount >= 500001 && amount <= 1000000) return 2000;
  if (amount >= 1000001 && amount <= 5000000) return 2400;
  return 0;
}

export function calculateWithdrawal(amount) {
  const requested = parseAmount(amount);
  const allowed = requested >= MIN_WITHDRAWAL_AMOUNT;

  const commissionAmount = allowed ? round2(requested * COMMISSION_RATE) : 0;
  const withdrawalFee = allowed ? round2(getWithdrawalFee(requested)) : 0;
  const netAmount = allowed ? round2(requested - commissionAmount - withdrawalFee) : 0;

  return {
    requested_amount: requested,
    commission_amount: commissionAmount,
    withdrawal_fee: withdrawalFee,
    net_amount: netAmount,
    allowed,
  };
}

export async function validateSufficientBalance(clientId, amount) {
  const id = Number(clientId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new WithdrawalRuleError('INVALID_CLIENT', 'clientId must be a valid number');
  }

  const preview = calculateWithdrawal(amount);
  if (!preview.allowed) {
    throw new WithdrawalRuleError('MIN_AMOUNT', `Minimum withdrawal amount is UGX ${MIN_WITHDRAWAL_AMOUNT}.`);
  }

  throw new WithdrawalRuleError(
    'BALANCE_CHECK_NOT_IMPLEMENTED',
    'Balance validation is not implemented yet (no database balance reads/writes).'
  );
}

