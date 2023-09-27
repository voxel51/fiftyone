import { Tooltip, useTheme } from "@fiftyone/components/src/components";
import PopoutDiv from "@fiftyone/components/src/components/Popout/PopoutDiv";
import * as fos from "@fiftyone/state";
import { useOutsideClick } from "@fiftyone/state";
import {
  BOOLEAN_FIELD,
  INT_FIELD,
  LIST_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";
import { cloneDeep } from "lodash";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Item from "../../Filters/categoricalFilter/filterOption/FilterItem";
import { activeColorField } from "../state";

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
  style: React.CSSProperties;
};

const ColorAttribute: React.FC<Prop> = ({ style }) => {
  const theme = useTheme();
  const VALID_COLOR_ATTRIBUTE_TYPES = [BOOLEAN_FIELD, INT_FIELD, STRING_FIELD];
  const path = useRecoilValue(activeColorField).path;
  const expandedPath = useRecoilValue(fos.expandPath(path));

  const commonExpandedPath = useRecoilValue(
    fos.expandPath(expandedPath.startsWith("frames.") ? expandedPath : path)
  );
  const subfields = useRecoilValue(
    fos.fields({
      path: commonExpandedPath,
      ftype: [...VALID_COLOR_ATTRIBUTE_TYPES, LIST_FIELD],
    })
  ).filter((field) =>
    [...VALID_COLOR_ATTRIBUTE_TYPES, null].includes(field.subfield)
  );
  const ref = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  useOutsideClick(ref, () => open && setOpen(false));

  const setColorScheme = fos.useSetSessionColorScheme();
  const activeField = useRecoilValue(activeColorField);
  const currentColorScheme = useRecoilValue(fos.colorScheme);
  const index = currentColorScheme.fields.findIndex(
    (s) => s.path == activeField.path
  );

  const options = subfields.map((field) => {
    const value = field.path?.split(".").slice(-1)[0];
    return {
      value,
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        const copy = cloneDeep(currentColorScheme.fields);
        if (index > -1) {
          copy[index].colorByAttribute = value;
          setColorScheme({ ...currentColorScheme, fields: copy });
          setOpen(false);
        }
      },
    };
  });

  const selected =
    currentColorScheme.fields[index]?.colorByAttribute ??
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
        </Tooltip>
        {open && (
          <PopoutDiv style={{ zIndex: 1000000001, opacity: 1, width: "100%" }}>
            {options.map((option) => (
              <Item key={option.value} {...option} />
            ))}
          </PopoutDiv>
        )}
      </ActionDiv>
    </div>
  );
};

export default ColorAttribute;
