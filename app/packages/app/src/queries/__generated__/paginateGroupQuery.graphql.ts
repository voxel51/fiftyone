/**
 * @generated SignedSource<<599f5e2760d2983e038ae0fb1da85258>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type paginateGroupQuery$variables = {
  count?: number | null;
  cursor?: string | null;
  dataset: string;
  view: Array;
};
export type paginateGroupQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"paginateGroup_query">;
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
      name: "view",
    },
    v4 = [
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
        name: "first",
        variableName: "count",
      },
      {
        kind: "Variable",
        name: "view",
        variableName: "view",
      },
    ],
    v5 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "height",
      storageKey: null,
    },
    v6 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "sample",
      storageKey: null,
    },
    v7 = {
      alias: null,
      args: null,
      kind: "ScalarField",
      name: "width",
      storageKey: null,
    };
  return {
    fragment: {
      argumentDefinitions: [
        v0 /*: any*/,
        v1 /*: any*/,
        v2 /*: any*/,
        v3 /*: any*/,
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
      ],
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: [
        v2 /*: any*/,
        v3 /*: any*/,
        v0 /*: any*/,
        v1 /*: any*/,
      ],
      kind: "Operation",
      name: "paginateGroupQuery",
      selections: [
        {
          alias: null,
          args: v4 /*: any*/,
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
                      selections: [v5 /*: any*/, v6 /*: any*/, v7 /*: any*/],
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
                        v5 /*: any*/,
                        v6 /*: any*/,
                        v7 /*: any*/,
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
          args: v4 /*: any*/,
          filters: ["dataset", "view"],
          handle: "connection",
          key: "paginateGroup_query_samples",
          kind: "LinkedHandle",
          name: "samples",
        },
      ],
    },
    params: {
      cacheID: "420edaf5afc8eaafac61dcb7e3751814",
      id: null,
      metadata: {},
      name: "paginateGroupQuery",
      operationKind: "query",
      text: "query paginateGroupQuery(\n  $dataset: String!\n  $view: BSONArray!\n  $count: Int = 20\n  $cursor: String = null\n) {\n  ...paginateGroup_query\n}\n\nfragment paginateGroup_query on Query {\n  samples(dataset: $dataset, view: $view, first: $count, after: $cursor) {\n    edges {\n      cursor\n      node {\n        __typename\n        ... on ImageSample {\n          height\n          sample\n          width\n        }\n        ... on VideoSample {\n          frameRate\n          height\n          sample\n          width\n        }\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n",
    },
  };
})();

(node as any).hash = "721ff0a8adab47afdf2e03e0840fe7aa";

export default node;
