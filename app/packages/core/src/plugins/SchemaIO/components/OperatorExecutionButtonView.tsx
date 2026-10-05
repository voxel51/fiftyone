import { MuiIconFont, TooltipProvider } from "@fiftyone/components";
import { OperatorExecutionButton, usePanelEvent } from "@fiftyone/operators";
import { OperatorResult } from "@fiftyone/operators/src/operators";
import { OperatorExecutionOption } from "@fiftyone/operators/src/state";
import {
  ExecutionCallback,
  ExecutionErrorCallback,
} from "@fiftyone/operators/src/ts/runtime.types";
import { usePanelId } from "@fiftyone/spaces";
import { isNullish } from "@fiftyone/utilities";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Box, ButtonProps, Typography } from "@mui/material";
import {
  getColorByCode,
  getComponentProps,
  getDisabledColors,
  type StyleObject,
} from "../utils";
import { ViewPropsType } from "../utils/types";

type MenuOrigin = {
  vertical: "top" | "bottom" | "center";
  horizontal: "left" | "right" | "center";
};

type OperatorExecutionButtonViewOptions = {
  description?: string;
  icon?: string;
  icon_position?: "left" | "right";
  label?: string;
  operator: string;
  params?: Record<string, unknown>;
  title?: string;
  disabled?: boolean;
  // operator URIs triggered on these events
  on_error?: string;
  on_success?: string;
  on_option_selected?: string;
  inside_modal?: boolean;
  menu_anchor_origin?: MenuOrigin;
  menu_transform_origin?: MenuOrigin;
};

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
    on_error,
    on_success,
    on_option_selected,
    inside_modal = false,
    menu_anchor_origin,
    menu_transform_origin,
  } = view as OperatorExecutionButtonViewOptions;
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

  const triggerEvent = usePanelEvent();

  const handleOnSuccess: ExecutionCallback = (
    operatorResult: OperatorResult,
    { ctx },
  ) => {
    if (on_success) {
      triggerEvent(panelId, {
        operator: on_success,
        params: {
          result: operatorResult.result,
          original_params: ctx.params,
        },
      });
    }
  };
  const handleOnError: ExecutionErrorCallback = (
    result: OperatorResult,
    { ctx },
  ) => {
    if (on_error) {
      triggerEvent(panelId, {
        operator: on_error,
        params: {
          error: result.error,
          error_message: result.errorMessage,
          original_params: ctx.params,
        },
      });
    }
  };
  const handleOnOptionSelected = (option: OperatorExecutionOption) => {
    if (on_option_selected) {
      triggerEvent(panelId, {
        operator: on_option_selected,
        params: {
          selected_option: option,
        },
      });
    }
  };

  return (
    <Box {...getComponentProps(props, "container")}>
      <TooltipProvider title={title} {...getComponentProps(props, "tooltip")}>
        <OperatorExecutionButton
          operatorUri={operator}
          onSuccess={handleOnSuccess}
          onError={handleOnError}
          onOptionSelected={handleOnOptionSelected}
          executionParams={computedParams}
          variant={variant}
          disabled={disabled}
          insideModal={inside_modal}
          menuAnchorOrigin={menu_anchor_origin}
          menuTransformOrigin={menu_transform_origin}
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
  const { label, color, disabled } = props.schema.view as {
    label?: string;
    color?: string;
    disabled?: boolean;
  };
  // getVariant only yields contained/outlined, so the round/square branches
  // below never apply; kept as-is
  const variant: string = getVariant(props);
  const baseProps: ButtonProps = getCommonProps(props);
  const sx = baseProps.sx as StyleObject<ButtonProps["sx"]>;
  if (isNullish(label)) {
    sx["& .MuiButton-startIcon"] = { mr: 0, ml: 0 };
    sx.minWidth = "auto";
    sx.p = "6px";
  }
  if (variant === "round") {
    sx.borderRadius = "1rem";
    sx.p = "3.5px 10.5px";
  }
  if (variant === "square") {
    sx.borderRadius = "3px 3px 0 0";
    sx.backgroundColor = (theme) => theme.palette.background.field;
    sx.borderBottom = "1px solid";
    sx.paddingBottom = "5px";
    sx.borderColor = (theme) => theme.palette.primary.main;
  }
  if (variant === "outlined") {
    sx.p = "5px";
  }
  if ((variant === "square" || variant === "outlined") && isNullish(color)) {
    const borderColor =
      "rgba(var(--fo-palette-common-onBackgroundChannel) / 0.23)";
    sx.borderColor = borderColor;
    sx.borderBottomColor = borderColor;
  }
  if (isNullish(variant) || variant === "contained") {
    baseProps.variant = "contained";
    baseProps.color = "primary";
    sx.color = (theme) => theme.palette.text.primary;
    sx["&:hover"] = {
      backgroundColor: (theme) => theme.palette.tertiary.hover,
    };
  }

  if (disabled) {
    const [bgColor, textColor] = getDisabledColors();
    sx["&.Mui-disabled"] = {
      backgroundColor: variant === "outlined" ? "inherit" : bgColor,
      color: textColor,
    };
    if (["square", "outlined"].includes(variant)) {
      sx["&.Mui-disabled"].backgroundColor = (theme) =>
        theme.palette.background.field;
    }
  }

  return baseProps;
}

// the icon only takes the shared sx
function getIconProps(props: ViewPropsType): Pick<ButtonProps, "sx"> {
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
  const { color } = view as { color?: string };
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
  const variant = pros.schema.view.variant as string;
  if (defaultVariant.includes(variant))
    return variant as "contained" | "outlined";
  if (variant === "round") return "contained";
  return "contained";
}
