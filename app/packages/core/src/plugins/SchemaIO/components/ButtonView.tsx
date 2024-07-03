import { MuiIconFont } from "@fiftyone/components";
import usePanelEvent from "@fiftyone/operators/src/usePanelEvent";
import { usePanelId } from "@fiftyone/spaces";
import { isNullish } from "@fiftyone/utilities";
import { Box, ButtonProps } from "@mui/material";
import React from "react";
import { getComponentProps } from "../utils";
import { ViewPropsType } from "../utils/types";
import Button from "./Button";

export default function ButtonView(props: ViewPropsType) {
  const { schema, path } = props;
  const { view = {} } = schema;
  const {
    description,
    href,
    icon,
    icon_position = "left",
    label,
    operator,
    params = {},
    prompt,
  } = view;
  const panelId = usePanelId();
  const handleClick = usePanelEvent();
  const variant = getVariant(props);
  const computedParams = { ...params, path };

  const Icon = icon ? (
    <MuiIconFont
      name={icon}
      {...getComponentProps(props, "icon", getIconProps(props))}
    />
  ) : null;

  return (
    <Box {...getComponentProps(props, "container")}>
      <Button
        variant={variant}
        href={href}
        onClick={() => {
          handleClick(panelId, { params: computedParams, operator, prompt });
        }}
        startIcon={icon_position === "left" ? Icon : undefined}
        endIcon={icon_position === "right" ? Icon : undefined}
        title={description}
        {...getComponentProps(props, "button", getButtonProps(props))}
      >
        {label}
      </Button>
    </Box>
  );
}

function getButtonProps(props: ViewPropsType): ButtonProps {
  const { label, variant } = props.schema.view;
  const baseProps: ButtonProps = getCommonProps(props);
  if (isNullish(label)) {
    baseProps.sx["& .MuiButton-startIcon"] = { mr: 0, ml: 0 };
    baseProps.sx.minWidth = "auto";
    baseProps.sx.p = "6px";
  }
  if (variant === "round") {
    baseProps.sx.borderRadius = "1rem";
    baseProps.sx.p = "3.5px 10.5px";
  }
  if (variant === "square") {
    baseProps.sx.borderRadius = "3px 3px 0 0";
    baseProps.sx.backgroundColor = (theme) => theme.palette.neutral.softBg;
    baseProps.sx.borderBottom = "1px solid";
    baseProps.sx.borderColor = (theme) => theme.palette.primary.main;
  }
  return baseProps;
}

function getIconProps(props: ViewPropsType): ButtonProps {
  return getCommonProps(props);
}

function getCommonProps(props: ViewPropsType): ButtonProps {
  return {
    sx: { color: getColor(props), fontSize: "1rem", fontWeight: "bold" },
  };
}

function getColor(props: ViewPropsType) {
  const color = props.schema.view.color;
  if (color) {
    if (color === "primary") return (theme) => theme.palette.text.primary;
    if (color === "secondary") return (theme) => theme.palette.text.secondary;
    if (color === "orange") return (theme) => theme.palette.primary.main;
    return { color };
  }
  const variant = getVariant(props);
  return (theme) => {
    return variant === "contained"
      ? theme.palette.common.white
      : theme.palette.secondary.main;
  };
}

const defaultVariant = ["contained", "outlined"];

function getVariant(pros: ViewPropsType) {
  const variant = pros.schema.view.variant;
  if (defaultVariant.includes(variant)) return variant;
  if (variant === "round") return "contained";
  return null;
}
