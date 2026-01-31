import { upsertPortalSession, PortalSessionError } from '../services/portalSessionService.js';

export async function getPortalContextHandler(req, res) {
	try {
		const mac = req.query?.mac;
		const ip = req.query?.ip;
		const iface = req.query?.interface;
		const routerId = req.query?.router_id;

		const session = await upsertPortalSession({ mac, ip, interface: iface, router_id: routerId });

		return res.status(200).json({
			success: true,
			data: {
				mac: session.mac,
				ip: session.ip,
				payment_methods: ['VOUCHER', 'MOBILE_MONEY'],
				currency: 'UGX',
				support_phone: '07XXXXXXXX',
			},
		});
	} catch (err) {
		if (err instanceof PortalSessionError) {
			return res.status(err.httpStatus).json({
				success: false,
				error: { code: err.code, message: err.message },
			});
		}

		return res.status(500).json({
			success: false,
			error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
		});
	}
}
