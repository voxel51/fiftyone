import * as fos from '@fiftyone/state'
import { dataset } from '@fiftyone/state';
import { toCamelCase } from '@fiftyone/utilities';
import {useEffect} from 'react'
import { usePreloadedQuery, useQueryLoader } from 'react-relay';
export { DatasetQuery } from "./__generated__/DatasetQuery.graphql";

const DatasetQueryNode = graphql`
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
      }
      sampleFields {
        ftype
        subfield
        embeddedDocType
        path
        dbField
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
      }
    }
  }
`;

export function usePrepareDataset(dataset, {colorscale, config, state}) {
  const update = fos.useStateUpdate();

  useEffect(() => {
    if (dataset) {
      update(() => {
        return {
          colorscale,
          config: config
            ? (toCamelCase(config) as fos.State.Config)
            : undefined,
          dataset: fos.transformDataset(dataset),
          state
        };
      });
    }
  }, [dataset]);
}
export function usePreLoadedDataset(preloadedQuery, {colorscale, config, state} = {}) {
  const {dataset} = usePreloadedQuery(DatasetQueryNode, preloadedQuery)
  usePrepareDataset(dataset, {colorscale, config, state})
}
export function useLoadedDataset({colorscale, config, state} = {}) {
  const {dataset} = useQueryLoader(DatasetQueryNode)
  usePrepareDataset(dataset, {colorscale, config, state})
}