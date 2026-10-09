import { animated } from "@react-spring/web";
import styled from "styled-components";

export const SidebarColumn = styled.div`
  position: relative;
  max-height: 100%;
  width: 100%;
  flex: 1;

  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  scrollbar-width: thin;

  background: var(--color-content-bg-card);
`;

export const Container = animated(styled.div`
  position: relative;
  min-height: 100%;
  scrollbar-width: none;

  & > div {
    position: absolute;
    transform-origin: 50% 50% 0px;
    touch-action: none;
    width: 100%;
  }
`);
