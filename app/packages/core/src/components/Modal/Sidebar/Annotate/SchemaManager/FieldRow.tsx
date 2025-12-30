import { Tooltip } from "@fiftyone/components";
import { EditOutlined } from "@mui/icons-material";
import { ListItem, Pill, Clickable, Size } from "@voxel51/voodo";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { WritableAtom } from "jotai";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { fieldType } from "../state";
import { currentField } from "./state";

type SelectedAtom = WritableAtom<boolean, [toggle: boolean], void>;

// Placeholder: determine if a field type is supported for annotation
const isFieldTypeSupported = (_fieldType: string | undefined): boolean => {
  // TODO: implement actual logic
  return true;
};

interface FieldRowProps {
  path: string;
  isSelected?: SelectedAtom;
  showDragHandle?: boolean;
  hasSchema?: boolean;
  isReadOnly?: boolean;
  dragHandleListeners?: SyntheticListenerMap;
}

// Bridge component to connect jotai atom with ListItem's selection
const FieldRowWithSelection = ({
  path,
  isSelected,
  showDragHandle,
  isReadOnly,
  dragHandleListeners,
}: {
  path: string;
  isSelected: SelectedAtom;
  showDragHandle: boolean;
  isReadOnly: boolean;
  dragHandleListeners?: SyntheticListenerMap;
}) => {
  const [checked, setChecked] = useAtom(isSelected);
  const setField = useSetAtom(currentField);
  const fType = useAtomValue(fieldType(path));
  const isSupported = isFieldTypeSupported(fType);

  const actions = (
    <span className="flex items-center gap-2">
      {!isSupported && (
        <Pill size={Size.Xs} style={{ opacity: 0.7 }}>
          Unsupported
        </Pill>
      )}
      {isReadOnly && (
        <Pill size={Size.Xs} style={{ opacity: 0.7 }}>
          Read-only
        </Pill>
      )}
      {isSupported && (
        <Tooltip placement="top-center" text="Configure annotation schema">
          <Clickable
            style={{ padding: 4, height: 29, width: 29 }}
            onClick={() => setField(path)}
          >
            <EditOutlined fontSize="small" />
          </Clickable>
        </Tooltip>
      )}
    </span>
  );

  return (
    <ListItem
      canSelect={true}
      selected={checked}
      onSelected={setChecked}
      canDrag={showDragHandle}
      dragHandleListeners={dragHandleListeners}
      primaryContent={path}
      secondaryContent={fType}
      actions={actions}
    />
  );
};

// Non-selectable version
const FieldRowWithoutSelection = ({
  path,
  showDragHandle,
  isReadOnly,
  dragHandleListeners,
}: {
  path: string;
  showDragHandle: boolean;
  isReadOnly: boolean;
  dragHandleListeners?: SyntheticListenerMap;
}) => {
  const setField = useSetAtom(currentField);
  const fType = useAtomValue(fieldType(path));
  const isSupported = isFieldTypeSupported(fType);

  const actions = (
    <span className="flex items-center gap-2">
      {!isSupported && (
        <Pill size={Size.Xs} style={{ opacity: 0.7 }}>
          Unsupported
        </Pill>
      )}
      {isReadOnly && (
        <Pill size={Size.Xs} style={{ opacity: 0.7 }}>
          Read-only
        </Pill>
      )}
      {isSupported && (
        <Tooltip placement="top-center" text="Configure annotation schema">
          <Clickable
            style={{ padding: 4, height: 29, width: 29 }}
            onClick={() => setField(path)}
          >
            <EditOutlined fontSize="small" />
          </Clickable>
        </Tooltip>
      )}
    </span>
  );

  return (
    <ListItem
      canDrag={showDragHandle}
      dragHandleListeners={dragHandleListeners}
      primaryContent={path}
      secondaryContent={fType}
      actions={actions}
    />
  );
};

const FieldRow = ({
  path,
  isSelected,
  showDragHandle = false,
  hasSchema = false,
  isReadOnly = false,
  dragHandleListeners,
}: FieldRowProps) => {
  // If hasSchema and isSelected atom is provided, use the selectable version
  if (hasSchema && isSelected) {
    return (
      <FieldRowWithSelection
        path={path}
        isSelected={isSelected}
        showDragHandle={showDragHandle}
        isReadOnly={isReadOnly}
        dragHandleListeners={dragHandleListeners}
      />
    );
  }

  // Otherwise, use the non-selectable version
  return (
    <FieldRowWithoutSelection
      path={path}
      showDragHandle={showDragHandle}
      isReadOnly={isReadOnly}
      dragHandleListeners={dragHandleListeners}
    />
  );
};

export default FieldRow;
