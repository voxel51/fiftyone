import { PopoutDiv, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";
import React from "react";
import { useRecoilState } from "recoil";
import styled from "styled-components";

export const ModeControlContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
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

const ModeControl: React.FC = () => {
  const [colorScheme, setColorScheme] = useRecoilState(fos.colorScheme);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  fos.useOutsideClick(ref, () => open && setOpen(false));
  const theme = useTheme();

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

  const selected = colorScheme.colorBy;

  return (
    <ModeControlContainer>
      <Controls ref={ref}>
        <Text>Color by </Text>
        <SelectButton
          onClick={() => setOpen((o) => !o)}
          theme={theme}
          data-cy="custom-colors-select-attribute"
        >
          <div>{selected}</div>
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
              <Option onClick={option.onClick}>{option.value}</Option>
            ))}
          </PopoutDiv>
        )}
      </Controls>
    </ModeControlContainer>
  );
};

export default ModeControl;
