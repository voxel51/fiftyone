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
  #webserverProcessConfig?: WebServerProcessConfig;

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
        dbName,
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
      const stderrTail: string[] = [];

      // emulated containers (linux baseline generation on Apple silicon)
      // need minutes for the python import chain
      const timeoutMs = process.env.FO_WEB_SERVER_TIMEOUT_MS
        ? Number(process.env.FO_WEB_SERVER_TIMEOUT_MS)
        : Duration.Seconds(30);
      const startedAt = Date.now();

      // this server announces its bind on its own stderr, which a foreign
      // process already holding the port cannot write to — unlike probing
      // the port, the announcement proves the listener is the child we
      // spawned, against the database this worker configured
      const announcedBind = new RegExp(
        `Running on http://[^\\s]+:${this.#port}\\b`,
      );

      const serverBound = new Promise<void>((resolve) => {
        proc.stderr.on("data", (data) => {
          const chunk = String(data);
          console.error(`stderr: ${chunk}`);

          stderrTail.push(chunk);
          if (stderrTail.length > 50) {
            stderrTail.shift();
          }

          if (announcedBind.test(chunk)) {
            resolve();
          }
        });
      });

      const startupFailure = new Promise<never>((_, reject) => {
        const fail = (reason: string) => {
          if (!startupComplete) {
            reject(
              new Error(
                `${reason} — port ${this.#port}, database ${dbName}\n${stderrTail.join("")}`,
              ),
            );
          }
        };

        proc.once("error", (err: Error) =>
          fail(`webserver failed to spawn: ${err.message}`),
        );
        proc.once("exit", (code: number | null, signal: string | null) =>
          fail(
            `webserver exited before startup completed (code=${code}, signal=${signal})`,
          ),
        );
      });

      proc.stdout.on("data", (data) => {
        console.log(`stdout: ${data}`);
      });

      this.#webserverProcessConfig = {
        processId: proc.pid,
      };

      console.log(
        `waiting for webserver (procId = ${proc.pid}) to start on port ${
          this.#port
        }...`,
      );

      let bindTimer: NodeJS.Timeout;
      const bindTimeout = new Promise<never>((_, reject) => {
        bindTimer = setTimeout(
          () =>
            reject(
              new Error(
                `webserver did not bind port ${this.#port} within ${timeoutMs} ms\n${stderrTail.join(
                  "",
                )}`,
              ),
            ),
          timeoutMs,
        );
      });

      try {
        await Promise.race([serverBound, startupFailure, bindTimeout]);
      } finally {
        clearTimeout(bindTimer);
      }

      await Promise.race([
        waitOn({
          resources: [`http-get://127.0.0.1:${this.#port}/graphql`],
          timeout: Math.max(timeoutMs - (Date.now() - startedAt), 1000),
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
    const processId = this.#webserverProcessConfig?.processId;

    if (!processId) {
      return;
    }

    const killPromise = new Promise<void>((resolve, reject) => {
      kill(processId, "SIGTERM", (err) => {
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
        timeoutMs,
      );
    });

    try {
      await Promise.race([killPromise, timeoutPromise]);
    } finally {
      this.#webserverProcessConfig = undefined;
    }
  }
}
