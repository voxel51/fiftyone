import { PageQuery, datasetQuery } from "@fiftyone/relay";
import { useCurrentDataset } from "@fiftyone/teams-state";
import { toSlug } from "@fiftyone/utilities";
import { NextRouter, useRouter } from "next/router";
import { useMemo } from "react";
import glueHistory from "./glueHistory";
import type { Page } from "./loadPageQuery";
import type { DatasetData } from "./transition";
import usePage from "./usePage";
import useSetters from "./useSetters/useSetters";

function injectDynamicRouter() {
  const router: { ref?: NextRouter } = { ref: undefined };
  glueHistory(requestAnimationFrame, () => {
    router.ref?.replace(
      window.history.state.url,
      window.history.state.as,
      window.history.state.options
    );
  });

  return (): DatasetData &
    (
      | {
          loading: true;
          state: null;
        }
      | {
          loading: false;
          state: {
            page: Page;
            setters: ReturnType<typeof useSetters>;
            subscribe: (
              fn: (pageQuery: PageQuery<datasetQuery>) => void
            ) => () => void;
          };
        }
    ) => {
    const nextRouter = useRouter();
    const slug = nextRouter.query.slug as string;
    nextRouter.beforePopState(({ as }) => {
      if (as.split("?")[0] === router.ref?.asPath.split("?")[0]) return false;
      return true;
    });
    router.ref = nextRouter;

    const current = useCurrentDataset(slug);
    if (!current) {
      throw new Error("no current dataset");
    }

    const dataset = useMemo(() => {
      return {
        datasetId: current.id,
        datasetName: current.name,
        datasetSlug: slug,
      };
    }, [current.id, current.name, slug]);

    const { page, subscribe, setters } = usePage(dataset);

    if (
      !page ||
      !page?.data.dataset?.headName ||
      toSlug(page?.data.dataset?.headName) !== slug
    ) {
      return { ...dataset, state: null, loading: true };
    }

    return {
      ...dataset,

      loading: false,
      state: {
        page,
        setters,
        subscribe,
      },
    };
  };
}

export default injectDynamicRouter;
