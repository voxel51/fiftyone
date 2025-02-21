/**
 * @generated SignedSource<<fc90b06305f59ecc6a53a21d0485e561>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DelegatedOperationOrderFields = "completedAt" | "failedAt" | "operator" | "queuedAt" | "scheduledAt" | "startedAt" | "updatedAt" | "%future added value";
export type DelegatedOperationSearchFields = "delegationTarget" | "label" | "operator" | "user" | "%future added value";
export type OrderInputDirection = "ASC" | "DESC" | "%future added value";
export type DelegatedOperationFilter = {
  datasetIdentifier?: StringFilter | null;
  delegationTarget?: StringFilter | null;
  operator?: StringFilter | null;
  pinned?: boolean | null;
  runBy?: StringFilter | null;
  runState?: StringFilter | null;
};
export type StringFilter = {
  eq?: string | null;
  in?: ReadonlyArray<string> | null;
  ne?: string | null;
  regexp?: string | null;
};
export type DelegatedOperationOrderFieldsOrder = {
  direction: OrderInputDirection;
  field: DelegatedOperationOrderFields;
};
export type DelegatedOperationSearchFieldsSearch = {
  fields: ReadonlyArray<DelegatedOperationSearchFields>;
  term: string;
};
export type runsLogQuery$variables = {
  filter?: DelegatedOperationFilter | null;
  logs_after?: string | null;
  logs_first: number;
  order?: DelegatedOperationOrderFieldsOrder | null;
  page: number;
  pageSize: number;
  search?: DelegatedOperationSearchFieldsSearch | null;
};
export type runsLogQuery$data = {
  readonly delegatedOperationsPage: {
    readonly nodeTotal: number;
    readonly nodes: ReadonlyArray<{
      readonly logConnection: {
        readonly edges: ReadonlyArray<{
          readonly cursor: string;
          readonly node: {
            readonly content: string | null;
            readonly date: string | null;
            readonly level: string | null;
          };
        }>;
        readonly pageInfo: {
          readonly endCursor: string | null;
          readonly hasNextPage: boolean;
          readonly hasPreviousPage: boolean;
          readonly startCursor: string | null;
        };
      };
    }>;
    readonly pageTotal: number;
  };
};
export type runsLogQuery = {
  response: runsLogQuery$data;
  variables: runsLogQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "filter"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "logs_after"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "logs_first"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "order"
},
v4 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "page"
},
v5 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "pageSize"
},
v6 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "search"
},
v7 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "filter",
        "variableName": "filter"
      },
      {
        "kind": "Variable",
        "name": "order",
        "variableName": "order"
      },
      {
        "kind": "Variable",
        "name": "page",
        "variableName": "page"
      },
      {
        "kind": "Variable",
        "name": "pageSize",
        "variableName": "pageSize"
      },
      {
        "kind": "Variable",
        "name": "search",
        "variableName": "search"
      }
    ],
    "concreteType": "DelegatedOperationPage",
    "kind": "LinkedField",
    "name": "delegatedOperationsPage",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "nodeTotal",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "concreteType": "DelegatedOperation",
        "kind": "LinkedField",
        "name": "nodes",
        "plural": true,
        "selections": [
          {
            "alias": null,
            "args": [
              {
                "kind": "Variable",
                "name": "after",
                "variableName": "logs_after"
              },
              {
                "kind": "Variable",
                "name": "first",
                "variableName": "logs_first"
              }
            ],
            "concreteType": "DelegatedOperationLogConnection",
            "kind": "LinkedField",
            "name": "logConnection",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "concreteType": "PageInfo",
                "kind": "LinkedField",
                "name": "pageInfo",
                "plural": false,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "hasNextPage",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "hasPreviousPage",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "startCursor",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "endCursor",
                    "storageKey": null
                  }
                ],
                "storageKey": null
              },
              {
                "alias": null,
                "args": null,
                "concreteType": "DelegatedOperationLogEdge",
                "kind": "LinkedField",
                "name": "edges",
                "plural": true,
                "selections": [
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": "DelegatedOperationLog",
                    "kind": "LinkedField",
                    "name": "node",
                    "plural": false,
                    "selections": [
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "content",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "date",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "level",
                        "storageKey": null
                      }
                    ],
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "cursor",
                    "storageKey": null
                  }
                ],
                "storageKey": null
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "pageTotal",
        "storageKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/),
      (v4/*: any*/),
      (v5/*: any*/),
      (v6/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "runsLogQuery",
    "selections": (v7/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v3/*: any*/),
      (v4/*: any*/),
      (v5/*: any*/),
      (v6/*: any*/),
      (v2/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "runsLogQuery",
    "selections": (v7/*: any*/)
  },
  "params": {
    "cacheID": "dc1545880f752ee09503d19b7c029024",
    "id": null,
    "metadata": {},
    "name": "runsLogQuery",
    "operationKind": "query",
    "text": "query runsLogQuery(\n  $filter: DelegatedOperationFilter = null\n  $order: DelegatedOperationOrderFieldsOrder = null\n  $page: Int!\n  $pageSize: Int!\n  $search: DelegatedOperationSearchFieldsSearch = null\n  $logs_first: Int!\n  $logs_after: String = null\n) {\n  delegatedOperationsPage(filter: $filter, order: $order, page: $page, pageSize: $pageSize, search: $search) {\n    nodeTotal\n    nodes {\n      logConnection(first: $logs_first, after: $logs_after) {\n        pageInfo {\n          hasNextPage\n          hasPreviousPage\n          startCursor\n          endCursor\n        }\n        edges {\n          node {\n            content\n            date\n            level\n          }\n          cursor\n        }\n      }\n    }\n    pageTotal\n  }\n}\n"
  }
};
})();

(node as any).hash = "d93ef884e779625a8dbdd85b3e17e63e";

export default node;
