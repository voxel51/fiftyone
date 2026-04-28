export const bin = (name) =>
  process.platform === "win32" ? `${name}.cmd` : name;
