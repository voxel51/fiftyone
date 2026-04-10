import { spawn } from "child_process";
import dotenv from "dotenv";
import { dedentPythonCode } from "src/oss/utils/dedent";
import { writeToTmpFile } from "src/oss/utils/fs";

dotenv.config({ path: process.env.CI ? ".env.ci" : ".env.dev" });

export type PythonCommandGenerator = (argv: string[]) => string;

export class PythonRunner {
  constructor(
    private readonly pythonCommandGenerator: PythonCommandGenerator,
    private readonly env?: Record<string, string>
  ) {
    this.pythonCommandGenerator = pythonCommandGenerator;

    if (env) {
      Object.entries(env).forEach(([key, value]) => {
        process.env[key] = value;
      });
    }
  }

  public async exec(sourceCode: string) {
    const dedentedSourceCode = dedentPythonCode(sourceCode);
    const sourceFilePath = writeToTmpFile(dedentedSourceCode, "py");

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
