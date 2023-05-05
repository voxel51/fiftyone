import { selector } from "recoil";
import { pinned3DSample } from "./atoms";
import { groupSample } from "./groups";

export const sidebarSampleId = selector({
  key: "sidebarSampleId",
  get: ({ get }) => {
    const override = get(pinned3DSample);

    return override ? override : get(groupSample(null)).sample._id;
  },
});
