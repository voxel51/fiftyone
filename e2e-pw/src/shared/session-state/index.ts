/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Reads the server's session state — the same `StateDescription` the App and a
 * Python `fo.Session` share.
 *
 * The view the browser applies lives in the server process's memory
 * (`fiftyone/server/events/state.py`), not in MongoDB, so a separate Python
 * process cannot see it by loading the dataset. The server's `/events` route
 * does expose it: a stream opens with the current state as a `state_update`
 * event. The read closes the stream at that event, so the server stops
 * counting it as an App at once; a polling read would count as an App for its
 * whole lease and bring the shared session banner into the test's page.
 *
 * The payload carries an empty `AppInitializer` on purpose. A payload naming a
 * dataset the server does not currently hold makes `handle_dataset_change`
 * reset `state.view`, and a payload carrying a whole `StateDescription` is
 * dispatched as an update and overwrites it — either would destroy the thing
 * being measured. All-`None` takes every early return in
 * `handle_app_initializer` instead, so nothing is written.
 */

/** A serialized view stage, as `DatasetView._serialize()` writes it. */
export interface SerializedStage {
  _cls: string;
  kwargs: [string, unknown][];
}

interface SessionState {
  dataset?: string | null;
  view?: SerializedStage[] | null;
  view_name?: string | null;
}

const STATE_UPDATE = /event: state_update\r?\ndata: (.*)\r?\n/;

const readState = async (baseURL: string): Promise<SessionState> => {
  const controller = new AbortController();
  try {
    const response = await fetch(`${baseURL}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initializer: {},
        events: ["state_update"],
        subscription: `e2e-${Math.random().toString(36).slice(2)}`,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `reading session state failed: ${response.status} ${await response.text()}`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        throw new Error(`no state_update in /events stream: ${received}`);
      }
      received += decoder.decode(value, { stream: true });
      const update = STATE_UPDATE.exec(received);
      if (update) {
        return (JSON.parse(update[1]) as { state: SessionState }).state;
      }
    }
  } finally {
    controller.abort();
  }
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
  baseURL: string,
  datasetName: string,
): Promise<SerializedStage[]> => {
  const state = await readState(baseURL);

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
