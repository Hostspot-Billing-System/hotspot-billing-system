import app from "./src/app.js";
import "./src/config/env.js";
import { env } from "./src/config/env.js";
import { checkDbConnection } from "./src/config/db.js";

async function start() {
  await checkDbConnection();

  app.listen(env.PORT, () => {
    console.log(`Backend running on port ${env.PORT}`);
  });
}

start().catch((err) => {
  console.error('Backend failed to start:', err);
  process.exit(1);
});
