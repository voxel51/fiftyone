import React from "react";
import { graphql, usePreloadedQuery } from "react-relay";

import { State } from "@fiftyone/app/src/recoil/types";
import DatasetContainer from "@fiftyone/app/src/containers/Dataset";

import { RouteComponent } from "../../routing";
import {
  DatasetQuery,
  DatasetQuery$data,
} from "./__generated__/DatasetQuery.graphql";
import { Field, Schema, StrictField } from "@fiftyone/utilities";
import { useStateUpdate } from "@fiftyone/app/src/utils/hooks";
import { useEffect } from "react";

const toStrictField = (field: Field): StrictField => {
  return {
    ...field,
    fields: Object.entries(field.fields).map(([_, f]) => toStrictField(f)),
  };
};

const collapseFields = (
  paths: DatasetQuery$data["dataset"]["sampleFields"]
): StrictField[] => {
  const schema: Schema = {};
  for (let i = 0; i < paths.length; i++) {
    const field = paths[i];
    const keys = field.path.split(".");
    let ref = schema;
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      ref[key] = ref[key] || { fields: {} };

      if (j === keys.length - 1) {
        ref[key] = {
          ...field,
          name: key,
          fields: ref[key].fields,
        };
      } else {
        ref = ref[key].fields;
      }
    }
  }

  return Object.entries(schema).map(([_, field]) => toStrictField(field));
};

const convertTargets = (
  targets: DatasetQuery$data["dataset"]["defaultMaskTargets"]
) => {
  return Object.fromEntries(
    (targets || []).map<[number, string]>(({ target, value }) => [
      target,
      value,
    ])
  );
};

const transformDataset = ({
  dataset,
}: DatasetQuery$data): Readonly<State.Dataset> => {
  const targets = Object.fromEntries(
    (dataset.maskTargets || []).map(({ name, targets }) => [
      name,
      convertTargets(targets),
    ])
  );

  const copy = clone(dataset);

  return {
    ...copy,
    defaultMaskTargets: convertTargets(dataset.defaultMaskTargets),
    brainMethods: [...dataset.brainMethods],
    evaluations: [...dataset.evaluations],
    frameFields: collapseFields(dataset.frameFields),
    sampleFields: collapseFields(dataset.sampleFields),
    maskTargets: targets,
    mediaType: dataset.mediaType === "image" ? "image" : "video",
  };
};

type Mutable<T> = {
  -readonly [K in keyof T]: Mutable<T[K]>;
};

const clone = <T extends unknown>(data: T): Mutable<T> => {
  return JSON.parse(JSON.stringify(data));
};

const Dataset: RouteComponent<DatasetQuery> = ({ prepared }) => {
  const data = usePreloadedQuery(
    graphql`
      query DatasetQuery($name: String!) {
        datasets(first: 1000) @connection(key: "Dataset_query_datasets") {
          edges {
            cursor
            node {
              name
            }
          }
        }
        dataset(name: $name) {
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
        viewer {
          config {
            timezone
            colorscale
            colorPool
            gridZoom
            loopVideos
            notebookHeight
            showConfidence
            showIndex
            showLabel
            showTooltip
            useFrameNumber
          }
          colorscale
        }
      }
    `,
    prepared
  );

  const state: State.Description = {
    view: [],
    selected: [],
    selectedLabels: [],
    close: false,
    refresh: false,
    connected: true,
    viewCls: null,
    datasets: data.datasets.edges.map(({ node }) => node.name),
    config: {
      ...clone(data.viewer.config),
    },
    activeHandle: null,
    colorscale: clone(data.viewer.colorscale) || [],
    dataset: transformDataset(data),
  };

  const update = useStateUpdate();

  useEffect(() => {
    update({ state });
  }, [state]);

  return <DatasetContainer />;
};

export default Dataset;
