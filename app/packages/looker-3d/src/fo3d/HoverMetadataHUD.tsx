import CloseIcon from "@mui/icons-material/Close";
import React, { useCallback, useMemo } from "react";
import styled from "styled-components";
import { useFo3dContext } from "./context";

const HoverMetadataHUDContainer = styled.div`
  position: absolute;
  top: 1.5em;
  right: 1.5em;
  width: 300px;
  z-index: 500;
  background: rgba(30, 32, 38, 0.96);
  color: #fff;
  border-radius: 14px;
  box-shadow: 0 6px 32px 0 rgba(0, 0, 0, 0.22);
  padding: 0;
  font-size: 0.82rem;
  font-family: inherit;
  pointer-events: auto;
  border: 1px solid var(--fo-palette-primary-plainBorder, #444);
  backdrop-filter: blur(8px);
  overflow: hidden;
  opacity: 0.7;
  transition: opacity 0.15s;
  max-height: 500px;
  overflow-y: auto;

  &:hover {
    opacity: 1;
  }
`;

const TitleBar = styled.div`
  display: flex;
  position: sticky;
  top: 0;
  z-index: 1;
  align-items: center;
  justify-content: space-between;
  background: rgba(40, 42, 50, 0.98);
  padding: 0.7em 1.2em 0.7em 1.2em;
  border-bottom: 1px solid var(--fo-palette-primary-plainBorder, #444);
`;

const Title = styled.div`
  font-weight: 700;
  font-size: 1.02em;
  letter-spacing: 0.01em;
  color: #e0e0e0;
  display: flex;
  align-items: center;
  gap: 0.7em;
`;

const RenderModeDescriptor = styled.span`
  background: #2d2f36;
  color: #a0a0ff;
  font-size: 0.92em;
  font-weight: 500;
  border-radius: 6px;
  padding: 0.15em 0.7em;
  margin-left: 0.7em;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  padding: 0.2em;
  border-radius: 50%;
  transition: background 0.15s;
  display: flex;
  align-items: center;
  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }
`;

const HoverMetadataList = styled.dl`
  margin: 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  row-gap: 0.3em;
  column-gap: 1em;
  padding: 1.1em 1.3em 1.2em 1.3em;
  dt {
    font-weight: 600;
    color: #b3b3b3;
    margin: 0;
    font-size: 0.93em;
  }
  dd {
    margin: 0;
    word-break: break-all;
    color: #fff;
    font-size: 0.93em;
  }
`;

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

const HoverMetadataHUD = () => {
  const { hoverMetadata, setHoverMetadata } = useFo3dContext();

  const entries = useMemo(
    () =>
      hoverMetadata?.attributes
        ? Object.entries(hoverMetadata.attributes)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([key, value]) => {
              if (key === "dynamicAttr") {
                return null;
              }

              return (
                <React.Fragment key={key}>
                  <dt>{key}</dt>
                  <dd>{formatMetadataValue(value)}</dd>
                </React.Fragment>
              );
            })
        : [],
    [hoverMetadata]
  );

  const onClose = useCallback(() => {
    setHoverMetadata(null);
  }, [setHoverMetadata]);

  if (
    !hoverMetadata ||
    !hoverMetadata.attributes ||
    Object.keys(hoverMetadata.attributes).length === 0
  )
    return null;

  return (
    <HoverMetadataHUDContainer>
      <TitleBar>
        <Title>
          {hoverMetadata.assetName}
          {hoverMetadata.renderModeDescriptor && (
            <RenderModeDescriptor>
              {hoverMetadata.renderModeDescriptor}
            </RenderModeDescriptor>
          )}
        </Title>
        <CloseButton onClick={onClose} title="Close HUD">
          <CloseIcon fontSize="small" />
        </CloseButton>
      </TitleBar>
      <HoverMetadataList>{entries}</HoverMetadataList>
    </HoverMetadataHUDContainer>
  );
};

export default HoverMetadataHUD;
