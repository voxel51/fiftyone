import React from "react";

import styled from "styled-components";
import { useHover } from "@fiftyone/state";
import { Edit, Check } from "@mui/icons-material";
import { useTheme } from "@fiftyone/components";

import Tooltip from "@mui/joy/Tooltip";

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
`;

const TertiaryTextContainer = styled(TextContainer)`
  display: inline-block;
  overflow: hidden;
  white-space: nowrap;
  width: 100%;
  text-overflow: ellipsis;
  color: ${({ theme }) => theme.text.tertiary};
`;

export type SelectionItemProps = {
  description: string;
  id: string;
  label: string;
  color: string;
};

interface Props {
  item: SelectionItemProps;
  isSelected?: boolean;
  preDecorator?: React.ReactNode;
}

export default function SelectionOption(props: Props) {
  const { item, isSelected, preDecorator = null } = props;

  const [hoverRef, isHovered] = useHover();
  const { label, description } = item;
  const theme = useTheme();

  return (
    <Tooltip title={description} size="md" placement="right">
      <Box ref={hoverRef}>
        {preDecorator}
        <Box
          style={{
            width: "70%",
            flexDirection: "column",
          }}
        >
          <TextContainer>{label}</TextContainer>
          <TertiaryTextContainer>{label}</TertiaryTextContainer>
        </Box>
        <Box style={{ width: "18%" }}>
          {(isHovered || isSelected) && (
            <EditBox>
              <Box>
                {isHovered && (
                  <Edit
                    color="disabled"
                    fontSize="small"
                    sx={{
                      zIndex: "999",
                      marginRight: isSelected ? "0.5rem" : "0",

                      "&:hover": {
                        color: theme.text.primary,
                      },
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
    </Tooltip>
  );
}
