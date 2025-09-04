import { DeleteOutlined, EditOutlined } from "@mui/icons-material";
import { Checkbox, Typography } from "@mui/material";
import type { WritableAtom } from "jotai";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React from "react";
import { RoundButtonWhite } from "../Actions";
import { currentPath, fieldType } from "../state";
import { Item, ItemLeft, ItemRight } from "./Components";

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

const FieldRow = ({
  isSelected,
  path,
  onDelete,
}: {
  isSelected?: SelectedAtom;
  path: string;
  onDelete?: () => void;
}) => {
  const setField = useSetAtom(currentPath);
  const fType = useAtomValue(fieldType(path));

  return (
    <Item>
      <ItemLeft>
        {isSelected && <Selectable isSelected={isSelected} />}
        <Typography>{path}</Typography>
        <Typography color="secondary">{fType}</Typography>
      </ItemLeft>

      <ItemRight>
        {onDelete && (
          <RoundButtonWhite
            style={{ padding: 4, height: 29, width: 29 }}
            onClick={onDelete}
          >
            <DeleteOutlined />
          </RoundButtonWhite>
        )}
        <RoundButtonWhite
          style={{ padding: 4, height: 29, width: 29 }}
          onClick={() => setField(path)}
        >
          <EditOutlined />
        </RoundButtonWhite>
      </ItemRight>
    </Item>
  );
};

export default FieldRow;
