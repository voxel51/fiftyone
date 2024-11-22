import { constants } from "@fiftyone/utilities";
import { OpenInNew, West } from "@mui/icons-material";
import {
  Box,
  Button,
  Card,
  IconProps,
  Stack,
  Typography,
  TypographyProps,
  useTheme,
} from "@mui/material";
import React, { FunctionComponent } from "react";
import MuiButton from "../MuiButton";
import MuiIconFont from "../MuiIconFont";

const { IS_APP_MODE_FIFTYONE, BOOK_A_DEMO_LINK, TRY_IN_BROWSER_LINK } =
  constants;

export default function PanelCTA(props: PanelCTAProps) {
  const {
    demoLabel,
    demoDescription,
    demoCaption,
    Actions,
    caption,
    description,
    docCaption,
    docLink,
    icon: Icon,
    iconProps = {},
    label,
    mode,
    name,
    onBack,
    tryLink,
    demoDocCaption,
  } = props;
  const theme = useTheme();
  const isDefault = mode === "default";
  const computedLabel = IS_APP_MODE_FIFTYONE ? demoLabel || label : label;
  const computedDescription = IS_APP_MODE_FIFTYONE
    ? demoDescription || description
    : description;
  const computedCaption = IS_APP_MODE_FIFTYONE
    ? demoCaption || caption
    : caption;
  const computedDocCaption = IS_APP_MODE_FIFTYONE
    ? demoDocCaption || docCaption
    : docCaption;

  return (
    <Stack spacing={1} sx={{ height: "100%", p: 2 }}>
      {isDefault && (
        <Box>
          <Button onClick={onBack} startIcon={<West />} color="secondary">
            Back to {name}
          </Button>
        </Box>
      )}
      <Card
        sx={{
          position: "relative",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          minHeight: 320,
        }}
      >
        <Stack sx={{ maxWidth: "85%" }}>
          <Stack
            spacing={1}
            sx={{
              height: "100%",
              alignItems: "center",
              justifyContent: "space-between",
              py: 2,
            }}
          >
            <Stack
              sx={{
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {typeof Icon === "string" && (
                <MuiIconFont
                  sx={{
                    fontSize: 64,
                    color: theme.palette.custom.primarySoft,
                    marginBottom: 2,
                  }}
                  {...(iconProps as IconProps)}
                  name={Icon}
                />
              )}
              {Boolean(Icon) && typeof Icon !== "string" && Icon}
              <TypographyOrNode variant="h6">{computedLabel}</TypographyOrNode>
              <TypographyOrNode color="secondary">
                {computedDescription}
              </TypographyOrNode>
              <TypographyOrNode sx={{ color: theme.palette.text.tertiary }}>
                {computedCaption}
              </TypographyOrNode>
              {!IS_APP_MODE_FIFTYONE && (
                <Box pt={1}>{Actions && <Actions {...props} />}</Box>
              )}
              {IS_APP_MODE_FIFTYONE && (
                <Stack direction="row" spacing={2} pt={2}>
                  <MuiButton
                    variant="contained"
                    color="primary"
                    href={BOOK_A_DEMO_LINK}
                    target="_blank"
                  >
                    Book a demo
                  </MuiButton>
                  <MuiButton
                    variant="contained"
                    color="primary"
                    href={tryLink || TRY_IN_BROWSER_LINK}
                    target="_blank"
                  >
                    Try in browser
                  </MuiButton>
                </Stack>
              )}
            </Stack>
            {docLink && (
              <Stack
                spacing={1}
                sx={{ alignItems: "center", justifyContent: "center" }}
              >
                {computedDocCaption && (
                  <Typography color="secondary">
                    {computedDocCaption}
                  </Typography>
                )}
                <MuiButton
                  variant="outlined"
                  endIcon={<OpenInNew sx={{ fontSize: "16px!important" }} />}
                  href={docLink}
                  target="_blank"
                >
                  View documentation
                </MuiButton>
              </Stack>
            )}
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}

function TypographyOrNode(props: TypographyProps) {
  const { children, ...otherProps } = props;

  if (typeof children === "string") {
    return (
      <Typography sx={{ textAlign: "center" }} {...otherProps}>
        {children}
      </Typography>
    );
  }

  if (React.isValidElement(children)) {
    return children;
  }

  return null;
}

export type PanelCTAProps = {
  Actions?: FunctionComponent<any>;
  caption?: string | React.ReactNode;
  description?: string | React.ReactNode;
  docCaption?: string;
  docLink?: string;
  icon?: string | React.ReactNode;
  iconProps?: IconProps;
  label: string | React.ReactNode;
  mode?: "onboarding" | "default";
  name: string;
  onBack: () => void;
  panelProps?: any;
  demoLabel?: string;
  demoDescription?: string;
  demoCaption?: string;
  demoDocCaption?: string;
  tryLink?: string;
};
