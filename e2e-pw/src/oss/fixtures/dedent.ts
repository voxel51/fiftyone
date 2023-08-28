import dedent from "ts-dedent";

export function dedentPythonCode(code: string): string {
  // we're using a simple heuristic here to determine the number of spaces to remove
  const firstNonEmptyLine = code.split("\n").find((line) => {
    return line.trim().length > 0;
  });

  // check the number of spaces before the first character in the non-empty line
  const numSpaces = firstNonEmptyLine?.search(/\S|$/);

  // for each non-empty line in code, remove the first numSpaces characters
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length > 0) {
      lines[i] = line.slice(numSpaces);
    }
  }

  return dedent(lines.join("\n"));
}
