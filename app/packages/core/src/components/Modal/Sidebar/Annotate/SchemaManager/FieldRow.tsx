import { EditOutlined } from "@mui/icons-material";
import {
  Anchor,
  Clickable,
  ListItem,
  Pill,
  Size,
  Tooltip,
} from "@voxel51/voodo";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { WritableAtom } from "jotai";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { useCallback } from "react";
import { fieldAttributeCount, fieldType } from "../state";
import { isSystemReadOnlyField } from "./constants";
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
  const attrCount = useAtomValue(fieldAttributeCount(path));
  const setField = useSetAtom(currentField);
  const isSupported = isFieldTypeSupported(fType);
  const isSystemReadOnly = isSystemReadOnlyField(path);

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
      {isReadOnly && !isSystemReadOnly && <Pill size={Size.Md}>Read-only</Pill>}
      {isSystemReadOnly ? (
        <Pill size={Size.Md}>Read-only</Pill>
      ) : (
        isSupported && (
          <Tooltip
            content="Configure annotation schema"
            anchor={Anchor.Bottom}
            portal
          >
            <Clickable
              style={{ padding: 4, height: 29, width: 29 }}
              onClick={onEdit}
            >
              <EditOutlined fontSize="small" />
            </Clickable>
          </Tooltip>
        )
      )}
    </span>
  );

  const secondaryContent = (
    <>
      {fType}
      {attrCount > 0 && (
        <span style={{ opacity: 0.7 }}>
          {" "}
          • {attrCount} attribute{attrCount !== 1 ? "s" : ""}
        </span>
      )}
    </>
  );

  return { fType, attrCount, secondaryContent, actions, isSystemReadOnly };
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
  const { secondaryContent, actions } = useFieldRow(path, isReadOnly);
  const selection = useSelection(hasSchema ? isSelected : undefined);

  return (
    <ListItem
      canSelect={!!selection}
      selected={selection?.checked ?? false}
      onSelected={selection?.setChecked}
      canDrag={showDragHandle}
      dragHandleListeners={dragHandleListeners}
      primaryContent={path}
      secondaryContent={secondaryContent}
      actions={actions}
    />
  );
};

export default FieldRow;
