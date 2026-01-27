import fs from "fs";
import os from "os";
import path from "path";

export function writeToTmpFile(content: string, extension: string): string {
  const randomFileName = Math.random().toString(36).substring(8);
  const sourceFilePath = path.join(
    os.tmpdir(),
    `${randomFileName}.${extension}`
  );
  fs.writeFileSync(sourceFilePath, content, "utf-8");
  return sourceFilePath;
}
