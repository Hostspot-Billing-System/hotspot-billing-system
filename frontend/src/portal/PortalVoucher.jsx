import React from 'react';

function LogoPill({ label, accent }) {
	return (
		<div className="flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2">
			<div
				className="mr-2 h-3 w-3 rounded-sm"
				style={{ background: accent }}
				aria-hidden="true"
			/>
			<div className="text-xs font-semibold text-white/80">{label}</div>
		</div>
	);
}

export default function PortalVoucher({
	voucherCode,
	onVoucherCodeChange,
	onConnect,
	onBuyInstead,
	onBack,
}) {
	return (
		<div className="p-6">
			<div className="mb-5">
				<button
					type="button"
					onClick={onBack}
					className="text-xs font-semibold text-white/70 hover:text-white"
				>
					← Back
				</button>
				<h2 className="mt-3 text-lg font-bold text-white">Voucher code</h2>
				<p className="mt-1 text-sm text-white/65">Enter your voucher to connect.</p>
			</div>

			<div className="space-y-3">
				<input
					type="text"
					inputMode="text"
					autoComplete="one-time-code"
					placeholder="Enter voucher code"
					value={voucherCode}
					onChange={(e) => onVoucherCodeChange?.(e.target.value)}
					className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none ring-0 focus:border-sky-400/60"
				/>
				<button
					type="button"
					onClick={onConnect}
					className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-400"
				>
					CONNECT
				</button>
			</div>

			<div className="mt-5">
				<div className="text-center text-xs text-white/60">You can also buy internet using</div>
				<div className="mt-3 flex items-center justify-center gap-3">
					<LogoPill label="airtel money" accent="#e11d48" />
					<LogoPill label="MTN MoMo" accent="#f59e0b" />
				</div>
			</div>

			<div className="mt-6">
				<button
					type="button"
					onClick={onBuyInstead}
					className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/85 transition hover:bg-white/10"
				>
					Buy Internet
				</button>
			</div>
		</div>
	);
}
