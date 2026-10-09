import { FilterAndSelectionIndicator } from "@fiftyone/components";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { BUILT_IN_PANEL_PRIORITY_CONST } from "@fiftyone/utilities";
import {
  useReverbValue,
  useReverbValueLoadable,
  useResetReverbState,
  useSetReverbState,
} from "@fiftyone/reverb";
import {
  BackgroundColor,
  CloseIcon,
  getColorCssVar,
  GridViewIcon,
  IconAction,
  Pill,
  Size,
  TextColor,
} from "@voxel51/voodo";
import styled from "styled-components";
import Grid from "../components/Grid";
import Header from "../components/Grid/Header";
import { FieldActionContext, GridSidebar } from "@fiftyone/sidebar";
import { QuickEditEntry } from "../components/Modal/Sidebar/Annotate";
import SchemaLensRow from "../components/SchemaLens/SchemaLensRow";

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

const Container = styled.div`
  display: flex;
  flex: 1;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
  padding: 0 8px 8px;
  box-sizing: border-box;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;

  & > [data-cy="schema-lens-row"] {
    flex: 1;
    min-width: 0;
  }

  & > [data-cy="sidebar-close"] {
    margin-left: auto;
  }
`;

const GridArea = styled.div`
  position: relative;
  flex: 1;
  min-width: 0;
  height: 100%;
`;

// Tiles scrolling up under the actions row fade out rather than cut off
const ScrollFade = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 24px;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    var(--color-content-bg-background),
    transparent
  );
`;

const SamplesPanel = () => {
  const showSidebar = useReverbValue(fos.sidebarVisible(false));
  const setShowSidebar = useSetReverbState(fos.sidebarVisible(false));

  return (
    <Panel>
      <Header />
      <Container>
        {showSidebar && (
          <FieldActionContext.Provider value={QuickEditEntry}>
            <GridSidebar
              header={
                <HeaderRow>
                  <SchemaLensRow padded={false} />
                  <IconAction
                    aria-label="Hide sidebar"
                    data-cy="sidebar-close"
                    icon={CloseIcon}
                    size={Size.Sm}
                    title="Hide sidebar"
                    style={{ color: getColorCssVar(TextColor.Secondary) }}
                    onClick={() => setShowSidebar(false)}
                  />
                </HeaderRow>
              }
            />
          </FieldActionContext.Provider>
        )}
        <GridArea>
          <Grid key={"grid"} />
          <ScrollFade />
        </GridArea>
      </Container>
    </Panel>
  );
};

registerComponent({
  name: "Samples",
  label: "Samples",
  component: SamplesPanel,
  type: PluginComponentType.Panel,
  Icon: GridViewIcon,
  activator: () => true,
  panelOptions: { TabIndicator, priority: BUILT_IN_PANEL_PRIORITY_CONST },
});

function TabIndicator() {
  const similarityParameters = useReverbValue(fos.similarityParameters);
  const resetSimilarityParameters = useResetReverbState(
    fos.similarityParameters,
  );
  const selectedSamples = useReverbValue(fos.selectedSamples);
  const resetSelectedSamples = useResetReverbState(fos.selectedSamples);

  const selectedSamplesCount = selectedSamples.size;

  return (
    <>
      <SampleCount />
      <FilterAndSelectionIndicator
        filterCount={similarityParameters ? "" : undefined}
        filterTitle="Reset sort by similarity"
        onClickFilter={resetSimilarityParameters}
        selectionCount={
          selectedSamplesCount > 0 ? selectedSamplesCount.toString() : undefined
        }
        onClickSelection={resetSelectedSamples}
      />
    </>
  );
}

/** What the grid shows, once it is counted. */
function SampleCount() {
  const count = useReverbValueLoadable(
    fos.count({ path: "", extended: true, modal: false }),
  );
  if (count.state !== "hasValue") return null;

  return (
    <Pill
      size={Size.Xs}
      backgroundColor={BackgroundColor.CardElevated}
      color={TextColor.Secondary}
      data-cy="samples-tab-count"
    >
      {(count.contents as number).toLocaleString()}
    </Pill>
  );
}
