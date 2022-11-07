import { atomFamily, selector } from "recoil";
import { aggregationQuery, count } from "./aggregations";
import { dataset } from "./atoms";
import { labelFields } from "./schema";
import { appConfigDefault, isVideoDataset } from "./selectors";
import { State } from "./types";

export const selectedMediaField = atomFamily<string, boolean>({
  key: "selectedMediaField",
  default: "filepath",
});

export const sidebarModeDefault = selector<"all" | "fast">({
  key: "sidebarModeDefault",
  get: ({ get }) => {
    const appDefault = get(
      appConfigDefault({ modal: false, key: "sidebarMode" })
    ) as "all" | "best" | "fast";

    const datasetDefault = get(dataset)?.appConfig?.sidebarMode;

    const mode = datasetDefault || appDefault;

    if (mode !== "best") {
      return mode;
    }

    if (get(count({ path: "" })) >= 10000) {
      return "fast";
    }

    if (get(count({ path: "" })) >= 1000 && get(labelFields({})).length >= 10) {
      return "fast";
    }

    if (get(labelFields({ space: State.SPACE.FRAME })).length >= 1) {
      return "fast";
    }

    return "all";
  },
});

export const isLargeVideo = selector<boolean>({
  key: "isLargeVideo",
  get: ({ get }) => {
    const video = get(isVideoDataset);
    if (!video) {
      return false;
    }

    const data = get(
      aggregationQuery({
        extended: false,
        root: true,
        paths: [""],
        modal: false,
      })
    );

    return data.aggregate[0].count > 1000;
  },
});

export const sidebarMode = atomFamily<"all" | "best" | "fast", boolean>({
  key: "sidebarMode",
  default: sidebarModeDefault,
});
