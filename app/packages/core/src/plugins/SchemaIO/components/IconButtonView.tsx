import { MuiIconFont, PillButton } from "@fiftyone/components";
import usePanelEvent from "@fiftyone/operators/src/usePanelEvent";
import { usePanelId } from "@fiftyone/spaces";
import { IconButton, Link, SxProps } from "@mui/material";
import React, { useCallback } from "react";
import styled from "styled-components";
import { getComponentProps } from "../utils";
import Button from "./Button";

export default function IconButtonView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { icon, operator, params = {}, prompt, variant, href, label } = view;
  const panelId = usePanelId();
  const handleClick = usePanelEvent();

  const Icon = icon ? (
    <MuiIconFont
      name={icon}
      sx={getVariantSx(variant)}
      {...getComponentProps(props, "icon")}
    />
  ) : null;

  const onClick = useCallback(() => {
    handleClick(panelId, { params, operator, prompt });
  }, [panelId, params, operator, prompt, handleClick]);

  if (variant === "round") {
    const Wrapper = href ? Link : React.Fragment;
    return (
      <Wrapper href={href}>
        <PillButton
          icon={Icon || label}
          title={label}
          highlight
          onClick={onClick}
          aria-label={`Button for ${icon}`}
          {...getComponentProps(props, "button")}
        />
      </Wrapper>
    );
  }

  if (variant === "square") {
    return (
      <SquareButton
        title={label}
        aria-label={`Button for ${icon}`}
        onClick={onClick}
        href={href}
        {...getComponentProps(props, "button")}
      >
        {Icon || label}
      </SquareButton>
    );
  }

  if (variant === "contained" || variant === "outlined") {
    return (
      <Button
        variant={variant}
        href={href}
        onClick={onClick}
        {...getComponentProps(props, "button")}
      >
        {Icon || label}
      </Button>
    );
  }

  return (
    <IconButton
      title={label}
      aria-label={`Button for ${icon}`}
      size="small"
      href={href}
      onClick={onClick}
      {...getComponentProps(props, "button")}
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

function getVariantSx(variant: VariantType): SxProps {
  if (variant === "round") return {};
  if (variant === "contained") {
    return {
      color: (theme) => theme.palette.common.white,
    };
  }
  if (variant === "outlined") {
    return {
      color: (theme) => theme.palette.secondary.main,
    };
  }
  return {
    color: (theme) => theme.palette.primary.main,
  };
}
type VariantType = "round" | "square" | "contained" | "outlined" | "default";
