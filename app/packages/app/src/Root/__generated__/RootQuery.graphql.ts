/**
 * @generated SignedSource<<e6761d7ff415e46dd218d2c6bc692085>>
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
    "RootDatasets_query" | "RootGA_query" | "RootNav_query"
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
          name: "RootDatasets_query",
        },
        {
          args: null,
          kind: "FragmentSpread",
          name: "RootGA_query",
        },
        {
          args: null,
          kind: "FragmentSpread",
          name: "RootNav_query",
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
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "context",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "dev",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "doNotTrack",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "uid",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "version",
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: "ScalarField",
          name: "teamsSubmission",
          storageKey: null,
        },
      ],
    },
    params: {
      cacheID: "2d8bc133a1f906f1c953a989c97b5982",
      id: null,
      metadata: {},
      name: "RootQuery",
      operationKind: "query",
      text:
        'query RootQuery(\n  $search: String = ""\n  $count: Int = 10\n  $cursor: String\n) {\n  ...RootDatasets_query\n  ...RootGA_query\n  ...RootNav_query\n}\n\nfragment RootDatasets_query on Query {\n  datasets(search: $search, first: $count, after: $cursor) {\n    total\n    edges {\n      cursor\n      node {\n        name\n        id\n        __typename\n      }\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n\nfragment RootGA_query on Query {\n  context\n  dev\n  doNotTrack\n  uid\n  version\n}\n\nfragment RootNav_query on Query {\n  teamsSubmission\n}\n',
    },
  };
})();

(node as any).hash = "58b33be2ff73c5d66f21b1505e4b7d64";

export default node;
