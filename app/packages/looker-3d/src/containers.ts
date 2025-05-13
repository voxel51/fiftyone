import styled from "styled-components";

export const ActionItem = styled.div`
  display: flex;
  align-content: center;
  text-align: center;
  cursor: pointer;
  color: var(--fo-palette-text-secondary);
  -webkit-transition: 0.2s ease-in-out;
  -moz-transition: 0.2s ease-in-out;
  -o-transition: 0.2s ease-in-out;
  transition: 0.2s ease-in-out;

  &:hover {
    transform: translate(0, -1px);
  }
`;

export const ActionBarContainer = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  opacity: 1;
  z-index: 20000;
  justify-items: center;
  align-items: center;
  display: flex;

  color: #eee;

  -webkit-transition: opacity 0.5s;
  -moz-transition: opacity 0.5s;
  -o-transition: opacity 0.5s;
  -ms-transition: opacity 0.5s;
  transition: opacity 0.5s;
  width: 100%;

  opacity: 0.95;
  min-height: 37px;
  max-height: 200px;
  background-color: var(--fo-palette-background-level3);
  border: 1px solid var(--fo-palette-primary-plainBorder);
  border-left: 0;
  padding: 0 1rem;
`;

export const ActionsBar = styled.div`
  position: relative;
  display: flex;
  flex-grow: 1;
  justify-content: end;
  row-gap: 0.5rem;
  column-gap: 0.75rem;
  align-items: center;
  height: 2.3rem;
`;

export const ActionPopOverDiv = styled.div`
  width: 20rem;
  position: absolute;
  bottom: 2.5rem;
  background-color: var(--fo-palette-background-level2);
  border: 1px solid var(--fo-palette-primary-plainBorder);
  box-shadow: 0 8px 15px 0 var(--fo-palette-neutral-softBg);
  border-radius: 3px;
  color: var(--fo-palette-text-secondary);
  overflow: hidden;
`;

export const ActionPopOverInner = styled.div`
  padding: 0 0.25rem;
`;

export const Container = styled.div`
  height: 100%;
  width: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-x: hidden;
`;

export const StatusBarRootContainer = styled.div`
  position: absolute;
  bottom: 3em;
  margin-bottom: 3vh;
  left: 1vw;
  z-index: 1000;
  width: 100%;

  & .looker-3d-core-stats-panel {
    position: relative !important;
  }
`;

export const NodeInfoRootContainer = styled.div`
  display: flex;
  flex-direction: column;
  position: absolute;
  top: 3em;
  margin-top: 2vh;
  right: 1vw;
  z-index: 1000;
`;

export const StatusBarContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 150px;
`;

export const PerfStatsContainer = styled.div`
  position: fixed;
  bottom: 0;
  right: 2em;
  opacity: 0.5;
  border-radius: 8px;
  padding: 16px 24px 12px 24px;
  min-width: 240px;
  box-shadow: none;
  backdrop-filter: blur(4px);
  z-index: 1000;
  color: #e0e0e0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  letter-spacing: 0.01em;
  align-items: stretch;
  user-select: none;
`;

export const StatRowContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5em;
  width: 100%;
  min-height: 28px;
`;

export const StatLabelContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
  font-weight: 400;
  opacity: 0.85;
  font-size: 14px;
`;

export const StatIconWrapper = styled.span<{ color: string }>`
  color: ${(props) => props.color};
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const StatValueContainer = styled.span`
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: #bdbdbd;
  font-size: 14px;
  min-width: 60px;
  text-align: right;
`;

export const StatBarOuterContainer = styled.div`
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 3px;
  margin-top: 2px;
  margin-bottom: 2px;
  overflow: hidden;
`;

export const StatBarInner = styled.div<{ width: string; background: string }>`
  width: ${(props) => props.width};
  height: 100%;
  background: ${(props) => props.background};
  border-radius: 3px;
  transition: width 0.4s cubic-bezier(0.4, 2, 0.6, 1);
`;

export const StatsRowWrapper = styled.div`
  width: 100%;
`;

export const StatusBarInfoContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding-left: 1em;
  justify-content: space-between;
  position: relative;
  height: 100%;
  width: 100%;
  background-color: hsl(208.46deg 87% 53% / 20%);
`;

export const StatusBarHeaderContainer = styled.div`
  display: flex;
  width: 100%;
  justify-content: right;
  background-color: rgb(255 109 5 / 6%);
`;

export const CameraInfoContainer = styled.div`
  display: flex;
  align-items: center;
  opacity: 0.5;
`;

export const CameraPositionText = styled.div`
  margin-left: 0.5em;
  margin-top: -5px;
`;

export const PerfStatsHeaderContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
`;

export const PerfStatsFPSValue = styled.span<{ color: string }>`
  color: ${(props) => props.color};
  margin-left: 6px;
`;

export const PerfStatsDivider = styled.hr`
  border: none;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 4px 0 2px 0;
`;

export const ViewButton = styled.div`
  line-height: 1rem;
  padding: 3px 6px;
  background-color: var(--fo-palette-text-secondary);
  color: var(--fo-palette-text-invert);
  border-radius: 1rem;
  border: none;
  font-weight: bold;
  display: flex;
  justify-content: space-between;
  opacity: 1;
`;
