import Color from "color";
import styled from "styled-components";

export const SamplesHeader = styled.div`
  position: absolute;
  top: 0;
  display: flex;
  padding: 0.5rem;
  justify-content: space-between;
  overflow: visible;
  width: 100%;
  background-image: linear-gradient(
    to top,
    ${({ theme }) => Color(theme.background.mediaSpace).alpha(0.0).toString()}
      0%,
    ${({ theme }) => theme.background.mediaSpace} 100%
  );
  gap: 8px;
`;

/** The grid's actions row, above the sidebar and the grid in the Samples panel */
export const ActionsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 8px 16px 6px;
  min-width: 0;
`;

export const RightDiv = styled.div`
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
  border-color: ${({ theme }) => theme.primary.plainBorder};
  border-right-style: solid;
  border-right-width: 1px;
  margin: 0 0.25rem;
  padding-right: 1rem;
  font-weight: bold;
`;

export const RightContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
`;

export const SliderContainer = styled.div`
  display: flex;
  align-items: center;
  width: 7.375rem;
  padding-right: 0.375rem;
`;
