import useLookerCache from "./useLookerCache";

const CACHE = () =>
  useLookerCache({
    reset: "",
    maxHiddenItems: 0,
    maxHiddenItemsSizeBytes: 0,
  });

export type LookerCache = ReturnType<typeof CACHE>;
