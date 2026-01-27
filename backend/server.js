import app from "./src/app.js";
import "./src/config/env.js";
import { env } from "./src/config/env.js";
import { checkDbConnection, seedDefaultPackagesIfEmpty } from "./src/config/db.js";

async function start() {
  try {
    await checkDbConnection();
    await seedDefaultPackagesIfEmpty();
    console.log('Database connection: ok');
  } catch (err) {
    console.warn('Database connection: failed. Backend will start in degraded mode.');
    console.warn(err?.message ?? err);
  }

  app.listen(env.PORT, () => {
    console.log(`Backend running on port ${env.PORT}`);
  });
}

start().catch((err) => {
  console.error('Backend failed to start:', err);
  process.exit(1);
});
