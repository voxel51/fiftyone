/**
 * @generated SignedSource<<45fa98127c6b961657883917d8833517>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type RootQuery$variables = {
  search?: string | null;
  count?: number | null;
  cursor?: string | null;
};
export type RootQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<
    "RootNav_query" | "RootDatasets_query"
  >;
};
export type RootQuery = {
  variables: RootQuery$variables;
  response: RootQuery$data;
};

const node: ConcreteRequest = (function () {
  var v0 = {
      defaultValue: 10,
      kind: "LocalArgument",
      name: "count",
    },
    v1 = {
      defaultValue: null,
      kind: "LocalArgument",
      name: "cursor",
    },
    v2 = {
      defaultValue: "",
      kind: "LocalArgument",
      name: "search",
    },
    v3 = [
      {
        kind: "Variable",
        name: "after",
        variableName: "cursor",
      },
      {
        kind: "Variable",
        name: "first",
        variableName: "count",
      },
      {
        kind: "Variable",
        name: "search",
        variableName: "search",
      },
    ];
  return {
    fragment: {
      argumentDefinitions: [v0 /*: any*/, v1 /*: any*/, v2 /*: any*/],
      kind: "Fragment",
      metadata: null,
      name: "RootQuery",
      selections: [
        {
          args: null,
          kind: "FragmentSpread",
          name: "RootNav_query",
        },
        {
          args: null,
          kind: "FragmentSpread",
          name: "RootDatasets_query",
        },
      ],
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: [v2 /*: any*/, v0 /*: any*/, v1 /*: any*/],
      kind: "Operation",
      name: "RootQuery",
      selections: [
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "teamsSubmission",
          storageKey: null,
        },
        {
          alias: null,
          args: v3 /*: any*/,
          concreteType: "DatasetConnection",
          kind: "LinkedField",
          name: "datasets",
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
              concreteType: "DatasetEdge",
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
                  concreteType: "Dataset",
                  kind: "LinkedField",
                  name: "node",
                  plural: false,
                  selections: [
                    {
                      alias: null,
                      args: null,
                      kind: "ScalarField",
                      name: "name",
                      storageKey: null,
                    },
                    {
                      alias: null,
                      args: null,
                      kind: "ScalarField",
                      name: "id",
                      storageKey: null,
                    },
                    {
                      alias: null,
                      args: null,
                      kind: "ScalarField",
                      name: "__typename",
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
              args: null,
              concreteType: "PageInfo",
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
          args: v3 /*: any*/,
          filters: ["search"],
          handle: "connection",
          key: "DatasetsList_query_datasets",
          kind: "LinkedHandle",
          name: "datasets",
        },
      ],
    },
    params: {
      cacheID: "05550a8792658c840c13ee4f0c8615d9",
      id: null,
      metadata: {},
      name: "RootQuery",
      operationKind: "query",
      text:
        'query RootQuery(\n  $search: String = ""\n  $count: Int = 10\n  $cursor: String\n) {\n  ...RootNav_query\n  ...RootDatasets_query\n}\n\nfragment RootDatasets_query on Query {\n  datasets(search: $search, first: $count, after: $cursor) {\n    total\n    edges {\n      cursor\n      node {\n        name\n        id\n        __typename\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n\nfragment RootNav_query on Query {\n  teamsSubmission\n}\n',
    },
  };
})();

(node as any).hash = "ce3f65b46a5157b40c4a38954fba1bd6";

export default node;
