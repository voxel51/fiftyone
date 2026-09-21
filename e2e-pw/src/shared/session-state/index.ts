/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Reads the server's session state — the same `StateDescription` the App and a
 * Python `fo.Session` share.
 *
 * The view the browser applies lives in the server process's memory
 * (`fiftyone/server/events/state.py`), not in MongoDB, so a separate Python
 * process cannot see it by loading the dataset. The server's `/events` route
 * does expose it: posting `polling: true` returns the current state as a
 * `state_update` event.
 *
 * The payload carries an empty `AppInitializer` on purpose. A payload naming a
 * dataset the server does not currently hold makes `handle_dataset_change`
 * reset `state.view`, and a payload carrying a whole `StateDescription` is
 * dispatched as an update and overwrites it — either would destroy the thing
 * being measured. All-`None` takes every early return in
 * `handle_app_initializer` instead, so nothing is written.
 */

import type { APIRequestContext } from "@playwright/test";

/** A serialized view stage, as `DatasetView._serialize()` writes it. */
export interface SerializedStage {
  _cls: string;
  kwargs: [string, unknown][];
}

interface StateUpdateResponse {
  events: { event: string; data: { state: SessionState } }[];
}

interface SessionState {
  dataset?: string | null;
  view?: SerializedStage[] | null;
  view_name?: string | null;
}

const readState = async (
  request: APIRequestContext,
  baseURL: string,
): Promise<SessionState> => {
  const response = await request.post(`${baseURL}/events`, {
    data: {
      initializer: {},
      events: ["state_update"],
      subscription: `e2e-${Math.random().toString(36).slice(2)}`,
      polling: true,
    },
  });

  if (!response.ok()) {
    throw new Error(
      `reading session state failed: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as StateUpdateResponse;
  const update = body.events?.find((e) => e.event === "state_update");

  if (!update) {
    throw new Error(
      `no state_update in /events response: ${JSON.stringify(body)}`,
    );
  }

  return update.data.state;
};

/**
 * The stages the server currently holds for `datasetName`, in order. Empty
 * when the session is on the unfiltered dataset.
 *
 * Throws when the session is on a different dataset, so a test that navigated
 * somewhere unexpected fails as a wrong navigation rather than as an empty
 * view.
 */
export const getSessionView = async (
  request: APIRequestContext,
  baseURL: string,
  datasetName: string,
): Promise<SerializedStage[]> => {
  const state = await readState(request, baseURL);

  if (state.dataset !== datasetName) {
    throw new Error(
      `session is on dataset '${state.dataset}', expected '${datasetName}'`,
    );
  }

  return state.view ?? [];
};

/** A stage's kwargs as a plain object, for asserting on what the user entered. */
export const kwargsOf = (stage: SerializedStage): Record<string, unknown> =>
  Object.fromEntries(stage.kwargs ?? []);

/** The short class name of a serialized stage, e.g. `"Limit"`. */
export const clsOf = (stage: SerializedStage): string =>
  stage._cls.slice(stage._cls.lastIndexOf(".") + 1);
