import {
  setSampleSelectionStyle,
  type setSampleSelectionStyleMutation,
} from "@fiftyone/relay";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import type { RegisteredWriter } from "./registerWriter";

const onSetSampleSelectionStyle: RegisteredWriter<"sampleSelectionStyle"> =
  ({ environment, subscription }) =>
  (style) => {
    commitMutation<setSampleSelectionStyleMutation>(environment, {
      mutation: setSampleSelectionStyle,
      variables: {
        style:
          style instanceof DefaultValue
            ? { default: "checkmark", alt: "checkmark" }
            : style,
        subscription,
      },
    });
  };

export default onSetSampleSelectionStyle;
