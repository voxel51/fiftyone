import { getComponentProps } from "../utils";
import PillBadge from "@fiftyone/components/src/components/PillBadge/PillBadge";
import React from "react";

export default function ModalView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { modal, primary_button, secondary_button, callback_function } = view;
  const { title, subtitle, body } = modal;
  const { primary_text, primary_color } = primary_button;
  const { secondary_text, secondary_color } = secondary_button;

  return (
    <ModalBase
      text={text}
      color={color}
      variant={variant}
      showIcon={showIcon}
      {...getComponentProps(props, "pillBadge")}
    />
  );
}
