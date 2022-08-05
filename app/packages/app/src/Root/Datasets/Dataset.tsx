import { Route, RouterContext } from "@fiftyone/components";
import { NotFoundError, toCamelCase } from "@fiftyone/utilities";
import React, { useContext, useEffect, useRef } from "react";
import { graphql, usePreloadedQuery } from "react-relay";
import { useRecoilValue } from "recoil";

import DatasetComponent from "../../components/Dataset";
import { useStateUpdate } from "../../utils/hooks";
import { DatasetQuery } from "./__generated__/DatasetQuery.graphql";
import { datasetName } from "../../recoil/selectors";
import * as viewAtoms from "../../recoil/view";
import { getDatasetName } from "../../utils/generic";
import { filters } from "../../recoil/filters";
import { similarityParameters } from "../../components/Actions/Similar";
import transformDataset from "./transformDataset";
import { State } from "../../recoil/types";

const Query = graphql`
  query DatasetQuery($name: String!, $view: BSONArray = null) {
    dataset(name: $name, view: $view) {
      id
      name
      mediaType
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
      appSidebarGroups {
        name
        paths
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
    }
  }
`;

export const Dataset: Route<DatasetQuery> = ({ prepared }) => {
  const { dataset } = usePreloadedQuery(Query, prepared);
  const router = useContext(RouterContext);
  const name = useRecoilValue(datasetName);
  const view = useRecoilValue(viewAtoms.view);
  const viewRef = useRef(view);
  viewRef.current = view;
  if (!dataset) {
    throw new NotFoundError(`/datasets/${getDatasetName(router)}`);
  }

  const update = useStateUpdate();

  useEffect(() => {
    update(({ reset }) => {
      reset(filters);
      reset(similarityParameters);
      return {
        colorscale:
          router.state && router.state.colorscale
            ? router.state.colorscale
            : undefined,
        config:
          router.state && router.state.config
            ? (toCamelCase(router.state.config) as State.Config)
            : undefined,
        dataset: transformDataset(dataset),
        state:
          router.state && router.state.state ? router?.state.state || {} : {},
      };
    });
  }, [dataset]);

  if (!name) {
    return null;
  }

  return <DatasetComponent />;
};

export default Dataset;
