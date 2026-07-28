import { usePanelContext } from "@fiftyone/spaces";
import { Spinner } from "@voxel51/voodo";
import { Suspense } from "react";
import { SimilaritySearchViewProps } from "../types";
import { useSimilarityPanel } from "../hooks/useSimilarityPanel";
import RunList from "./Home/RunList";
import NewSearch from "./NewSearch/NewSearch";
import SimilarityIndex from "./SimilarityIndex/SimilarityIndex";
import SimilaritySearchCTA from "./SimilaritySearchCTA";
import { FullCenter, FullSize } from "./styled";

function SimilaritySearchReady(props: SimilaritySearchViewProps) {
  const panel = useSimilarityPanel(props);

  if (!panel.loaded) {
    return (
      <FullCenter>
        <Spinner />
      </FullCenter>
    );
  }

  if (panel.brainKeys.length === 0 && panel.runs.length === 0) {
    return <SimilaritySearchCTA mode="onboarding" />;
  }

  return (
    <FullSize>
      {panel.page === "home" && (
        <RunList
          runs={panel.runs}
          filteredRuns={panel.filteredRuns}
          brainKeys={panel.brainKeys}
          appliedRunId={panel.appliedRunId}
          sampleMedia={panel.sampleMedia}
          onApply={panel.handleApply}
          onClone={panel.handleClone}
          onDelete={panel.handleDelete}
          onBulkDelete={panel.handleBulkDelete}
          onRename={panel.handleRename}
          onRefresh={panel.refreshRuns}
          onNewSearch={panel.handleNewSearch}
          onSettings={panel.navigateSimilarityIndex}
          onGetSampleMedia={panel.getSampleMedia}
          filterState={panel.filterState}
          onFilterChange={panel.setFilterState}
          canFilterByOwner={panel.canFilterByOwner}
          selection={panel.selection}
        />
      )}
      {panel.page === "new_search" && (
        <NewSearch
          brainKeys={panel.brainKeys}
          cloneConfig={panel.cloneConfig}
          isPatchesView={panel.isPatchesView}
          isReadOnly={panel.isReadOnly}
          onBack={panel.navigateHome}
          onSubmitted={panel.handleSubmitted}
        />
      )}
      {panel.page === "similarity_index" && (
        <SimilarityIndex
          brainKeys={panel.brainKeys}
          onBack={panel.navigateHome}
        />
      )}
    </FullSize>
  );
}

export default function SimilaritySearchView(props: SimilaritySearchViewProps) {
  const panelContext = usePanelContext();
  const panelId = panelContext?.node?.id;

  if (!panelId) {
    return (
      <FullCenter>
        <Spinner />
      </FullCenter>
    );
  }

  return (
    <Suspense
      fallback={
        <FullCenter>
          <Spinner />
        </FullCenter>
      }
    >
      <SimilaritySearchReady {...props} />
    </Suspense>
  );
}
