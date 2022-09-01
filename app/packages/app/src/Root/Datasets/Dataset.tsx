import { NotFoundError, toCamelCase } from "@fiftyone/utilities";
import React, { useContext, useEffect } from "react";
import { graphql, usePreloadedQuery } from "react-relay";
import { useRecoilValue } from "recoil";

import DatasetComponent from "../../components/Dataset";
import { DatasetQuery } from "./__generated__/DatasetQuery.graphql";

import * as fos from "@fiftyone/state";
import { Route, RouterContext } from "@fiftyone/state";
import { getDatasetName } from "@fiftyone/state";

const Query = graphql`
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

export const Dataset: Route<DatasetQuery> = ({ prepared }) => {
  const { dataset } = usePreloadedQuery(Query, prepared);
  const router = useContext(RouterContext);
  const name = useRecoilValue(fos.datasetName);
  if (!dataset) {
    throw new NotFoundError(`/datasets/${getDatasetName(router)}`);
  }

  const update = fos.useStateUpdate();

  useEffect(() => {
    update(() => {
      return {
        colorscale: router?.state?.colorscale
          ? router.state.colorscale
          : undefined,
        config: router?.state?.config
          ? (toCamelCase(router.state.config) as fos.State.Config)
          : undefined,
        dataset: fos.transformDataset(dataset),
        state: router?.state?.state ? router.state.state || {} : {},
      };
    });
  }, [dataset, router.state]);

  if (!name || name !== dataset.name) {
    return null;
  }

  return <DatasetComponent />;
};

export default Dataset;
