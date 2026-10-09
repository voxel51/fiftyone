import { animated } from "@react-spring/web";
import styled from "styled-components";

export const SidebarColumn = styled.div`
  position: relative;
  max-height: 100%;
  width: 100%;
  flex: 1;

  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 8px;
  box-sizing: border-box;
  scrollbar-gutter: stable;

  &::-webkit-scrollbar {
    width: 10px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: color-mix(
      in srgb,
      var(--color-content-text-primary) 14%,
      transparent
    );
    background-clip: content-box;
    border: 3px solid transparent;
    border-radius: 9999px;
    min-height: 32px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background-color: color-mix(
      in srgb,
      var(--color-content-text-primary) 26%,
      transparent
    );
  }

  /* Chromium drops the pseudo-elements above once scrollbar-width is set */
  @supports not selector(::-webkit-scrollbar) {
    scrollbar-width: thin;
    scrollbar-color: color-mix(
        in srgb,
        var(--color-content-text-primary) 14%,
        transparent
      )
      transparent;
  }

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
