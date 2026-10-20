import { configuredPort } from "../../../scripts/runtime/configured-port.mjs";
import { logger } from "./lib/logger";

// Validate before importing dependencies which may initialize data services.
const port = configuredPort(process.env["PORT"]);
const { default: app } = await import("./app");

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
