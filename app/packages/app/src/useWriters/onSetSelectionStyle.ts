import {
  setSelectionStyle,
  type setSelectionStyleMutation,
} from "@fiftyone/relay";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import type { RegisteredWriter } from "./registerWriter";

const onSetSelectionStyle: RegisteredWriter<"selectionStyle"> =
  ({ environment, subscription }) =>
  (style) => {
    commitMutation<setSelectionStyleMutation>(environment, {
      mutation: setSelectionStyle,
      variables: {
        style:
          style instanceof DefaultValue ? { default: "checkmark" } : style,
        subscription,
      },
    });
  };

export default onSetSelectionStyle;
