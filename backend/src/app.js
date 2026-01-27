import express from "express";
import cors from "cors";
import healthRoutes from "./routes/healthRoutes.js";
import captiveRoutes from "./routes/captiveRoutes.js";
import vouchersRoutes from "./routes/vouchersRoutes.js";
import packagesRoutes from "./routes/packagesRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", healthRoutes);
app.use("/api/captive", captiveRoutes);
app.use("/api/vouchers", vouchersRoutes);
app.use("/api/packages", packagesRoutes);

export default app;
