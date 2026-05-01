import {
  setSampleSelectionStyle,
  type setSampleSelectionStyleMutation,
} from "@fiftyone/relay";
import { DEFAULT_SELECTION_STYLE } from "@fiftyone/state";
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
            ? DEFAULT_SELECTION_STYLE
            : style,
        subscription,
      },
    });
  };

export default onSetSampleSelectionStyle;
