import { ItemAction, useHighlightHover } from "@fiftyone/sidebar";
import { ExternalLink, useTheme } from "@fiftyone/components";
import { LaunchIcon } from "@voxel51/voodo";
import type { MouseEventHandler } from "react";
import React from "react";
import { useActionIconSize } from "./iconSize";

export type ActionOptionProps = {
  id?: string;
  onClick?: MouseEventHandler;
  href?: string;
  text: string;
  title?: string;
  hidden?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
  svgStyles?: React.CSSProperties;
};

export const ActionOption = React.memo(
  ({
    onClick,
    text,
    href,
    title,
    disabled = false,
    hidden = false,
    style,
    svgStyles = { height: "1rem", marginTop: 4.5, marginLeft: 1 },
  }: ActionOptionProps) => {
    const { style: animationStyles, ...rest } = useHighlightHover(disabled);
    const theme = useTheme();
    const iconSize = useActionIconSize(24);
    const convertedText = text.replace(/[\s.,/]/g, "-").toLowerCase();
    if (hidden) {
      return null;
    }
    return (
      <ItemAction
        data-cy={`item-action-${convertedText}`}
        title={title ? title : text}
        onClick={disabled ? undefined : onClick}
        {...rest}
        style={style ?? animationStyles}
      >
        <span style={href ? { textDecoration: "underline" } : {}}>
          {href ? (
            <ExternalLink style={{ color: theme.text.primary }} href={href}>
              {text}
              <LaunchIcon size={iconSize} style={svgStyles} />
            </ExternalLink>
          ) : (
            `${text}`
          )}
        </span>
      </ItemAction>
    );
  },
);
