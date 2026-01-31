import React from 'react';

function SuccessIcon() {
	return (
		<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/30">
			<svg
				width="28"
				height="28"
				viewBox="0 0 24 24"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				aria-hidden="true"
			>
				<path
					d="M20 6L9 17l-5-5"
					stroke="currentColor"
					strokeWidth="2.4"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="text-emerald-300"
				/>
			</svg>
		</div>
	);
}

export default function PortalSuccess({ onDone }) {
	return (
		<div className="p-6 text-center">
			<SuccessIcon />
			<h2 className="mt-5 text-xl font-extrabold text-white">You are now connected</h2>
			<p className="mt-2 text-sm text-white/65">You can now browse the internet</p>

			<button
				type="button"
				onClick={onDone}
				className="mt-6 w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white shadow-sm ring-1 ring-white/10 transition hover:bg-white/15"
			>
				Done
			</button>
		</div>
	);
}
