import ActionButton from "../ActionButton";
import { useOperatorBrowser } from "@fiftyone/operators";
import { PackageIcon } from "@voxel51/voodo";
import type { ActionProps } from "../types";
import { ActionDiv, getStringAndNumberProps } from "../utils";

export default ({
  adaptiveMenuItemProps,
  modal,
}: ActionProps & { modal?: boolean }) => {
  const browser = useOperatorBrowser();
  return (
    <ActionDiv {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}>
      <ActionButton
        highlight={browser.isVisible}
        icon={PackageIcon}
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
