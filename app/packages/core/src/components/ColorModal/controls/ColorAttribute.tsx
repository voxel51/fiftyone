import { Tooltip, useTheme } from "@fiftyone/components/src/components";
import PopoutDiv from "@fiftyone/components/src/components/Popout/PopoutDiv";
import * as fos from "@fiftyone/state";
import { useOutsideClick } from "@fiftyone/state";
import { Field } from "@fiftyone/utilities";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";
import { cloneDeep } from "lodash";
import React from "react";
import useMeasure from "react-use-measure";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Item from "../../Filters/categoricalFilter/filterOption/FilterItem";

const ActionDiv = styled.div`
  position: relative;
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

type Prop = {
  fields: Field[];
  style: React.CSSProperties;
};

type Option = {
  value: string;
  onClick: () => void;
};

const ColorAttribute: React.FC<Prop> = ({ fields, style }) => {
  const theme = useTheme();
  const ref = React.useRef<HTMLDivElement>();
  const [open, setOpen] = React.useState(false);
  useOutsideClick(ref, () => open && setOpen(false));
  const [mRef, bounds] = useMeasure();

  const { setColorScheme } = fos.useSessionColorScheme();
  const activeField = useRecoilValue(fos.activeColorField) as Field;
  const { colorPool, customizedColorSettings } = useRecoilValue(
    fos.sessionColorScheme
  );
  const index = customizedColorSettings.findIndex(
    (s) => s.field == activeField.path
  );

  const options = fields.map((field) => ({
    value: field.path?.split(".").slice(-1),
    onClick: (e) => {
      e.preventDefault();
      const copy = cloneDeep(customizedColorSettings);
      if (index > -1) {
        copy[index].attributeForColor = field.path?.split(".").slice(-1)[0];
        setColorScheme(colorPool, copy, false);
        setOpen(false);
      }
    },
  }));

  const selected =
    customizedColorSettings[index]?.attributeForColor ??
    "Please select an attribute";

  return (
    <div style={style}>
      Select an attribute to color by
      <ActionDiv ref={ref}>
        <Tooltip
          text={
            "You can select StringField, BooleanField or IntField attribute for annotation's color"
          }
          placement={"bottom-center"}
        >
          <SelectButton
            onClick={() => setOpen((o) => !o)}
            ref={mRef}
            theme={theme}
          >
            <div>{selected}</div>
            {open ? (
              <KeyboardArrowUpOutlinedIcon />
            ) : (
              <KeyboardArrowDownOutlinedIcon />
            )}
          </SelectButton>
        </Tooltip>
        {open && (
          <PopoutDiv style={{ zIndex: 1000000001, opacity: 1, width: "100%" }}>
            {options.map((option: Option) => (
              <Item key={option.value} {...option} />
            ))}
          </PopoutDiv>
        )}
      </ActionDiv>
    </div>
  );
};

export default ColorAttribute;
