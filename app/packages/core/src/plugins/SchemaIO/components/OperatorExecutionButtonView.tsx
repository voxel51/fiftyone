import React from "react";
import { MuiIconFont } from "@fiftyone/components";
import { OperatorExecutionButton } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { isNullish } from "@fiftyone/utilities";
import { Box, ButtonProps, Typography } from "@mui/material";
import { getColorByCode, getComponentProps, getDisabledColors } from "../utils";
import { ViewPropsType } from "../utils/types";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import TooltipProvider from "./TooltipProvider";

export default function OperatorExecutionButtonView(props: ViewPropsType) {
  const { schema, path } = props;
  const { view = {} } = schema;
  const {
    description,
    icon,
    icon_position = "right",
    label,
    operator,
    params = {},
    title,
    disabled = false,
  } = view;
  const panelId = usePanelId();
  const variant = getVariant(props);
  const computedParams = { ...params, path, panel_id: panelId };

  const Icon = icon ? (
    <MuiIconFont
      name={icon}
      {...getComponentProps(props, "icon", getIconProps(props))}
    />
  ) : (
    <ExpandMoreIcon />
  );

  return (
    <Box {...getComponentProps(props, "container")}>
      <TooltipProvider title={title} {...getComponentProps(props, "tooltip")}>
        <OperatorExecutionButton
          operatorUri={operator}
          executionParams={computedParams}
          variant={variant}
          disabled={disabled}
          startIcon={icon_position === "left" ? Icon : undefined}
          endIcon={icon_position === "right" ? Icon : undefined}
          title={description}
          {...getComponentProps(props, "button", getButtonProps(props))}
        >
          <Typography>{label}</Typography>
        </OperatorExecutionButton>
      </TooltipProvider>
    </Box>
  );
}

function getButtonProps(props: ViewPropsType): ButtonProps {
  const { label, color, disabled } = props.schema.view;
  const variant = getVariant(props);
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
    baseProps.sx.backgroundColor = (theme) => theme.palette.background.field;
    baseProps.sx.borderBottom = "1px solid";
    baseProps.sx.paddingBottom = "5px";
    baseProps.sx.borderColor = (theme) => theme.palette.primary.main;
  }
  if (variant === "outlined") {
    baseProps.sx.p = "5px";
  }
  if ((variant === "square" || variant === "outlined") && isNullish(color)) {
    const borderColor =
      "rgba(var(--fo-palette-common-onBackgroundChannel) / 0.23)";
    baseProps.sx.borderColor = borderColor;
    baseProps.sx.borderBottomColor = borderColor;
  }
  if (isNullish(variant) || variant === "contained") {
    baseProps.variant = "contained";
    baseProps.color = "primary";
    baseProps.sx.color = (theme) => theme.palette.text.primary;
    baseProps.sx["&:hover"] = {
      backgroundColor: (theme) => theme.palette.tertiary.hover,
    };
  }

  if (disabled) {
    const [bgColor, textColor] = getDisabledColors();
    baseProps.sx["&.Mui-disabled"] = {
      backgroundColor: variant === "outlined" ? "inherit" : bgColor,
      color: textColor,
    };
    if (["square", "outlined"].includes(variant)) {
      baseProps.sx["&.Mui-disabled"].backgroundColor = (theme) =>
        theme.palette.background.field;
    }
  }

  return baseProps;
}

function getIconProps(props: ViewPropsType): ButtonProps {
  return getCommonProps(props);
}

function getCommonProps(props: ViewPropsType): ButtonProps {
  const color = getColor(props);
  const disabled = props.schema.view?.disabled || false;

  return {
    sx: {
      color,
      fontSize: "1rem",
      fontWeight: "bold",
      borderColor: color,
      "&:hover": {
        borderColor: color,
      },
      ...(disabled
        ? {
            opacity: 0.5,
          }
        : {}),
    },
  };
}

function getColor(props: ViewPropsType) {
  const {
    schema: { view = {} },
  } = props;
  const { color } = view;
  if (color) {
    return getColorByCode(color);
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
  return "contained";
}
