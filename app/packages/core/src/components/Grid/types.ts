import useItemCache from "./useItemCache";

const CACHE = () =>
  useItemCache({
    reset: "",
    maxHiddenItems: 0,
    maxHiddenItemsSizeBytes: 0,
  });

export type ItemCache = ReturnType<typeof CACHE>;
