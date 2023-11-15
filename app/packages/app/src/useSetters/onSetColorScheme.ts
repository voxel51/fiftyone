import {
  ColorSchemeInput,
  colorSchemeFragment,
  colorSchemeFragment$key,
  readFragment,
  setColorScheme,
  setColorSchemeMutation,
} from "@fiftyone/relay";
import { ensureColorScheme } from "@fiftyone/state";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import { RegisteredSetter } from "./registerSetter";
import { cloneDeep } from "lodash";

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

function removeRgbProperty(input) {
  // Clone the input to avoid mutating the original object
  const clonedInput = cloneDeep(input);

  // Process the 'colorscales' array
  if (clonedInput.colorscales && Array.isArray(clonedInput.colorscales)) {
    clonedInput.colorscales = clonedInput.colorscales.map(
      ({ rgb, ...rest }) => rest
    );
  }

  // Process the 'defaultColorscale' object
  if (
    clonedInput.defaultColorscale &&
    typeof clonedInput.defaultColorscale === "object"
  ) {
    const { rgb, ...rest } = clonedInput.defaultColorscale;
    clonedInput.defaultColorscale = rest;
  }

  return clonedInput;
}
