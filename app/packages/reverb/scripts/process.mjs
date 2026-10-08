/**
 * Resolves the platform-specific executable name for a package binary.
 */
export const bin = (name) =>
  process.platform === "win32" ? `${name}.cmd` : name;
