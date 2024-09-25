const fs = require("fs");
const path = require("path");

const buildPath = path.resolve(__dirname, "../build");

const htmlFiles = findHTMLFiles(buildPath);

const substitutions = {
  __SUB_NEW__:
    '<strong style="color: hsl(25, 100%, 51%); font-size: 12px">NEW</strong>',
};

for (const file of htmlFiles) {
  let content = fs.readFileSync(file, "utf8");
  if (content.includes("__SUB_")) {
    for (const [key, value] of Object.entries(substitutions)) {
      content = content.replaceAll(key, value);
    }
    fs.writeFileSync(file, content);
  }
}

function findHTMLFiles(dir) {
  const files = fs.readdirSync(dir);
  const htmlFiles = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.lstatSync(filePath);

    if (stat.isDirectory()) {
      htmlFiles.push(...findHTMLFiles(filePath));
    } else if (file.endsWith(".html")) {
      htmlFiles.push(filePath);
    }
  }

  return htmlFiles;
}
