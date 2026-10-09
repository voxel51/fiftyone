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
  CheckIcon,
  CloseIcon,
  getColorCssVar,
  GridViewIcon,
  IconAction,
  ImageSearchIcon,
  Pill,
  Size,
  TextColor,
} from "@voxel51/voodo";
import styled from "styled-components";
import Grid from "../components/Grid";
import Header from "../components/Grid/Header";
import { ACTIONS_ROW_HEIGHT } from "../components/Grid/Header/Containers";
import { FieldActionContext, GridSidebar } from "@fiftyone/sidebar";
import { QuickEditEntry } from "../components/Modal/Sidebar/Annotate";
import SchemaLensRow from "../components/SchemaLens/SchemaLensRow";

const Panel = styled.div`
  position: relative;
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

// The grid scrolls up under the actions row; the sidebar sits below it
const Sidebar = styled.div`
  display: flex;
  margin-top: ${ACTIONS_ROW_HEIGHT}px;
  min-height: 0;
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

const SamplesPanel = () => {
  const showSidebar = useReverbValue(fos.sidebarVisible(false));
  const setShowSidebar = useSetReverbState(fos.sidebarVisible(false));

  return (
    <Panel>
      <Header />
      <Container>
        {showSidebar && (
          <Sidebar>
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
          </Sidebar>
        )}
        <GridArea>
          <Grid key={"grid"} />
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

const Indicators = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

function TabIndicator() {
  const similarityParameters = useReverbValue(fos.similarityParameters);
  const resetSimilarityParameters = useResetReverbState(
    fos.similarityParameters,
  );
  const selectedSamples = useReverbValue(fos.selectedSamples);
  const resetSelectedSamples = useResetReverbState(fos.selectedSamples);

  return (
    <Indicators>
      <SampleCount />
      {similarityParameters ? (
        <Pill
          size={Size.Xs}
          icon={ImageSearchIcon}
          color={TextColor.Secondary}
          title="Reset sort by similarity"
          onRemove={resetSimilarityParameters}
        />
      ) : null}
      {selectedSamples.size > 0 ? (
        <Pill
          size={Size.Xs}
          icon={CheckIcon}
          color={TextColor.Secondary}
          data-cy="selection-count-container"
          title="Clear selection"
          onRemove={resetSelectedSamples}
        >
          {selectedSamples.size.toLocaleString()}
        </Pill>
      ) : null}
    </Indicators>
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
