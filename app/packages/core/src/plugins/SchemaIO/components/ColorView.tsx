import { Box, Popper, Stack, TextField } from "@mui/material";
import React, { useEffect, useState } from "react";
import * as ColorPickers from "react-color";
import { colorPicker } from "./ColorView.module.css";
import HeaderView from "./HeaderView";
import autoFocus from "../utils/auto-focus";
import { getComponentProps } from "../utils";

export default function ColorView(props) {
  const { onChange, path, schema, data } = props;
  const { view = {} } = schema;
  const { compact, variant, readOnly } = view;
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(data ?? defaultColor);
  const [anchor, setAnchor] = React.useState<null | HTMLElement>(null);
  const Component = ColorPickers[variant] || ColorPickers.ChromePicker;

  const { bgColor, hexColor } = formatColor(color);

  useEffect(() => {
    onChange(path, color);
  }, [color]);

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
            autoFocus={autoFocus(props)}
            size="small"
            value={hexColor}
            onChange={(e) => {
              setColor({ hex: e.target.value });
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
        {...getComponentProps(props, "popper")}
      >
        <Component
          color={color.hsl || color.hex}
          onChange={(color) => {
            setColor(color);
          }}
          className={colorPicker}
          {...getComponentProps(props, "picker")}
        />
      </Popper>
    </Box>
  );
}

function formatColor(color) {
  const { hsl = {}, hex } = color;
  const { h, s, l, a } = hsl;
  const bgColor = color.hsl
    ? `hsla(${h},${s * 100}%,${l * 100}%,${a})`
    : color.hex;
  const hexColor = (hex.startsWith("#") ? hex : `#${hex}`).toLowerCase();
  return { ...color, bgColor, hexColor };
}

const defaultColor: defaultColorType = { hex: "#FF6D05" };

type defaultColorType = {
  hex: string;
  hsl?: {
    h: number;
    s: number;
    l: number;
    a: number;
  };
};
