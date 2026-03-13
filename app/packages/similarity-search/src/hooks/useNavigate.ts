import { usePanelStatePartial } from "@fiftyone/spaces";
import { useCallback } from "react";

type ViewState = {
  page: "home" | "new_search" | "similarity_index";
};

type NavigateResult = {
  page: string;
  navigateHome: () => void;
  navigateNewSearch: () => void;
  navigateSimilarityIndex: () => void;
};

/**
 * Hook for panel page navigation.
 */
export const useNavigate = (): NavigateResult => {
  const [viewState, setViewState] = usePanelStatePartial<ViewState>("view", {
    page: "home",
  });

  const navigateHome = useCallback(() => {
    setViewState({ page: "home" });
  }, [setViewState]);

  const navigateNewSearch = useCallback(() => {
    setViewState({ page: "new_search" });
  }, [setViewState]);

  const navigateSimilarityIndex = useCallback(() => {
    setViewState({ page: "similarity_index" });
  }, [setViewState]);

  return {
    page: viewState?.page ?? "home",
    navigateHome,
    navigateNewSearch,
    navigateSimilarityIndex,
  };
};
