import React from 'react';

function formatPrice(bundle) {
	if (!bundle) return '';
	return `${Number(bundle.price ?? 0).toLocaleString()} ${bundle.currency ?? 'UGX'}`;
}

export default function PortalPay({ bundle, phone, onPayNow, onBack }) {
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
				<h2 className="mt-3 text-lg font-bold text-white">Confirm payment</h2>
				<p className="mt-1 text-sm text-white/65">Review the details below.</p>
			</div>

			<div className="rounded-xl border border-white/10 bg-white/5 p-4">
				<div className="flex items-center justify-between">
					<div className="text-xs font-semibold text-white/60">Selected bundle</div>
					<div className="text-sm font-bold text-white">{bundle?.name ?? '—'}</div>
				</div>
				<div className="mt-3 flex items-center justify-between">
					<div className="text-xs font-semibold text-white/60">Price</div>
					<div className="text-sm font-bold text-emerald-300">{formatPrice(bundle) || '—'}</div>
				</div>
				<div className="mt-3 flex items-center justify-between">
					<div className="text-xs font-semibold text-white/60">Phone number</div>
					<div className="text-sm font-bold text-white">{phone || '—'}</div>
				</div>
			</div>

			<button
				type="button"
				onClick={onPayNow}
				className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-400"
			>
				PAY NOW
			</button>

			<div className="mt-4 text-center text-xs text-white/60">
				You will receive a payment prompt on your phone
			</div>
		</div>
	);
}
