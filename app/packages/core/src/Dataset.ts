import * as fos from "@fiftyone/state";
import { toCamelCase } from "@fiftyone/utilities";
import { useContext, useLayoutEffect, useState } from "react";
import { graphql, usePreloadedQuery, useQueryLoader } from "react-relay";

import {
  DatasetQuery,
  DatasetQuery$data,
} from "./__generated__/DatasetQuery.graphql";

const DatasetQuery = graphql`
  query DatasetQuery($name: String!, $view: BSONArray = null) {
    dataset(name: $name, view: $view) {
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
      appConfig {
        mediaFields
        gridMediaField
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

export function usePrepareDataset(dataset, setReady) {
  const update = fos.useStateUpdate();
  const router = useContext(fos.RouterContext);

  useLayoutEffect(() => {
    const { colorscale, config, state } = router.state;
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
}
export function usePreLoadedDataset(
  queryRef
): [DatasetQuery$data["dataset"], boolean] {
  const [ready, setReady] = useState(false);

  const { dataset } = usePreloadedQuery<DatasetQuery>(DatasetQuery, queryRef);
  usePrepareDataset(dataset, setReady);
  return [dataset, ready];
}
export function useDatasetLoader() {
  const [queryRef, loadQuery] = useQueryLoader(DatasetQuery);
  return [
    queryRef,
    (name) => {
      loadQuery({ name });
    },
  ];
}
