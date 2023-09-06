import * as foq from "@fiftyone/relay";
import { SPACES_DEFAULT, stateSubscription } from "@fiftyone/state";
import { useCallback, useContext } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilValue } from "recoil";
import { SessionContext } from "./Sync";
import { Queries } from "./makeRoutes";
import { DatasetPageQuery } from "./pages/datasets/__generated__/DatasetPageQuery.graphql";
import { RoutingContext, useRouterContext } from "./routing";

const goTo = (router: RoutingContext<Queries>, path: string) => {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.delete("view");
  const search = searchParams.toString();
  router.history.push(`${path}${search.length ? "?" : ""}${search}`, {
    view: [],
  });
};

const useSetDataset = () => {
  const router = useRouterContext();
  const to = useCallback((to: string) => goTo(router, to), [router]);
  const session = useContext(SessionContext);
  const [commit] = useMutation<foq.setDatasetMutation>(foq.setDataset);
  const subscription = useRecoilValue(stateSubscription);
  const onError = useErrorHandler();
  return (name?: string) => {
    commit({
      onError,
      variables: { subscription, name },
    });
    foq.subscribeBefore<DatasetPageQuery>((page) => {
      session.selectedLabels = [];
      session.selectedSamples = new Set();
      session.selectedFields = undefined;
      session.sessionSpaces = SPACES_DEFAULT;
      session.colorScheme = page.data.dataset?.appConfig?.colorScheme || {
        colorPool: page.data.config.colorPool,
      };
    });

    to(name ? `/datasets/${encodeURIComponent(name)}` : "/");
  };
};

export default useSetDataset;
