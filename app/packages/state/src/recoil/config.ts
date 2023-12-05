import {
  configFragment,
  configFragment$data,
  configFragment$key,
  graphQLSyncFragmentAtom,
} from "@fiftyone/relay";
import { selector } from "recoil";

export const configData = graphQLSyncFragmentAtom<
  configFragment$key,
  configFragment$data
>(
  { fragments: [configFragment], default: null },
  {
    key: "configData",
  }
);

export const config = selector({
  key: "config",
  get: ({ get }) => get(configData).config,
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
