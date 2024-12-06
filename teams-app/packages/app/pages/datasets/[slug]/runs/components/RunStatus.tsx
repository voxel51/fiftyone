import { ColorCircle } from "@fiftyone/teams-components";
import { InfoOutlined } from "@mui/icons-material";
import { Chip, Tooltip, Typography, useTheme } from "@mui/material";
import { capitalize } from "lodash";

export default function RunStatus(props: RunStatusPropsType) {
  const { status, variant = "chip", progress } = props;
  const { palette } = useTheme();
  const colorGroup = colorGroupStatus[status];
  const color = palette[colorGroup].main;
  const label = capitalize(status);

  if (progress) return <ProgressChip {...progress} />;

  return variant === "chip" ? (
    <Chip
      label={label}
      sx={{ backgroundColor: color, color: palette.common.white }}
      size="small"
    />
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

type RunStatusPropsType = {
  status: string;
  variant?: "chip" | "circle";
  progress?: ProgressType;
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
