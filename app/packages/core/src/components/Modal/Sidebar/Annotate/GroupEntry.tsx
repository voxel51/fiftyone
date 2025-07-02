import { Add, Remove } from "@mui/icons-material";
import React, { useState } from "react";
import styled, { useTheme } from "styled-components";

const PlusMinusButton = ({ expanded }: { expanded: boolean }) =>
  expanded ? <Remove /> : <Add />;

const GroupHeader = styled.div`
  border-bottom: 2px solid ${({ theme }) => theme.primary.softBorder};
  border-top-left-radius: 3px;
  border-top-right-radius: 3px;
  padding: 3px 3px 3px 8px;
  text-transform: uppercase;
  display: flex;
  justify-content: space-between;
  vertical-align: middle;
  align-items: center;
  font-weight: bold;
  color: ${({ theme }) => theme.text.secondary};
  background: ${({ theme }) => theme.neutral.softBg};
  user-select: text;

  svg {
    font-size: 1.25em;
    vertical-align: middle;
  }
  cursor: pointer;
`;

const GroupDiv = styled.div`
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  text-transform: uppercase;
  font-weight: bold;
  color: ${({ theme }) => theme.text.secondary};
`;

const Group = React.memo(({ name }: { name: string }) => {
  const expanded = false;
  const [hovering, setHovering] = useState(false);

  const theme = useTheme();

  return (
    <div
      style={{
        boxShadow: `0 2px 20px ${theme.custom.shadow}`,
      }}
    >
      <div style={{ position: "relative", cursor: "pointer" }}>
        <GroupHeader title={name}>
          <GroupDiv
            style={{
              flexGrow: 1,

              textOverflow: "ellipsis",
            }}
          >
            {name}
          </GroupDiv>

          <span>
            <PlusMinusButton expanded={expanded} />
          </span>
        </GroupHeader>
      </div>
    </div>
  );
});

export default Group;
