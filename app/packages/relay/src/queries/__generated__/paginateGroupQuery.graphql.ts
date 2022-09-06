/**
 * @generated SignedSource<<4c60ff6540d65f075ed00a173701893a>>
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
export type paginateGroupQuery$variables = {
  count?: number | null;
  cursor?: string | null;
  dataset: string;
  filter: SampleFilter;
  pinnedSampleFilter: SampleFilter;
  view: Array;
};
export type paginateGroupQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<
    "paginateGroupPinnedSample_query" | "paginateGroup_query"
  >;
};
export type paginateGroupQuery = {
  response: paginateGroupQuery$data;
  variables: paginateGroupQuery$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = {
      defaultValue: 20,
      kind: "LocalArgument",
      name: "count",
    },
    v1 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "cursor",
    },
    v2 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "dataset",
    },
    v3 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "filter",
    },
    v4 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "pinnedSampleFilter",
    },
    v5 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "view",
    },
    v6 = {
      kind: "Variable",
      name: "dataset",
      variableName: "dataset",
    },
    v7 = {
      kind: "Variable",
      name: "view",
      variableName: "view",
    },
    v8 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "aspectRatio",
      storageKey: null,
    },
    v9 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "sample",
      storageKey: null,
    },
    v10 = [
      {
        alias: null,
        args: null,
        kind: "ScalarField",
        name: "__typename",
        storageKey: null,
      },
      {
        kind: "InlineFragment",
        selections: [v8 /*: any*/, v9 /*: any*/],
        type: "ImageSample",
        abstractKey: null,
      },
      {
        kind: "InlineFragment",
        selections: [v9 /*: any*/],
        type: "PointCloudSample",
        abstractKey: null,
      },
      {
        kind: "InlineFragment",
        selections: [
          v8 /*: any*/,
          {
            alias: null,
            args: null,
            kind: "ScalarField",
            name: "frameRate",
            storageKey: null,
          },
          v9 /*: any*/,
        ],
        type: "VideoSample",
        abstractKey: null,
      },
    ],
    v11 = {
      alias: null,
      args: [
        v6 /*: any*/,
        {
          kind: "Variable",
          name: "filter",
          variableName: "pinnedSampleFilter",
        },
        v7 /*: any*/,
      ],
      concreteType: null,
      kind: "LinkedField",
      name: "sample",
      plural: false,
      selections: v10 /*: any*/,
      storageKey: null,
    },
    v12 = [
      {
        kind: "Variable",
        name: "after",
        variableName: "cursor",
      },
      v6 /*: any*/,
      {
        kind: "Variable",
        name: "filter",
        variableName: "filter",
      },
      {
        kind: "Variable",
        name: "first",
        variableName: "count",
      },
      v7 /*: any*/,
    ];
  return {
    fragment: {
      argumentDefinitions: [
        v0 /*: any*/,
        v1 /*: any*/,
        v2 /*: any*/,
        v3 /*: any*/,
        v4 /*: any*/,
        v5 /*: any*/,
      ],
      kind: "Fragment",
      metadata: null,
      name: "paginateGroupQuery",
      selections: [
        {
          args: null,
          kind: "FragmentSpread",
          name: "paginateGroup_query",
        },
        {
          kind: "InlineDataFragmentSpread",
          name: "paginateGroupPinnedSample_query",
          selections: [v11 /*: any*/],
        },
      ],
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: [
        v0 /*: any*/,
        v1 /*: any*/,
        v2 /*: any*/,
        v5 /*: any*/,
        v3 /*: any*/,
        v4 /*: any*/,
      ],
      kind: "Operation",
      name: "paginateGroupQuery",
      selections: [
        {
          alias: null,
          args: v12 /*: any*/,
          concreteType: "SampleItemStrConnection",
          kind: "LinkedField",
          name: "samples",
          plural: false,
          selections: [
            {
              alias: null,
              args: null,
              kind: "ScalarField",
              name: "total",
              storageKey: null,
            },
            {
              alias: null,
              args: null,
              concreteType: "SampleItemStrEdge",
              kind: "LinkedField",
              name: "edges",
              plural: true,
              selections: [
                {
                  alias: null,
                  args: null,
                  kind: "ScalarField",
                  name: "cursor",
                  storageKey: null,
                },
                {
                  alias: null,
                  args: null,
                  concreteType: null,
                  kind: "LinkedField",
                  name: "node",
                  plural: false,
                  selections: v10 /*: any*/,
                  storageKey: null,
                },
              ],
              storageKey: null,
            },
            {
              alias: null,
              args: null,
              concreteType: "SampleItemStrPageInfo",
              kind: "LinkedField",
              name: "pageInfo",
              plural: false,
              selections: [
                {
                  alias: null,
                  args: null,
                  kind: "ScalarField",
                  name: "endCursor",
                  storageKey: null,
                },
                {
                  alias: null,
                  args: null,
                  kind: "ScalarField",
                  name: "hasNextPage",
                  storageKey: null,
                },
              ],
              storageKey: null,
            },
          ],
          storageKey: null,
        },
        {
          alias: null,
          args: v12 /*: any*/,
          filters: ["dataset", "view", "filter"],
          handle: "connection",
          key: "paginateGroup_query_samples",
          kind: "LinkedHandle",
          name: "samples",
        },
        v11 /*: any*/,
      ],
    },
    params: {
      cacheID: "3afe2307e88ce327c7cc808fc371a2de",
      id: null,
      metadata: {},
      name: "paginateGroupQuery",
      operationKind: "query",
      text: "query paginateGroupQuery(\n  $count: Int = 20\n  $cursor: String = null\n  $dataset: String!\n  $view: BSONArray!\n  $filter: SampleFilter!\n  $pinnedSampleFilter: SampleFilter!\n) {\n  ...paginateGroup_query\n  ...paginateGroupPinnedSample_query\n}\n\nfragment paginateGroupPinnedSample_query on Query {\n  sample(dataset: $dataset, view: $view, filter: $pinnedSampleFilter) {\n    __typename\n    ... on ImageSample {\n      aspectRatio\n      sample\n    }\n    ... on PointCloudSample {\n      sample\n    }\n    ... on VideoSample {\n      aspectRatio\n      frameRate\n      sample\n    }\n  }\n}\n\nfragment paginateGroup_query on Query {\n  samples(dataset: $dataset, view: $view, first: $count, after: $cursor, filter: $filter) {\n    total\n    edges {\n      cursor\n      node {\n        __typename\n        ... on ImageSample {\n          aspectRatio\n          sample\n        }\n        ... on PointCloudSample {\n          sample\n        }\n        ... on VideoSample {\n          aspectRatio\n          frameRate\n          sample\n        }\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n",
    },
  };
})();

(node as any).hash = "e04660582e3fd8867f7144bee2881f52";

export default node;
