import { setColorScheme, setColorSchemeMutation } from "@fiftyone/relay";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import { RegisteredWriter } from "./registerWriter";

const onSetColorScheme: RegisteredWriter<"colorScheme"> =
  ({ environment, subscription }) =>
  (colorScheme) => {
    if (!colorScheme || colorScheme instanceof DefaultValue) {
      throw new Error("not implemented");
    }

    console.log(colorScheme);
    commitMutation<setColorSchemeMutation>(environment, {
      mutation: setColorScheme,
      variables: {
        colorScheme,
        subscription,
      },
    });
  };

export default onSetColorScheme;
