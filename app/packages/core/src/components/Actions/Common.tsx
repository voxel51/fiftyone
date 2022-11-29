import React from "react";
import { Launch } from "@mui/icons-material";

import { useHighlightHover } from "./utils";
import { ItemAction } from "./ItemAction";
import { useExternalLink } from "@fiftyone/utilities";
import ExternalLink from "@fiftyone/components/src/components/ExternalLink";
import { useTheme } from "@fiftyone/components";

type ActionOptionProps = {
  onClick?: (event?: Event) => void;
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
    onClick = href ? useExternalLink(href) : onClick;
    if (hidden) {
      return null;
    }
    return (
      <ItemAction
        title={title ? title : text}
        onClick={disabled ? null : onClick}
        {...rest}
        style={style ?? animationStyles}
      >
        <span style={href ? { textDecoration: "underline" } : {}}>
          {href ? (
            <ExternalLink style={{ color: theme.text.primary }} href={href}>
              {text}
              <Launch style={svgStyles} />
            </ExternalLink>
          ) : (
            `${text}`
          )}
        </span>
      </ItemAction>
    );
  }
);
