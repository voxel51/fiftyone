/**
 * @generated SignedSource<<0f7153d922fbe18da24beff3dc002efe>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type SampleFilter = {
  group?: GroupElementFilter | null;
  id?: string | null;
};
export type GroupElementFilter = {
  id?: string | null;
  slice?: string | null;
};
export type paginateGroupPinnedSampleQuery$variables = {
  dataset: string;
  pinnedSampleFilter: SampleFilter;
  view: Array;
};
export type paginateGroupPinnedSampleQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"paginateGroupPinnedSample_query">;
};
export type paginateGroupPinnedSampleQuery = {
  response: paginateGroupPinnedSampleQuery$data;
  variables: paginateGroupPinnedSampleQuery$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = [
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "dataset",
      },
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "pinnedSampleFilter",
      },
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "view",
      },
    ],
    v1 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "height",
      storageKey: null,
    },
    v2 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "sample",
      storageKey: null,
    },
    v3 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "width",
      storageKey: null,
    };
  return {
    fragment: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Fragment",
      metadata: null,
      name: "paginateGroupPinnedSampleQuery",
      selections: [
        {
          args: null,
          kind: "FragmentSpread",
          name: "paginateGroupPinnedSample_query",
        },
      ],
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Operation",
      name: "paginateGroupPinnedSampleQuery",
      selections: [
        {
          alias: null,
          args: [
            {
              kind: "Variable",
              name: "dataset",
              variableName: "dataset",
            },
            {
              kind: "Variable",
              name: "filter",
              variableName: "pinnedSampleFilter",
            },
            {
              kind: "Variable",
              name: "view",
              variableName: "view",
            },
          ],
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
            {
              kind: "InlineFragment",
              selections: [v1 /*: any*/, v2 /*: any*/, v3 /*: any*/],
              type: "ImageSample",
              abstractKey: null,
            },
            {
              kind: "InlineFragment",
              selections: [v2 /*: any*/],
              type: "PointCloudSample",
              abstractKey: null,
            },
            {
              kind: "InlineFragment",
              selections: [
                {
                  alias: null,
                  args: null,
                  kind: "ScalarField",
                  name: "frameRate",
                  storageKey: null,
                },
                v1 /*: any*/,
                v2 /*: any*/,
                v3 /*: any*/,
              ],
              type: "VideoSample",
              abstractKey: null,
            },
          ],
          storageKey: null,
        },
      ],
    },
    params: {
      cacheID: "cd3e643121466f00a91f1a0bd731f7c9",
      id: null,
      metadata: {},
      name: "paginateGroupPinnedSampleQuery",
      operationKind: "query",
      text: "query paginateGroupPinnedSampleQuery(\n  $dataset: String!\n  $pinnedSampleFilter: SampleFilter!\n  $view: BSONArray!\n) {\n  ...paginateGroupPinnedSample_query\n}\n\nfragment paginateGroupPinnedSample_query on Query {\n  sample(dataset: $dataset, view: $view, filter: $pinnedSampleFilter) {\n    __typename\n    ... on ImageSample {\n      height\n      sample\n      width\n    }\n    ... on PointCloudSample {\n      sample\n    }\n    ... on VideoSample {\n      frameRate\n      height\n      sample\n      width\n    }\n  }\n}\n",
    },
  };
})();

(node as any).hash = "c1db0455fe9f0230194677dad094ceeb";

export default node;
