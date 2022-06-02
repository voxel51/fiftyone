import { Route } from "@fiftyone/components";
import React, { useEffect } from "react";
import { graphql, usePreloadedQuery } from "react-relay";

import DatasetComponent from "../../components/Dataset";
import { useSetDataset, useStateUpdate } from "../../utils/hooks";
import { DatasetQuery } from "./__generated__/DatasetQuery.graphql";
import { datasetName } from "../../recoil/selectors";
import { useRecoilValue } from "recoil";
import transformDataset from "./transformDataset";
import { filters } from "../../recoil/filters";
import { _activeFields } from "../../recoil/schema";
import { similarityParameters } from "../../components/Actions/Similar";

const Query = graphql`
  query DatasetQuery($name: String!, $view: JSONArray) {
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
    }
  }
`;

export const Dataset: Route<DatasetQuery> = ({ prepared }) => {
  const { dataset } = usePreloadedQuery(Query, prepared);
  const name = useRecoilValue(datasetName);
  const setDataset = useSetDataset();

  const update = useStateUpdate();

  useEffect(() => {
    if (!dataset) {
      setDataset();
      return;
    }

    update(({ reset }) => {
      reset(filters);
      reset(_activeFields({ modal: false }));
      reset(similarityParameters);

      return {
        dataset: transformDataset(dataset),
      };
    });
  }, [dataset]);

  if (!name) {
    return null;
  }

  return <DatasetComponent />;
};

export default Dataset;
