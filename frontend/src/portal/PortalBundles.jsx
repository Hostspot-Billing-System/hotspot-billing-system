import React from 'react';

export const DEFAULT_BUNDLES = [
	{ id: '2h', name: '2 Hours', price: 500, currency: 'UGX' },
	{ id: '12h', name: '12 Hours', price: 1000, currency: 'UGX' },
	{ id: 'daily', name: 'Daily', price: 1500, currency: 'UGX' },
	{ id: 'weekly', name: 'Weekly', price: 6000, currency: 'UGX' },
	{ id: 'monthly', name: 'Monthly', price: 23000, currency: 'UGX' },
];

function formatPrice(bundle) {
	return `${bundle.price.toLocaleString()} ${bundle.currency}`;
}

function BundleRow({ bundle, onBuy }) {
	return (
		<div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
			<div>
				<div className="text-sm font-semibold text-white">{bundle.name}</div>
				<div className="text-xs font-semibold text-emerald-300">{formatPrice(bundle)}</div>
			</div>
			<button
				type="button"
				onClick={() => onBuy?.(bundle)}
				className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-400"
			>
				BUY NOW
			</button>
		</div>
	);
}

export default function PortalBundles({
	phone,
	onPhoneChange,
	selectedBundle,
	onSelectBundle,
	onBack,
	bundles = DEFAULT_BUNDLES,
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
				<div className="mt-3 text-center">
					<div className="text-xs font-semibold text-emerald-300">
						Enter your phone number to purchase bundles
					</div>
					<div className="text-xs font-semibold text-emerald-300">after tap buy now on the bundle</div>
				</div>
			</div>

			<div className="rounded-xl border border-white/10 bg-white/5 p-4">
				<input
					type="tel"
					inputMode="tel"
					autoComplete="tel"
					value={phone}
					onChange={(e) => onPhoneChange?.(e.target.value)}
					className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-emerald-400/60"
					placeholder="2567XXXXXXXX"
				/>
			</div>

			<div className="mt-5 space-y-3">
				{bundles.map((b) => (
					<div key={b.id} className={selectedBundle?.id === b.id ? 'ring-2 ring-emerald-400/60 rounded-xl' : ''}>
						<BundleRow bundle={b} onBuy={onSelectBundle} />
					</div>
				))}
			</div>
		</div>
	);
}
