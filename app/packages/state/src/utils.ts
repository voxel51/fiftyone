import { clone, Field, Schema, StrictField } from "@fiftyone/utilities";
import { useCallback, useRef } from "react";
import { State } from "./recoil";

import { matchPath, RoutingContext } from "./routing";

export const useDeferrer = () => {
  const initialized = useRef(false);
  const deferred = useCallback(
    (fn: () => void) => {
      if (initialized.current) fn();
    },
    [initialized]
  );

  const init = useCallback(() => {
    initialized.current = true;
  }, []);

  return { init, deferred };
};

export const stringifyObj = (obj) => {
  if (typeof obj !== "object" || Array.isArray(obj)) return obj;
  return JSON.stringify(
    Object.keys(obj)
      .map((key) => {
        return [key, obj[key]];
      })
      .sort((a, b) => a[0] - b[0])
  );
};

export const filterView = (stages) =>
  JSON.stringify(
    stages.map(({ kwargs, _cls }) => ({
      kwargs: kwargs.filter((ka) => !ka[0].startsWith("_")),
      _cls,
    }))
  );

export const viewsAreEqual = (viewOne, viewTwo) => {
  return filterView(viewOne) === filterView(viewTwo);
};

const toStrictField = (field: Field): StrictField => {
  return {
    ...field,
    fields: Object.entries(field.fields).map(([_, f]) => toStrictField(f)),
  };
};

export const collapseFields = (paths): StrictField[] => {
  const schema: Schema = {};
  for (let i = 0; i < paths.length; i++) {
    const field = paths[i];
    const keys = field.path.split(".");
    let ref = schema;
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j];
      ref[key] = ref[key] || ({ fields: {} } as Field);

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
  targets: {
    target: string;
    value: string;
  }[]
) => {
  return Object.fromEntries(
    (targets || []).map(({ target, value }, i) => {
      if (!isNaN(Number(target))) {
        // masks targets is for non-rgb masks
        return [target, value];
      }

      // convert into RGB mask representation
      // offset of 1 in intTarget because 0 has a special significance
      return [target, { label: value, intTarget: i + 1 }];
    })
  );
};

export const transformDataset = (dataset: any): Readonly<State.Dataset> => {
  const targets = Object.fromEntries(
    (dataset?.maskTargets || []).map(({ name, targets }) => [
      name,
      convertTargets(targets),
    ])
  );

  const copy: any = clone(dataset);

  return {
    ...copy,
    defaultMaskTargets: convertTargets(dataset.defaultMaskTargets),
    brainMethods: [...dataset.brainMethods],
    evaluations: [...dataset.evaluations],
    maskTargets: targets,
    mediaType: dataset.mediaType,
  };
};

export const getDatasetName = (context: RoutingContext<any>): string => {
  const result = matchPath(
    context.pathname,
    {
      path: "/datasets/:name",
      exact: true,
    },
    {},
    ""
  );

  if (result) {
    return decodeURIComponent(result.variables.name);
  }

  return null;
};

export type ResponseFrom<TQuery extends { response: unknown }> =
  TQuery["response"];

export const getSavedViewName = (context: RoutingContext<any>): string => {
  const datasetName = getDatasetName(context);
  const queryString = datasetName
    ? context.history.location.search
    : window.location.search;
  const params = new URLSearchParams(queryString);
  const viewName = params.get("view");
  if (viewName) {
    return decodeURIComponent(viewName);
  }

  return null;
};

export const DEFAULT_APP_COLOR_SCHEME = {
  colorPool: [
    "#ee0000",
    "#ee6600",
    "#993300",
    "#996633",
    "#999900",
    "#009900",
    "#003300",
    "#009999",
    "#000099",
    "#0066ff",
    "#6600ff",
    "#cc33cc",
    "#777799",
  ],
  fields: [],
};
