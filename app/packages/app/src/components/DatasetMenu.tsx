/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The header's Dataset menu: what can be done with the loaded dataset.
 */

import { useNotification, useRefresh } from "@fiftyone/state";
import {
  CaretDownIcon,
  ContentCopyIcon,
  DatabaseIcon,
  Dropdown,
  DropdownAnchor,
  MenuIconTextItem,
  RefreshIcon,
  Size,
  TextAction,
} from "@voxel51/voodo";

export default function DatasetMenu() {
  const refresh = useRefresh();
  const notify = useNotification();

  return (
    <Dropdown
      anchor={DropdownAnchor.BottomEnd}
      trigger={
        <TextAction
          size={Size.Md}
          leadingIcon={DatabaseIcon}
          trailingIcon={CaretDownIcon}
          aria-label="Dataset actions"
          data-cy="dataset-actions"
        >
          Dataset
        </TextAction>
      }
    >
      {/* The URL holds the dataset and its current view */}
      <MenuIconTextItem
        icon={<ContentCopyIcon size={16} />}
        text="Copy link"
        onClick={() =>
          navigator.clipboard
            .writeText(window.location.href)
            .then(() => notify({ msg: "Link copied", variant: "success" }))
        }
        data-cy="dataset-copy-link"
      />
      {/* Notebooks and remote sessions reload what Python changed from here */}
      <MenuIconTextItem
        icon={<RefreshIcon size={16} />}
        text="Refresh"
        onClick={refresh}
        data-cy="refresh-fo"
      />
    </Dropdown>
  );
}
