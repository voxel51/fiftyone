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
import { getHistoryState } from "../state";
import { writeSession } from "../useLocalSession";
import { RegisteredSetter } from "./registerSetter";

const onSetColorScheme: RegisteredSetter =
  ({ environment, setter }) =>
  (_, colorScheme) => {
    if (!colorScheme || colorScheme instanceof DefaultValue) {
      throw new Error("not implemented");
    }

    const prunedColorScheme = removeRgbProperty(colorScheme);

    commitMutation<setColorSchemeMutation>(environment, {
      mutation: setColorScheme,
      variables: {
        colorScheme: prunedColorScheme,
        subscription: "", // 'subscription' has no effect in Teams, only OSS
      },
      onCompleted: async (data) => {
        const state = getHistoryState();
        const colorScheme = ensureColorScheme(
          readFragment<colorSchemeFragment$key>(
            colorSchemeFragment,
            data["setColorScheme"]
          )
        );
        await writeSession(state.datasetId, async (session) => {
          session.colorScheme = colorScheme;
        });

        setter("colorScheme", colorScheme);
      },
    });
  };

export default onSetColorScheme;
