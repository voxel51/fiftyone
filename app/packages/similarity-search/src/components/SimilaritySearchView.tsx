import { usePanelContext } from "@fiftyone/spaces";
import { Spinner } from "@voxel51/voodo";
import React, { Suspense } from "react";
import { SimilaritySearchViewProps } from "../types";
import { useNavigate } from "../hooks/useNavigate";
import * as s from "./styles";

function SimilaritySearchReady(props: SimilaritySearchViewProps) {
  const { page, navigateHome, navigateNewSearch, navigateSimilarityIndex } =
    useNavigate();

  return (
    <div style={s.fullSize}>
      {page === "home" && (
        <div style={s.runListContainer}>
          <div style={s.emptyState}>
            <p>Similarity Search Runs will appear here</p>
            <button onClick={navigateNewSearch}>New Search</button>
            <button onClick={navigateSimilarityIndex}>Similarity Index</button>
          </div>
        </div>
      )}
      {page === "new_search" && (
        <div style={s.newSearchContainer}>
          <div style={s.emptyState}>
            <p>New Search form will appear here</p>
            <button onClick={navigateHome}>Back</button>
          </div>
        </div>
      )}
      {page === "similarity_index" && (
        <div style={s.newSearchContainer}>
          <div style={s.emptyState}>
            <p>Similarity Index will appear here</p>
            <button onClick={navigateHome}>Back</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SimilaritySearchView(props: SimilaritySearchViewProps) {
  const panelContext = usePanelContext();
  const panelId = panelContext?.node?.id;

  if (!panelId) {
    return (
      <div style={s.fullCenter}>
        <Spinner />
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div style={s.fullCenter}>
          <Spinner />
        </div>
      }
    >
      <SimilaritySearchReady {...props} />
    </Suspense>
  );
}
