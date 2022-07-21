/**
 * @generated SignedSource<<0530ffe1ba685b535e3817191456676f>>
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
  group: string;
  groupField: string;
  id: string;
};
export type paginateGroupWithPinnedSampleQuery$variables = {
  count?: number | null;
  cursor?: string | null;
  dataset: string;
  pinnedSampleFilter: SampleFilter;
  view: Array;
};
export type paginateGroupWithPinnedSampleQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<
    "paginateGroupPinnedSample_query" | "paginateGroup_query"
  >;
};
export type paginateGroupWithPinnedSampleQuery = {
  response: paginateGroupWithPinnedSampleQuery$data;
  variables: paginateGroupWithPinnedSampleQuery$variables;
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
      name: "pinnedSampleFilter",
    },
    v4 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "view",
    },
    v5 = {
      kind: "Variable",
      name: "dataset",
      variableName: "dataset",
    },
    v6 = {
      kind: "Variable",
      name: "view",
      variableName: "view",
    },
    v7 = [
      {
        kind: "Variable",
        name: "after",
        variableName: "cursor",
      },
      v5 /*: any*/,
      {
        kind: "Variable",
        name: "first",
        variableName: "count",
      },
      v6 /*: any*/,
    ],
    v8 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "height",
      storageKey: null,
    },
    v9 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "sample",
      storageKey: null,
    },
    v10 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "width",
      storageKey: null,
    },
    v11 = [
      {
        alias: null,
        args: null,
        kind: "ScalarField",
        name: "__typename",
        storageKey: null,
      },
      {
        kind: "InlineFragment",
        selections: [v8 /*: any*/, v9 /*: any*/, v10 /*: any*/],
        type: "ImageSample",
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
          v8 /*: any*/,
          v9 /*: any*/,
          v10 /*: any*/,
        ],
        type: "VideoSample",
        abstractKey: null,
      },
    ];
  return {
    fragment: {
      argumentDefinitions: [
        v0 /*: any*/,
        v1 /*: any*/,
        v2 /*: any*/,
        v3 /*: any*/,
        v4 /*: any*/,
      ],
      kind: "Fragment",
      metadata: null,
      name: "paginateGroupWithPinnedSampleQuery",
      selections: [
        {
          args: null,
          kind: "FragmentSpread",
          name: "paginateGroup_query",
        },
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
      argumentDefinitions: [
        v2 /*: any*/,
        v4 /*: any*/,
        v0 /*: any*/,
        v1 /*: any*/,
        v3 /*: any*/,
      ],
      kind: "Operation",
      name: "paginateGroupWithPinnedSampleQuery",
      selections: [
        {
          alias: null,
          args: v7 /*: any*/,
          concreteType: "SampleItemStrConnection",
          kind: "LinkedField",
          name: "samples",
          plural: false,
          selections: [
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
                  selections: v11 /*: any*/,
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
          args: v7 /*: any*/,
          filters: ["dataset", "view"],
          handle: "connection",
          key: "paginateGroup_query_samples",
          kind: "LinkedHandle",
          name: "samples",
        },
        {
          alias: null,
          args: [
            v5 /*: any*/,
            {
              kind: "Variable",
              name: "filter",
              variableName: "pinnedSampleFilter",
            },
            v6 /*: any*/,
          ],
          concreteType: null,
          kind: "LinkedField",
          name: "sample",
          plural: false,
          selections: v11 /*: any*/,
          storageKey: null,
        },
      ],
    },
    params: {
      cacheID: "95ca3c9a404b4b09850579175ed9c4c6",
      id: null,
      metadata: {},
      name: "paginateGroupWithPinnedSampleQuery",
      operationKind: "query",
      text: "query paginateGroupWithPinnedSampleQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $count: Int = 20\n  $cursor: String = null\n  $pinnedSampleFilter: SampleFilter!\n) {\n  ...paginateGroup_query\n  ...paginateGroupPinnedSample_query\n}\n\nfragment paginateGroupPinnedSample_query on Query {\n  sample(dataset: $dataset, view: $view, filter: $pinnedSampleFilter) {\n    __typename\n    ... on ImageSample {\n      height\n      sample\n      width\n    }\n    ... on VideoSample {\n      frameRate\n      height\n      sample\n      width\n    }\n  }\n}\n\nfragment paginateGroup_query on Query {\n  samples(dataset: $dataset, view: $view, first: $count, after: $cursor) {\n    edges {\n      cursor\n      node {\n        __typename\n        ... on ImageSample {\n          height\n          sample\n          width\n        }\n        ... on VideoSample {\n          frameRate\n          height\n          sample\n          width\n        }\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n",
    },
  };
})();

(node as any).hash = "676cef815470e5f705d0ee723a373c85";

export default node;
