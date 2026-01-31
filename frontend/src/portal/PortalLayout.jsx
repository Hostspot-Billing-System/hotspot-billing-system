import React from 'react';

export default function PortalLayout({ children }) {
	return (
		<div className="min-h-dvh w-full bg-linear-to-br from-[#2a1c72] via-[#063b6e] to-[#052426] px-4 py-8">
			<div className="mx-auto flex min-h-dvh max-w-105 flex-col items-stretch justify-center">
				<div className="mb-5 flex justify-center">
					<div className="h-1 w-60 rounded-full bg-linear-to-r from-emerald-400 via-sky-400 to-fuchsia-500 opacity-90" />
				</div>

				<div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.50)] backdrop-blur-xl">
					{children}
				</div>

				<div className="mt-6 text-center text-xs text-white/50">
					Powered by Hotspot Billing System
				</div>
			</div>
		</div>
	);
}
