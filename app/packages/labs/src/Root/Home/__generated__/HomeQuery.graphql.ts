/**
 * @generated SignedSource<<ec2882cbeff1393cba4f0c77f3d7d241>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from "relay-runtime";
import { FragmentRefs } from "relay-runtime";
export type HomeQuery$variables = {
  count?: number | null;
  cursor?: string | null;
};
export type HomeQueryVariables = HomeQuery$variables;
export type HomeQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"HomeComponent_query">;
};
export type HomeQueryResponse = HomeQuery$data;
export type HomeQuery = {
  variables: HomeQueryVariables;
  response: HomeQuery$data;
};

const node: ConcreteRequest = (function () {
  var v0 = [
      {
        defaultValue: 10,
        kind: "LocalArgument",
        name: "count",
      },
      {
        defaultValue: null,
        kind: "LocalArgument",
        name: "cursor",
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
        name: "first",
        variableName: "count",
      },
    ];
  return {
    fragment: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Fragment",
      metadata: null,
      name: "HomeQuery",
      selections: [
        {
          args: null,
          kind: "FragmentSpread",
          name: "HomeComponent_query",
        },
      ],
      type: "Query",
      abstractKey: null,
    },
    kind: "Request",
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: "Operation",
      name: "HomeQuery",
      selections: [
        {
          alias: null,
          args: v1 /*: any*/,
          concreteType: "DatasetConnection",
          kind: "LinkedField",
          name: "datasets",
          plural: false,
          selections: [
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
                      name: "__typename",
                      storageKey: null,
                    },
                  ],
                  storageKey: null,
                },
                {
                  alias: null,
                  args: null,
                  kind: "ScalarField",
                  name: "cursor",
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
          args: v1 /*: any*/,
          filters: null,
          handle: "connection",
          key: "DatasetList_query_datasets",
          kind: "LinkedHandle",
          name: "datasets",
        },
      ],
    },
    params: {
      cacheID: "c34097a8d00429d173f5edd9bafc5627",
      id: null,
      metadata: {},
      name: "HomeQuery",
      operationKind: "query",
      text:
        "query HomeQuery(\n  $count: Int = 10\n  $cursor: String\n) {\n  ...HomeComponent_query\n}\n\nfragment HomeComponent_query on Query {\n  datasets(first: $count, after: $cursor) {\n    edges {\n      node {\n        name\n        __typename\n      }\n      cursor\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n}\n",
    },
  };
})();

(node as any).hash = "b3d54134adce1b91498ec4ea2cad9c71";

export default node;
