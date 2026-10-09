/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The open sample's place in the grid order it was opened from, counted by
 * the server in the background: the only count of a large view.
 */

import {
  samplePosition,
  type samplePositionQuery,
  type samplePositionQuery$data,
} from "@fiftyone/relay";
import { useReverbValue } from "@fiftyone/reverb";
import { useEffect, useState } from "react";
import { fetchQuery, useRelayEnvironment } from "react-relay";
import { modalSelector } from "../../atoms/modal";
import { modalOrderInput } from "../../atoms/order";

/** A 1-based index, and the total or null when counting it timed out. */
export interface ModalPosition {
  index: number;
  total: number | null;
}

type Part = samplePositionQuery$data["samplePosition"]["total"] | null;

const valueOf = (part: Part) =>
  part?.__typename === "SamplePositionValue" ? part.value : undefined;

/** Null unless the offset is known; a total that timed out is null. */
export const toModalPosition = ({
  samplePosition: { offset, total },
}: samplePositionQuery$data): ModalPosition | null => {
  const at = valueOf(offset);
  if (at === undefined) return null;
  return { index: at + 1, total: valueOf(total) ?? null };
};

/**
 * The open sample's position, fetched without blocking anything once it
 * opens from the grid; stepping to another sample cancels the request.
 */
export const useModalPosition = (): ModalPosition | null => {
  const environment = useRelayEnvironment();
  const selector = useReverbValue(modalSelector);
  const input = useReverbValue(modalOrderInput);
  const target = selector?.groupId
    ? { groupId: selector.groupId }
    : selector?.id
      ? { sampleId: selector.id }
      : undefined;
  const key =
    input && target ? JSON.stringify({ input, ...target }) : undefined;
  const [position, setPosition] = useState<{
    key: string;
    value: ModalPosition | null;
  }>();

  useEffect(() => {
    if (!key) return undefined;
    const variables: samplePositionQuery["variables"] = JSON.parse(key);
    const subscription = fetchQuery<samplePositionQuery>(
      environment,
      samplePosition,
      variables,
      { fetchPolicy: "network-only" },
    ).subscribe({
      next: (data) => setPosition({ key, value: toModalPosition(data) }),
      error: () => setPosition({ key, value: null }),
    });
    return () => subscription.unsubscribe();
  }, [environment, key]);

  return position && position.key === key ? position.value : null;
};
