import { FilterAndSelectionIndicator } from "@fiftyone/components";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { BUILT_IN_PANEL_PRIORITY_CONST } from "@fiftyone/utilities";
import AppsIcon from "@mui/icons-material/Apps";
import { useRecoilValue, useResetRecoilState } from "recoil";
import styled from "styled-components";
import Grid from "../components/Grid";
import Header from "../components/Grid/Header";
import SamplesScopeTab from "../components/Grid/Selection/ScopeTab";

const Container = styled.div`
  position: relative;
  padding: 0;
  height: 100%;
  overflow-y: hidden;
`;

registerComponent({
  name: "Samples",
  label: "Samples",
  component: () => {
    return (
      <Container>
        <Grid key={"grid"} />
        <Header key={"header"} />
      </Container>
    );
  },
  type: PluginComponentType.Panel,
  Icon: AppsIcon,
  activator: () => true,
  panelOptions: {
    TabIndicator,
    TabLabel: SamplesScopeTab,
    priority: BUILT_IN_PANEL_PRIORITY_CONST,
  },
});

/**
 * Only the similarity-sort reset lives in the tab. The selection itself is
 * stated, counted, and cleared in the selection tray below the grid.
 */
function TabIndicator() {
  const similarityParameters = useRecoilValue(fos.similarityParameters);
  const resetSimilarityParameters = useResetRecoilState(
    fos.similarityParameters,
  );

  return (
    <FilterAndSelectionIndicator
      filterCount={similarityParameters ? "" : undefined}
      filterTitle="Reset sort by similarity"
      onClickFilter={resetSimilarityParameters}
    />
  );
}
