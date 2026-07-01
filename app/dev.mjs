// Launcher for `yarn dev:py` and `yarn dev:wpy`.
//
// Usage: node dev.mjs <py|wpy> [options]
//   -p, --port <port>   Port for the vite client dev server (default 5173).
//   -n, --notebook      Notebook dev: also set proxy_url to the client URL.
//
// Exports FIFTYONE_ALLOWED_ORIGINS (and, with -n, FIFTYONE_APP_PROXY_URL)
// pointed at the vite client dev server so the python server accepts
// cross-origin requests from the hot-reloading client. The python server keeps
// its default port (5151); only the client dev server port is configurable
// here, via vite's own --port flag.
import { spawn } from "node:child_process";

const [target, ...args] = process.argv.slice(2);

let port = "5173";
let notebook = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-p" || arg === "--port") {
    const value = args[++i];
    if (value === undefined || !/^\d+$/.test(value)) {
      console.error(`Invalid ${arg} value: ${value ?? "(missing)"}`);
      process.exit(1);
    }
    port = value;
  } else if (arg === "-n" || arg === "--notebook") {
    notebook = true;
  }
}

const origin = `http://localhost:${port}`;
const env = { ...process.env, FIFTYONE_ALLOWED_ORIGINS: origin };
if (notebook) {
  env.FIFTYONE_APP_PROXY_URL = origin;
}

const server = "python ../fiftyone/server/main.py";
const commands = {
  py: server,
  wpy: `concurrently -k "yarn dev --port ${port}" "${server}"`,
};

const command = commands[target];
if (!command) {
  console.error("Usage: node dev.mjs <py|wpy> [-p port] [-n]");
  process.exit(1);
}

const child = spawn(command, { stdio: "inherit", env, shell: true });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
