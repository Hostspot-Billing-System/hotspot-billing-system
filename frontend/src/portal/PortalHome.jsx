import React from 'react';

import PortalLayout from './PortalLayout.jsx';

export default function PortalHome() {
	const [voucherCode, setVoucherCode] = React.useState('');
	const [phone, setPhone] = React.useState('256707434218');

	const bundles = React.useMemo(
		() => [
			{ id: '2h', label: '2 Hours', price: '500 UGX' },
			{ id: '12h', label: '12 Hours', price: '1,000 UGX' },
			{ id: 'daily', label: 'Daily', price: '1,500 UGX' },
			{ id: 'weekly', label: 'Weekly', price: '6,000 UGX' },
			{ id: 'monthly', label: 'Monthly', price: '23,000 UGX' },
		],
		[],
	);

	return (
		<PortalLayout>
			<div className="px-5 pb-6 pt-5">
				<div className="text-center">
					<div className="text-[11px] font-extrabold tracking-widest text-white/70">
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
						className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-[13px] font-semibold text-white placeholder:text-white/40 outline-none focus:border-white/20"
					/>
					<button
						type="button"
						onClick={() => {}}
						className="w-full cursor-pointer rounded-xl bg-emerald-600 px-4 py-3 text-[13px] font-extrabold tracking-wide text-white shadow-[0_10px_22px_rgba(16,185,129,0.22)] transition hover:bg-emerald-500"
					>
						CONNECT
					</button>
				</div>

				<div className="mt-5 text-center">
					<div className="text-[11px] font-semibold text-white/60">
						You can also buy internet using
					</div>
					<div className="mt-3 flex items-center justify-center gap-3">
						<div className="flex items-center justify-center rounded-lg bg-[#e11d48] px-3 py-2 shadow-sm">
							<div className="text-[11px] font-extrabold uppercase tracking-wide text-white">
								airtel money
							</div>
						</div>
						<div className="flex items-center justify-center rounded-lg bg-[#fbbf24] px-3 py-2 shadow-sm">
							<div className="text-[11px] font-extrabold uppercase tracking-wide text-black">
								MTN MoMo
							</div>
						</div>
					</div>
				</div>

				<div className="mt-5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-4">
					<div className="text-center text-[12px] font-extrabold text-emerald-300">
						Enter your phone number to purchase bundles
					</div>
					<div className="mt-0.5 text-center text-[12px] font-extrabold text-emerald-300">
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
							className="w-full bg-transparent text-[13px] font-semibold text-white placeholder:text-white/35 outline-none"
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
								<div className="text-[13px] font-extrabold text-white">{b.label}</div>
								<div className="text-[11px] font-extrabold text-emerald-300">{b.price}</div>
							</div>
							<button
								type="button"
								onClick={() => {}}
								className="cursor-pointer rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-extrabold text-white shadow-sm transition hover:bg-emerald-500"
							>
								BUY NOW
							</button>
						</div>
					))}
				</div>

				<div className="mt-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
					<div>
						<div className="text-[12px] font-extrabold text-white">Need Help?</div>
						<div className="text-[12px] font-semibold text-white/70">Call: 0707434218</div>
					</div>
					<button
						type="button"
						onClick={() => {}}
						className="cursor-pointer rounded-lg bg-sky-500 px-4 py-2 text-[11px] font-extrabold tracking-wide text-white transition hover:bg-sky-400"
					>
						CALL
					</button>
				</div>
			</div>
		</PortalLayout>
	);
}
