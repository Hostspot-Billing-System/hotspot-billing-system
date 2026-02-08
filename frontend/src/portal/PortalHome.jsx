import React from 'react';

import PortalLayout from './PortalLayout.jsx';
import PortalSuccess from './PortalSuccess.jsx';
import {
	fetchPortalBundles,
	getApiErrorMessage,
	fetchPaymentStatus,
	initiateFlutterwavePayment,
	voucherConnect,
} from '../services/portal.js';
import mtnLogo from '../assets/mtn.png';

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

function Spinner({ className = '' }) {
	return (
		<svg
			className={`h-5 w-5 animate-spin ${className}`}
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<circle
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeOpacity="0.25"
				strokeWidth="3"
			/>
			<path
				d="M22 12a10 10 0 0 0-10-10"
				stroke="currentColor"
				strokeWidth="3"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function ErrorCard({ message, onRetry }) {
	if (!message) return null;
	return (
		<div role="alert" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
			<div className="flex items-start gap-3">
				<div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 ring-1 ring-rose-400/30">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M12 9v4m0 4h.01M10.29 3.86l-7.4 12.81A2 2 0 0 0 4.62 20h14.76a2 2 0 0 0 1.73-3.33l-7.4-12.81a2 2 0 0 0-3.46 0Z"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							className="text-rose-200"
						/>
					</svg>
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-[13px] font-extrabold text-white">Something went wrong</div>
					<div className="mt-0.5 text-[13px] font-semibold text-white/70">{message}</div>
				</div>
			</div>
			{onRetry ? (
				<button
					type="button"
					onClick={onRetry}
					className="mt-3 w-full rounded-lg bg-white/10 px-4 py-2.5 text-[15px] font-bold text-white ring-1 ring-white/10 transition hover:bg-white/15 active:scale-[0.99]"
				>
					Try again
				</button>
			) : null}
		</div>
	);
}

export default function PortalHome() {
	const [voucherCode, setVoucherCode] = React.useState('');
	const [phone, setPhone] = React.useState('');
	const [bundles, setBundles] = React.useState([]);
	const [selectedBundle, setSelectedBundle] = React.useState(null);
	const [bundlesError, setBundlesError] = React.useState('');
	const [voucherError, setVoucherError] = React.useState('');
	const [voucherSuccess, setVoucherSuccess] = React.useState(null);
	const [buyCountdownSeconds, setBuyCountdownSeconds] = React.useState(null);
	const [buyError, setBuyError] = React.useState('');
	const [buyResult, setBuyResult] = React.useState(null);
	const [isLoadingBundles, setIsLoadingBundles] = React.useState(false);
	const [isConnectingVoucher, setIsConnectingVoucher] = React.useState(false);
	const [isBuying, setIsBuying] = React.useState(false);
	const [showSuccessOverlay, setShowSuccessOverlay] = React.useState(false);
	const [successAutoCloseSeconds, setSuccessAutoCloseSeconds] = React.useState(null);
	const inFlightRef = React.useRef({ voucher: false, pay: false, context: false, bundles: false });
	const buyCountdownTimerRef = React.useRef(null);
		const voucherInputRef = React.useRef(null);
		const voucherConnectError = voucherError;

	const loadBundles = React.useCallback(async () => {
		if (inFlightRef.current.bundles) return;
		inFlightRef.current.bundles = true;
		setIsLoadingBundles(true);
		try {
			setBundlesError('');
			const list = await fetchPortalBundles();
			setBundles(Array.isArray(list) ? list : []);
		} catch (err) {
			setBundles([]);
			setBundlesError(getApiErrorMessage(err) || 'Unable to complete request. Please try again.');
		} finally {
			inFlightRef.current.bundles = false;
			setIsLoadingBundles(false);
		}
	}, [inFlightRef]);

	React.useEffect(() => {
		if (!isBuying) return;
		setBuyCountdownSeconds(12);
		if (buyCountdownTimerRef.current) {
			clearInterval(buyCountdownTimerRef.current);
			buyCountdownTimerRef.current = null;
		}
		buyCountdownTimerRef.current = setInterval(() => {
			setBuyCountdownSeconds((v) => {
				const n = toInt(v);
				if (n == null || n <= 0) return 0;
				return n - 1;
			});
		}, 1000);
		return () => {
			if (buyCountdownTimerRef.current) {
				clearInterval(buyCountdownTimerRef.current);
				buyCountdownTimerRef.current = null;
			}
		};
	}, [isBuying]);

	React.useEffect(() => {
		loadBundles();
	}, [loadBundles]);

	React.useEffect(() => {
		if (!voucherSuccess?.message) return;
		setShowSuccessOverlay(true);
		setSuccessAutoCloseSeconds(4);
	}, [voucherSuccess?.message]);

	React.useEffect(() => {
		const s = toInt(successAutoCloseSeconds);
		if (s == null) return;
		if (s <= 0) {
			setSuccessAutoCloseSeconds(null);
			setShowSuccessOverlay(false);
			return;
		}
		const t = setTimeout(() => setSuccessAutoCloseSeconds((v) => (toInt(v) ?? 0) - 1), 1000);
		return () => clearTimeout(t);
	}, [successAutoCloseSeconds]);

	async function onConnectVoucher() {
		if (inFlightRef.current.voucher) return;
		const code = String(voucherCode ?? '').trim();
		if (!code) {
			setVoucherError('Enter voucher code');
			return;
		}

		inFlightRef.current.voucher = true;
		setIsConnectingVoucher(true);
		try {
			setVoucherError('');
			setVoucherSuccess(null);
			setShowSuccessOverlay(false);
			setSuccessAutoCloseSeconds(null);

			const data = await voucherConnect({ voucher: code });
			const durationMinutes = toInt(data?.durationMinutes ?? data?.duration_minutes);

			setVoucherSuccess({
				message: 'You are now connected',
				durationMinutes,
				expiresAt: null,
			});

			// Preserve input on error; clear on success.
			setVoucherCode('');
		} catch (err) {
			setVoucherError(getApiErrorMessage(err) || 'Unable to complete request. Please try again.');
		} finally {
			inFlightRef.current.voucher = false;
			setIsConnectingVoucher(false);
		}
	}

	async function onBuyNow(bundle) {
		if (inFlightRef.current.pay) return;
		const msisdn = String(phone ?? '').trim();
		if (!msisdn) {
			setBuyError('Enter phone number');
			return;
		}

		const bundleId = String(bundle?.id ?? '').trim();
		if (!bundleId) {
			setBuyError('Bundle not available');
			return;
		}

		inFlightRef.current.pay = true;
		setIsBuying(true);
		try {
			setBuyError('');
			setBuyResult(null);

			setBuyCountdownSeconds(60);
			const countdownTimer = setInterval(() => {
				setBuyCountdownSeconds((v) => {
					if (v == null) return v;
					return Math.max(0, (toInt(v) ?? 0) - 1);
				});
			}, 1000);

			try {
				const init = await initiateFlutterwavePayment({
					phoneNumber: msisdn,
					bundleId,
					network: 'MTN',
				});

				const txRef = init?.tx_ref ?? init?.txRef ?? init?.reference ?? null;
				if (!txRef) throw new Error('Missing transaction reference.');

				const startedAt = Date.now();
				const timeoutMs = 60 * 1000;

				while (Date.now() - startedAt < timeoutMs) {
					const st = await fetchPaymentStatus(txRef);
					const status = String(st?.status ?? '').toLowerCase();

					if (status === 'successful' || status === 'success' || status === 'completed') {
						const voucher = st?.voucher_code ?? st?.voucherCode ?? null;
						setBuyResult({
							username: voucher ? String(voucher) : '',
							password: '',
							txRef,
						});
						setShowSuccessOverlay(true);
						setSuccessAutoCloseSeconds(3);
						return;
					}

					if (status === 'failed') {
						const reason = st?.failure_reason ?? st?.failureReason ?? 'Payment failed. Please try again.';
						throw new Error(String(reason));
					}

					await new Promise((r) => setTimeout(r, 2000));
				}

				throw new Error('Payment confirmation timed out. Please try again.');
			} finally {
				clearInterval(countdownTimer);
				setBuyCountdownSeconds(null);
			}
		} catch (err) {
			setBuyError(getApiErrorMessage(err) || 'Unable to complete request. Please try again.');
		} finally {
			inFlightRef.current.pay = false;
			setIsBuying(false);
		}
	}

	return (
		<PortalLayout
			overlay={
				showSuccessOverlay || isBuying ? (
					<div className="portal-fade-in fixed inset-0 z-50 flex items-stretch justify-center bg-black/45 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] backdrop-blur-sm">
						{showSuccessOverlay ? (
							<div className="portal-pop mx-auto my-auto w-full max-w-105 overflow-hidden rounded-2xl border border-white/10 bg-linear-to-br from-[#2a1c72] via-[#063b6e] to-[#052426] shadow-[0_30px_90px_rgba(0,0,0,0.60)]">
								<div className="border-b border-white/10 bg-white/5 px-5 py-4">
									<div className="text-center text-[12px] font-extrabold tracking-widest text-white/70">SUCCESS</div>
								</div>
								<PortalSuccess
									onDone={() => {
										setShowSuccessOverlay(false);
										setSuccessAutoCloseSeconds(null);
									}}
								/>
								{successAutoCloseSeconds != null ? (
									<div aria-live="polite" className="px-6 pb-6 text-center text-[13px] font-semibold text-white/65">
										Continuing in <span className="font-extrabold text-white">{successAutoCloseSeconds}</span>s…
									</div>
								) : null}
							</div>
						) : null}
						{isBuying ? (
							<div className="portal-pop mx-auto my-auto w-full max-w-105 overflow-hidden rounded-2xl border border-white/10 bg-linear-to-br from-[#2a1c72] via-[#063b6e] to-[#052426] shadow-[0_30px_90px_rgba(0,0,0,0.60)]">
								<div className="border-b border-white/10 bg-white/5 px-5 py-4">
									<div className="text-center text-[12px] font-extrabold tracking-widest text-white/70">PAYMENT</div>
								</div>
								<div className="px-6 py-6 text-center">
									<div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
										<Spinner className="h-6 w-6 text-white/80" />
									</div>
									<div className="mt-3 text-[15px] font-extrabold text-white">Processing Mobile Money…</div>
									<div className="mt-1 text-[13px] font-semibold text-white/65">Approve the prompt on your phone.</div>
									{buyCountdownSeconds != null ? (
										<div aria-live="polite" className="mt-3 text-[13px] font-semibold text-white/65">
											Waiting <span className="font-extrabold text-white">{Math.max(0, buyCountdownSeconds)}</span>s…
										</div>
									) : null}
								</div>
							</div>
						) : null}
					</div>
				) : null
			}
		>
			<div className="px-5 pb-6 pt-5">
				<div className="text-center">
					<div className="text-[12px] font-extrabold tracking-widest text-white/70">
						CONNECT
					</div>
					<div className="mt-1 text-[13px] font-semibold text-white/60">Enter voucher or buy a bundle below</div>
				</div>

				<div className="mt-4 space-y-3" aria-busy={isConnectingVoucher ? 'true' : 'false'}>
					<input
						type="text"
						inputMode="text"
						autoComplete="one-time-code"
						placeholder="Enter voucher code"
						value={voucherCode}
						onChange={(e) => {
							setVoucherCode(e.target.value);
							if (voucherError) setVoucherError('');
						}}
						ref={voucherInputRef}
						className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-[17px] font-semibold text-white placeholder:text-white/40 outline-none transition focus:border-white/20"
					/>
					<button
						type="button"
						onClick={onConnectVoucher}
						disabled={isConnectingVoucher}
						className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[17px] font-extrabold tracking-wide text-white shadow-[0_10px_22px_rgba(16,185,129,0.22)] transition hover:bg-emerald-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
					>
						{isConnectingVoucher ? <Spinner className="text-white" /> : null}
						<span>{isConnectingVoucher ? 'CONNECTING…' : 'CONNECT'}</span>
					</button>

					{voucherConnectError ? (
						<div aria-live="polite" className="text-center text-[13px] font-semibold text-rose-200/90">
							{voucherConnectError}
						</div>
					) : null}

					{voucherSuccess?.message ? (
						<div aria-live="polite" className="text-center text-[13px] font-semibold text-white/70">
							<span className="font-extrabold text-white">{voucherSuccess.message}</span>
							{voucherSuccess?.durationMinutes ? (
								<span> • {formatDurationLabelFromMinutes(voucherSuccess.durationMinutes)}</span>
							) : null}
						</div>
					) : null}
				</div>

				<div className="mt-5 text-center">
					<div className="text-[12px] font-semibold text-white/60">
						You can also buy internet using
					</div>
					<div className="mt-3 flex items-center justify-center">
						<img
							src={mtnLogo}
							alt="Mobile Money"
							className="h-10 w-auto max-w-full rounded-lg shadow-sm"
							loading="lazy"
						/>
					</div>
				</div>

				<div className="mt-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-4">
					<div className="text-center text-[14px] font-extrabold text-emerald-300">
						Enter your phone number to purchase bundles
					</div>
					<div className="mt-0.5 text-center text-[14px] font-extrabold text-emerald-300">
						after tap buy now on the bundle
					</div>

					<div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
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
					{buyError ? <ErrorCard message={buyError} /> : null}
					{buyResult?.username ? (
						<div aria-live="polite" className="mt-3 text-center text-[13px] font-semibold text-white/70">
							Voucher: {buyResult.username}
						</div>
					) : null}
				</div>

				{!isLoadingBundles && bundles.length === 0 && !bundlesError ? (
					<p className="text-center text-[13px] font-semibold text-white/70">No bundles available right now.</p>
				) : null}

				<div className="mt-4 grid grid-cols-1 gap-3">
					{bundles.map((bundle) => {
						const isSelected = selectedBundle?.id === bundle?.id;
						const price = Number(bundle?.price ?? bundle?.price_ugx ?? 0);
						const currency = String(bundle?.currency ?? 'UGX');
						return (
							<div
								key={bundle.id}
								className={
									`flex items-center justify-between gap-3 rounded-2xl border bg-white/5 px-4 py-3 ` +
									(isSelected ? 'border-emerald-400/60 ring-2 ring-emerald-400/20' : 'border-white/10')
								}
							>
								<button
									type="button"
									onClick={() => setSelectedBundle(bundle)}
									className="min-w-0 flex-1 text-left"
								>
									<div className="truncate text-[15px] font-extrabold text-white">
										{bundle.name}
									</div>
									<div className="mt-0.5 text-[13px] font-extrabold text-emerald-300">
										{Number.isFinite(price) ? price.toLocaleString() : '0'} {currency}
									</div>
								</button>

								<button
									type="button"
									onClick={() => onBuyNow(bundle)}
									disabled={isBuying}
									className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-[13px] font-extrabold text-white shadow-sm transition hover:bg-emerald-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
								>
									{isBuying ? <Spinner className="text-white" /> : null}
									<span>{isBuying ? 'LOADING…' : 'BUY NOW'}</span>
								</button>
							</div>
						);
					})}
				</div>
				{isLoadingBundles ? (
					<div className="mt-3 flex items-center justify-center gap-2 text-center text-[13px] font-semibold text-white/60">
						<Spinner className="text-white/70" />
						Loading bundles…
					</div>
				) : null}
				<ErrorCard message={bundlesError} onRetry={!isLoadingBundles ? loadBundles : null} />

				<div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
					<div>
						<div className="text-[13px] font-extrabold text-white">Need Help?</div>
						<div className="text-[13px] font-semibold text-white/70">Call: 0707434218</div>
					</div>
					<button
						type="button"
						onClick={() => {}}
						className="shrink-0 rounded-lg bg-sky-500 px-4 py-2.5 text-[13px] font-extrabold tracking-wide text-white transition hover:bg-sky-400 active:scale-[0.99]"
					>
						CALL
					</button>
				</div>
			</div>
		</PortalLayout>
	);
}
