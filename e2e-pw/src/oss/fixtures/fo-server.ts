import { spawn } from "child_process";
import crypto from "node:crypto";
import { getPythonCommand } from "src/oss/utils/commands";
import * as networkUtils from "src/shared/network-utils";
import kill from "tree-kill";
import waitOn from "wait-on";
import { Duration } from "../utils";

type WebServerProcessConfig = {
  processId: number;
};

export class FoWebServer {
  readonly #port: number;
  #webserverProcessConfig: WebServerProcessConfig;

  constructor(port: number) {
    this.#port = port;
  }

  public async startWebServer() {
    try {
      await networkUtils.assertPortAvailableOrWaitWithTimeout(this.#port);

      const hash = crypto.randomBytes(10).toString("base64url");
      const dbName = `PW-${hash}-${this.#port}`;
      process.env.FIFTYONE_DATABASE_NAME = dbName;

      console.log(
        "Starting webserver on port",
        this.#port,
        "with database",
        dbName
      );

      const mainPyPath = process.env.FIFTYONE_ROOT_DIR
        ? `${process.env.FIFTYONE_ROOT_DIR}/fiftyone/server/main.py`
        : "../fiftyone/server/main.py";

      const procString = getPythonCommand([
        mainPyPath,
        "--address",
        "0.0.0.0",
        "--port",
        this.#port.toString(),
        "--clean_start",
      ]);

      console.log(procString);

      const proc = spawn(procString, { shell: true });
      let startupComplete = false;

      const startupFailure = new Promise<never>((_, reject) => {
        const handleError = (err: Error) => {
          if (!startupComplete) {
            reject(err);
          }
        };

        const handleExit = (code: number | null, signal: string | null) => {
          if (!startupComplete) {
            reject(
              new Error(
                `webserver exited before startup completed (code=${code}, signal=${signal})`
              )
            );
          }
        };

        proc.once("error", handleError);
        proc.once("exit", handleExit);
      });

      proc.stdout.on("data", (data) => {
        console.log(`stdout: ${data}`);
      });

      proc.stderr.on("data", (data) => {
        console.error(`stderr: ${data}`);
      });

      this.#webserverProcessConfig = {
        processId: proc.pid,
      };

      console.log(
        `waiting for webserver (procId = ${proc.pid}) to start on port ${
          this.#port
        }...`
      );

      await Promise.race([
        waitOn({
          resources: [
            `tcp:127.0.0.1:${this.#port}`,
            `http-get://127.0.0.1:${this.#port}/graphql`,
          ],
          timeout: Duration.Seconds(30),
        }),
        startupFailure,
      ]);
      startupComplete = true;
      console.log("webserver started");
    } catch (e) {
      console.log(`webserver starting failed`, e);

      try {
        await this.stopWebServer();
      } catch (stopErr) {
        console.warn("Error stopping webserver:", stopErr);
      }

      throw e;
    }
  }

  async stopWebServer(timeoutMs = 10000): Promise<void> {
    if (!this.#webserverProcessConfig.processId) {
      return;
    }

    const killPromise = new Promise<void>((resolve, reject) => {
      kill(this.#webserverProcessConfig.processId, "SIGTERM", (err) => {
        if (err) {
          return reject(err);
        }
        console.log(`webserver stopped on port ${this.#port}`);
        resolve();
      });
    });

    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(
        () => reject(new Error("Timeout stopping webserver")),
        timeoutMs
      );
    });

    return Promise.race([killPromise, timeoutPromise]);
  }
}
