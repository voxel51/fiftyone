import { atomFamily, selector } from "recoil";
import { dataset } from "./atoms";
import { appConfigDefault } from "./selectors";

export const selectedMediaField = atomFamily<string, boolean>({
  key: "selectedMediaField",
  default: "filepath",
});

export const sidebarModeDefault = selector<"best" | "fast" | "slow">({
  key: "sidebarModeDefault",
  get: ({ get }) => {
    const appDefault = get(
      appConfigDefault({ modal: false, key: "sidebarMode" })
    ) as "best" | "fast" | "slow";

    const datasetDefault = get(dataset)?.appConfig?.sidebarMode;

    return datasetDefault || appDefault;
  },
});

export const sidebarMode = atomFamily<"best" | "fast" | "slow", boolean>({
  key: "sidebarMode",
  default: sidebarModeDefault,
});
