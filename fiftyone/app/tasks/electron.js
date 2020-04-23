const { spawn } = require("child_process");
const electron = require("electron");

let subprocess;

function startElectron(done) {
  subprocess = spawn(electron, [".", "--no-sandbox"], {
    env: { ...process.env, NODE_ENV: "development" },
    stdio: "inherit",
  });
  done();
}

function stopElectron() {
  subprocess.kill();
  return subprocess;
}

startElectron.displayName = "start-electron";
stopElectron.displayName = "stop-electron";

exports.start = startElectron;
exports.stop = stopElectron;
