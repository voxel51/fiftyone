import {
  colorSchemeFragment,
  colorSchemeFragment$key,
  readFragment,
  setColorScheme,
  setColorSchemeMutation,
} from "@fiftyone/relay";
import { ensureColorScheme, removeRgbProperty } from "@fiftyone/state";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import { RegisteredSetter } from "./registerSetter";

const onSetColorScheme: RegisteredSetter =
  ({ environment, setter, subscription }) =>
  (_, colorScheme) => {
    if (!colorScheme || colorScheme instanceof DefaultValue) {
      throw new Error("not implemented");
    }

    const prunedColorScheme = removeRgbProperty(colorScheme);

    commitMutation<setColorSchemeMutation>(environment, {
      mutation: setColorScheme,
      variables: {
        colorScheme: prunedColorScheme,
        subscription,
      },
      onCompleted: (colorScheme) => {
        setter(
          "colorScheme",
          ensureColorScheme(
            readFragment<colorSchemeFragment$key>(
              colorSchemeFragment,
              colorScheme["setColorScheme"]
            )
          )
        );
      },
    });
  };

export default onSetColorScheme;
