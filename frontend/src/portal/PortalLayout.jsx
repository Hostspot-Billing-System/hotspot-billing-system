import React from 'react';

export default function PortalLayout({ children }) {
	return (
		<div className="min-h-dvh w-full bg-linear-to-br from-[#2b1f6e] via-[#0b3a6b] to-[#062a2a] px-4 py-10">
			<div className="mx-auto flex min-h-dvh max-w-105 flex-col items-stretch justify-center">
				<div className="mb-6 flex justify-center">
					<div className="h-1 w-56 rounded-full bg-linear-to-r from-emerald-400 via-sky-400 to-fuchsia-500 opacity-90" />
				</div>

				<div className="rounded-2xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
					{children}
				</div>

				<div className="mt-6 text-center text-xs text-white/50">
					Powered by Hotspot Billing System
				</div>
			</div>
		</div>
	);
}
