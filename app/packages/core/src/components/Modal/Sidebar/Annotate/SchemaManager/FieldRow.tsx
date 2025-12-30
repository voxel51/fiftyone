import { Tooltip } from "@fiftyone/components";
import { EditOutlined } from "@mui/icons-material";
import { ListItem, Pill, Clickable, Size } from "@voxel51/voodo";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { WritableAtom } from "jotai";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { useCallback } from "react";
import { fieldType } from "../state";
import { currentField } from "./state";

type SelectedAtom = WritableAtom<boolean, [toggle: boolean], void>;

// Placeholder: determine if a field type is supported for annotation
const isFieldTypeSupported = (_fieldType: string | undefined): boolean => {
  // TODO: implement actual logic
  return true;
};

// Hook to get field row data and actions
const useFieldRow = (path: string, isReadOnly: boolean) => {
  const fType = useAtomValue(fieldType(path));
  const setField = useSetAtom(currentField);
  const isSupported = isFieldTypeSupported(fType);

  const onEdit = useCallback(() => {
    setField(path);
  }, [setField, path]);

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
            onClick={onEdit}
          >
            <EditOutlined fontSize="small" />
          </Clickable>
        </Tooltip>
      )}
    </span>
  );

  return { fType, actions };
};

// Hook to connect jotai selection atom
const useSelection = (isSelected?: SelectedAtom) => {
  const [checked, setChecked] = useAtom(isSelected ?? nullAtom);
  return isSelected ? { checked, setChecked } : null;
};

// Null atom for when selection is not needed
const nullAtom: SelectedAtom = {
  read: () => false,
  write: () => {},
} as unknown as SelectedAtom;

interface FieldRowProps {
  path: string;
  isSelected?: SelectedAtom;
  showDragHandle?: boolean;
  hasSchema?: boolean;
  isReadOnly?: boolean;
  dragHandleListeners?: SyntheticListenerMap;
}

const FieldRow = ({
  path,
  isSelected,
  showDragHandle = false,
  hasSchema = false,
  isReadOnly = false,
  dragHandleListeners,
}: FieldRowProps) => {
  const { fType, actions } = useFieldRow(path, isReadOnly);
  const selection = useSelection(hasSchema ? isSelected : undefined);

  return (
    <ListItem
      canSelect={!!selection}
      selected={selection?.checked ?? false}
      onSelected={selection?.setChecked}
      canDrag={showDragHandle}
      dragHandleListeners={dragHandleListeners}
      primaryContent={path}
      secondaryContent={fType}
      actions={actions}
    />
  );
};

export default FieldRow;
