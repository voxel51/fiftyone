import { Tooltip } from "@fiftyone/components";
import { DragIndicator, EditOutlined } from "@mui/icons-material";
import { Checkbox, Chip, Typography } from "@mui/material";
import type { WritableAtom } from "jotai";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { RoundButtonWhite } from "../Actions";
import { ItemLeft, ItemRight } from "../Components";
import { currentField, fieldType } from "../state";
import { Item } from "./Components";

type SelectedAtom = WritableAtom<boolean, [toggle: boolean], void>;

const Selectable = ({ isSelected }: { isSelected: SelectedAtom }) => {
  const [checked, setChecked] = useAtom(isSelected);

  return (
    <Checkbox
      checked={checked}
      disableRipple={true}
      onChange={(_, checked) => setChecked(checked)}
    />
  );
};

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
}

const FieldRow = ({
  path,
  isSelected,
  showDragHandle = false,
  hasSchema = false,
  isReadOnly = false,
}: FieldRowProps) => {
  const setField = useSetAtom(currentField);
  const fType = useAtomValue(fieldType(path));
  const isSupported = isFieldTypeSupported(fType);

  return (
    <Item>
      <ItemLeft style={{ columnGap: "0.5rem" }}>
        {hasSchema && isSelected && <Selectable isSelected={isSelected} />}
        {showDragHandle && (
          <DragIndicator
            fontSize="small"
            sx={{ color: "text.secondary", cursor: "grab" }}
          />
        )}
        <Typography fontWeight={500}>{path}</Typography>
        <Typography color="secondary">{fType}</Typography>
      </ItemLeft>

      <ItemRight style={{ gap: "0.5rem" }}>
        {!isSupported && (
          <Chip
            label="Unsupported"
            size="small"
            variant="outlined"
            sx={{ opacity: 0.7 }}
          />
        )}
        {isReadOnly && (
          <Chip
            label="Read-only"
            size="small"
            variant="outlined"
            sx={{ opacity: 0.7 }}
          />
        )}
        {isSupported && (
          <Tooltip placement="top-center" text="Configure annotation schema">
            <RoundButtonWhite
              style={{ padding: 4, height: 29, width: 29 }}
              onClick={() => setField(path)}
            >
              <EditOutlined />
            </RoundButtonWhite>
          </Tooltip>
        )}
      </ItemRight>
    </Item>
  );
};

export default FieldRow;
