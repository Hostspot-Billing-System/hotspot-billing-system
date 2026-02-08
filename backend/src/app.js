import express from "express";
import cors from "cors";
import session from 'express-session';
import { env } from './config/env.js';

/* ROUTES */
import healthRoutes from "./routes/healthRoutes.js";
import runtimeRoutes from "./routes/runtimeRoutes.js";
import captiveRoutes from "./routes/captiveRoutes.js";
import vouchersRoutes from "./routes/vouchersRoutes.js";
import packagesRoutes from "./routes/packagesRoutes.js";
import bundlesRoutes from "./routes/bundlesRoutes.js";
import portalRoutes from "./routes/portalRoutes.js";
import portalPageRoutes from "./routes/portalPageRoutes.js";
import voucherBatchesRoutes from "./routes/voucherBatchesRoutes.js";
import transactionsRoutes from "./routes/transactionsRoutes.js";
import withdrawalsRoutes from "./routes/withdrawalsRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import mikrotikRoutes from "./routes/mikrotikRoutes.js";
import reportsRoutes from "./routes/reportsRoutes.js";
import clientsRoutes from "./routes/clientsRoutes.js";
import routersRoutes from "./routes/routersRoutes.js";
import smsSettingsRoutes from "./routes/smsSettingsRoutes.js";
import myProfileRoutes from "./routes/myProfileRoutes.js";
import paymentsRoutes from "./routes/paymentsRoutes.js";
import authRoutes from './auth/auth.routes.js';
import requireAuth from './middleware/requireAuth.js';

const app = express();

// PRODUCTION NOTE:
// Railway/Vercel sit behind proxies and terminate TLS. Trusting the proxy enables
// accurate req.secure and allows `secure` cookies to be set correctly.
if (env.APP_ENV === 'production') {
   app.set('trust proxy', 1);
}

/* =========================
   CORS CONFIG
========================= */
// CORS origins:
// - Local dev origins are always allowed.
// - Production should explicitly allow the deployed frontend domain.
//   Configure with `FRONTEND_ORIGINS` (comma-separated), e.g.
//   FRONTEND_ORIGINS=https://yourapp.vercel.app,https://www.yourdomain.com
const allowedOrigins = (() => {
   const origins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
   ];

   const extra = String(process.env.FRONTEND_ORIGINS ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
   origins.push(...extra);

   return origins;
})();

const hasExplicitCorsOrigins = String(process.env.FRONTEND_ORIGINS ?? '').trim() !== '';

app.use(
   cors({
      origin: (origin, callback) => {
         // Allow curl, Postman, server-to-server
         if (!origin) return callback(null, true);

         // Backwards-compatible behavior:
         // If no explicit production origins are configured, do not block.
         // This keeps existing deployments working while still allowing teams
         // to lock down origins by setting FRONTEND_ORIGINS.
         if (!hasExplicitCorsOrigins) {
            return callback(null, true);
         }

         const allowed = allowedOrigins.some((o) =>
            typeof o === 'string' ? o === origin : o.test(origin)
         );

         if (!allowed) {
            // Never crash the server due to CORS, but do not grant CORS headers.
            // eslint-disable-next-line no-console
            console.warn('[CORS] Blocked origin:', origin);
            return callback(null, false);
         }

         return callback(null, true);
      },
      credentials: true,
   })
);

/* =========================
   SESSION
========================= */
if (!process.env.SESSION_SECRET || String(process.env.SESSION_SECRET).trim() === '') {
   throw new Error('Missing required environment variable: SESSION_SECRET');
}

app.use(
   session({
      name: 'omega.sid',
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      // PRODUCTION NOTE:
      // Enables secure cookies when running behind a proxy (Railway/Vercel).
      proxy: env.APP_ENV === 'production',
      cookie: {
         httpOnly: true,
         // Required for cross-site cookies (Vercel frontend -> Railway backend).
         // Safe for same-site too; keeps auth stable across environments.
         sameSite: env.APP_ENV === 'production' ? 'none' : 'lax',
         secure: env.APP_ENV === 'production',
         maxAge: 7 * 24 * 60 * 60 * 1000,
      },
   })
);

/* =========================
   MIDDLEWARE
========================= */
app.use(express.json());

// Public captive portal UI (HTML + static assets). Must resolve before /api/*.
app.use("/", portalPageRoutes);

/* =========================
   SYSTEM / HEALTH
========================= */
app.use("/api/health", healthRoutes);
app.use("/api/runtime", runtimeRoutes);

/* =========================
   AUTH
========================= */
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

/* =========================
   PORTAL & CAPTIVE
========================= */
app.use("/api/captive", captiveRoutes);
app.use("/api/portal", portalRoutes);

/* =========================
   BILLING
========================= */
app.use("/api/bundles", bundlesRoutes);
app.use("/api/packages", packagesRoutes);
app.use("/api/vouchers", requireAuth, vouchersRoutes);
app.use("/api/voucher-batches", requireAuth, voucherBatchesRoutes);
app.use("/api/transactions", requireAuth, transactionsRoutes);
app.use("/api/withdrawals", requireAuth, withdrawalsRoutes);
app.use("/api/reports", requireAuth, reportsRoutes);
app.use("/api/clients", requireAuth, clientsRoutes);
app.use("/api/routers", requireAuth, routersRoutes);
app.use("/api/sms-settings", requireAuth, smsSettingsRoutes);
app.use("/api/my-profile", requireAuth, myProfileRoutes);
app.use("/api/payments", requireAuth, paymentsRoutes);

/* =========================
   ADMIN & MIKROTIK
========================= */
app.use("/api/admin", requireAuth, adminRoutes);
app.use("/api/mikrotik", requireAuth, mikrotikRoutes);

/* =========================
   FALLBACK
========================= */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// ⚠️ STABLE CORE — DO NOT MODIFY WITHOUT FULL TEST
// Global error handler: never return HTTP 500 to the frontend.
// NOTE: only handles errors forwarded via next(err).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
   // eslint-disable-next-line no-console
   console.error('[ERROR]', err?.message ?? err);
   res.status(200).json({
      success: false,
      error: err?.userMessage || 'Something went wrong',
   });
});

export default app;