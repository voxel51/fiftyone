import React from "react";
import { Toast } from "@fiftyone/components";

export default function ToastView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { message, primary, secondary, duration, layout } = view;

  return (
    <Toast
      message={message}
      primary={primary}
      secondary={secondary}
      duration={duration}
      layout={layout}
    />
  );
}
