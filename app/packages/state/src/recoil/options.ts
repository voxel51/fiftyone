import { atomFamily, selector } from "recoil";
import { count } from "./aggregations";
import { dataset } from "./atoms";
import { appConfigDefault } from "./selectors";

export const selectedMediaField = atomFamily<string, boolean>({
  key: "selectedMediaField",
  default: "filepath",
});

export const sidebarModeDefault = selector<"all" | "best" | "fast">({
  key: "sidebarModeDefault",
  get: ({ get }) => {
    const appDefault = get(
      appConfigDefault({ modal: false, key: "sidebarMode" })
    ) as "all" | "best" | "fast";

    const datasetDefault = get(dataset)?.appConfig?.sidebarMode;

    return datasetDefault || appDefault;
  },
});

export const sidebarMode = atomFamily<"all" | "best" | "fast", boolean>({
  key: "sidebarMode",
  default: sidebarModeDefault,
});

export const resolvedSidebarMode = selector<"all" | "fast">({
  key: "resolvedSidebarMode",
  get: ({ get }) => {
    const setting = get(sidebarModeDefault);

    if (setting !== "best") {
      return setting;
    }

    const THRESHOLD = 1000;
    return get(count({ path: "", extended: false, modal: false })) > THRESHOLD
      ? "fast"
      : "all";
  },
});
