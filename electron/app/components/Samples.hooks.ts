import { useEffect, useMemo, useState } from "react";
import { useMessageHandler, useSendMessage } from "../utils/hooks";
import tile from "../utils/tile";

export default () => {
  const [state, setState] = useState({
    initialized: false,
    loadMore: false,
    isLoading: false,
    hasMore: true,
    pageToLoad: 1,
    rows: [],
    remainder: [],
  });

  useMessageHandler("page", ({ results, more }) => {
    setState(tile(results, more, state));
  });

  const guard = useMemo(() => {
    return !state.loadMore || state.isLoading || !state.hasMore;
  }, [state.loadMore, state.pageToLoad, state.hasMore]);

  useEffect(() => {
    !guard &&
      setState({
        ...state,
        isLoading: true,
        loadMore: false,
        initialized: true,
      });
  }, [guard]);

  // useSendMessage("page", { page: state.pageToLoad }, guard);

  return [state, setState];
};
