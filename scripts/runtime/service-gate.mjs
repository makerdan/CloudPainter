// Private cooperative startup gate. Python registers this exact incarnation
// before allowing any service module to execute. No detached/remote commands.
import { createInterface } from "node:readline";
const lines = createInterface({ input: process.stdin });
let dispatched = false;
lines.on("line", async line => {
  if (line !== "dispatch" || dispatched) return;
  dispatched = true;
  try {
    const { run } = await import(process.argv[2]);
    await run(JSON.parse(process.argv[3]));
  } catch (error) {
    console.log("@service " + JSON.stringify({ event: "startup-error", message: error.message }));
    process.exit(1); // Supervisor still owns and verifies all remaining children.
  }
});
lines.on("close", () => { if (!dispatched) process.exitCode = 1; });
