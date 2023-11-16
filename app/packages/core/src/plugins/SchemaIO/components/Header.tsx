import { Box, Stack, StackProps, Typography } from "@mui/material";
import React from "react";
import { ErrorView, HelpTooltip } from ".";
import { getComponentProps } from "../utils";

export default function Header(props: HeaderProps) {
  const {
    label,
    description,
    caption,
    divider,
    Actions,
    sx = {},
    variant = "secondary",
    descriptionView = "inline",
    omitCaption = false,
    omitErrors = false,
    errors,
    componentsProps,
  } = props;

  const labelVariantMap = {
    primary: "h6" as const,
    secondary: "body1" as const,
    tertiary: "body2" as const,
  };

  if (
    !label &&
    !description &&
    (!caption || omitCaption) &&
    (errors.length === 0 || omitErrors)
  ) {
    return null;
  }

  const viewProps = { schema: { view: { componentsProps } } };

  return (
    <Stack
      direction="row"
      spacing={2}
      justifyContent="space-between"
      alignItems="center"
      sx={{
        ...sx,
        ...(divider
          ? {
              borderBottom: "1px solid",
              borderColor: (theme) => theme.palette.divider,
              pb: 2,
              mb: 2,
            }
          : {}),
      }}
      {...getComponentProps(viewProps, "container")}
    >
      <Box {...getComponentProps(viewProps, "headingsContainer")}>
        <Stack {...getComponentProps(viewProps, "labelContainer")}>
          <Typography
            variant={labelVariantMap[variant]}
            color="text.primary"
            sx={{ display: "flex", alignItems: "center" }}
            {...getComponentProps(viewProps, "label")}
          >
            {label}
            {descriptionView === "tooltip" && (
              <HelpTooltip
                title={description}
                sx={{ ml: 1 }}
                {...getComponentProps(viewProps, "description")}
              />
            )}
          </Typography>
        </Stack>
        {description && descriptionView === "inline" && (
          <Typography
            variant="body2"
            color="text.secondary"
            {...getComponentProps(viewProps, "description")}
          >
            {description}
          </Typography>
        )}
        {caption && !omitCaption && (
          <Typography
            variant="body2"
            color="text.tertiary"
            {...getComponentProps(viewProps, "caption")}
          >
            {caption}
          </Typography>
        )}
        {!omitErrors && <ErrorView schema={{}} data={errors} />}
      </Box>
      {Actions && (
        <Box {...getComponentProps(viewProps, "actionsContainer")}>
          {Actions}
        </Box>
      )}
    </Stack>
  );
}

export type HeaderProps = {
  label: string;
  description?: string;
  caption?: string;
  divider?: boolean;
  Actions?: JSX.Element;
  sx?: StackProps["sx"];
  variant?: "primary" | "secondary" | "tertiary";
  omitCaption?: boolean;
  omitErrors?: boolean;
  descriptionView?: "inline" | "tooltip";
  errors: [];
  componentsProps?: unknown;
};
