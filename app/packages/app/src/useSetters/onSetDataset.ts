import {
  setDataset,
  setDatasetMutation,
  subscribeBefore,
} from "@fiftyone/relay";
import {
  SPACES_DEFAULT,
  ensureColorScheme,
  stateSubscription,
} from "@fiftyone/state";
import { env } from "@fiftyone/utilities";
import { commitMutation } from "relay-runtime";
import { DatasetPageQuery } from "../pages/datasets/__generated__/DatasetPageQuery.graphql";
import { resolveURL } from "../utils";
import { RegisteredSetter } from "./registerSetter";

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

    subscribeBefore<DatasetPageQuery>((entry) => {
      sessionRef.current.selectedLabels = [];
      sessionRef.current.selectedSamples = new Set();
      sessionRef.current.sessionSpaces = SPACES_DEFAULT;
      sessionRef.current.fieldVisibilityStage = undefined;
      sessionRef.current.colorScheme = entry.data.dataset?.appConfig
        ?.colorScheme ?? {
        id: sessionRef.current.colorScheme?.id,
        colorBy: entry.data.config.colorBy,
        colorPool: entry.data.config.colorPool,
        fields: [],
        labelTags: {
          fieldColor: null,
          valueColors: [],
        },
        defaultMaskTargetsColors: [],
        defaultColorscale: {
          name: entry.data.config.colorscale ?? "viridis",
          list: [],
        },
        colorscales: [],
        multicolorKeypoints: false,
        opacity: 0.7,
        showSkeletons: true,
      };
      sessionRef.current.sessionGroupSlice =
        entry.data.dataset?.defaultGroupSlice || undefined;
    });

    router.history.push(resolveURL(router, datasetName || null), {
      view: [],
    });
  };

export default onSetDataset;
