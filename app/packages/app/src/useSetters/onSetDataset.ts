import {
  setDataset,
  type setDatasetMutation,
  subscribeBefore,
} from "@fiftyone/relay";
import {
  GRID_SPACES_DEFAULT,
  ResponseFrom,
  Session,
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
      assignSession(sessionRef.current, {
        colorScheme: entry.data.dataset?.appConfig?.colorScheme,
        config: entry.data.config,
        groupSlice: entry.data.dataset?.defaultGroupSlice,
      });
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

export const assignSession = (
  session: Session,
  settings: {
    colorScheme?: Partial<
      NonNullable<
        NonNullable<ResponseFrom<DatasetPageQuery>["dataset"]>["appConfig"]
      >["colorScheme"]
    >;
    config?: ResponseFrom<DatasetPageQuery>["config"];
    groupSlice?: null | string;
  }
) => {
  session.selectedLabels = [];
  session.selectedSamples = new Set();
  session.sessionSpaces = GRID_SPACES_DEFAULT;
  session.fieldVisibilityStage = undefined;
  session.colorScheme = ensureColorScheme(
    settings.colorScheme,
    settings.config
  );
  session.sessionGroupSlice = settings?.groupSlice || undefined;
};

export default onSetDataset;
