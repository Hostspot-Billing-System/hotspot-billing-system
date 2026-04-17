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
import authRoutes from './auth/auth.routes.js';
import requireAuth from './middleware/requireAuth.js';

const app = express();
const isProduction = env.APP_ENV === 'production';

// PRODUCTION NOTE:
// Railway/Vercel sit behind proxies and terminate TLS. Trusting the proxy enables
// accurate req.secure and allows `secure` cookies to be set correctly.
if (isProduction) {
   app.set('trust proxy', 1);
}


// --- PRODUCTION-READY CORS CONFIG FOR CLOUDFLARE PAGES FRONTEND ---
const allowedOrigins = [
   'http://localhost:5173',
   'http://localhost:5174',
   'http://127.0.0.1:5173',
   'http://127.0.0.1:5174',
   'https://admin-omega-wifi.pages.dev',
   /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));




/* =========================
   SESSION
========================= */
if (!process.env.SESSION_SECRET || String(process.env.SESSION_SECRET).trim() === '') {
   throw new Error('Missing required environment variable: SESSION_SECRET');
}

app.use(session({
   secret: process.env.SESSION_SECRET,
   resave: false,
   saveUninitialized: false,
   cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax'
   }
}));

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


// Global error handler: return proper status and structured JSON
// NOTE: only handles errors forwarded via next(err).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
   // eslint-disable-next-line no-console
   console.error('[ERROR]', err?.message ?? err);
   const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
   res.status(status).json({
      success: false,
      error: err?.userMessage || err?.message || 'Something went wrong',
   });
});

export default app;
