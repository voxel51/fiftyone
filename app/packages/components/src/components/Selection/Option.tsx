import React from "react";

import styled from "styled-components";
import { useHover } from "@fiftyone/state";
import { Edit, Check } from "@mui/icons-material";
import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";

const Box = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
`;

const EditBox = styled.div`
  position: absolute;
  right: 16px;
  height: 100%;
`;

const TextContainer = styled.div`
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  width: 100%;
  text-overflow: ellipsis;
  color: ${({ theme }) => theme.text.primary};
  padding-bottom: 2px;
`;

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
  compact?: boolean; // compact form rows
  readonly?: boolean;
  onEdit?: (item: DatasetViewOption) => void;
}

export default function SelectionOption(props: Props) {
  const {
    item,
    isSelected,
    preDecorator = null,
    compact,
    readonly,
    onEdit,
  } = props;

  const [hoverRef, isHovered] = useHover();
  const { label } = item;
  const theme = useTheme();

  return (
    <Box ref={hoverRef}>
      {preDecorator}
      <Box
        style={{
          width: compact ? "76%" : "70%",
          flexDirection: "column",
        }}
      >
        <TextContainer>{label}</TextContainer>
      </Box>
      <Box style={{ width: "18%" }}>
        {!readonly && (isHovered || isSelected) && (
          <EditBox>
            <Box>
              {isHovered && item.id !== "1" && (
                <Edit
                  data-cy="btn-edit-selection"
                  fontSize="small"
                  sx={{
                    color: theme.neutral[400],
                    zIndex: "9999",
                    marginRight: isSelected ? "0.5rem" : "0",

                    "&:hover": {
                      color: theme.text.primary,
                    },
                  }}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    e.preventDefault();

                    if (onEdit) {
                      onEdit(item);
                    }
                  }}
                />
              )}
              {isSelected && (
                <Check
                  color="disabled"
                  fontSize="small"
                  sx={{
                    zIndex: "999",
                    color: theme.text.primary,
                  }}
                />
              )}
            </Box>
          </EditBox>
        )}
      </Box>
    </Box>
  );
}
