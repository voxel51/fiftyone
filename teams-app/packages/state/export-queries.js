const fs = require("fs");
const { resolve, relative } = require("path");

const { src } = require("./relay.config");
const generatedDirectoryNames = ["__generated__"];
const excludedDirectoryNames = ["node_modules", "__mocks__"];
const queryFilesExtensions = ["graphql.ts"];
const typesExportDirectoryPath = resolve(__dirname, "./src");
const typesExportFilePath = resolve(
  typesExportDirectoryPath,
  "./query-types.ts"
);
const exportedTypes = new Set();

const generatedDirectories = findGeneratedDirectories(resolve(__dirname, src));
const queriesExportFiles = [];
for (const item of generatedDirectories) {
  queriesExportFiles.push(generateQueriesExportFile(item));
}

let typesExportFileData = "";
for (const queriesExportFile of queriesExportFiles) {
  let relativeExportFilePath = relative(
    typesExportDirectoryPath,
    queriesExportFile
  );
  if (!relativeExportFilePath.startsWith("."))
    relativeExportFilePath = "./" + relativeExportFilePath;
  relativeExportFilePath = relativeExportFilePath.replace("/index.ts", "");
  typesExportFileData += `export * from '${relativeExportFilePath}'\n`;
}
fs.writeFileSync(typesExportFilePath, typesExportFileData);

function findGeneratedDirectories(path) {
  if (isDirectory(path) && !isExcludedDirectory(path)) {
    const result = [];
    if (isGeneratedDirectory(path)) result.push(path);
    const subItems = fs.readdirSync(path);
    for (const item of subItems) {
      result.push(...findGeneratedDirectories(resolve(path, item)));
    }
    return result;
  }
  return [];
}

function isDirectory(path) {
  try {
    return fs.statSync(path).isDirectory();
  } catch (e) {}
}

function isExcludedDirectory(path) {
  return excludedDirectoryNames.some((item) => path.endsWith(item));
}

function isGeneratedDirectory(path) {
  return generatedDirectoryNames.some((item) => path.endsWith(item));
}

function generateQueriesExportFile(path) {
  let exportFileContent = "";
  const outputFile = resolve(path, "index.ts");
  const files = fs.readdirSync(path);
  for (const file of files) {
    const filePath = resolve(path, file);
    if (isQueryFile(filePath)) {
      const types = extractTypes(filePath);
      for (const type of types) {
        if (exportedTypes.has(type)) continue;
        exportedTypes.add(type);
        exportFileContent += `export type { ${type} as ${type}T } from './${file.replace(
          ".ts",
          ""
        )}'\n`;
      }
    }
  }
  fs.writeFileSync(outputFile, exportFileContent);
  return outputFile;
}

function isQueryFile(path) {
  return queryFilesExtensions.some((item) => path.endsWith(item));
}

function extractTypes(filePath) {
  const types = [];
  const data = fs.readFileSync(filePath, "utf-8");
  const matches = data.matchAll(/export type (\S+) =/g);
  for (const match of matches) {
    types.push(match[1]);
  }
  return types;
}
