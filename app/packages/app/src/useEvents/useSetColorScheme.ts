import { ensureColorScheme, useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import { EventHandlerHook } from "./registerEvent";
import { colorSchemeFragment$data } from "@fiftyone/relay";
import { cloneDeep } from "lodash";

const useSetColorScheme: EventHandlerHook = () => {
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      // we don't send rgb list to GraphQL
      setter(
        "colorScheme",
        removeRgbProperty(ensureColorScheme(payload.color_scheme))
      );
    },
    [setter]
  );
};
export default useSetColorScheme;

const removeRGB = (colorscheme: colorSchemeFragment$data) => {};

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
