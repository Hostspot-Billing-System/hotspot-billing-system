import React from 'react';

import PortalLayout from './PortalLayout.jsx';
import {
	buyBundle,
	fetchPortalBundles,
	getApiErrorMessage,
	voucherConnect,
} from '../services/portal.js';

function toInt(value) {
	const n = Number(value);
	return Number.isFinite(n) ? Math.trunc(n) : null;
}

function formatDurationLabelFromMinutes(durationMinutes) {
	const mins = toInt(durationMinutes);
	if (mins == null || mins <= 0) return '';
	if (mins % 10080 === 0) {
		const weeks = mins / 10080;
		return weeks === 1 ? '1 Week' : `${weeks} Weeks`;
	}
	if (mins % 1440 === 0) {
		const days = mins / 1440;
		return days === 1 ? '1 Day' : `${days} Days`;
	}
	if (mins % 60 === 0) {
		const hours = mins / 60;
		return hours === 1 ? '1 Hour' : `${hours} Hours`;
	}
	return `${mins} Minutes`;
}

function formatCountdown(totalSeconds) {
	const s = toInt(totalSeconds);
	if (s == null || s < 0) return '0:00';
	const hours = Math.floor(s / 3600);
	const minutes = Math.floor((s % 3600) / 60);
	const seconds = s % 60;
	if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function PortalHome() {
	const [voucherCode, setVoucherCode] = React.useState('');
	const [phone, setPhone] = React.useState('256707434218');
	const [bundles, setBundles] = React.useState([]);
	const [bundlesError, setBundlesError] = React.useState('');
	const [voucherError, setVoucherError] = React.useState('');
	const [voucherSuccess, setVoucherSuccess] = React.useState(null);
	const [voucherExpiredMessage, setVoucherExpiredMessage] = React.useState('');
	const [voucherCountdownSeconds, setVoucherCountdownSeconds] = React.useState(null);
	const [buyError, setBuyError] = React.useState('');
	const [buyResult, setBuyResult] = React.useState(null);
	const inFlightRef = React.useRef({ voucher: false, pay: false, context: false, bundles: false });
	const voucherTimerRef = React.useRef(null);
	const voucherExpiresAtMsRef = React.useRef(null);
	const voucherInputRef = React.useRef(null);

	React.useEffect(() => {
		return () => {
			if (voucherTimerRef.current) {
				clearInterval(voucherTimerRef.current);
				voucherTimerRef.current = null;
			}
		};
	}, []);

	React.useEffect(() => {
		let alive = true;
		(async () => {
			if (inFlightRef.current.bundles) return;
			inFlightRef.current.bundles = true;
			try {
				const data = await fetchPortalBundles();
				if (!alive) return;
				setBundlesError('');
				const normalized = (Array.isArray(data) ? data : []).map((b) => {
					const name = String(b?.name ?? '').trim();
					const rateLimit = String(b?.rateLimit ?? b?.rate_limit ?? b?.['rate-limit'] ?? '').trim();
					const secondary = rateLimit ? rateLimit : '';
					return {
						id: b?.id ?? name,
						name,
						secondary,
						_raw: b,
					};
				});
				setBundles(normalized);
			} catch (err) {
				if (alive) {
					setBundlesError(getApiErrorMessage(err));
					setBundles([]);
				}
			} finally {
				inFlightRef.current.bundles = false;
			}
		})();
		return () => {
			alive = false;
		};
	}, []);

	async function onConnectVoucher() {
		if (inFlightRef.current.voucher) return;
		const code = String(voucherCode ?? '').trim();
		if (!code) {
			setVoucherError('Enter voucher code');
			return;
		}

		inFlightRef.current.voucher = true;
		try {
			setVoucherError('');
			setVoucherSuccess(null);
			setVoucherExpiredMessage('');
			setVoucherCountdownSeconds(null);
			voucherExpiresAtMsRef.current = null;
			if (voucherTimerRef.current) {
				clearInterval(voucherTimerRef.current);
				voucherTimerRef.current = null;
			}

			const data = await voucherConnect({ voucher: code });
			const durationMinutes = toInt(data?.durationMinutes ?? data?.duration_minutes);
			const expiresAtIso = data?.expiresAt ?? data?.expires_at ?? null;
			const expiresAtMs = expiresAtIso ? Date.parse(expiresAtIso) : NaN;

			setVoucherSuccess({
				message: 'Internet access granted',
				durationMinutes,
				expiresAt: Number.isFinite(expiresAtMs) ? expiresAtIso : null,
			});

			// Countdown is calculated from timestamps (not by decrementing), so refreshes are correct.
			if (Number.isFinite(expiresAtMs)) {
				voucherExpiresAtMsRef.current = expiresAtMs;
				const update = () => {
					const ms = voucherExpiresAtMsRef.current;
					if (!Number.isFinite(ms)) return;
					const remaining = Math.max(0, Math.floor((ms - Date.now()) / 1000));
					setVoucherCountdownSeconds(remaining);
					if (remaining <= 0) {
						if (voucherTimerRef.current) {
							clearInterval(voucherTimerRef.current);
							voucherTimerRef.current = null;
						}
						voucherExpiresAtMsRef.current = null;
						setVoucherSuccess(null);
						setVoucherCountdownSeconds(null);
						setVoucherExpiredMessage('Session expired');
						// "Redirect" back to voucher entry.
						try {
							voucherInputRef.current?.focus?.();
						} catch {
							// ignore
						}
					}
				};
				update();
				voucherTimerRef.current = setInterval(update, 1000);
			}

			setVoucherCode('');
		} catch (err) {
			setVoucherError(getApiErrorMessage(err));
		} finally {
			inFlightRef.current.voucher = false;
		}
	}

	async function onBuyNow(bundle) {
		if (inFlightRef.current.pay) return;
		const msisdn = String(phone ?? '').trim();
		if (!msisdn) {
			setBuyError('Enter phone number');
			return;
		}

		const bundleName = String(bundle?._raw?.profile ?? bundle?._raw?.name ?? bundle?.name ?? '').trim();
		if (!bundleName) {
			setBuyError('Bundle not available');
			return;
		}

		inFlightRef.current.pay = true;
		try {
			setBuyError('');
			setBuyResult(null);
			const data = await buyBundle({ phone: msisdn, bundle: bundleName });
			setBuyResult({ username: data?.username ?? '', password: data?.password ?? '' });
		} catch (err) {
			setBuyError(getApiErrorMessage(err));
		} finally {
			inFlightRef.current.pay = false;
		}
	}

	return (
		<PortalLayout>
			<div className="px-5 pb-6 pt-5">
				<div className="text-center">
					<div className="text-[12px] font-extrabold tracking-widest text-white/70">
						CONNECT WITH VOUCHER
					</div>
				</div>

				<div className="mt-4 space-y-3">
					<input
						type="text"
						inputMode="text"
						autoComplete="one-time-code"
						placeholder="Enter voucher code"
						value={voucherCode}
						onChange={(e) => setVoucherCode(e.target.value)}
						ref={voucherInputRef}
						className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-[17px] font-semibold text-white placeholder:text-white/40 outline-none focus:border-white/20"
					/>
					<button
						type="button"
						onClick={onConnectVoucher}
						disabled={inFlightRef.current.voucher}
						className="w-full cursor-pointer rounded-xl bg-emerald-600 px-4 py-3 text-[17px] font-extrabold tracking-wide text-white shadow-[0_10px_22px_rgba(16,185,129,0.22)] transition hover:bg-emerald-500"
					>
						{inFlightRef.current.voucher ? 'CONNECTING...' : 'CONNECT'}
					</button>
					{voucherSuccess?.message ? (
						<div className="text-center text-[12px] font-semibold text-white/70">
							{voucherSuccess.message}
							{voucherSuccess?.durationMinutes ? (
								<span> • {formatDurationLabelFromMinutes(voucherSuccess.durationMinutes)}</span>
							) : null}
							{voucherCountdownSeconds != null ? (
								<span> • {formatCountdown(voucherCountdownSeconds)}</span>
							) : null}
						</div>
					) : null}
					{voucherExpiredMessage ? (
						<div className="text-center text-[12px] font-semibold text-white/70">{voucherExpiredMessage}</div>
					) : null}
					{voucherError ? (
						<div className="text-center text-[12px] font-semibold text-white/70">{voucherError}</div>
					) : null}
				</div>

				<div className="mt-5 text-center">
					<div className="text-[12px] font-semibold text-white/60">
						You can also buy internet using
					</div>
					<div className="mt-3 flex items-center justify-center gap-3">
						<div className="flex items-center justify-center rounded-lg bg-[#e11d48] px-3 py-2 shadow-sm">
							<div className="text-[12px] font-extrabold uppercase tracking-wide text-white">
								airtel money
							</div>
						</div>
						<div className="flex items-center justify-center rounded-lg bg-[#fbbf24] px-3 py-2 shadow-sm">
							<div className="text-[12px] font-extrabold uppercase tracking-wide text-black">
								MTN MoMo
							</div>
						</div>
					</div>
				</div>

				<div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-4">
					<div className="text-center text-[13px] font-extrabold text-emerald-300">
						Enter your phone number to purchase bundles
					</div>
					<div className="mt-0.5 text-center text-[13px] font-extrabold text-emerald-300">
						after tap buy now on the bundle
					</div>

					<div className="mt-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
						<input
							type="tel"
							inputMode="tel"
							autoComplete="tel"
							placeholder="2567XXXXXXXX"
							value={phone}
							onChange={(e) => setPhone(e.target.value)}
							className="w-full bg-transparent text-[17px] font-semibold text-white placeholder:text-white/35 outline-none"
						/>
					</div>
					{buyError ? (
						<div className="mt-3 text-center text-[12px] font-semibold text-white/70">{buyError}</div>
					) : null}
					{buyResult?.username && buyResult?.password ? (
						<div className="mt-3 text-center text-[12px] font-semibold text-white/70">
							Username: {buyResult.username} • Password: {buyResult.password}
						</div>
					) : null}
				</div>

				<div className="mt-5 space-y-3">
					{inFlightRef.current.bundles ? (
						<div className="text-center text-[12px] font-semibold text-white/60">Loading bundles...</div>
					) : null}
					{bundlesError ? (
						<div className="text-center text-[12px] font-semibold text-white/60">{bundlesError}</div>
					) : null}
					{bundles.map((b) => (
						<div
							key={b.id}
							className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
						>
							<div>
								<div className="text-[17px] font-extrabold text-white">{b.name}</div>
								<div className="text-[12px] font-extrabold text-emerald-300">{b.secondary}</div>
							</div>
							<button
								type="button"
								onClick={() => onBuyNow(b)}
								disabled={inFlightRef.current.pay}
								className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-extrabold text-white shadow-sm transition hover:bg-emerald-500"
							>
								{inFlightRef.current.pay ? 'LOADING...' : 'BUY NOW'}
							</button>
						</div>
					))}
				</div>

				<div className="mt-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
					<div>
						<div className="text-[13px] font-extrabold text-white">Need Help?</div>
						<div className="text-[13px] font-semibold text-white/70">Call: 0707434218</div>
					</div>
					<button
						type="button"
						onClick={() => {}}
						className="cursor-pointer rounded-lg bg-sky-500 px-4 py-2 text-[12px] font-extrabold tracking-wide text-white transition hover:bg-sky-400"
					>
						CALL
					</button>
				</div>
			</div>
		</PortalLayout>
	);
}
