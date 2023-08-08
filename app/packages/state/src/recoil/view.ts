import { atom, selector } from "recoil";

import { Stage } from "@fiftyone/utilities";
import { groupByFieldValue } from "./groups";
import { State } from "./types";
import { getSanitizedGroupByExpression } from "./utils";

export const view = atom<State.Stage[]>({
  key: "view",
  default: [],
});

export const viewCls = atom<string>({
  key: "viewCls",
  default: null,
});

export const viewName = atom<string>({
  key: "viewName",
  default: null,
});

export const isRootView = selector<boolean>({
  key: "isRootView",
  get: ({ get }) =>
    [undefined, null, "fiftyone.core.view.DatasetView"].includes(get(viewCls)),
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

const CLIPS_VIEW = "fiftyone.core.clips.ClipsView";
const FRAMES_VIEW = "fiftyone.core.video.FramesView";
const EVALUATION_PATCHES_VIEW = "fiftyone.core.patches.EvaluationPatchesView";
const PATCHES_VIEW = "fiftyone.core.patches.PatchesView";
const PATCH_VIEWS = [PATCHES_VIEW, EVALUATION_PATCHES_VIEW];

export const GROUP_BY_VIEW_STAGE = "fiftyone.core.stages.GroupBy";
export const LIMIT_VIEW_STAGE = "fiftyone.core.stages.Limit";
export const MATCH_VIEW_STAGE = "fiftyone.core.stages.Match";
export const SKIP_VIEW_STAGE = "fiftyone.core.stages.Skip";
export const SORT_VIEW_STAGE = "fiftyone.core.stages.SortBy";
export const TAKE_VIEW_STAGE = "fiftyone.core.stages.Take";

enum ELEMENT_NAMES {
  CLIP = "clip",
  FRAME = "frame",
  PATCH = "patch",
  SAMPLE = "sample",
}

enum ELEMENT_NAMES_PLURAL {
  CLIP = "clips",
  FRAME = "frames",
  PATCH = "patches",
  SAMPLE = "samples",
}

export const rootElementName = selector<string>({
  key: "rootElementName",
  get: ({ get }) => {
    const cls = get(viewCls);
    if (PATCH_VIEWS.includes(cls)) {
      return ELEMENT_NAMES.PATCH;
    }

    if (cls === CLIPS_VIEW) return ELEMENT_NAMES.CLIP;

    if (cls === FRAMES_VIEW) return ELEMENT_NAMES.FRAME;

    return ELEMENT_NAMES.SAMPLE;
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const rootElementNamePlural = selector<string>({
  key: "rootElementNamePlural",
  get: ({ get }) => {
    const elementName = get(rootElementName);

    switch (elementName) {
      case ELEMENT_NAMES.CLIP:
        return ELEMENT_NAMES_PLURAL.CLIP;
      case ELEMENT_NAMES.FRAME:
        return ELEMENT_NAMES_PLURAL.FRAME;
      case ELEMENT_NAMES.PATCH:
        return ELEMENT_NAMES_PLURAL.PATCH;
      default:
        return ELEMENT_NAMES_PLURAL.SAMPLE;
    }
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const elementNames = selector<{ plural: string; singular: string }>({
  key: "elementNames",
  get: ({ get }) => {
    return {
      plural: get(rootElementNamePlural),
      singular: get(rootElementName),
    };
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const isClipsView = selector<boolean>({
  key: "isClipsView",
  get: ({ get }) => {
    return get(rootElementName) === ELEMENT_NAMES.CLIP;
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const isPatchesView = selector<boolean>({
  key: "isPatchesView",
  get: ({ get }) => {
    return get(rootElementName) === ELEMENT_NAMES.PATCH;
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const isFramesView = selector<boolean>({
  key: "isFramesView",
  get: ({ get }) => {
    return get(rootElementName) === ELEMENT_NAMES.FRAME;
  },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

export const dynamicGroupCurrentElementIndex = atom<number>({
  key: "dynamicGroupCurrentElementIndex",
  default: 1,
});

export const dynamicGroupParameters =
  selector<State.DynamicGroupParameters | null>({
    key: "dynamicGroupParameters",
    get: ({ get }) => {
      const viewArr = get(view);
      if (!viewArr) return null;

      const groupByViewStageNode = viewArr.find(
        (view) => view._cls === GROUP_BY_VIEW_STAGE
      );
      if (!groupByViewStageNode) return null;

      const isFlat = groupByViewStageNode.kwargs[2][1]; // third index is 'flat', we want it to be false for dynamic groups
      if (isFlat) return null;

      return {
        groupBy: groupByViewStageNode.kwargs[0][1], // first index is 'field_or_expr', which defines group-by
        orderBy: groupByViewStageNode.kwargs[1][1], // second index is 'order_by', which defines order-by
      };
    },
  });

export const isDynamicGroup = selector<boolean>({
  key: "isDynamicGroup",
  get: ({ get }) => {
    return Boolean(get(dynamicGroupParameters));
  },
});

export const dynamicGroupViewQuery = selector<Stage[]>({
  key: "dynamicGroupViewQuery",
  get: ({ get }) => {
    const params = get(dynamicGroupParameters);
    if (!dynamicGroupParameters) return [];

    const { groupBy, orderBy } = params;

    // todo: fix sample_id issue
    // todo: sanitize expressions
    const groupBySanitized = getSanitizedGroupByExpression(groupBy);

    const viewStages: State.Stage[] = [
      {
        _cls: MATCH_VIEW_STAGE,
        kwargs: [
          [
            "filter",
            {
              $expr: {
                $let: {
                  vars: {
                    expr: `$${groupBySanitized}`,
                  },
                  in: {
                    $in: [
                      {
                        $toString: "$$expr",
                      },
                      [get(groupByFieldValue)],
                    ],
                  },
                },
              },
            },
          ],
        ],
      },
    ];

    if (orderBy?.length) {
      viewStages.push({
        _cls: SORT_VIEW_STAGE,
        kwargs: [
          ["field_or_expr", orderBy],
          ["reverse", false],
        ],
      });
    }

    const baseView = [...get(view)];
    let modalView: State.Stage[] = [];
    let pastGroup = false;
    for (let index = 0; index < baseView.length; index++) {
      const stage = baseView[index];
      if (stage._cls === GROUP_BY_VIEW_STAGE) {
        modalView = [...modalView, ...viewStages];
        pastGroup = true;
        continue;
      }

      if (!pastGroup) {
        modalView.push(stage);
        continue;
      }

      // Assume these stages should be filtered out because they apply to the slices
      // and not a slice list. To be improved
      if (
        ![LIMIT_VIEW_STAGE, SKIP_VIEW_STAGE, TAKE_VIEW_STAGE].includes(
          stage._cls
        )
      ) {
        modalView.push(stage);
      }
    }

    return modalView;
  },
});

export const currentViewSlug = selector<string>({
  key: "currentViewSlug",
  get: () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("view") || null;
  },
});

export const DEFAULT_SELECTED: DatasetViewOption = {
  id: "1",
  label: "Unsaved view",
  color: "#9e9e9e",
  description: "Unsaved view",
  slug: "unsaved-view",
  viewStages: [],
};

export type DatasetViewOption = Pick<
  State.SavedView,
  "id" | "description" | "color" | "viewStages"
> & { label: string; slug: string };

export const selectedSavedViewState = atom<DatasetViewOption | null>({
  key: "selectedSavedViewState",
  default: DEFAULT_SELECTED,
});
