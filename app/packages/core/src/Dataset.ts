import * as fos from "@fiftyone/state";
import { toCamelCase } from "@fiftyone/utilities";
import React, { useState } from "react";
import { usePreloadedQuery } from "react-relay";
import { graphql } from "relay-runtime";
import {
  DatasetQuery,
  DatasetQuery$data,
} from "./__generated__/DatasetQuery.graphql";

const DatasetQuery = graphql`
  query DatasetQuery(
    $name: String!
    $view: BSONArray = null
    $viewName: String = null
  ) {
    dataset(name: $name, view: $view, viewName: $viewName) {
      id
      name
      mediaType
      defaultGroupSlice
      groupField
      groupMediaTypes {
        name
        mediaType
      }
      appConfig {
        gridMediaField
        mediaFields
        plugins
        sidebarGroups {
          expanded
          paths
          name
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
        }
      }
      savedViews {
        datasetId
        name
        urlName
        description
        color
        viewStages
        createdAt
        lastModifiedAt
        lastLoadedAt
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
      appConfig {
        gridMediaField
        mediaFields
        modalMediaField
        plugins
        sidebarGroups {
          name
          paths
        }
        sidebarMode
      }
      info
    }
  }
`;

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

  React.useLayoutEffect(() => {
    const { colorscale, config, state } = router?.state || {};

    if (dataset) {
      update(() => {
        return {
          colorscale,
          config: config
            ? (toCamelCase(config) as fos.State.Config)
            : undefined,
          dataset: fos.transformDataset(dataset),
          state,
        };
      });
      setReady(true);
    }
  }, [dataset, router]);

  return [dataset, ready];
};
