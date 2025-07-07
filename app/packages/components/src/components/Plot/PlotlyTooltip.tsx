import {
  formatValueAsNumber,
  isFunctionalComponent,
} from "@fiftyone/utilities";
import { Stack, Typography, useTheme } from "@mui/material";
import React, { ComponentType } from "react";

export default function PlotlyTooltip(props: PlotlyTooltipProps) {
  const { event, value } = props;
  const theme = useTheme();

  if (!event) return null;

  const xPosition = event.event.pointerX + 25;
  const yPosition = event.event.pointerY - 25;
  const TooltipComponent = isFunctionalComponent(value)
    ? (value as TooltipComponent)
    : DefaultTooltipComponent;

  return (
    <Stack
      sx={{
        background: theme.palette.background.tooltip,
        p: 1,
        position: "absolute",
        top: yPosition,
        left: xPosition,
        borderRadius: 1,
        maxWidth: "300px",
        "& > *": {
          whiteSpace: "nowrap",
        },
        zIndex: theme.zIndex.tooltip,
      }}
    >
      <TooltipComponent event={event} value={value} />
    </Stack>
  );
}

function DefaultTooltipComponent(props: PlotlyTooltipProps) {
  const { event, value } = props;
  const { label, data = [] } = getTooltipData(event as TooltipEvent, value);

  return (
    <>
      {label && <Typography color="secondary">{label}</Typography>}
      {data.map((item, index) => (
        <Typography key={index}>
          <Typography color="secondary" component="span">
            {item.label}:
          </Typography>
          &nbsp;
          {formatValueAsNumber(item.value, 5)}
        </Typography>
      ))}
    </>
  );
}

function getTooltipData(
  event: TooltipEvent,
  value?: TooltipValue
): FullTooltipData {
  if (typeof value === "function") {
    const valueResolver = value as TooltipResolver;
    return valueResolver(event);
  } else if (value) {
    return value as FullTooltipData;
  }

  const [point] = event.points;
  const name = point.data.name;
  const x = point.x;
  const y = point.y;
  const z = point.z;
  const r = point.r;
  const theta = point.theta;
  const tooltipData = [];
  if (x !== undefined) {
    tooltipData.push({ label: "x", value: x });
  }
  if (y !== undefined) {
    tooltipData.push({ label: "y", value: y });
  }
  if (z !== undefined) {
    tooltipData.push({ label: "z", value: z });
  }
  if (r !== undefined) {
    tooltipData.push({ label: "r", value: r });
  }
  if (theta !== undefined) {
    tooltipData.push({ label: "θ", value: theta });
  }
  return { label: name, data: tooltipData };
}

type TooltipData = Array<{
  label: string;
  value: number | string;
}>;

type FullTooltipData = {
  label?: string;
  data?: TooltipData;
};

type TooltipResolver = (tooltip: TooltipEvent) => FullTooltipData;

type TooltipComponent = ComponentType<{
  event: TooltipEvent;
  value?: TooltipValue;
}>;

export type TooltipValue = FullTooltipData | TooltipResolver | TooltipComponent;

export type TooltipEvent = Readonly<Plotly.PlotHoverEvent>;

export type PlotlyTooltipProps = {
  value?: TooltipValue;
  event?: TooltipEvent;
};
