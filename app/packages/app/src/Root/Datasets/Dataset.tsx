import { clone, Field, Schema, StrictField } from "@fiftyone/utilities";
import { Route } from "@fiftyone/components";
import { RGB } from "@fiftyone/looker";
import { NotFoundError } from "@fiftyone/utilities";
import React, { useEffect, useRef } from "react";
import { graphql, usePreloadedQuery, useQueryLoader } from "react-relay";

import DatasetComponent from "../../components/Dataset";
import { State } from "../../recoil/types";
import { useStateUpdate } from "../../utils/hooks";
import {
  DatasetQuery,
  DatasetQuery$data,
} from "./__generated__/DatasetQuery.graphql";
import { refresher } from "../../recoil/selectors";
import { useRecoilValue } from "recoil";
import { getEnvironment } from "@fiftyone/components/src/use/useRouter";

const toStrictField = (field: Field): StrictField => {
  return {
    ...field,
    fields: Object.entries(field.fields).map(([_, f]) => toStrictField(f)),
  };
};

const collapseFields = (
  paths: NonNullable<DatasetQuery$data["dataset"]>["sampleFields"]
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
  targets: NonNullable<DatasetQuery$data["dataset"]>["defaultMaskTargets"]
) => {
  return Object.fromEntries(
    (targets || []).map<[number, string]>(({ target, value }) => [
      target,
      value,
    ])
  );
};

const transformDataset = (
  dataset: NonNullable<DatasetQuery$data["dataset"]>
): Readonly<State.Dataset> => {
  const targets = Object.fromEntries(
    (dataset?.maskTargets || []).map(({ name, targets }) => [
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

const Query = graphql`
  query DatasetQuery($name: String!) {
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
  }
`;

export const Dataset: Route<DatasetQuery> = ({ prepared }) => {
  const [ref, load] = useQueryLoader(Query, prepared);
  const data = usePreloadedQuery(Query, ref);

  if (!data.dataset) {
    throw new NotFoundError(window.location.pathname);
  }

  const state: State.Description = {
    view: [],
    selected: [],
    selectedLabels: [],
    close: false,
    refresh: false,
    connected: true,
    viewCls: null,
    config: {
      ...clone(data.config),
    },
    activeHandle: null,
    colorscale: (clone(data.colorscale) || []) as RGB[],
    dataset: transformDataset(data.dataset),
  };

  const update = useStateUpdate();

  useEffect(() => {
    update(state);
  }, [state]);
  const refresh = useRecoilValue(refresher);
  const refreshRef = useRef<boolean>(true);

  useEffect(() => {
    refreshRef.current
      ? (refreshRef.current = false)
      : load(
          { name: data.dataset.name },
          {
            fetchPolicy: "network-only",
            networkCacheConfig: { force: true },
          }
        );
  }, [refresh]);

  return <DatasetComponent />;
};

export default Dataset;
