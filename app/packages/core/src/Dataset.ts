import * as fos from "@fiftyone/state";
import { stateProxy } from "@fiftyone/state";
import { toCamelCase } from "@fiftyone/utilities";
import React, { useState } from "react";
import { usePreloadedQuery } from "react-relay";
import { useRecoilValue } from "recoil";
import { graphql } from "relay-runtime";
import {
  DatasetQuery,
  DatasetQuery$data,
} from "./__generated__/DatasetQuery.graphql";

export const DatasetSavedViewsFragment = graphql`
  fragment DatasetSavedViewsFragment on Query
  @refetchable(queryName: "DatasetSavedViewsFragmentQuery") {
    savedViews(datasetName: $name) {
      id
      datasetId
      name
      slug
      description
      color
      viewStages
      createdAt
      lastModifiedAt
      lastLoadedAt
    }
  }
`;

export const DatasetNodeQuery = graphql`
  query DatasetQuery(
    $name: String!
    $view: BSONArray = null
    $savedViewSlug: String = null
  ) {
    ...DatasetSavedViewsFragment
    dataset(name: $name, view: $view, savedViewSlug: $savedViewSlug) {
      stages(slug: $savedViewSlug)
      id
      name
      mediaType
      parentMediaType
      defaultGroupSlice
      groupField
      groupSlice
      groupMediaTypes {
        name
        mediaType
      }
      appConfig {
        gridMediaField
        mediaFields
        modalMediaField
        plugins
        sidebarGroups {
          expanded
          paths
          name
        }
        sidebarMode
        colorScheme {
          colorPool
          fields {
            path
            fieldColor
            colorByAttribute
            valueColors {
              value
              color
            }
          }
        }
      }
      sampleFields {
        ftype
        subfield
        embeddedDocType
        path
        dbField
        description
        info
      }
      frameFields {
        ftype
        subfield
        embeddedDocType
        path
        dbField
        description
        info
      }
      maskTargets {
        name
        targets {
          target
          value
        }
      }
      defaultMaskTargets {
        target
        value
      }
      evaluations {
        key
        version
        timestamp
        viewStages
        config {
          cls
          predField
          gtField
        }
      }
      brainMethods {
        key
        version
        timestamp
        viewStages
        config {
          cls
          embeddingsField
          method
          patchesField
          supportsPrompts
          type
          maxK
          supportsLeastSimilarity
        }
      }
      savedViews {
        id
        datasetId
        name
        slug
        description
        color
        viewStages
      }
      lastLoadedAt
      createdAt
      skeletons {
        name
        labels
        edges
      }
      defaultSkeleton {
        labels
        edges
      }
      version
      viewCls
      viewName
      savedViewSlug
      info
    }
  }
`;

export const DatasetQueryRef = React.createContext<
  DatasetQuery$data | undefined
>(undefined);

export const usePreLoadedDataset = (
  queryRef
): [DatasetQuery$data["dataset"], boolean] => {
  const [ready, setReady] = useState(false);

  const { dataset } = usePreloadedQuery<DatasetQuery>(
    DatasetNodeQuery,
    queryRef
  );
  const update = fos.useStateUpdate();
  const router = React.useContext(fos.RouterContext);
  const stateProxyValue = useRecoilValue(stateProxy);

  React.useLayoutEffect(() => {
    let { viewName, stages: view, ...rest } = dataset;

    const params = new URLSearchParams(router.history.location.search);
    if (!viewName && !view && params.has("view")) {
      params.delete("view");
      const search = params.toString();
      router.history.replace(
        `${router.pathname}?${search.length ? `?${search}` : ""}`
      );
    }

    if (
      !router.state &&
      typeof window !== "undefined" &&
      window.history.state?.view
    ) {
      view = window.history.state.view;
    }

    const { colorscale, config, state } = router?.state || {};

    if (dataset) {
      update(() => {
        return {
          colorscale,
          config: config
            ? (toCamelCase(config) as fos.State.Config)
            : undefined,
          dataset: fos.transformDataset(
            stateProxyValue?.dataset ? stateProxyValue.dataset : rest
          ),
          state: { view, viewName, ...state, ...(stateProxyValue || {}) },
        };
      });
      setReady(true);
    }
  }, [dataset, router, stateProxyValue]);

  return [dataset, ready];
};
