import { PillButton } from "@fiftyone/components";
import { useOperatorBrowser } from "@fiftyone/operators";
import { List } from "@mui/icons-material";
import React from "react";
import type { ActionProps } from "../types";
import { ActionDiv, getStringAndNumberProps } from "../utils";

export default ({
  adaptiveMenuItemProps,
  modal,
}: ActionProps & { modal?: boolean }) => {
  const browser = useOperatorBrowser();
  return (
    <ActionDiv {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}>
      <PillButton
        open={false}
        highlight={true}
        icon={<List />}
        onClick={() => {
          browser.toggle();
          adaptiveMenuItemProps?.closeOverflow?.();
        }}
        title={"Browse operations"}
        tooltipPlacement={modal ? "bottom" : "top"}
        data-cy="action-browse-operations"
      />
    </ActionDiv>
  );
};
