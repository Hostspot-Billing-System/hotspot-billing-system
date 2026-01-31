import React from 'react';

import PortalLayout from './PortalLayout.jsx';
import {
	createPortalPaymentIntent,
	fetchPortalBundles,
	fetchPortalContext,
	getApiErrorMessage,
	voucherLogin,
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

function formatUgx(value) {
	const n = Number(value);
	if (!Number.isFinite(n)) return '';
	return `${n.toLocaleString()} UGX`;
}

function getPortalQueryContext() {
	const params = new URLSearchParams(window.location.search);
	const mac = params.get('mac') || '';
	const ip = params.get('ip') || '';
	const iface = params.get('interface') || '';
	const routerId = params.get('router_id') || '';
	return {
		mac: mac || null,
		ip: ip || null,
		interface: iface || null,
		router_id: routerId || null,
	};
}

export default function PortalHome() {
	const [voucherCode, setVoucherCode] = React.useState('');
	const [phone, setPhone] = React.useState('256707434218');
	const [portalContext, setPortalContext] = React.useState(null);
	const [bundles, setBundles] = React.useState([]);
	const inFlightRef = React.useRef({ voucher: false, pay: false, context: false, bundles: false });

	React.useEffect(() => {
		let alive = true;
		(async () => {
			if (inFlightRef.current.bundles) return;
			inFlightRef.current.bundles = true;
			try {
				const data = await fetchPortalBundles();
				if (!alive) return;
				const normalized = (Array.isArray(data) ? data : []).map((b) => {
					const durationLabel = formatDurationLabelFromMinutes(b?.duration_minutes);
					const name = String(b?.name ?? '').trim();
					const price = formatUgx(b?.price_ugx);
					const secondary = [durationLabel, price].filter(Boolean).join(' • ');
					return {
						id: b?.id,
						name,
						secondary,
						_raw: b,
					};
				});
				setBundles(normalized);
			} catch (err) {
				if (alive) {
					// No UI changes allowed; use an alert for errors.
					window.alert(getApiErrorMessage(err));
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

	React.useEffect(() => {
		let alive = true;
		(async () => {
			const ctx = getPortalQueryContext();
			if (!ctx.mac || !ctx.ip) return;
			if (inFlightRef.current.context) return;
			inFlightRef.current.context = true;
			try {
				const data = await fetchPortalContext({
					mac: ctx.mac,
					ip: ctx.ip,
					interface: ctx.interface,
					router_id: ctx.router_id,
				});
				if (!alive) return;
				setPortalContext(data);
			} catch (err) {
				if (alive) window.alert(getApiErrorMessage(err));
			} finally {
				inFlightRef.current.context = false;
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
			window.alert('Enter voucher code');
			return;
		}

		const ctx = portalContext ?? getPortalQueryContext();
		const mac = ctx?.mac;
		const ip = ctx?.ip;
		if (!mac || !ip) {
			window.alert('Missing portal context (mac/ip). Open the portal link from the router.');
			return;
		}

		inFlightRef.current.voucher = true;
		try {
			const data = await voucherLogin({ mac, ip, voucher_code: code });
			window.alert(data?.transaction_reference ? `Connected. Ref: ${data.transaction_reference}` : 'Connected');
			setVoucherCode('');
		} catch (err) {
			window.alert(getApiErrorMessage(err));
		} finally {
			inFlightRef.current.voucher = false;
		}
	}

	async function onBuyNow(bundle) {
		if (inFlightRef.current.pay) return;
		const msisdn = String(phone ?? '').trim();
		if (!msisdn) {
			window.alert('Enter phone number');
			return;
		}

		const ctx = portalContext ?? getPortalQueryContext();
		const mac = ctx?.mac;
		const ip = ctx?.ip;
		if (!mac || !ip) {
			window.alert('Missing portal context (mac/ip). Open the portal link from the router.');
			return;
		}

		const bundleId = bundle?._raw?.id ?? bundle?.id;
		if (!bundleId) {
			window.alert('Bundle not available');
			return;
		}

		inFlightRef.current.pay = true;
		try {
			const data = await createPortalPaymentIntent({
				mac,
				ip,
				phone: msisdn,
				bundle_id: bundleId,
			});
			window.alert(data?.message || 'Transaction created');
		} catch (err) {
			window.alert(getApiErrorMessage(err));
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
						className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-[17px] font-semibold text-white placeholder:text-white/40 outline-none focus:border-white/20"
					/>
					<button
						type="button"
						onClick={onConnectVoucher}
						className="w-full cursor-pointer rounded-xl bg-emerald-600 px-4 py-3 text-[17px] font-extrabold tracking-wide text-white shadow-[0_10px_22px_rgba(16,185,129,0.22)] transition hover:bg-emerald-500"
					>
						CONNECT
					</button>
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
				</div>

				<div className="mt-5 space-y-3">
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
								className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-extrabold text-white shadow-sm transition hover:bg-emerald-500"
							>
								BUY NOW
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
