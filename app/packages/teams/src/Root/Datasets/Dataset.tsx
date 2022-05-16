import { Route } from "@fiftyone/components";
import React, { useEffect } from "react";
import { graphql, usePreloadedQuery } from "react-relay";

import { DatasetQuery } from "./__generated__/DatasetQuery.graphql";
import { useRecoilValue } from "recoil";
import { datasetName } from "@fiftyone/app/src/recoil/selectors";
import { useSetDataset, useStateUpdate } from "@fiftyone/app/src/utils/hooks";
import { _activeFields } from "@fiftyone/app/src/recoil/schema";
import { filters } from "@fiftyone/app/src/recoil/filters";
import DatasetComponent from "@fiftyone/app/src/components/Dataset";
import { transformDataset } from "@fiftyone/app/src/Root/Datasets";

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
