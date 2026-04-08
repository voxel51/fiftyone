import {
  setLabelSelectionStyle,
  type setLabelSelectionStyleMutation,
} from "@fiftyone/relay";
import { DEFAULT_LABEL_SELECTION_STYLE } from "@fiftyone/state";
import { DefaultValue } from "recoil";
import { commitMutation } from "relay-runtime";
import type { RegisteredWriter } from "./registerWriter";

const onSetLabelSelectionStyle: RegisteredWriter<"labelSelectionStyle"> =
  ({ environment, subscription }) =>
  (style) => {
    commitMutation<setLabelSelectionStyleMutation>(environment, {
      mutation: setLabelSelectionStyle,
      variables: {
        style:
          style instanceof DefaultValue
            ? DEFAULT_LABEL_SELECTION_STYLE
            : style,
        subscription,
      },
    });
  };

export default onSetLabelSelectionStyle;
