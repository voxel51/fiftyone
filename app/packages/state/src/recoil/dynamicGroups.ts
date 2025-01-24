import { ImaVidLooker } from "@fiftyone/looker";
import {
  DYNAMIC_GROUP_FIELDS,
  EMBEDDED_DOCUMENT_FIELD,
  GROUP,
  LIST_FIELD,
  getFieldInfo,
} from "@fiftyone/utilities";
import { get as _get } from "lodash";
import { atom, atomFamily, selector, selectorFamily } from "recoil";
import {
  currentSlice,
  groupSlice,
  hasGroupSlices,
  modalGroupSlice,
} from "./groups";
import { modalLooker, modalSample } from "./modal";
import { dynamicGroupsViewMode, selectedMediaField } from "./options";
import { fieldPaths, fieldSchema } from "./schema";
import { datasetName, parentMediaTypeSelector } from "./selectors";
import { State } from "./types";
import {
  GROUP_BY_VIEW_STAGE,
  LIMIT_VIEW_STAGE,
  MATCH_VIEW_STAGE,
  SKIP_VIEW_STAGE,
  SORT_VIEW_STAGE,
  TAKE_VIEW_STAGE,
  view,
} from "./view";

export const dynamicGroupCurrentElementIndex = atom<number>({
  key: "dynamicGroupCurrentElementIndex",
  default: 1,
});

export const dynamicGroupIndex = atom<number>({
  key: "dynamicGroupIndex",
  default: null,
});

export const dynamicGroupFields = selector<string[]>({
  key: "dynamicGroupFields",
  get: ({ get }) => {
    const groups = get(
      fieldPaths({
        ftype: EMBEDDED_DOCUMENT_FIELD,
        embeddedDocType: GROUP,
        space: State.SPACE.SAMPLE,
      })
    );
    const lists = get(
      fieldPaths({ ftype: LIST_FIELD, space: State.SPACE.SAMPLE })
    );
    const primitives = get(
      fieldPaths({ ftype: DYNAMIC_GROUP_FIELDS, space: State.SPACE.SAMPLE })
    ).filter((path) => path !== "filepath" && path !== "id");

    const filtered = primitives.filter(
      (path) =>
        lists.every((list) => !path.startsWith(list)) &&
        groups.every(
          (group) => path !== `${group}.id` && path !== `${group}.name`
        )
    );

    return filtered;
  },
});

export const dynamicGroupPageSelector = selectorFamily<
  (
    cursor: number,
    pageSize: number
  ) => {
    after: string | null;
    count: number;
    dataset: string;
    filter: { group: { slice?: string; slices?: string[] } };
    view: State.Stage[];
  },
  { modal: boolean; value: string }
>({
  key: "paginateDynamicGroupVariables",
  get:
    ({ modal, value }) =>
    ({ get }) => {
      const slice = get(modal ? modalGroupSlice : groupSlice);

      const params = {
        dataset: get(datasetName),
        view: get(dynamicGroupViewQuery(value)),
        filter: { group: { slice } },
      };

      if (get(hasGroupSlices)) {
        params.filter.group.slices = [slice];
      }

      return (cursor: number, pageSize: number) => ({
        ...params,
        after: cursor ? String(cursor) : null,
        count: pageSize,
      });
    },
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

      // third index is 'flat', we want it to be false for dynamic groups
      const isFlat = groupByViewStageNode.kwargs[2][1];
      if (isFlat) return null;

      return {
        // first index is 'field_or_expr', which defines group-by
        groupBy: groupByViewStageNode.kwargs[0][1] as string,
        // second index is 'order_by', which defines order-by
        orderBy: groupByViewStageNode.kwargs[1][1] as string,
      };
    },
  });

export const dynamicGroupViewQuery = selectorFamily<
  State.Stage[],
  string | null
>({
  key: "dynamicGroupViewQuery",
  get:
    (groupByFieldValueExplicit) =>
    ({ get }) => {
      const params = get(dynamicGroupParameters);
      if (!params) return [];

      const { groupBy, orderBy } = params;

      const schema = get(fieldSchema({ space: State.SPACE.SAMPLE }));
      const groupByFieldKeyInfo = getFieldInfo(groupBy, schema);

      let groupByValue;

      if (groupByFieldValueExplicit !== null) {
        groupByValue = String(groupByFieldValueExplicit);
      } else {
        groupByValue = get(groupByFieldValue);

        if (groupByValue) {
          groupByValue = String(groupByValue);
        }
      }
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
                      expr: `$${groupByFieldKeyInfo.pathWithDbField}`,
                    },
                    in: {
                      $in: [
                        {
                          $toString: "$$expr",
                        },
                        [groupByValue],
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

        // Assume these stages should be filtered out because they apply to
        // the slices and not the contents of a group
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

export const groupByFieldValue = selector<string | null>({
  key: "groupByFieldValue",
  get: ({ get }) => {
    const params = get(dynamicGroupParameters);

    if (!params?.groupBy) {
      return null;
    }
    const schema = get(fieldSchema({ space: State.SPACE.SAMPLE }));
    const fieldInfo = getFieldInfo(params.groupBy, schema);
    const groupByKeyDbField = fieldInfo.pathWithDbField;

    return String(_get(get(modalSample).sample, groupByKeyDbField));
  },
});

export const imaVidLookerState = atomFamily<any, string>({
  key: "imaVidLookerState",
  default: null,
  effects: (key) => [
    ({ setSelf, getPromise, onSet }) => {
      let unsubscribe;

      onSet((_newValue) => {
        // note: resetRecoilState is not triggering `onSet` in effect,
        // see https://github.com/facebookexperimental/Recoil/issues/2183
        // replace with `useResetRecoileState` when fixed

        // if (!isReset) {
        //   throw new Error("cannot set ima-vid state directly");
        // }
        unsubscribe && unsubscribe();

        getPromise(modalLooker)
          .then((looker: ImaVidLooker) => {
            if (looker) {
              unsubscribe = looker.subscribeToState(key, (stateValue) => {
                setSelf(stateValue);
              });
            }
          })
          .catch((e) => {
            console.error(e);
          });
      });

      return () => {
        unsubscribe();
      };
    },
  ],
});

export const imaVidStoreKey = selectorFamily<
  string,
  { modal: boolean; groupByFieldValue: string }
>({
  key: "imaVidStoreKey",
  get:
    ({ modal, groupByFieldValue }) =>
    ({ get }) => {
      const { groupBy, orderBy } = get(dynamicGroupParameters);
      const slice = get(currentSlice(modal)) ?? "UNSLICED";
      const mediaField = get(selectedMediaField(modal));

      return `$${groupBy}-${orderBy}-${groupByFieldValue}-${slice}-${mediaField}`;
    },
});

export const isDynamicGroup = selector<boolean>({
  key: "isDynamicGroup",
  get: ({ get }) => {
    return Boolean(get(dynamicGroupParameters));
  },
});

export const isNonNestedDynamicGroup = selector<boolean>({
  key: "isNonNestedDynamicGroup",
  get: ({ get }) => {
    return get(isDynamicGroup) && get(parentMediaTypeSelector) !== "group";
  },
});

export const isNestedDynamicGroup = selector<boolean>({
  key: "isNestedDynamicGroup",
  get: ({ get }) => {
    return get(isDynamicGroup) && get(hasGroupSlices);
  },
});

export const isOrderedDynamicGroup = selector<boolean>({
  key: "isOrderedDynamicGroup",
  get: ({ get }) => {
    const params = get(dynamicGroupParameters);
    if (!params) return false;

    const { orderBy } = params;
    return Boolean(orderBy?.length);
  },
});

export const shouldRenderImaVidLooker = selectorFamily({
  key: "shouldRenderImaVidLooker",
  get:
    (modal: boolean) =>
    ({ get }) => {
      return (
        get(isOrderedDynamicGroup) &&
        get(dynamicGroupsViewMode(modal)) === "video"
      );
    },
});
