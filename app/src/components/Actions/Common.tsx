import React from "react";
import { Launch } from "@material-ui/icons";

import { ItemAction, useHighlightHover } from "./utils";
import { useExternalLink } from "../ExternalLink";

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
    svgStyles = { height: "1rem", marginTop: 4.5 },
  }: ActionOptionProps) => {
    const { style: animationStyles, ...rest } = useHighlightHover(disabled);
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
        href={href}
        target={href ? "_blank" : null}
      >
        <span style={href ? { textDecoration: "underline" } : {}}>
          {text}
          {href && <Launch style={svgStyles} />}
        </span>
      </ItemAction>
    );
  }
);
