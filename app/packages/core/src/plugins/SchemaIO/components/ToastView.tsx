import React from "react";
import { Toast } from "@fiftyone/components";

export default function ToastView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { message, duration, layout } = view;

  return <Toast message={message} duration={duration} layout={layout} />;
}
