import { spawn } from "child_process";
import dedent from "dedent";
import fs from "fs";
import os from "os";
import path from "path";

export class PythonRunner {
  public static exec(sourceCode: string) {
    const dedentedSourceCode = dedent(sourceCode);
    const randomFileName = Math.random().toString(36).substring(8);
    const sourceFilePath = path.join(os.tmpdir(), `${randomFileName}.py`);
    fs.writeFileSync(sourceFilePath, dedentedSourceCode, "utf-8");

    const proc = spawn("python", [sourceFilePath], {
      env: {
        ...process.env,
        // todo: might want to set PYTHONPATH here to point to the python source code
        FIFTYONE_DATABASE_NAME: "cypress",
      },
    });
    const pId = proc.pid;

    console.log(`Spawning python process, pId = ${pId}. Source code:`);
    console.log("=====================================");
    console.log(sourceCode);
    console.log("=====================================");

    proc.stdout.on("data", (data) => {
      console.log(`${pId}: ${data.toString()}`);
    });

    proc.stderr.on("data", (data) => {
      console.error(`${pId} STDERR:`);
      console.error(data.toString());
    });

    proc.on("error", (data) => {
      console.error(`${pId} STDERR:`);
      console.error(data.toString());
    });

    return pId;
  }
}
