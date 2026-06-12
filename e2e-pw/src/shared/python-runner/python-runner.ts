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

    // Reject on non-zero exit so a crashing script surfaces at the actual
    // call site instead of cascading into a downstream ENOENT (e.g. when a
    // result file was never written) or a misleading UI timeout (e.g. when
    // setup silently failed). stderr is already piped above, so the real
    // traceback is visible before this error fires.
    return new Promise<void>((resolve, reject) =>
      proc.on("exit", (code, signal) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `Python process exited with code ${code}` +
                (signal ? ` (signal ${signal})` : "")
            )
          );
        }
      })
    );
  }
}
