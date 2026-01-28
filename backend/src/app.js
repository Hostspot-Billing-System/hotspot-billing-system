import express from "express";
import cors from "cors";
import healthRoutes from "./routes/healthRoutes.js";
import captiveRoutes from "./routes/captiveRoutes.js";
import vouchersRoutes from "./routes/vouchersRoutes.js";
import packagesRoutes from "./routes/packagesRoutes.js";
import voucherBatchesRoutes from "./routes/voucherBatchesRoutes.js";

const app = express();

const allowedOrigins = new Set([
	'http://localhost:5173',
	'http://127.0.0.1:5173',
	'http://localhost:4173',
	'http://127.0.0.1:4173',
]);

const localDevOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

app.use(
	cors({
		origin(origin, callback) {
			// Allow same-origin, curl, Postman (no Origin header)
			if (!origin) return callback(null, true);
			if (allowedOrigins.has(origin)) return callback(null, true);
			if (localDevOriginPattern.test(origin)) return callback(null, true);
			return callback(new Error(`CORS blocked origin: ${origin}`));
		},
		credentials: true,
	})
);
app.use(express.json());

app.use("/api", healthRoutes);
app.use("/api/captive", captiveRoutes);
app.use("/api/vouchers", vouchersRoutes);
app.use("/api/packages", packagesRoutes);
app.use("/api/voucher-batches", voucherBatchesRoutes);

export default app;
