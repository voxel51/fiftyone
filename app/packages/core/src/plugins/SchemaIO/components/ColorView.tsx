import { Box, Popper, Stack, TextField } from "@mui/material";
import React, { useCallback, useEffect, useState } from "react";
import * as ColorPickers from "react-color";
import { colorPicker } from "./ColorView.module.css";
import HeaderView from "./HeaderView";
import autoFocus from "../utils/auto-focus";
import { getComponentProps } from "../utils";
import { useKey } from "../hooks";

export default function ColorView(props) {
  const { onChange, path, schema, data } = props;
  const { view = {} } = schema;
  const { compact, variant, readOnly } = view;
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(schema.default ?? data ?? fallbackColor);
  const [anchor, setAnchor] = React.useState<null | HTMLElement>(null);
  const Component = ColorPickers[variant] || ColorPickers.ChromePicker;

  const { bgColor, hexColor } = formatColor(color);
  const [key, setUserChanged] = useKey(path, schema);

  const handleChange = useCallback(
    (color) => {
      setColor(color);
      onChange(path, color);
      setUserChanged();
    },
    [onChange, path, setUserChanged]
  );

  useEffect(() => {
    setColor(schema.default ?? data ?? fallbackColor);
  }, [key]);

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        {...getComponentProps(props, "stack")}
      >
        <Box
          onClick={(e) => {
            if (readOnly) return;
            setAnchor(e.currentTarget);
            setOpen(!open);
          }}
          sx={{
            width: 36,
            height: 36,
            bgcolor: bgColor,
            borderRadius: 0.5,
            cursor: "pointer",
          }}
          {...getComponentProps(props, "preview")}
        />
        {!compact && (
          <TextField
            key={key}
            autoFocus={autoFocus(props)}
            size="small"
            value={hexColor}
            onChange={(e) => {
              handleChange({ hex: e.target.value });
            }}
            disabled={readOnly}
            {...getComponentProps(props, "field")}
          />
        )}
      </Stack>
      <Popper
        open={open}
        anchorEl={anchor}
        placement="bottom-start"
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
        {...getComponentProps(props, "popper")}
      >
        <Component
          color={color.hsl || color.hex}
          onChange={handleChange}
          className={colorPicker}
          {...getComponentProps(props, "picker")}
        />
      </Popper>
    </Box>
  );
}

function formatColor(color: ColorType) {
  const { hsl = {}, hex } = color;
  const { h, s, l, a } = hsl;
  const bgColor = hsl ? `hsla(${h},${s * 100}%,${l * 100}%,${a})` : color.hex;
  const hexColor = (hex.startsWith("#") ? hex : `#${hex}`).toLowerCase();
  return { ...color, bgColor, hexColor };
}

const fallbackColor: ColorType = { hex: "#FF6D05" };

type ColorType = {
  hex: string;
  hsl?: {
    h: number;
    s: number;
    l: number;
    a: number;
  };
};
