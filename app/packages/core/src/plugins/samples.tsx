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
  ImageSearchIcon,
  Pill,
  Size,
  TextColor,
} from "@voxel51/voodo";
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useRef,
  useState,
} from "react";
import styled from "styled-components";
import Header from "../components/Grid/Header";
import { ACTIONS_ROW_HEIGHT } from "../components/Grid/Header/Containers";
import { FieldActionContext, GridSidebar } from "@fiftyone/sidebar";
import { QuickEditEntry } from "../components/Modal/Sidebar/Annotate";
import SchemaLensRow from "../components/SchemaLens/SchemaLensRow";
import useSidebarSlide from "./useSidebarSlide";

const Panel = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

const Container = styled.div`
  position: relative;
  display: flex;
  flex: 1;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
  padding: 0 8px 8px;
  box-sizing: border-box;
`;

// The grid scrolls up under the actions row; the sidebar sits below it
/**
 * Where the grid's loading overlay renders: across the whole panel body,
 * over the grid and under the sidebar.
 */
export const GridBackdropContext = createContext<HTMLElement | null>(null);

const Backdrop = styled.div`
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
`;

const Sidebar = styled.div`
  position: relative;
  z-index: 3;
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

const SamplesPanel = ({ grid }: { grid: ReactNode }) => {
  const showSidebar = useReverbValue(fos.sidebarVisible(false));
  const setShowSidebar = useSetReverbState(fos.sidebarVisible(false));
  const { gridStyle, rendered, sidebar, sidebarStyle } =
    useSidebarSlide(showSidebar);
  const [backdrop, setBackdrop] = useState<HTMLDivElement | null>(null);

  return (
    <Panel>
      <Header />
      <Container>
        {rendered && (
          <Sidebar ref={sidebar} style={sidebarStyle}>
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
        <GridArea style={gridStyle}>
          <GridBackdropContext.Provider value={backdrop}>
            {grid}
          </GridBackdropContext.Provider>
        </GridArea>
        <Backdrop ref={setBackdrop} />
      </Container>
    </Panel>
  );
};

/** Registers the Samples panel around the grid that renders its items */
export const registerSamplesPanel = (GridComponent: ComponentType) =>
  registerComponent({
    name: "Samples",
    label: "Samples",
    component: () => <SamplesPanel grid={<GridComponent />} />,
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
          backgroundColor={BackgroundColor.CardElevated}
          color={TextColor.Primary}
          data-cy="selection-count-container"
          title="Clear selection"
          onRemove={resetSelectedSamples}
        >
          {selectedSamples.size.toLocaleString()} selected
        </Pill>
      ) : null}
    </Indicators>
  );
}

/** What the grid shows, once it is counted. */
export function SampleCount() {
  const count = useReverbValueLoadable(
    fos.count({ path: "", extended: true, modal: false }),
  );
  // a recount keeps the last total rather than dropping the pill
  const last = useRef<number>();
  if (count.state === "hasValue" && typeof count.contents === "number") {
    last.current = count.contents;
  }
  if (last.current === undefined) return null;

  return (
    <Pill
      size={Size.Xs}
      backgroundColor={BackgroundColor.CardElevated}
      color={TextColor.Secondary}
      data-cy="samples-tab-count"
    >
      {last.current.toLocaleString()}
    </Pill>
  );
}
