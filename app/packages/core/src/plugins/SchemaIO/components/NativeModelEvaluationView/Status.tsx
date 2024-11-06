import { ColoredDot } from "@fiftyone/components";
import { Chip, MenuItem, Select, Stack, Typography } from "@mui/material";
import React from "react";
import { useTriggerEvent } from "./utils";

export default function Status(props: StatusProps) {
  const { status, canEdit, setStatusEvent } = props;
  const triggerEvent = useTriggerEvent();

  if (canEdit) {
    return (
      <Select
        sx={{
          height: "28px",
          borderRadius: 16,
          backgroundColor: (theme) => theme.palette.action.selected,
          "& fieldset": {
            border: "none",
          },
        }}
        defaultValue={status || "needs_review"}
        onChange={(e) => {
          triggerEvent(setStatusEvent, { status: e.target.value });
        }}
      >
        {STATUSES.map((status) => {
          const color = COLOR_BY_STATUS[status];
          return (
            <MenuItem key={status} value={status}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <ColoredDot color={color} />
                <Typography sx={{ color }}>{STATUS_LABELS[status]}</Typography>
              </Stack>
            </MenuItem>
          );
        })}
      </Select>
    );
  }

  const color = COLOR_BY_STATUS[status];
  return (
    <Chip
      size="small"
      variant="filled"
      label={
        <Stack direction="row" sx={{ alignItems: "center" }}>
          <ColoredDot color={color} />
          <Typography sx={{ color }}>
            {STATUS_LABELS[status] || "Needs review"}
          </Typography>
        </Stack>
      }
      sx={{
        border: "none",
        backgroundColor: (theme) =>
          `${theme.palette.action.selected}!important`,
      }}
    />
  );
}

type StatusProps = {
  status?: string;
  canEdit?: boolean;
  setStatusEvent?: string;
};

const STATUS_LABELS = {
  needs_review: "Needs Review",
  in_review: "In Review",
  reviewed: "Reviewed",
};

const COLOR_BY_STATUS = {
  needs_review: "#999999",
  in_review: "#FFB682",
  reviewed: "#8BC18D",
};

const STATUSES = Object.keys(STATUS_LABELS);
