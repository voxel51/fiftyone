import React, { useEffect, useRef } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";

import { Grid } from "semantic-ui-react";

import DisplayOptionsSidebar from "../components/DisplayOptionsSidebar";
import ImageContainerHeader from "../components/ImageContainerHeader";
import Samples from "../components/Samples";
import ViewBar from "../components/ViewBar/ViewBar";
import { scrollbarStyles } from "./utils";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";

const Root = styled.div`
  height: 100%;
  overlflow-y: hidden;
  .ui.grid > .sidebar-column {
    ${scrollbarStyles}
    flex: 0 0 17rem;
    z-index: 400;
    margin-right: -0.5em;
  }

  .ui.grid > .content-column {
    flex: 1;
    padding-bottom: 0;
  }
`;

const DisplayOptionsWrapper = (props) => {
  const [activeTags, setActiveTags] = useRecoilState(atoms.activeTags);
  const [activeLabels, setActiveLabels] = useRecoilState(
    atoms.activeLabels("sample")
  );
  const [activeFrameLabels, setActiveFrameLabels] = useRecoilState(
    atoms.activeLabels("frame")
  );
  const [activeOther, setActiveOther] = useRecoilState(
    atoms.activeOther("sample")
  );

  const labelSampleCounts = useRecoilValue(
    selectors.labelSampleCounts("sample")
  );
  const filteredLabelSampleCounts = useRecoilValue(
    selectors.filteredLabelSampleCounts("sample")
  );
  const frameLabelSampleCounts = useRecoilValue(
    selectors.labelSampleCounts("frame")
  );
  const filteredFrameLabelSampleCounts = useRecoilValue(
    selectors.filteredLabelSampleCounts("frame")
  );

  const tagNames = useRecoilValue(selectors.tagNames);
  const tagSampleCounts = useRecoilValue(selectors.tagSampleCounts);

  const filters = useRecoilValue(selectors.labelFilters);
  const setModalFilters = useSetRecoilState(selectors.modalLabelFilters);
  const labelNameGroups = useRecoilValue(selectors.labelNameGroups("sample"));

  const frameLabelNameGroups = useRecoilValue(
    selectors.labelNameGroups("frame")
  );

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
      <DisplayOptionsSidebar
        tags={getDisplayOptions(
          tagNames.map((t) => ({ name: t })),
          filteredLabelSampleCounts,
          tagSampleCounts,
          activeTags
        )}
        frameLabels={getDisplayOptions(
          frameLabelNameGroups.labels,
          filteredFrameLabelSampleCounts,
          frameLabelSampleCounts,
          activeFrameLabels
        )}
        labels={getDisplayOptions(
          labelNameGroups.labels,
          filteredLabelSampleCounts,
          labelSampleCounts,
          activeLabels
        )}
        onSelectTag={handleSetDisplayOption(setActiveTags)}
        onSelectLabel={handleSetDisplayOption(setActiveLabels)}
        onSelectFrameLabel={handleSetDisplayOption(setActiveFrameLabels)}
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
          scrollbarWidth: "thin",
        }}
      />
    </Grid.Column>
  );
};

const SamplesContainer = (props) => {
  const [showSidebar, setShowSidebar] = useRecoilState(atoms.sidebarVisible);
  const containerRef = useRef();

  return (
    <Root ref={containerRef} showSidebar={showSidebar}>
      <ViewBar />
      <ImageContainerHeader
        showSidebar={showSidebar}
        onShowSidebar={setShowSidebar}
      />
      <Grid style={{ height: "100%", overflow: "hidden" }}>
        {showSidebar ? (
          <DisplayOptionsWrapper containerRef={containerRef} {...props} />
        ) : null}
        <Grid.Column
          className="content-column"
          style={{ height: "100%", paddingRight: 0, paddingTop: 0 }}
        >
          <Samples {...props} />
        </Grid.Column>
      </Grid>
    </Root>
  );
};

export default SamplesContainer;
