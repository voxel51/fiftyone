import { Launch } from "@mui/icons-material";
import React from "react";

import { useTheme } from "@fiftyone/components";
import ExternalLink from "@fiftyone/components/src/components/ExternalLink";
import { useExternalLink } from "@fiftyone/utilities";
import { ItemAction } from "./ItemAction";
import { useHighlightHover } from "./utils";

type ActionOptionProps = {
  id: string;
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
    id,
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

    const convertedText = text.replace(/[\s.,/]/g, "-").toLowerCase();

    if (hidden) {
      return null;
    }
    return (
      <ItemAction
        data-cy={`${id}-${text}`}
        title={title ? title : text}
        onClick={disabled ? null : onClick}
        {...rest}
        style={style ?? animationStyles}
        data-cy={`item-action-${convertedText}`}
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
