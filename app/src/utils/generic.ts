export const isElectron = (): boolean => {
  return (
    window.process &&
    window.process.versions &&
    Boolean(window.process.versions.electron)
  );
};

export const isFloat = (n: number): boolean => {
  return Number(n) === n && n % 1 !== 0;
};

export const summarizeLongStr = (
  s: string,
  maxLen: number,
  mode: string = "middle"
): string => {
  if (s.length <= maxLen) {
    return s;
  }

  const modeLower = mode.toLowerCase();

  if (modeLower === "first") {
    return "... " + s.slice(-(maxLen - 4));
  }

  if (modeLower === "middle") {
    const len1 = Math.ceil(0.5 * (maxLen - 5));
    const len2 = Math.floor(0.5 * (maxLen - 5));
    return s.slice(0, len1) + " ... " + s.slice(-len2);
  }

  if (modeLower === "last") {
    return s.slice(0, maxLen - 4) + " ...";
  }

  throw new Error(`Unsupported mode '${mode}'`);
};
