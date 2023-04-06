import { Link } from "@fiftyone/components";
import styled from "styled-components";

export const EmbeddingsContainer = styled.div`
  margin: 0;
  height: 100%;
  width: 100%;
`;
export const Selectors = styled.div`
  display: flex;
  gap: 1rem;
  position: absolute;
  top: 1rem;
  display: flex;
  column-gap: 1rem;
  z-index: 999;
  padding: 0 1rem;
  > div {
    display: flex;
    column-gap: 1rem;
  }
`;
export const PlotOption = styled(Link)`
  display: flex;
  color: var(--joy-palette-primary-plainColor);
  align-items: center;
  cursor: pointer;
  border-bottom: 1px var(--joy-palette-primary-plainColor) solid;
  background: var(--joy-palette-neutral-softBg);
  border-top-left-radius: 3px;
  border-top-right-radius: 3px;
  padding: 0.25rem;
`;
export const WarningsContainer = styled.ul`
  position: absolute;
  top: 3rem;
  z-index: 999;
  list-style: none;
  padding-inline-start: 0;
  background: var(--joy-palette-background-level1);
  > li {
    margin: 1rem 0;
  }
`;
export const WarningItem = styled.li`
  display: flex;
  column-gap: 1rem;
  color: var(--joy-palette-text-plainColor);
  padding: 0 2.5rem 0 1rem;
  border-radius: 3px;
  list-style: none;
  svg {
    position: relative;
    top: 3px;
  }
`;
export const WarningClose = styled.div`
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  cursor: pointer;
`;
