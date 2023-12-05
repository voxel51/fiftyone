import { PopoutDiv, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";
import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { activeColorEntry } from "../state";
import { getDisplayName } from "../utils";

export const ModeControlContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 0.5rem;
`;
const Text = styled.div`
  font-size: 1.2rem;
  margin: auto 0.5rem;
`;

const Controls = styled.div`
  display: flex;
  flex-direction: row;
`;

const SelectButton = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 0.25rem;
  margin: 0.25rem;
  background-color: ${({ theme }) => theme.background.level3};
`;

const Option = styled.div`
  cursor: pointer;
  padding-left: 0.25rem;
  background-color: ${({ theme }) => theme.background.secondary};
  &:hover {
    background-color: ${({ theme }) => theme.primary.main};
  }
`;

const ModeControl: React.FC = () => {
  const [colorScheme, setColorScheme] = useRecoilState(fos.colorScheme);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  fos.useOutsideClick(ref, () => open && setOpen(false));
  const theme = useTheme();

  const activeEntry = useRecoilValue(activeColorEntry);
  if (!activeEntry) {
    throw new Error("entry not defined in color modal");
  }
  const title = getDisplayName(activeEntry);

  const options = ["field", "value", "instance"].map((option) => ({
    value: option,
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
      setColorScheme({
        ...colorScheme,
        colorBy: option,
      });
      setOpen(false);
    },
  }));

  return (
    <ModeControlContainer>
      <Text>{title}</Text>
      <Controls ref={ref}>
        <Text>Color by </Text>
        <SelectButton
          onClick={() => setOpen((o) => !o)}
          theme={theme}
          data-cy="color-by-attribute"
        >
          <div>{colorScheme.colorBy}</div>
          {open ? (
            <KeyboardArrowUpOutlinedIcon />
          ) : (
            <KeyboardArrowDownOutlinedIcon />
          )}
        </SelectButton>
        {open && (
          <PopoutDiv
            style={{
              zIndex: 1000000001,
              opacity: 1,
              width: "50%",
              marginTop: "2rem",
            }}
          >
            {options.map((option) => (
              <Option
                onClick={option.onClick}
                key={option.value}
                data-cy={"option-" + option.value}
              >
                {option.value}
              </Option>
            ))}
          </PopoutDiv>
        )}
      </Controls>
    </ModeControlContainer>
  );
};

export default ModeControl;
