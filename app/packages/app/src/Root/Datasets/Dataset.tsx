import { Route, RouterContext } from "@fiftyone/components";
import React, { useContext, useEffect } from "react";
import { graphql, usePreloadedQuery } from "react-relay";

import DatasetComponent from "../../components/Dataset";
import { useStateUpdate } from "../../utils/hooks";
import { DatasetQuery } from "./__generated__/DatasetQuery.graphql";
import { datasetName } from "../../recoil/selectors";
import { useRecoilValue } from "recoil";
import transformDataset from "./transformDataset";
import { filters } from "../../recoil/filters";
import { _activeFields } from "../../recoil/schema";
import { State } from "../../recoil/types";
import { similarityParameters } from "../../components/Actions/Similar";
import { toCamelCase } from "@fiftyone/utilities";

const Query = graphql`
  query DatasetQuery($name: String!, $view: JSONArray) {
    dataset(name: $name, view: $view) {
      id
      name
      mediaType
      mediaFields
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

  const update = useStateUpdate();

  useEffect(() => {
    update(({ reset }) => {
      reset(filters);
      reset(_activeFields({ modal: false }));
      reset(similarityParameters);

      return {
        colorscale: router.state.colorscale,
        config: router.state.config
          ? (toCamelCase(router.state.config) as State.Config)
          : undefined,
        dataset: transformDataset(dataset),
        state: router.state.state,
      };
    });
  }, [dataset, prepared, router]);

  if (!name) {
    return null;
  }

  return <DatasetComponent />;
};

export default Dataset;
