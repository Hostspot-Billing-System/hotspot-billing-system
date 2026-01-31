import React from 'react';

import PortalLayout from './PortalLayout.jsx';
import PortalVoucher from './PortalVoucher.jsx';
import PortalBundles, { DEFAULT_BUNDLES } from './PortalBundles.jsx';
import PortalPay from './PortalPay.jsx';
import PortalSuccess from './PortalSuccess.jsx';

function PortalHomeScreen({ onVoucher, onBuy }) {
	return (
		<div className="p-6">
			<div className="mb-6 text-center">
				<div className="text-sm font-semibold tracking-wide text-white/70">Welcome to</div>
				<h1 className="mt-1 text-2xl font-extrabold text-white">Hotspot Internet</h1>
				<p className="mt-2 text-sm text-white/65">
					Connect instantly with a voucher or purchase a bundle.
				</p>
			</div>

			<div className="space-y-3">
				<button
					type="button"
					onClick={onVoucher}
					className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white shadow-sm ring-1 ring-white/10 transition hover:bg-white/15"
				>
					Connect with Voucher
				</button>
				<button
					type="button"
					onClick={onBuy}
					className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-400"
				>
					Buy Internet
				</button>
			</div>

			<div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
				<div className="text-xs font-semibold text-white/80">Need help?</div>
				<div className="mt-1 text-sm text-white/70">Call: 0707434218</div>
			</div>
		</div>
	);
}

export default function PortalHome() {
	const [route, setRoute] = React.useState('home');
	const [voucherCode, setVoucherCode] = React.useState('');
	const [phone, setPhone] = React.useState('256707434218');
	const [selectedBundle, setSelectedBundle] = React.useState(DEFAULT_BUNDLES[0]);

	function go(next) {
		setRoute(next);
	}

	return (
		<PortalLayout>
			{route === 'home' && (
				<PortalHomeScreen onVoucher={() => go('voucher')} onBuy={() => go('bundles')} />
			)}

			{route === 'voucher' && (
				<PortalVoucher
					voucherCode={voucherCode}
					onVoucherCodeChange={setVoucherCode}
					onConnect={() => go('success')}
					onBuyInstead={() => go('bundles')}
					onBack={() => go('home')}
				/>
			)}

			{route === 'bundles' && (
				<PortalBundles
					phone={phone}
					onPhoneChange={setPhone}
					selectedBundle={selectedBundle}
					onSelectBundle={(b) => {
						setSelectedBundle(b);
						go('pay');
					}}
					onBack={() => go('home')}
				/>
			)}

			{route === 'pay' && (
				<PortalPay
					bundle={selectedBundle}
					phone={phone}
					onPayNow={() => go('success')}
					onBack={() => go('bundles')}
				/>
			)}

			{route === 'success' && <PortalSuccess onDone={() => go('home')} />}
		</PortalLayout>
	);
}
