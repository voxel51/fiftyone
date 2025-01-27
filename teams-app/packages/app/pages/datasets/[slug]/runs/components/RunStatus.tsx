import { Box, ColorCircle } from "@fiftyone/teams-components";
import { InfoOutlined } from "@mui/icons-material";
import { Chip, Stack, Tooltip, Typography, useTheme } from "@mui/material";
import { capitalize } from "lodash";
import React from "react";

const STATUS_WITH_TOOLTIP = ["queued", "scheduled"];

export default function RunStatus(props: RunStatusPropsType) {
  const { status, variant = "chip", progress, position } = props;
  const { palette } = useTheme();
  const colorGroup = colorGroupStatus[status];
  const color = palette[colorGroup].main;
  const label = capitalize(status);
  const Wrapper = STATUS_WITH_TOOLTIP.includes(status)
    ? Tooltip
    : React.Fragment;
  let wrapperProps = {};
  if (status === "queued") {
    wrapperProps = {
      title:
        "Queued job will run as soon as resources are available on your orchestrator",
      arrow: true,
    };
  }
  if (status === "scheduled") {
    wrapperProps = {
      title: `Scheduled job position ${position}`,
      arrow: true,
    };
  }

  if (progress) return <ProgressChip {...progress} />;

  return variant === "chip" ? (
    <Wrapper {...wrapperProps}>
      <Chip
        label={
          position ? (
            <LabelWithPosition label={label} position={position} />
          ) : (
            label
          )
        }
        sx={{ backgroundColor: color, color: palette.common.white }}
        size="small"
      />
    </Wrapper>
  ) : (
    <ColorCircle title={label} color={color} sx={{ mr: 1 }} />
  );
}

function ProgressChip(props: ProgressType) {
  const { progress, label } = props;
  const adjustedProgress = progress ? Math.round(progress * 100) : undefined;
  const { palette } = useTheme();

  return (
    <Chip
      label={
        <Tooltip title={label}>
          {adjustedProgress ? (
            <Typography color="common.white">{adjustedProgress}%</Typography>
          ) : (
            <InfoOutlined sx={{ display: "flex" }} />
          )}
        </Tooltip>
      }
      size="small"
      sx={{
        backgroundColor:
          palette.mode === "dark" ? "hsl(199 92% 25%)" : "hsl(201 97% 60%)",
        color: palette.common.white,
        "& .MuiChip-icon": {
          mx: 0,
          fontSize: "1rem",
          color: palette.common.white,
          backgroundColor: palette.info.main,
        },
      }}
      icon={<Chip label="Running" size="small" />}
    />
  );
}

function LabelWithPosition(props: LabelWithPositionPropsType) {
  const { label, position } = props;
  const [current, outOf] = position.split("/");

  return (
    <Stack direction="row" sx={{ alignItems: "center" }}>
      <Typography sx={{ color: (theme) => theme.palette.common.white }}>
        {label}
      </Typography>
      <Box>
        <Typography
          sx={{
            backgroundColor: (theme) => theme.palette.background.tertiary,
            borderRadius: "50%",
            px: 0.75,
            pb: 0.25,
            ml: 1,
            lineHeight: "1rem",
          }}
        >
          {current}
        </Typography>
      </Box>
    </Stack>
  );
}

type RunStatusPropsType = {
  status: string;
  variant?: "chip" | "circle";
  progress?: ProgressType;
  position?: string;
};

const colorGroupStatus = {
  queued: "queued",
  scheduled: "scheduled",
  running: "info",
  completed: "success",
  failed: "error",
};

type ProgressType = {
  progress?: number;
  label?: string;
  updated_at?: string;
};

type LabelWithPositionPropsType = {
  position: string;
  label: string;
};
