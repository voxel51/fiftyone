/**
 * @generated SignedSource<<acf9ef71f2167e6ed8bdf9baf1bd5942>>
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
export type paginateGroupPageQuery$variables = {
  count?: number | null;
  cursor?: string | null;
  dataset: string;
  filter?: SampleFilter | null;
  view: Array;
};
export type paginateGroupPageQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"paginateGroup_query">;
};
export type paginateGroupPageQuery = {
  response: paginateGroupPageQuery$data;
  variables: paginateGroupPageQuery$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = [
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "count",
      },
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "cursor",
      },
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "dataset",
      },
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "filter",
      },
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "view",
      },
    ],
    v1 = [
      {
        kind: "Variable",
        name: "after",
        variableName: "cursor",
      },
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
        name: "first",
        variableName: "count",
      },
      {
        kind: "Variable",
        name: "view",
        variableName: "view",
      },
    ],
    v2 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "height",
      storageKey: null,
    },
    v3 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "sample",
      storageKey: null,
    },
    v4 = {
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
      name: "paginateGroupPageQuery",
      selections: [
        {
          args: null,
          kind: "FragmentSpread",
          name: "paginateGroup_query",
        },
      ],
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Operation",
      name: "paginateGroupPageQuery",
      selections: [
        {
          alias: null,
          args: v1 /*: any*/,
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
                      selections: [v2 /*: any*/, v3 /*: any*/, v4 /*: any*/],
                      type: "ImageSample",
                      abstractKey: null,
                    },
                    {
                      kind: "InlineFragment",
                      selections: [v3 /*: any*/],
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
                        v2 /*: any*/,
                        v3 /*: any*/,
                        v4 /*: any*/,
                      ],
                      type: "VideoSample",
                      abstractKey: null,
                    },
                  ],
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
          args: v1 /*: any*/,
          filters: ["dataset", "view", "filter"],
          handle: "connection",
          key: "paginateGroup_query_samples",
          kind: "LinkedHandle",
          name: "samples",
        },
      ],
    },
    params: {
      cacheID: "0e3590e0db68b1616988a2a80ab79fe8",
      id: null,
      metadata: {},
      name: "paginateGroupPageQuery",
      operationKind: "query",
      text: "query paginateGroupPageQuery(\n  $count: Int\n  $cursor: String\n  $dataset: String!\n  $filter: SampleFilter\n  $view: BSONArray!\n) {\n  ...paginateGroup_query\n}\n\nfragment paginateGroup_query on Query {\n  samples(dataset: $dataset, view: $view, first: $count, after: $cursor, filter: $filter) {\n    edges {\n      cursor\n      node {\n        __typename\n        ... on ImageSample {\n          height\n          sample\n          width\n        }\n        ... on PointCloudSample {\n          sample\n        }\n        ... on VideoSample {\n          frameRate\n          height\n          sample\n          width\n        }\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n",
    },
  };
})();

(node as any).hash = "c119b0885661da12d5f2a27f16f94f3e";

export default node;
