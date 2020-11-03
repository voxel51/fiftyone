import React, { useEffect, useRef } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";

import DisplayOptionsSidebar from "../components/DisplayOptionsSidebar";
import ContainerHeader from "../components/ImageContainerHeader";
import Samples from "../components/Samples";
import ViewBar from "../components/ViewBar/ViewBar";
import { scrollbarStyles } from "../components/utils";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";

const SidebarColumn = styled.div`
  ${scrollbarStyles}
  z-index: 400;
  height: 100%;
  overflow-y: scroll;
  width 256px;
`;

const ContentColumn = styled.div`
  flex: 1;
  height: 100%;
`;

const DisplayOptionsWrapper = () => {
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
    <SidebarColumn>
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
    </SidebarColumn>
  );
};

const Container = styled.div`
  display: flex;
  justify-content: space-between;
  height: 100%;
  margin-right: -1rem;
  height: calc(100% - 129px);
`;

const SamplesContainer = (props) => {
  const [showSidebar, setShowSidebar] = useRecoilState(atoms.sidebarVisible);

  return (
    <>
      <ViewBar />
      <ContainerHeader
        showSidebar={showSidebar}
        onShowSidebar={setShowSidebar}
      />
      <Container>
        {showSidebar ? <DisplayOptionsWrapper /> : null}
        <ContentColumn>
          <Samples {...props} />
        </ContentColumn>
      </Container>
    </>
  );
};

export default SamplesContainer;
