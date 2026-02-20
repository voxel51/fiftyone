import { getDefaultStore } from "jotai";

// note: it's possible to access and mutate state of stored atoms in this store
// from outside React as well
export const jotaiStore: ReturnType<typeof getDefaultStore> = getDefaultStore();
