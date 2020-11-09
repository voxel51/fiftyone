import { useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { useMessageHandler, useSendMessage } from "../utils/hooks";
import tile from "../utils/tile";

import * as selectors from "../recoil/selectors";

export default () => {
  const view = useRecoilValue(selectors.view);
  const empty = {
    initialized: false,
    loadMore: false,
    isLoading: false,
    hasMore: true,
    pageToLoad: 1,
    rows: [],
    remainder: [],
  };
  const [state, setState] = useState(empty);

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

  useSendMessage("page", { page: state.pageToLoad }, guard);

  return [state, setState];
};
