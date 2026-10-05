import { StatusButton } from "@fiftyone/components";
import type { ComponentProps } from "react";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { ViewPropsType } from "../utils/types";

export default function StatusButtonView(props: ViewPropsType) {
  const { schema } = props;
  const { view = {} } = schema;
  const {
    label,
    on_click,
    params = {},
    severity,
    disabled,
    title,
  } = view as {
    label: string;
    on_click: string;
    params?: Record<string, unknown>;
    severity: ComponentProps<typeof StatusButton>["severity"];
    disabled?: boolean;
    title?: string;
  };
  const panelId = usePanelId();
  const triggerEvent = usePanelEvent();
  const handleClick = () => {
    triggerEvent(panelId, {
      operator: on_click,
      params,
    });
  };

  return (
    <StatusButton
      label={label}
      onClick={handleClick}
      severity={severity}
      disabled={disabled}
      title={title}
    />
  );
}
