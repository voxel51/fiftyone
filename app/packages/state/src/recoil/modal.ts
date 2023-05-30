import { mainSample, mainSampleQuery } from "@fiftyone/relay";
import { selector } from "recoil";
import { graphQLSelector } from "recoil-relay";
import { VariablesOf } from "relay-runtime";
import { ResponseFrom } from "../utils";
import { modalSampleIndex, pinned3DSample } from "./atoms";
import { filters } from "./filters";
import { groupSample } from "./groups";
import { RelayEnvironmentKey } from "./relay";
import { datasetName } from "./selectors";
import { view } from "./view";

export const sidebarSampleId = selector({
  key: "sidebarSampleId",
  get: ({ get }) => {
    const override = get(pinned3DSample);

    return override ? override : get(groupSample(null)).sample._id;
  },
});

export type ModalSample = NonNullable<
  Exclude<
    ResponseFrom<mainSampleQuery>["sample"],
    {
      readonly __typename: "%other";
    }
  >
>;

export const modalSample = graphQLSelector<
  VariablesOf<mainSampleQuery>,
  ModalSample
>({
  environment: RelayEnvironmentKey,
  key: "modalSample",
  query: mainSample,
  mapResponse: (data: ResponseFrom<mainSampleQuery>, { get }) => {
    const index = get(modalSampleIndex);
    if (!data.sample) {
      throw new Error(`sample with index ${index} not found`);
    }

    if (
      data.sample.__typename === "ImageSample" ||
      data.sample.__typename === "VideoSample"
    ) {
      return data.sample;
    }

    throw new Error(`unexpected sample item ${data.sample.__typename}`);
  },
  variables: ({ get }) => {
    const index = get(modalSampleIndex);
    if (index === null) return null;
    return {
      dataset: get(datasetName),
      view: get(view),
      index,
      filter: {},
      filters: get(filters),
    };
  },
});

export const modalSampleId = selector<string>({
  key: "modalSampleId",
  get: ({ get }) => {
    const id = get(modalSample).id;
    if (!id) throw new Error("no sample id found");

    return id;
  },
});
