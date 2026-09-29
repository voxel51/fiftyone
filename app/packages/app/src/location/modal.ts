/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { LocationModel, LocationStore } from "@fiftyone/location";
import type { ModalSelector } from "@fiftyone/state";
import type { AppRoute } from "./routes";

type Selected = { groupId?: string; id?: string } | undefined;
type Store = LocationStore<AppRoute>;

// the query params a sample was linked by before it had a path
const LEGACY_GROUP = "groupId";
const LEGACY_SAMPLE = "id";

const selectedBy = (route: AppRoute): Selected => {
  if (route.kind === "group") return { groupId: route.groupId };
  if (route.kind === "sample") return { id: route.id };
  return undefined;
};

/** The sample the URL has open. A group's is named by its group alone. */
export const readModal = (store: Store): Selected =>
  selectedBy(store.get().route);

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

const datasetOf = (route: AppRoute) =>
  route.kind === "dataset" || route.kind === "sample" || route.kind === "group"
    ? route.name
    : undefined;

const withSelector = (
  current: LocationModel<AppRoute>,
  selector: ModalSelector | null | undefined,
): LocationModel<AppRoute> => {
  const name = datasetOf(current.route);
  if (name === undefined) return current;
  const route: AppRoute = selector?.groupId
    ? { kind: "group", name, groupId: selector.groupId }
    : selector?.id
      ? { kind: "sample", name, id: selector.id }
      : { kind: "dataset", name };
  return { ...current, route };
};

/** Rewrites a `?id=` or `?groupId=` link to the sample's path, in place. */
export const redirectLegacyModal = (store: Store) => {
  const current = store.get();
  const {
    [LEGACY_GROUP]: groupId,
    [LEGACY_SAMPLE]: id,
    ...params
  } = current.params;
  if (!groupId && !id) return;
  const next =
    current.route.kind === "dataset"
      ? withSelector(current, { groupId, id })
      : current;
  store.replace({ ...next, params });
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
  store: Store,
  selector: ModalSelector | null | undefined,
) => {
  const selected = readModal(store);
  if (isSelected(selected, selector)) {
    // the URL moved first, as on Back, so it is no longer the App's open
    opened = undefined;
    return;
  }

  const next = (current: LocationModel<AppRoute>) =>
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
