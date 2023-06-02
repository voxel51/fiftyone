import { mainSample, mainSampleQuery } from "@fiftyone/relay";
import { atom, selector } from "recoil";
import { graphQLSelector } from "recoil-relay";
import { VariablesOf } from "relay-runtime";
import { ResponseFrom } from "../utils";
import { pinned3DSample } from "./atoms";
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

export const currentModalSample = atom<{ id: string; index: number } | null>({
  key: "currentModalSample",
  default: null,
});

export const currentModalNavigation = atom<
  ((index: number) => Promise<string>) | null
>({
  key: "currentModalNavigation",
  default: null,
});

export const modalSampleIndex = selector<number | null>({
  key: "modalSampleIndex",
  get: ({ get }) => {
    const current = get(currentModalSample);
    return current ? current.index : null;
  },
});

export const modalSampleId = selector<string | null>({
  key: "modalSampleId",
  get: ({ get }) => {
    const current = get(currentModalSample);
    return current ? current.id : null;
  },
});

export const isModalActive = selector<boolean>({
  key: "isModalActive",
  get: ({ get }) => get(currentModalSample) !== null,
});

export const modalSample = graphQLSelector<
  VariablesOf<mainSampleQuery>,
  ModalSample
>({
  environment: RelayEnvironmentKey,
  key: "modalSample",
  query: mainSample,
  mapResponse: (data: ResponseFrom<mainSampleQuery>, { get }) => {
    const current = get(currentModalSample);
    if (!data.sample) {
      throw new Error(`sample with index ${current.index} not found`);
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
    const current = get(currentModalSample);
    if (current === null) return null;
    return {
      dataset: get(datasetName),
      view: get(view),
      filter: {
        id: current.id,
      },
      filters: get(filters),
    };
  },
});
