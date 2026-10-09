import ActionButton from "../ActionButton";
import { useOperatorBrowser } from "@fiftyone/operators";
import { ListIcon } from "@voxel51/voodo";
import type { ActionProps } from "../types";
import { useActionIconSize } from "../iconSize";
import { ActionDiv, getStringAndNumberProps } from "../utils";

export default ({
  adaptiveMenuItemProps,
  modal,
}: ActionProps & { modal?: boolean }) => {
  const browser = useOperatorBrowser();
  const iconSize = useActionIconSize(24);
  return (
    <ActionDiv {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}>
      <ActionButton
        open={false}
        highlight={browser.isVisible}
        icon={<ListIcon size={iconSize} />}
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
