import React, { MouseEventHandler } from "react";

import { useHover } from "@fiftyone/state";
import { Edit, Check } from "@mui/icons-material";
import { IconButton, useTheme } from "@fiftyone/components";
import {
  EditBox,
  RowLabelContainer,
  SelectionRow,
  TextContainer,
} from "./styledComponents";

export interface DatasetViewOption {
  id: string;
  label: string;
  color?: string;
  description?: string;
  slug?: string;
}

interface Props {
  item: DatasetViewOption;
  isSelected?: boolean;
  preDecorator?: React.ReactNode;
  hideActions?: boolean;
  readonly?: boolean;
  dataCy?: string;
  onEdit?: (item: DatasetViewOption) => void;
  onClick?: (e: MouseEventHandler) => void;
}

export default function (props: Props) {
  const {
    item,
    isSelected,
    preDecorator = null,
    hideActions = false,
    readonly,
    onEdit,
    onClick,
    dataCy,
  } = props;

  const [hoverRef, isHovered] = useHover();
  const { label } = item;
  const theme = useTheme();

  return (
    <SelectionRow
      ref={hoverRef}
      onClick={onClick}
      data-cy={dataCy}
      role="option"
    >
      <RowLabelContainer>
        <TextContainer>
          {preDecorator} {label}
        </TextContainer>
      </RowLabelContainer>
      {(isHovered || isSelected) && (
        <EditBox isSelected isHovered>
          {!hideActions && isHovered && (
            <IconButton
              sx={{
                "&:hover": {
                  background: theme.background.level2,
                },
              }}
              size="small"
              title={readonly ? "Can not edit in read-only mode" : undefined}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                e.preventDefault();

                if (onEdit && !readonly) {
                  onEdit(item);
                }
              }}
            >
              <Edit
                data-cy="btn-edit-selection"
                sx={{
                  color: readonly ? theme.text.disabled : theme.text.secondary,
                  zIndex: 999,
                  right: isSelected ? ".5rem" : "0",
                  cursor: readonly ? "not-allowed" : "inherit",
                  width: 16,
                  height: 16,
                  "&:hover": {
                    color: readonly ? theme.text.disabled : theme.text.primary,
                  },
                }}
              />
            </IconButton>
          )}
          {isSelected && (
            <Check
              fontSize="small"
              sx={{
                zIndex: "999",
              }}
            />
          )}
        </EditBox>
      )}
    </SelectionRow>
  );
}
