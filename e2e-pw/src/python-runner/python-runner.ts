import { spawn } from "child_process";
import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import { getPythonCommand } from "src/utils/commands";
import dedent from "ts-dedent";

dotenv.config({ path: process.env.CI ? ".env.ci" : ".env.dev" });

export class PythonRunner {
  public static exec(sourceCode: string) {
    const dedentedSourceCode = dedent(sourceCode);
    const randomFileName = Math.random().toString(36).substring(8);
    const sourceFilePath = path.join(os.tmpdir(), `${randomFileName}.py`);
    fs.writeFileSync(sourceFilePath, dedentedSourceCode, "utf-8");

    const proc = spawn(getPythonCommand([sourceFilePath]), { shell: true });

    console.log(`Spawning python process with source code:`);
    console.log("=====================================");
    console.log(dedentedSourceCode);
    console.log("=====================================");
    console.log("fiftyone related env:");
    console.log("=====================================");
    Object.entries(process.env).forEach(([key, value]) => {
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
