import {
  configFragment,
  configFragment$data,
  graphQLFragmentEffect,
} from "@fiftyone/relay";
import { RGB } from "@fiftyone/utilities";
import { atom, selector } from "recoil";

const configData = atom<configFragment$data>({
  key: "configData",
  default: null,
  effects: [graphQLFragmentEffect(configFragment)],
});

export const colorscale = selector<RGB[]>({
  key: "colorscale",
  get: ({ get }) => get(configData).colorscale as RGB[],
});

export const config = selector({
  key: "config",
  get: ({ get }) => get(configData).config,
});

export const colorPool = selector({
  key: "colorPool",
  get: ({ get }) => get(config).colorPool,
});
