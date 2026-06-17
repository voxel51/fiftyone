// Launcher for `yarn dev:py` and `yarn dev:wpy`.
//
// Usage: node dev.mjs <py|wpy> [options]
//   -p, --port <port>   Port for the vite dev server (default 5173).
//   -n, --notebook      Notebook dev: also set proxy_url to the vite server URL.
//
// Both targets export FIFTYONE_ALLOWED_ORIGINS (and, with -n,
// FIFTYONE_APP_PROXY_URL) pointed at the vite dev server so the python server
// accepts requests from the hot-reloading client.
import { spawn } from "node:child_process";

const [target, ...args] = process.argv.slice(2);

let port = process.env.FIFTYONE_DEFAULT_APP_PORT || "5173";
let notebook = Boolean(process.env.FIFTYONE_APP_PROXY_URL);

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-p" || arg === "--port") {
    port = args[++i];
  } else if (arg === "-n" || arg === "--notebook") {
    notebook = true;
  }
}

const origin = `http://localhost:${port}`;
const env = {
  ...process.env,
  FIFTYONE_DEFAULT_APP_PORT: port,
  FIFTYONE_ALLOWED_ORIGINS: origin,
};
if (notebook) {
  env.FIFTYONE_APP_PROXY_URL = origin;
}

const commands = {
  py: ["python", ["../fiftyone/server/main.py"]],
  wpy: ["concurrently", ["-k", "yarn:dev", "yarn:dev:py"]],
};

if (!commands[target]) {
  console.error("Usage: node dev.mjs <py|wpy> [-p port] [-n]");
  process.exit(1);
}

const [cmd, cmdArgs] = commands[target];
const child = spawn(cmd, cmdArgs, { stdio: "inherit", env, shell: true });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
