import "./src/config/env.js";
import app from "./src/app.js";
// import { env } from "./src/config/env.js";
// import { checkDbConnection } from "./src/config/db.js";
// import { startMikroTikExpiryCron } from "./src/services/mikrotikExpiryService.js";
// import { getRuntimeHealth } from "./src/services/mikrotikRuntimeService.js";

const PORT = process.env.PORT || 8080;

console.log("🚀 SERVER STARTING...");
console.log("PORT:", PORT);

async function start() {
  try {
    // Temporary stability mode:
    // Disable non-essential startup checks so they do not block the web server.
    // await checkDbConnection();
    // const status = await getRuntimeHealth();
    // console.log(`MikroTik connection: ok${status?.identity ? ` (identity: ${status.identity})` : ""}`);

    console.log("PORT:", PORT);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      // startMikroTikExpiryCron();
    });
  } catch (err) {
    console.error("Startup error:", err?.message ?? err);
  }
}

start().catch((err) => {
  console.error("Unhandled startup error:", err?.message ?? err);
});
