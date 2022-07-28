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
  // get: () => "point-cloud",
  get: ({ get }) => {
    const { groupMediaTypes } = get(dataset);
    for (const { name, mediaType } of groupMediaTypes) {
      if (mediaType === "point_cloud") {
        return name;
      }
    }
  },
});

export const groupField = selector<string>({
  key: "groupField",
  get: ({ get }) => get(dataset).groupField,
});
