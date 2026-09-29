/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { atom, useAtomValue, useSetAtom, type PrimitiveAtom } from "jotai";

/**
 * The ordered member sample ids of the dynamic group the annotate surface
 * plays as video, position `i` being the member behind frame `i + 1`. Null
 * while no dynamic group is playing or its index has not loaded.
 */
export type DynamicGroupMemberIndex = readonly string[];

/** Internal — consumers go through the hooks below. */
const memberIndexAtom: PrimitiveAtom<DynamicGroupMemberIndex | null> = atom(
  null as DynamicGroupMemberIndex | null,
);

export const useDynamicGroupMemberIndex = (): DynamicGroupMemberIndex | null =>
  useAtomValue(memberIndexAtom);

/** Publisher — `useDynamicGroupIndex` feeds this. */
export const usePublishDynamicGroupMemberIndex = (): ((
  index: DynamicGroupMemberIndex | null,
) => void) => useSetAtom(memberIndexAtom);
