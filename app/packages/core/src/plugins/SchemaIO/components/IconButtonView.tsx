import { MuiIconFont, PillButton } from "@fiftyone/components";
import usePanelEvent from "@fiftyone/operators/src/usePanelEvent";
import { usePanelId } from "@fiftyone/spaces";
import { IconButton, Link } from "@mui/material";
import React, { useCallback } from "react";
import styled from "styled-components";
import { getComponentProps } from "../utils";

export default function IconButtonView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { icon, operator, params = {}, prompt, variant, label } = view;
  const panelId = usePanelId();
  const handleClick = usePanelEvent();

  const Icon = icon ? (
    <MuiIconFont
      name={icon}
      sx={
        variant === "round"
          ? {}
          : { color: (theme) => theme.palette.primary.main }
      }
      {...getComponentProps(props, "icon")}
    />
  ) : null;

  const onClick = useCallback(() => {
    handleClick(panelId, { params, operator, prompt });
  }, [panelId, params, operator, prompt, handleClick]);

  if (variant === "round") {
    return (
      <PillButton
        icon={Icon || label}
        title={label}
        highlight
        onClick={onClick}
      />
    );
  }

  if (variant === "square") {
    return (
      <SquareButton
        title={label}
        aria-label={icon}
        onClick={onClick}
        {...getComponentProps(props, "button")}
      >
        {Icon || label}
      </SquareButton>
    );
  }

  return (
    <IconButton
      title={label}
      aria-label={icon}
      {...getComponentProps(props, "button")}
      onClick={onClick}
    >
      {Icon || label}
    </IconButton>
  );
}

const SquareButton = styled(Link)`
  display: flex;
  color: var(--fo-palette-primary-plainColor);
  align-items: center;
  cursor: pointer;
  border-bottom: 1px var(--fo-palette-primary-plainColor) solid;
  background: var(--fo-palette-neutral-softBg);
  border-top-left-radius: 3px;
  border-top-right-radius: 3px;
  padding: 0.25rem;
`;
