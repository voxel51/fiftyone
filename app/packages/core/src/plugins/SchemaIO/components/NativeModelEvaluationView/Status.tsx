import { ColoredDot } from "@fiftyone/components";
import { useMutation } from "@fiftyone/state";
import { Chip, MenuItem, Select, Stack, Typography } from "@mui/material";
import { useTriggerEvent } from "./utils";

export default function Status(props: StatusProps) {
  const { status, canEdit, readOnly, setStatusEvent } = props;
  const triggerEvent = useTriggerEvent();
  const [enable, message] = useMutation(canEdit, "update evaluation status");

  if (!readOnly) {
    return (
      <Select
        sx={{
          height: "28px",
          borderRadius: 16,
          backgroundColor: (theme) => theme.palette.action.selected,
          "& fieldset": { border: "none" },
        }}
        defaultValue={status || "needs_review"}
        onChange={(e) => {
          if (setStatusEvent) {
            triggerEvent(setStatusEvent, { status: e.target.value });
          }
        }}
        title={message}
        disabled={!enable}
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
  status: string;
  canEdit: boolean;
  readOnly?: boolean;
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
