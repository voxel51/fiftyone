import { savedViewsFragment$key } from "@fiftyone/relay";
import {
  clone,
  Field,
  getFetchFunction,
  GQLError,
  GraphQLError,
  Schema,
  StrictField,
} from "@fiftyone/utilities";
import React, { MutableRefObject, useCallback, useRef } from "react";
import {
  Environment,
  FetchFunction,
  GraphQLResponse,
  GraphQLResponseWithData,
  Network,
  RecordSource,
  Store,
} from "relay-runtime";
import { State } from "./recoil";

export const deferrer =
  (initialized: MutableRefObject<boolean>) =>
  (fn: (...args: any[]) => void) =>
  (...args: any[]): void => {
    if (initialized.current) fn(...args);
  };

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

export const getStandardizedUrls = (
  urls: Array<{ field: string; url: string }> | { [field: string]: string }
) => {
  let standardizedUrls: { [field: string]: string } = {};
  if (Array.isArray(urls)) {
    for (const { field, url } of urls) {
      standardizedUrls[field] = url;
    }
  } else {
    standardizedUrls = urls;
  }
  return standardizedUrls;
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
  };
};

export type ResponseFrom<TQuery extends { response: unknown }> =
  TQuery["response"];

export const getCurrentEnvironment = () => {
  return currentEnvironment;
};

export const setCurrentEnvironment = (environment: Environment) => {
  currentEnvironment = environment;
};

type GQLResponse = Omit<GraphQLResponseWithData, "errors"> & {
  errors?: GQLError[];
};

const fetchRelay: FetchFunction = async (
  params,
  variables
): Promise<GraphQLResponse> => {
  const data = await await getFetchFunction()<unknown, GQLResponse>(
    "POST",
    "/graphql",
    {
      query: params.text,
      variables,
    }
  );

  // mutation errors are handled by the calling component or hook
  if (params.operationKind !== "mutation" && "errors" in data && data.errors) {
    throw new GraphQLError({
      errors: data.errors,
      variables,
    });
  }

  return data;
};

export const getEnvironment = () =>
  new Environment({
    network: Network.create(fetchRelay),
    store: new Store(new RecordSource()),
  });

let currentEnvironment: Environment = getEnvironment();

export const datasetQueryContext = React.createContext<
  savedViewsFragment$key | undefined
>(undefined);
