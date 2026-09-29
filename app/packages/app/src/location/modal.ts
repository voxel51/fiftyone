/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { LocationModel, LocationStore } from "@fiftyone/location";
import type { ModalSelector } from "@fiftyone/state";
import { groupIdParam, sampleIdParam } from "./params";

type Selected = { groupId?: string; id?: string } | undefined;

/** The sample the URL has open. A group's is named by its group alone. */
export const readModal = (store: LocationStore<unknown>): Selected => {
  const groupId = store.read(groupIdParam);
  if (groupId) return { groupId };
  const id = store.read(sampleIdParam);
  return id ? { id } : undefined;
};

/** Whether `selector` is the sample `selected` names. */
export const isSelected = (
  selected: Selected,
  selector: ModalSelector | null | undefined,
) => {
  if (!selected) return !selector?.groupId && !selector?.id;
  return selected.groupId
    ? selected.groupId === selector?.groupId
    : selected.id === selector?.id;
};

const withSelector = <R>(
  current: LocationModel<R>,
  selector: ModalSelector | null | undefined,
): LocationModel<R> => {
  const params = { ...current.params };
  delete params[groupIdParam.key];
  delete params[sampleIdParam.key];
  if (selector?.groupId) {
    params[groupIdParam.key] = selector.groupId;
  } else if (selector?.id) {
    params[sampleIdParam.key] = selector.id;
  }
  return { ...current, params };
};

// The sample the App's own open pushed, while the entry before it is still
// the grid it was opened from. Only then can a close go back to that entry.
let opened: Selected;

/**
 * Writes the App's move to `selector`. An open pushes, a step to another
 * sample replaces, and a close goes back to the grid the open pushed from, or
 * replaces when the entry before is not known to be it.
 */
export const writeModal = (
  store: LocationStore<unknown>,
  selector: ModalSelector | null | undefined,
) => {
  const selected = readModal(store);
  if (isSelected(selected, selector)) {
    // the URL moved first, as on Back, so it is no longer the App's open
    opened = undefined;
    return;
  }

  const next = (current: LocationModel<unknown>) =>
    withSelector(current, selector);
  const onOpened = selected !== undefined && isSelected(opened, selected);

  if (!selector?.groupId && !selector?.id) {
    opened = undefined;
    onOpened ? store.back() : store.update(next, "replace");
    return;
  }

  if (!selected) {
    store.update(next, "push");
    opened = readModal(store);
    return;
  }

  store.update(next, "replace");
  opened = onOpened ? readModal(store) : undefined;
};
