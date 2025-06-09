import React, { useMemo } from "react";
import styled from "styled-components";

const HoverMetadataHUDContainer = styled.div`
  position: absolute;
  top: 2em;
  right: 2em;
  z-index: 2001;
  min-width: 220px;
  max-width: 350px;
  background: rgba(30, 32, 38, 0.92);
  color: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 24px 0 rgba(0, 0, 0, 0.18);
  padding: 1.2em 1.5em;
  font-size: 1rem;
  font-family: inherit;
  pointer-events: none;
  border: 1px solid var(--fo-palette-primary-plainBorder, #444);
  backdrop-filter: blur(6px);
`;

const HoverMetadataList = styled.dl`
  margin: 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  row-gap: 0.4em;
  column-gap: 1em;
  dt {
    font-weight: 600;
    color: #b3b3b3;
    margin: 0;
  }
  dd {
    margin: 0;
    word-break: break-all;
    color: #fff;
  }
`;

type HoverMetadataHUDProps = {
  hoverMetadata: Record<string, unknown> | null;
};

const formatMaybeNumber = (value: unknown) => {
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return value.toString();
    }
    return value.toFixed(4);
  }
  return value;
};

const formatMetadataValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((v) => formatMaybeNumber(v)).join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(formatMaybeNumber(value));
};

const HoverMetadataHUD: React.FC<HoverMetadataHUDProps> = ({
  hoverMetadata,
}) => {
  const entries = useMemo(
    () =>
      hoverMetadata
        ? Object.entries(hoverMetadata)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{formatMetadataValue(value)}</dd>
              </React.Fragment>
            ))
        : [],
    [hoverMetadata]
  );

  if (!hoverMetadata) return null;

  return (
    <HoverMetadataHUDContainer>
      <HoverMetadataList>{entries}</HoverMetadataList>
    </HoverMetadataHUDContainer>
  );
};

export default HoverMetadataHUD;
