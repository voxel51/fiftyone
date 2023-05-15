import {
  configFragment,
  configFragment$data,
  configFragment$key,
  graphQLSyncFragmentAtom,
} from "@fiftyone/relay";
import { RGB } from "@fiftyone/utilities";
import { atom, selector } from "recoil";
import { sessionColorScheme } from "./atoms";

const configData = graphQLSyncFragmentAtom<
  configFragment$key,
  configFragment$data
>(
  { fragments: [configFragment], default: null },
  {
    key: "configData",
  }
);

export const colorscale = selector<RGB[]>({
  key: "colorscale",
  get: ({ get }) => {
    return get(configData).colorscale as RGB[];
  },
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
      return get(sessionColorScheme).colorPool;
    },
  }),
});

export const colorPool = selector({
  key: "colorPool",
  get: ({ get }) => get(config).colorPool,
});

export const themeConfig = selector({
  key: "themeConfig",
  get: ({ get }) => {
    const current = get(config).theme;
    if (current === "%future added value") {
      throw new Error("unexpected theme value");
    }

    return current;
  },
});
