import type { Lookers } from "@fiftyone/state";
import useLookerCache from "./useLookerCache";

const CACHE = () =>
  useLookerCache<Lookers>({
    reset: "",
    maxHiddenItems: 0,
    maxHiddenItemsSizeBytes: 0,
  });

export type LookerCache = ReturnType<typeof CACHE>;
