import { atomFamily, selector, selectorFamily } from "recoil";
import { v4 as uuid } from "uuid";

import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { isBooleanField } from "./BooleanFieldFilter.state";
import { isNumericField } from "./NumericFieldFilter.state";
import { isStringField } from "./StringFieldFilter.state";

import { AGGS } from "../../utils/labels";
import { request } from "../../utils/socket";

const COUNT_CLS = "Count";

export const catchLabelCount = (
  names: string[],
  prefix: string,
  cur: { name: string; _CLS: string; result: number },
  acc: { [key: string]: number }
): void => {
  if (
    cur.name &&
    names.includes(cur.name.slice(prefix.length).split(".")[0]) &&
    cur._CLS === COUNT_CLS
  ) {
    acc[cur.name.slice(prefix.length).split(".")[0]] = cur.result;
  }
};

export const modalStats = selector({
  key: "modalStats",
  get: async ({ get }) => {
    const id = uuid();
    const data = await request({
      type: "frame_statistics",
      uuid: id,
      args: {
        sample_id: get(atoms.modal).sampleId,
      },
    });

    return data.stats;
  },
});

export const modalFrameLabelCounts = selector({
  key: "modalFrameLabelCounts",
  get: ({ get }) => {
    const stats = get(modalFrameStats).main;
    const names = get(selectors.labelNames("frame"));
    if (stats === null) {
      return null;
    }
    return stats.reduce((acc, cur) => {
      catchLabelCount(names, "frames.", cur, acc);
      return acc;
    }, {});
  },
});

export const modalFilteredFrameStats = selector({
  key: "modalFilteredStats",
  get: async ({ get }) => {
    const id = uuid();
    const data = await request({
      type: "frame_statistics",
      uuid: id,
      args: {
        sample_id: get(atoms.modal).sampleId,
      },
    });

    return data.stats;
  },
});

export const modalFilteredFrameLabelCounts = selector({
  key: "modalFilteredFrameLabelCounts",
  get: ({ get }) => {
    const stats = get(modalFilteredFrameStats).main;
    const names = get(selectors.labelNames("frame"));
    if (stats === null) {
      return null;
    }
    return stats.reduce((acc, cur) => {
      catchLabelCount(names, "frames.", cur, acc);
      return acc;
    }, {});
  },
});

export const isLabelField = selectorFamily<boolean, string>({
  key: "isLabelField",
  get: (field) => ({ get }) => {
    const names = get(selectors.labelNames("sample")).concat(
      get(selectors.labelNames("frame")).map((l) => "frames." + l)
    );
    return names.includes(field);
  },
});

export const unsupportedFields = selector<string[]>({
  key: "unsupportedFields",
  get: ({ get }) => {
    const fields = get(selectors.fieldPaths);
    return fields.filter(
      (f) =>
        !f.startsWith("frames.") &&
        !get(isLabelField(f)) &&
        !get(isNumericField(f)) &&
        !get(isStringField(f)) &&
        !get(isBooleanField(f)) &&
        !["metadata", "tags"].includes(f)
    );
  },
});

export const noneCount = selectorFamily<
  number,
  { path: string; modal: boolean; filtered: boolean }
>({
  key: "noneCount",
  get: ({ path, modal, filtered }) => ({ get }) => {
    if (modal) {
    }

    if (filtered) {
      return get(selectors.noneFilteredFieldCounts)[path];
    }

    return get(selectors.noneFieldCounts)[path];
  },
});

const modalCountsAtom = selectorFamily<
  {
    count: number;
    results: [Value, number][];
  },
  string
>({
  key: "categoricalModalFieldCounts",
  get: (path) => ({ get }) => {
    let target = get(selectors.modalSample);
    let nullCount = 0;
    const counts = {};
    const video = get(selectors.isRootView) && get(selectors.isVideoDataset);

    if (video && path.startsWith("frames.")) {
      console.log(get(modalFrameLabelCounts));
      return {
        count: 0,
        results: [],
      };
    }

    let keys = path.split(".").slice(0, -1);
    const key = path.split(".").slice(-1)[0];

    keys.forEach((key) => {
      target = target[key];
    });

    const add = (v) => {
      if (!v[key]) {
        nullCount++;
      } else {
        v[key] in counts ? counts[v[key]]++ : (counts[v[key]] = 1);
      }
    };
    let count = 0;
    if (Array.isArray(target)) {
      count = target.length;
      target.forEach((v) => add(v));
    } else {
      add(target);
      target[key] !== null && target[key] !== undefined && (count = 1);
    }
    const results: [Value, number][] = Object.entries(counts);

    if (nullCount) {
      results.push([null, nullCount]);
    }

    return {
      results,
      count,
    };
  },
});

export const countsAtom = selectorFamily<
  { count: number; results: [Value, number][] },
  { path: string; modal: boolean }
>({
  key: "categoricalFieldCounts",
  get: ({ path, modal }) => ({ get }) => {
    const none = get(noneCount({ path, modal, filtered: false }));

    const data = (get(selectors.datasetStats) ?? []).reduce(
      (acc, cur) => {
        if (cur.name === path && cur._CLS === AGGS.COUNT_VALUES) {
          return {
            count: cur.result[0],
            results: cur.result[1],
          };
        }
        return acc;
      },
      { count: 0, results: [] }
    );

    if (none > 0 && !modal) {
      data.count = data.count + 1;
      data.results = [...data.results, [null, none]];
    }

    return data;
  },
});

export const activeFields = atomFamily<string[], boolean>({
  key: "activeFields",
  default: selectors.labelPaths,
});

export const activeLabels = selectorFamily<
  string[],
  { modal: boolean; frames: boolean }
>({
  key: "activeLabels",
  get: ({ modal, frames }) => ({ get }) => {
    const paths = get(selectors.labelPaths);
    return get(activeFields(modal))
      .filter((v) => paths.includes(v))
      .filter((v) =>
        frames ? v.startsWith("frames.") : !v.startsWith("frames.")
      );
  },
  set: ({ modal, frames }) => ({ get, set }, value) => {
    if (Array.isArray(value)) {
      let active = get(activeFields(modal)).filter((v) =>
        get(isLabelField(v)) &&
        (frames ? v.startsWith("frames.") : !v.startsWith("frames."))
          ? value.includes(v)
          : true
      );

      if (value.length) {
        active = [value[0], ...active.filter((v) => v !== value[0])];
      }
      set(activeFields(modal), active);
    }
  },
});

export const activeLabelPaths = selectorFamily<string[], boolean>({
  key: "activeLabelPaths",
  get: (modal) => ({ get }) => {
    const sample = get(activeLabels({ modal, frames: false }));
    const frames = get(activeLabels({ modal, frames: true }));

    return [...sample, ...frames];
  },
});

export const activeScalars = selectorFamily<string[], boolean>({
  key: "activeScalars",
  get: (modal) => ({ get }) => {
    const scalars = get(selectors.scalarNames("sample"));
    return get(activeFields(modal)).filter((v) => scalars.includes(v));
  },
  set: (modal) => ({ get, set }, value) => {
    if (modal) {
      return [];
    }
    if (Array.isArray(value)) {
      const scalars = get(selectors.scalarNames("sample"));
      const prevActiveScalars = get(activeScalars(modal));
      let active = get(activeFields(modal)).filter((v) =>
        scalars.includes(v) ? value.includes(v) : true
      );
      if (value.length && prevActiveScalars.length < value.length) {
        active = [value[0], ...active.filter((v) => v !== value[0])];
      }
      set(activeFields(modal), active);
    }
  },
});

export const activeTags = selectorFamily<string[], boolean>({
  key: "activeTags",
  get: (modal) => ({ get }) => {
    const tags = get(selectors.tagNames);
    return get(activeFields(modal))
      .filter((t) => t.startsWith("tags.") && tags.includes(t.slice(5)))
      .map((t) => t.slice(5));
  },
  set: (modal) => ({ get, set }, value) => {
    if (Array.isArray(value)) {
      const tags = value.map((v) => "tags." + v);
      const prevActiveTags = get(activeTags(modal));
      let active = get(activeFields(modal)).filter((v) =>
        v.startsWith("tags.") ? tags.includes(v) : true
      );
      if (tags.length && prevActiveTags.length < tags.length) {
        active = [tags[0], ...active.filter((v) => v !== tags[0])];
      }
      set(activeFields(modal), active);
    }
  },
});

export const activeLabelTags = selectorFamily<string[], boolean>({
  key: "activeLabelTags",
  get: (modal) => ({ get }) => {
    const tags = get(selectors.labelTagNames);
    return get(activeFields(modal))
      .filter(
        (t) =>
          t.startsWith("_label_tags.") &&
          tags.includes(t.slice("_label_tags.".length))
      )
      .map((t) => t.slice("_label_tags.".length));
  },
  set: (modal) => ({ get, set }, value) => {
    if (Array.isArray(value)) {
      const tags = value.map((v) => "_label_tags." + v);
      const prevActiveTags = get(activeLabelTags(modal));
      let active = get(activeFields(modal)).filter((v) =>
        v.startsWith("_label_tags.") ? tags.includes(v) : true
      );
      if (tags.length && prevActiveTags.length < tags.length) {
        active = [tags[0], ...active.filter((v) => v !== tags[0])];
      }
      set(activeFields(modal), active);
    }
  },
});

const NONSTRING_VALUES: any[] = [false, true, null];
const STRING_VALUES = ["False", "True", "None"];

export const getValueString = (value: Value): [string, boolean] => {
  if (NONSTRING_VALUES.includes(value)) {
    return [STRING_VALUES[NONSTRING_VALUES.indexOf(value)], true];
  }

  return [value as string, false];
};
