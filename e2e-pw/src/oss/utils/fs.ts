import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

export function writeToTmpFile(content: string, extension: string): string {
  const randomFileName = `fo-e2e-${crypto.randomUUID()}`;
  const sourceFilePath = path.join(
    os.tmpdir(),
    `${randomFileName}.${extension}`,
  );
  fs.writeFileSync(sourceFilePath, content, "utf-8");
  return sourceFilePath;
}
