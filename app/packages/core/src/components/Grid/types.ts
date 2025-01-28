import type { Lookers } from "@fiftyone/state";
import useLookerCache from "./useLookerCache";

const CACHE = () => useLookerCache<Lookers>("", 0, 0);

export type LookerCache = ReturnType<typeof CACHE>;
