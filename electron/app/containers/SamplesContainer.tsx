import React, { useState, useEffect, useRef, useContext } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import styled, { ThemeContext } from "styled-components";

import { Grid, Sticky } from "semantic-ui-react";

import DisplayOptionsSidebar from "../components/DisplayOptionsSidebar";
import ImageContainerHeader from "../components/ImageContainerHeader";
import Samples from "../components/Samples";
import ViewBar from "../components/ViewBar/ViewBar";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";
import { useResizeHandler, useScrollHandler } from "../utils/hooks";
import { makeLabelNameGroups } from "../utils/labels";

const Root = styled.div`
  .ui.grid > .sidebar-column {
    flex: 0 0 17rem;
    z-index: 400;
    margin-right: -0.5em;
    width: 400px;
  }

  .ui.grid > .content-column {
    flex: 1;
  }
`;

const DisplayOptionsWrapper = (props) => {
  const {
    containerRef,
    sidebarRef,
    sidebarHeight,
    displayProps,
    headerHeight,
  } = props;
  const {
    activeTags,
    activeLabels,
    activeOther,
    setActiveTags,
    setActiveLabels,
    setActiveOther,
  } = displayProps;
  const labelSampleCounts = useRecoilValue(selectors.labelSampleCounts);
  const filteredLabelSampleCounts = useRecoilValue(
    selectors.filteredLabelSampleCounts
  );
  const tagNames = useRecoilValue(selectors.tagNames);
  const tagSampleCounts = useRecoilValue(selectors.tagSampleCounts);
  const filteredTagSampleCounts = useRecoilValue(
    selectors.filteredTagSampleCounts
  );
  const filters = useRecoilValue(selectors.labelFilters);
  const setModalFilters = useSetRecoilState(selectors.modalLabelFilters);
  const labelNameGroups = useRecoilValue(selectors.labelNameGroups);

  useEffect(() => {
    setModalFilters(filters);
  }, [filters]);

  const getDisplayOptions = (values, filteredCounts, totalCounts, selected) => {
    return [...values].sort().map(({ name, type }) => ({
      name,
      type,
      totalCount: totalCounts[name],
      filteredCount: filteredCounts[name],
      selected: Boolean(selected[name]),
    }));
  };
  const handleSetDisplayOption = (setSelected) => (entry) => {
    setSelected((selected) => ({
      ...selected,
      [entry.name]: entry.selected,
    }));
  };

  return (
    <Grid.Column className="sidebar-column">
      <Sticky
        context={containerRef}
        offset={headerHeight}
        styleElement={{
          paddingTop: "1rem",
          width: 240,
        }}
      >
        <DisplayOptionsSidebar
          tags={getDisplayOptions(
            tagNames.map((t) => ({ name: t })),
            filteredLabelSampleCounts,
            tagSampleCounts,
            activeTags
          )}
          labels={getDisplayOptions(
            labelNameGroups.labels,
            filteredLabelSampleCounts,
            labelSampleCounts,
            activeLabels
          )}
          onSelectTag={handleSetDisplayOption(setActiveTags)}
          onSelectLabel={handleSetDisplayOption(setActiveLabels)}
          scalars={getDisplayOptions(
            labelNameGroups.scalars,
            filteredLabelSampleCounts,
            labelSampleCounts,
            activeOther
          )}
          onSelectScalar={handleSetDisplayOption(setActiveOther)}
          unsupported={getDisplayOptions(
            labelNameGroups.unsupported,
            filteredLabelSampleCounts,
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
  );
};

const SamplesContainer = (props) => {
  const [showSidebar, setShowSidebar] = useRecoilState(atoms.sidebarVisible);

  const theme = useContext(ThemeContext);

  const containerRef = useRef();
  const stickyHeaderRef = useRef();
  const sidebarRef = useRef();
  const [sidebarHeight, setSidebarHeight] = useState("unset");
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
      <Sticky
        ref={stickyHeaderRef}
        context={containerRef}
        styleElement={{
          background: theme.background,
        }}
      >
        <ViewBar />
        <ImageContainerHeader
          showSidebar={showSidebar}
          onShowSidebar={setShowSidebar}
        />
      </Sticky>
      <Grid>
        {showSidebar ? (
          <DisplayOptionsWrapper
            sidebarRef={sidebarRef}
            stickyHeaderRef={stickyHeaderRef}
            containerRef={containerRef}
            sidebarHeight={sidebarHeight}
            headerHeight={headerHeight}
            {...props}
          />
        ) : null}
        <Grid.Column className="content-column">
          <Samples {...props} />
        </Grid.Column>
      </Grid>
    </Root>
  );
};

export default SamplesContainer;
