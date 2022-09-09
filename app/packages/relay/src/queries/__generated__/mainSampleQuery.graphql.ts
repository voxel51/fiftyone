/**
 * @generated SignedSource<<b1e7c1c489449082561879825e82d53e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from "relay-runtime";
export type SampleFilter = {
  group?: GroupElementFilter | null;
  id?: string | null;
};
export type GroupElementFilter = {
  id?: string | null;
  slice?: string | null;
};
export type mainSampleQuery$variables = {
  dataset: string;
  filter: SampleFilter;
  view: Array;
};
export type mainSampleQuery$data = {
  readonly sample: {
    readonly frameRate?: number;
    readonly sample?: object;
    readonly urls?: ReadonlyArray<{
      readonly field: string;
      readonly url: string;
    }>;
  } | null;
};
export type mainSampleQuery = {
  response: mainSampleQuery$data;
  variables: mainSampleQuery$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "dataset",
    },
    v1 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "filter",
    },
    v2 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "view",
    },
    v3 = [
      {
        kind: "Variable",
        name: "dataset",
        variableName: "dataset",
      },
      {
        kind: "Variable",
        name: "filter",
        variableName: "filter",
      },
      {
        kind: "Variable",
        name: "view",
        variableName: "view",
      },
    ],
    v4 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "sample",
      storageKey: null,
    },
    v5 = {
      alias: null,
      args: null,
      concreteType: "MediaURL",
      kind: "LinkedField",
      name: "urls",
      plural: true,
      selections: [
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "field",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "url",
          storageKey: null,
        },
      ],
      storageKey: null,
    },
    v6 = {
      kind: "InlineFragment",
      selections: [v4 /*: any*/, v5 /*: any*/],
      type: "ImageSample",
      abstractKey: null,
    },
    v7 = {
      kind: "InlineFragment",
      selections: [
        v4 /*: any*/,
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "frameRate",
          storageKey: null,
        },
        v5 /*: any*/,
      ],
      type: "VideoSample",
      abstractKey: null,
    };
  return {
    fragment: {
      argumentDefinitions: [v0 /*: any*/, v1 /*: any*/, v2 /*: any*/],
      kind: "Fragment",
      metadata: null,
      name: "mainSampleQuery",
      selections: [
        {
          alias: null,
          args: v3 /*: any*/,
          concreteType: null,
          kind: "LinkedField",
          name: "sample",
          plural: false,
          selections: [v6 /*: any*/, v7 /*: any*/],
          storageKey: null,
        },
      ],
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: [v0 /*: any*/, v2 /*: any*/, v1 /*: any*/],
      kind: "Operation",
      name: "mainSampleQuery",
      selections: [
        {
          alias: null,
          args: v3 /*: any*/,
          concreteType: null,
          kind: "LinkedField",
          name: "sample",
          plural: false,
          selections: [
            {
              alias: null,
              args: null,
              kind: "ScalarField",
              name: "__typename",
              storageKey: null,
            },
            v6 /*: any*/,
            v7 /*: any*/,
          ],
          storageKey: null,
        },
      ],
    },
    params: {
      cacheID: "26ec2aa2c560cc96f85ccc22c94db962",
      id: null,
      metadata: {},
      name: "mainSampleQuery",
      operationKind: "query",
      text: "query mainSampleQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $filter: SampleFilter!\n) {\n  sample(dataset: $dataset, view: $view, filter: $filter) {\n    __typename\n    ... on ImageSample {\n      sample\n      urls {\n        field\n        url\n      }\n    }\n    ... on VideoSample {\n      sample\n      frameRate\n      urls {\n        field\n        url\n      }\n    }\n  }\n}\n",
    },
  };
})();

(node as any).hash = "2a4a2b71392bbedf7f1812f0fb7a1065";

export default node;
