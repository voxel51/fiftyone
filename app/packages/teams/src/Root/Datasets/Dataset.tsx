import React, { useEffect } from "react";
import { graphql, usePreloadedQuery } from "react-relay";

import { State } from "@fiftyone/app/src/recoil/types";
import DatasetContainer from "@fiftyone/app/src/components/Dataset";

import { DatasetQuery } from "./__generated__/DatasetQuery.graphql";
import { clone } from "@fiftyone/utilities";
import { useStateUpdate } from "@fiftyone/app/src/utils/hooks";
import { RGB } from "@fiftyone/looker";
import { Route } from "@fiftyone/components";
import { transformDataset } from "@fiftyone/app/src/Root/Datasets";
import { useRecoilValue } from "recoil";
import { datasetName } from "@fiftyone/app/src/recoil/selectors";

export const Dataset: Route<DatasetQuery> = ({ prepared }) => {
  const data = usePreloadedQuery(
    graphql`
      query DatasetQuery($name: String!, $view: JSONArray) {
        colorscale
        config {
          colorPool
          colorscale
          gridZoom
          loopVideos
          notebookHeight
          useFrameNumber
          showConfidence
          showIndex
          showLabel
          showTooltip
          timezone
        }
        dataset(name: $name, view: $view) @required(action: THROW) {
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
          version
        }
      }
    `,
    prepared
  );
  const name = useRecoilValue(datasetName);

  const state: State.Description = {
    dataset: data.dataset.name,
    view: [],
    selected: [],
    selectedLabels: [],
    viewCls: null,
    config: {
      ...clone(data.config),
    },
    colorscale: (clone(data.colorscale) || []) as RGB[],
  };

  const update = useStateUpdate();

  useEffect(() => {
    update({ state, dataset: transformDataset(data.dataset) });
  }, [state, data.dataset]);

  if (!data.dataset || !name) {
    return null;
  }

  return <DatasetContainer />;
};

export default Dataset;
