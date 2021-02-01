import React, { useEffect } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";

import FieldsSidebar from "../components/FieldsSidebar";
import ContainerHeader from "../components/ImageContainerHeader";
import Samples from "../components/Samples";
import ViewBar from "../components/ViewBar/ViewBar";
import { scrollbarStyles } from "../components/utils";

import * as atoms from "../recoil/atoms";
import * as selectors from "../recoil/selectors";

const SidebarColumn = styled.div`
  ${scrollbarStyles}
  z-index: 400;
  max-height: 100%;
  overflow-y: scroll;
  overflow-x: hidden;
  width 256px;
`;

const ContentColumn = styled.div`
  flex-grow: 1;
`;

const FieldsWrapper = () => {
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
  const colorByLabel = useRecoilValue(atoms.colorByLabel);
  const setModalFilters = useSetRecoilState(selectors.modalLabelFilters);
  const labelNameGroups = useRecoilValue(selectors.labelNameGroups("sample"));

  const frameLabelNameGroups = useRecoilValue(
    selectors.labelNameGroups("frame")
  );

  useEffect(() => {
    setModalFilters(filters);
  }, [filters, colorByLabel]);

  const getDisplayOptions = (values, filteredCounts, totalCounts, selected) => {
    return [...values].sort().map(({ name, type }) => ({
      name,
      type,
      totalCount: totalCounts ? totalCounts[name] : null,
      filteredCount: filteredCounts ? filteredCounts[name] : null,
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
      <FieldsSidebar
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
        colorByLabelAtom={atoms.colorByLabel}
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
  margin-right: -1rem;
  flex-grow: 1;
  overflow: hidden;
`;

const SamplesContainer = React.memo(() => {
  const [showSidebar, setShowSidebar] = useRecoilState(atoms.sidebarVisible);

  return (
    <>
      <ViewBar />
      <ContainerHeader
        showSidebar={showSidebar}
        onShowSidebar={setShowSidebar}
      />
      <Container>
        {showSidebar ? <FieldsWrapper /> : null}
        <ContentColumn>
          <Samples />
        </ContentColumn>
      </Container>
    </>
  );
});

export default SamplesContainer;
