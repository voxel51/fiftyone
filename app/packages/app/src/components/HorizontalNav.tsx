import React, { useState } from "react";
import { capitalize } from "@material-ui/core";
import { Assessment, Fullscreen, FullscreenExit } from "@material-ui/icons";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";

import { PillButton } from "./utils";
import Distributions from "./Distributions";
import { useWindowSize } from "../utils/hooks";
import { Resizable } from "re-resizable";
import { PluginComponentType, useActivePlugins } from "@fiftyone/plugins";

import * as fos from "@fiftyone/state";

export type Props = {
};

const Container = styled(Resizable)`
  padding: 1rem 0 0;
  background-color: ${({ theme }) => theme.backgroundDark};
  border-bottom: 1px ${({ theme }) => theme.backgroundDarkBorder} solid;
`;

const Nav = styled.div`
  padding: 0 1rem;
  width: 100%;
  display: flex;
  justify-content: space-between;
`;

const NavButtons = styled.div`
  display: flex;
  justify-content: space-between;
`;

const PlotsButtons = styled.div`
  padding-bottom: 1rem;
`;

const PlotButton = styled.div`
  height: 1.5rem;
  line-height: 1.5rem;
  margin: 0.25rem 0.25rem 0.25rem 0;
  cursor: pointer;
  display: inline-block;
  margin-right: 5px;
  padding: 0 1em;
  color: ${({ theme }) => theme.font};
  background-color: ${({ theme }) => theme.backgroundLight};
  text-decoration: none;
  border-radius: 2px;
  font-weight: bold;

  &.active {
    background-color: ${({ theme }) => theme.secondary};
  }
`;

const ToggleMaximizeContainer = styled.div`
  cursor: pointer;
  width: 1.5rem;
  height: 1.5rem;
  margin: 0.25rem;
`;

const ToggleMaximize = React.memo(
  ({
    maximized,
    setMaximized,
  }: {
    maximized: boolean;
    setMaximized: (value: boolean) => void;
  }) => {
    return (
      <ToggleMaximizeContainer onClick={() => setMaximized(!maximized)}>
        {maximized ? <FullscreenExit /> : <Fullscreen />}
      </ToggleMaximizeContainer>
    );
  }
);

const DISTRIBUTION_PLOTS = [
  "Sample tags",
  "Label tags",
  "Labels",
  "Other fields",
];

const HorizontalNav = ({}: Props) => {
  const { height: windowHeight } = useWindowSize();
  const [activePlot, setActivePlot] = useRecoilState(fos.activePlot);
  const [expanded, setExpanded] = useState(false);
  const [openedHeight, setOpenedHeight] = useState(392);
  const [maximized, setMaximized] = useState(false);
  const closedHeight = 64;

  const height = expanded ? openedHeight : closedHeight;
  const elementNames = useRecoilValue(fos.elementNames);
  const pluginPlots = useActivePlugins(PluginComponentType.Plot, { dataset });
  const pluginPlotLabels = pluginPlots.map((p) => p.label);

  const buttonLabels = [...DISTRIBUTION_PLOTS, ...pluginPlotLabels];

  return (
    <Container
      size={{ height: maximized ? windowHeight - 73 : height }}
      minHeight={closedHeight}
      enable={{
        top: false,
        right: false,
        bottom: expanded && !maximized,
        left: false,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      onResizeStop={(e, direction, ref, d) => {
        setOpenedHeight(height + d.height);
      }}
    >
      <Nav>
        <PlotsButtons>
          {buttonLabels.map((e) => (
            <PlotButton
              key={e}
              className={e === activePlot && expanded ? "active" : ""}
              onClick={() => {
                if (expanded && activePlot === e) {
                  setExpanded(false);
                } else {
                  setExpanded(true);
                  setActivePlot(e);
                }
              }}
            >
              {e === "Sample tags"
                ? `${capitalize(elementNames.singular)} tags`
                : e}
            </PlotButton>
          ))}
        </PlotsButtons>
        <NavButtons>
          {expanded && (
            <ToggleMaximize
              maximized={maximized}
              setMaximized={() => {
                setMaximized(!maximized);
                setExpanded(true);
              }}
            />
          )}
          <PillButton
            onClick={() => {
              setExpanded(!expanded);
              expanded && setMaximized(false);
            }}
            text={expanded ? "Hide" : "Show"}
            open={expanded}
            icon={<Assessment />}
            highlight={!expanded}
            arrow={true}
            style={{ height: "2rem" }}
          />
        </NavButtons>
      </Nav>
      {expanded ? (
        <ActivePlot
          key={activePlot}
          active={activePlot}
          pluginPlotLabels={pluginPlotLabels}
          distributionPlots={DISTRIBUTION_PLOTS}
          pluginPlots={pluginPlots}
        />
      ) : null}
    </Container>
  );
};

function ActivePlot({
  active,
  pluginPlots,
  pluginPlotLabels,
  distributionPlots,
}) {
  const isPluginPlot = pluginPlotLabels.includes(active);
  const isDistPlot = distributionPlots.includes(active);
  const plugin = isPluginPlot
    ? pluginPlots.find((p) => p.label === active)
    : null;

  if (isDistPlot) return <Distributions key={active} group={active} />;
  if (plugin) {
    return <plugin.component dataset={useRecoilValue(atoms.dataset)} />;
  }

  return null;
}

export default HorizontalNav;
