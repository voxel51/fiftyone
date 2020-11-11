import { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import { useMessageHandler } from "../utils/hooks";
import tile from "../utils/tile";
import { packageMessage } from "../utils/socket";
import { viewsAreEqual } from "../utils/view";

import * as selectors from "../recoil/selectors";

export default () => {
  const socket = useRecoilValue(selectors.socket);
  const [prevFilters, setPrevFilters] = useState({});
  const filters = useRecoilValue(selectors.paginatedFilterStages);
  const datasetName = useRecoilValue(selectors.datasetName);
  const view = useRecoilValue(selectors.view);
  const [prevView, setPrevView] = useState([]);

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

  useEffect(() => {
    setState(empty);
    setPrevFilters(filters);
  }, [JSON.stringify(filters) === JSON.stringify(prevFilters)]);
  useEffect(() => {
    if (viewsAreEqual(view, prevView)) return;
    setState(empty);
    setPrevView(view);
  }, [view, prevView]);

  useEffect(() => {
    setState(empty);
  }, [datasetName]);

  useEffect(() => {
    if (!state.loadMore || state.isLoading || !state.hasMore) return;
    setState({ ...state, isLoading: true, loadMore: false, initialized: true });
    socket.send(packageMessage("page", { page: state.pageToLoad }));
  }, [state.loadMore, state.pageToLoad, state.hasMore]);

  return [state, setState];
};
