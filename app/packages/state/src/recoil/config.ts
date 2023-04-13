import { config as configGraphQLQuery, configQuery } from "@fiftyone/relay";
import { RGB } from "@fiftyone/utilities";
import { atom, selector } from "recoil";
import { graphQLSelector } from "recoil-relay";
import { VariablesOf } from "relay-runtime";
import { RelayEnvironmentKey } from "./relay";

export type ResponseFrom<TResponse extends { response: unknown }> =
  TResponse["response"];

const configData = graphQLSelector<
  VariablesOf<configQuery>,
  ResponseFrom<configQuery>
>({
  key: "configData",
  environment: RelayEnvironmentKey,
  query: configGraphQLQuery,
  variables: () => {
    return {};
  },
  mapResponse: (data) => {
    return data;
  },
});

export const colorscale = selector<RGB[]>({
  key: "colorscale",
  get: ({ get }) => get(configData).colorscale as RGB[],
});

export const config = selector({
  key: "config",
  get: ({ get }) => get(configData).config,
});

export const colorPalette = atom<string[]>({
  key: "colorPalette",
  default: selector({
    key: "initial",
    get: ({ get }) => {
      return get(colorPool) as string[];
    },
  }),
});

export const colorPool = selector({
  key: "colorPool",
  get: ({ get }) => get(config).colorPool,
});

export const sessionColorConfig = selector({
  key: "sessionColorConfig",
  get: ({ get }) => get(config).customizedColors,
});
