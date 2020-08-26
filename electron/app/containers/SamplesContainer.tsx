import React, { useState, useEffect, useRef } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";

import { Grid, Sticky } from "semantic-ui-react";

import DisplayOptionsSidebar from "../components/DisplayOptionsSidebar";
import ImageContainerHeader from "../components/ImageContainerHeader";
import Samples from "../components/Samples";
import ViewBar from "../components/ViewBar/ViewBar";
import { VerticalSpacer } from "../components/utils";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { useResizeHandler, useScrollHandler } from "../utils/hooks";
import { VALID_LABEL_TYPES, VALID_SCALAR_TYPES } from "../utils/labels";

const Root = styled.div`
  .ui.grid > .sidebar-column {
    flex: 0 0 17rem;
    z-index: 400;
    margin-right: -0.5em;
  }

  .ui.grid > .content-column {
    flex: 1;
  }
`;

const SamplesContainer = (props) => {
  const {
    activeTags,
    activeLabels,
    activeOther,
    setActiveTags,
    setActiveLabels,
    setActiveOther,
    labelData,
  } = props.displayProps;

  const [showSidebar, setShowSidebar] = useRecoilState(atoms.sidebarVisible);
  const [sidebarHeight, setSidebarHeight] = useState("unset");
  const [stuck, setStuck] = useState(false);
  const datasetName = useRecoilValue(selectors.datasetName);
  const numSamples = useRecoilValue(selectors.numSamples);
  const tagNames = useRecoilValue(selectors.tagNames);
  const tagSampleCounts = useRecoilValue(selectors.tagSampleCounts);
  const fieldSchema = useRecoilValue(selectors.fieldSchema);
  const labelNames = useRecoilValue(selectors.labelNames);
  const labelTypes = useRecoilValue(selectors.labelTypes);
  const labelSampleCounts = useRecoilValue(selectors.labelSampleCounts);
  const colorMapping = useRecoilValue(selectors.labelColorMapping);

  const containerRef = useRef();
  const stickyHeaderRef = useRef();
  const sidebarRef = useRef();

  const labelNameGroups = {
    labels: [],
    scalars: [],
    unsupported: [],
  };
  for (const name of labelNames) {
    if (VALID_LABEL_TYPES.includes(labelTypes[name])) {
      labelNameGroups.labels.push({ name, type: labelTypes[name] });
    } else if (VALID_SCALAR_TYPES.includes(fieldSchema[name])) {
      labelNameGroups.scalars.push({ name });
    } else {
      labelNameGroups.unsupported.push({ name });
    }
  }

  const getDisplayOptions = (values, counts, selected) => {
    return [...values].sort().map(({ name, type }) => ({
      name,
      type,
      count: counts[name],
      selected: Boolean(selected[name]),
    }));
  };
  const handleSetDisplayOption = (selected, setSelected) => (entry) => {
    setSelected((selected) => ({
      ...selected,
      [entry.name]: entry.selected,
    }));
  };

  let headerHeight = 0;
  if (stickyHeaderRef.current && stickyHeaderRef.current.stickyRect) {
    headerHeight = stickyHeaderRef.current.stickyRect.height;
  }

  const updateSidebarHeight = () => {
    if (sidebarRef.current) {
      setSidebarHeight(
        window.innerHeight - sidebarRef.current.getBoundingClientRect().top
      );
    }
  };
  useResizeHandler(updateSidebarHeight, [sidebarRef.current]);
  useScrollHandler(updateSidebarHeight, [sidebarRef.current]);
  useEffect(updateSidebarHeight, []);

  return (
    <Root ref={containerRef} showSidebar={showSidebar}>
      <VerticalSpacer opaque height={5} />
      <Sticky
        ref={stickyHeaderRef}
        context={containerRef}
        onStick={() => setStuck(true)}
        onUnstick={() => setStuck(false)}
      >
        <ViewBar />
        <VerticalSpacer opaque height={5} />
        <ImageContainerHeader
          datasetName={datasetName}
          total={numSamples}
          showSidebar={showSidebar}
          onShowSidebar={setShowSidebar}
        />
        <VerticalSpacer opaque height={5} />
      </Sticky>
      <Grid>
        {showSidebar ? (
          <Grid.Column className="sidebar-column">
            <Sticky context={containerRef} offset={headerHeight}>
              <DisplayOptionsSidebar
                colorMapping={colorMapping}
                tags={getDisplayOptions(
                  tagNames.map((t) => ({ name: t })),
                  tagSampleCounts,
                  activeTags
                )}
                labels={getDisplayOptions(
                  labelNameGroups.labels,
                  labelSampleCounts,
                  activeLabels
                )}
                onSelectTag={handleSetDisplayOption(activeTags, setActiveTags)}
                onSelectLabel={handleSetDisplayOption(
                  activeLabels,
                  setActiveLabels
                )}
                scalars={getDisplayOptions(
                  labelNameGroups.scalars,
                  labelSampleCounts,
                  activeOther
                )}
                onSelectScalar={handleSetDisplayOption(
                  activeOther,
                  setActiveOther
                )}
                unsupported={getDisplayOptions(
                  labelNameGroups.unsupported,
                  labelSampleCounts,
                  activeLabels
                )}
                style={{
                  maxHeight: sidebarHeight,
                  overflowY: "auto",
                  overflowX: "hidden",
                  paddingRight: 25,
                  marginRight: -25,
                  scrollbarWidth: "thin",
                }}
                ref={sidebarRef}
              />
            </Sticky>
          </Grid.Column>
        ) : null}
        <Grid.Column className="content-column">
          <Samples {...props} />
        </Grid.Column>
      </Grid>
    </Root>
  );
};

export default SamplesContainer;
