import { Help } from "@mui/icons-material";
import {
  Tooltip as MUITooltip,
  TooltipProps as MUITooltipProps,
  Typography,
} from "@mui/material";
import React from "react";
import Markdown from "./Markdown";

const MarkdownHelpTooltipTitle = ({
  titleMarkdown,
}: {
  titleMarkdown: string;
}) => {
  return <Markdown>{titleMarkdown}</Markdown>;
};
interface HelpTooltipProps extends TooltipProps {
  isTitleMarkdown?: boolean;
  iconSx?: React.CSSProperties;
}

export default function HelpTooltip(props: HelpTooltipProps) {
  const { title, iconSx, isTitleMarkdown, ...otherProps } = props;
  return (
    <MUITooltip
      title={
        isTitleMarkdown ? (
          <MarkdownHelpTooltipTitle titleMarkdown={title as string} />
        ) : (
          <Typography variant="body2">{title}</Typography>
        )
      }
      {...otherProps}
      sx={{
        fontSize: 14,
        color: (theme) => theme.palette.text.secondary,
        ...(otherProps?.sx || {}),
      }}
    >
      <Help sx={iconSx ?? {}} />
    </MUITooltip>
  );
}

type TooltipProps = Omit<MUITooltipProps, "children"> & {
  children?: MUITooltipProps["children"];
};
