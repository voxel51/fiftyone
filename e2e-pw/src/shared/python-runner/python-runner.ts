import { spawn } from "child_process";
import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import dedent from "ts-dedent";

dotenv.config({ path: process.env.CI ? ".env.ci" : ".env.dev" });

export type PythonCommandGenerator = (argv: string[]) => string;

export class PythonRunner {
  constructor(private pythonCommandGenerator: PythonCommandGenerator) {}

  public exec(sourceCode: string) {
    const dedentedSourceCode = dedent(sourceCode);
    const randomFileName = Math.random().toString(36).substring(8);
    const sourceFilePath = path.join(os.tmpdir(), `${randomFileName}.py`);
    fs.writeFileSync(sourceFilePath, dedentedSourceCode, "utf-8");

    const proc = spawn(this.pythonCommandGenerator([sourceFilePath]), {
      shell: true,
    });

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

    proc.stdout.pipe(process.stdout);
    proc.stderr.pipe(process.stderr);

    return new Promise<void>((resolve) => proc.on("exit", () => resolve()));
  }
}
