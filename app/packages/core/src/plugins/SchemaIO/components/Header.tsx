import { Box, Stack, StackProps, Typography } from "@mui/material";
import React from "react";
import { ErrorView, HelpTooltip } from ".";

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
  } = props;

  const labelVariantMap = {
    primary: "h6" as const,
    secondary: "body1" as const,
    tertiary: "body2" as const,
  };

  if (!label && !description && (!caption || omitCaption)) return null;

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
    >
      <Box>
        <Stack>
          <Typography
            variant={labelVariantMap[variant]}
            color="text.primary"
            sx={{ display: "flex", alignItems: "center" }}
          >
            {label}
            {descriptionView === "tooltip" && (
              <HelpTooltip title={description} sx={{ ml: 1 }} />
            )}
          </Typography>
        </Stack>
        {description && descriptionView === "inline" && (
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        )}
        {caption && !omitCaption && (
          <Typography variant="body2" color="text.tertiary">
            {caption}
          </Typography>
        )}
        {!omitErrors && <ErrorView schema={{}} data={errors} />}
      </Box>
      {Actions && <Box>{Actions}</Box>}
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
  errors: object;
};
