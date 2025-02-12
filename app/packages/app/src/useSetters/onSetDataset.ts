import {
  setDataset,
  type setDatasetMutation,
  subscribeBefore,
} from "@fiftyone/relay";
import {
  GRID_SPACES_DEFAULT,
  ensureColorScheme,
  stateSubscription,
} from "@fiftyone/state";
import { env } from "@fiftyone/utilities";
import { commitMutation } from "relay-runtime";
import type { DatasetPageQuery } from "../pages/datasets/__generated__/DatasetPageQuery.graphql";
import { resolveURL } from "../utils";
import type { RegisteredSetter } from "./registerSetter";

const onSetDataset: RegisteredSetter =
  ({ environment, router, sessionRef }) =>
  ({ get }, datasetName: string) => {
    !env().VITE_NO_STATE &&
      commitMutation<setDatasetMutation>(environment, {
        mutation: setDataset,
        variables: {
          name: datasetName,
          subscription: get(stateSubscription),
        },
      });

    const unsubscribe = subscribeBefore<DatasetPageQuery>((entry) => {
      sessionRef.current.selectedLabels = [];
      sessionRef.current.selectedSamples = new Set();
      sessionRef.current.sessionSpaces = GRID_SPACES_DEFAULT;
      sessionRef.current.fieldVisibilityStage = undefined;
      sessionRef.current.colorScheme = ensureColorScheme(
        entry.data.dataset?.appConfig?.colorScheme,
        entry.data.config
      );
      sessionRef.current.sessionGroupSlice =
        entry.data.dataset?.defaultGroupSlice || undefined;

      unsubscribe();
    });

    router.history.push(
      resolveURL({
        currentPathname: router.history.location.pathname,
        currentSearch: router.history.location.search,
        nextDataset: datasetName || null,
        extra: {
          groupId: null,
          id: null,
          slice: null,
          workspace: null,
        },
      }),
      {
        view: [],
        workspace: null,
      }
    );
  };

export default onSetDataset;
