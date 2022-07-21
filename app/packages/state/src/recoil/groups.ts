import { selector } from "recoil";
import { dataset } from "./atoms";

export const isGroup = selector<boolean>({
  key: "isGroup",
  get: ({ get }) => {
    return get(dataset).mediaType === "group";
  },
});

export const isPinned = selector<boolean>({
  key: "isPinned",
  get: () => true,
});

export const pinnedSampleGroup = selector<string>({
  key: "pinnedSampleGroup",
  get: () => "center",
});

export const groupField = selector<string>({
  key: "groupField",
  get: () => "group",
});
