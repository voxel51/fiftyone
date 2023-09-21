import { getBasename, resolveParent } from "@fiftyone/utilities";
import { FileObjectType, FileSystemObjectType } from "./types";

export function getNameFromPath(path: string) {
  return getBasename(path);
}

export function computeFileObject(path: string, chooseMode: string) {
  const sanitizedCustomPath = path.trim();
  const absolute_path = sanitizedCustomPath;
  const parent_path = resolveParent(absolute_path);
  const name = parent_path ? getNameFromPath(sanitizedCustomPath) : undefined;
  return { absolute_path, name, exists: false, type: chooseMode, parent_path };
}

export function limitFiles(currentFiles: Array<FileObjectType>, limit: number) {
  const files = currentFiles.filter((f) => f.type === "file");
  const dirs = currentFiles.filter((f) => f.type === "directory");
  return {
    limitedFiles: [...dirs, ...files.slice(0, limit)],
    fileCount: files.length,
  };
}

export function getFileSystemsFromList(
  fileSystems: Array<FileSystemObjectType>
) {
  const azure = fileSystems.find((fs) => fs.name.toLowerCase() === "azure");
  const s3 = fileSystems.find((fs) => fs.name.toLowerCase() === "s3");
  const gcp = fileSystems.find((fs) => fs.name.toLowerCase() === "gcp");
  const minio = fileSystems.find((fs) => fs.name.toLowerCase() === "minio");
  const local = fileSystems.find((fs) => fs.name.toLowerCase() === "local");
  return { azure, s3, gcp, minio, local };
}
