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
    return "..." + s.slice(-(maxLen - 3));
  }

  if (modeLower === "middle") {
    const len1 = Math.ceil(0.5 * (maxLen - 3));
    const len2 = Math.floor(0.5 * (maxLen - 3));
    return s.slice(0, len1) + "..." + s.slice(-len2);
  }

  if (modeLower === "last") {
    return s.slice(0, maxLen - 3) + "...";
  }

  throw new Error(`Unsupported mode '${mode}'`);
};

export const prettify = (
  v: boolean | string | null | undefined | number,
  summarize: boolean = true,
  maxStrLen: number = 27
): string => {
  if (typeof v === "string") {
    return summarize ? summarizeLongStr(v, maxStrLen) : v;
  } else if (typeof v === "number") {
    return Number(v.toFixed(3)).toLocaleString();
  } else if (v === true) {
    return "True";
  } else if (v === false) {
    return "False";
  } else if ([undefined, null].includes(v)) {
    return "None";
  }
  return null;
};
