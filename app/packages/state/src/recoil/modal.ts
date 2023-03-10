import { selector } from "recoil";
import { sidebarOverride } from "./atoms";
import { groupSample } from "./groups";

export const sidebarSampleId = selector({
  key: "sidebarSampleId",
  get: ({ get }) => {
    const override = get(sidebarOverride);

    return override ? override : get(groupSample(null))._id;
  },
});
