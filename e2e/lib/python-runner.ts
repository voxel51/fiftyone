import { spawn } from "child_process";
import dedent from "ts-dedent";
import fs from "fs";
import os from "os";
import path from "path";
import { DEFAULT_APP_ADDRESS, DEFAULT_APP_PORT } from "./constants";

export class PythonRunner {
  public static exec(sourceCode: string) {
    const dedentedSourceCode = dedent(sourceCode);
    const randomFileName = Math.random().toString(36).substring(8);
    const sourceFilePath = path.join(os.tmpdir(), `${randomFileName}.py`);
    fs.writeFileSync(sourceFilePath, dedentedSourceCode, "utf-8");

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      // todo: might want to set PYTHONPATH here to point to the python source code
      FIFTYONE_DATABASE_NAME: "cypress",
      FIFTYONE_DEFAULT_APP_PORT: String(DEFAULT_APP_PORT),
      FIFTYONE_DEFAULT_APP_ADDRESS: DEFAULT_APP_ADDRESS,
    };

    const proc = spawn("python", [sourceFilePath], {
      env,
    });

    console.log(`Spawning python process with source code:`);
    console.log("=====================================");
    console.log(dedentedSourceCode);
    console.log("=====================================");
    console.log("fiftyone related env:");
    console.log("=====================================");
    Object.entries(env).forEach(([key, value]) => {
      if (key.startsWith("FIFTYONE")) {
        console.log(`${key} = ${value}`);
      }
    });
    console.log("=====================================");
    console.log();
    console.log("New python process spawned with pid:", proc.pid);

    proc.stdout.on("data", (data) => {
      console.log(`${proc.pid}: ${data.toString()}`);
    });

    proc.stderr.on("data", (data) => {
      console.error(`${proc.pid} STDERR:`);
      console.error(data.toString());
    });

    proc.on("error", (data) => {
      console.error(`${proc.pid} STDERR:`);
      console.error(data.toString());
    });

    return new Promise<number>((resolve, reject) =>
      proc.on("exit", (exitCode) =>
        exitCode ? reject(exitCode) : resolve(exitCode)
      )
    );
  }
}
