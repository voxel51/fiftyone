/**
 * @generated SignedSource<<3fb247d42fa62ec671272d13347f1065>>
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
export type runsPageQuery$variables = {
  filter?: DelegatedOperationFilter | null;
  order?: DelegatedOperationOrderFieldsOrder | null;
  page: number;
  pageSize: number;
  search?: DelegatedOperationSearchFieldsSearch | null;
};
export type runsPageQuery$data = {
  readonly delegatedOperationsPage: {
    readonly nodeTotal: number;
    readonly nodes: ReadonlyArray<{
      readonly completedAt: string | null;
      readonly datasetId: string | null;
      readonly failedAt: string | null;
      readonly id: string;
      readonly label: string | null;
      readonly logPath: string | null;
      readonly logUploadError: string | null;
      readonly logUrl: string | null;
      readonly operator: string;
      readonly pinned: boolean | null;
      readonly priority: number | null;
      readonly queuedAt: string | null;
      readonly runBy: {
        readonly id: string;
        readonly name: string;
      } | null;
      readonly runLink: string | null;
      readonly runState: string;
      readonly scheduledAt: string | null;
      readonly startedAt: string | null;
      readonly status: any | null;
      readonly updatedAt: string | null;
    }>;
    readonly pageTotal: number;
  };
};
export type runsPageQuery = {
  response: runsPageQuery$data;
  variables: runsPageQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "filter"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "order"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "page"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "pageSize"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "search"
  }
],
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v2 = [
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
            "args": null,
            "kind": "ScalarField",
            "name": "operator",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "label",
            "storageKey": null
          },
          (v1/*: any*/),
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "runState",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "startedAt",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "queuedAt",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "completedAt",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "failedAt",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "concreteType": "User",
            "kind": "LinkedField",
            "name": "runBy",
            "plural": false,
            "selections": [
              {
                "alias": null,
                "args": null,
                "kind": "ScalarField",
                "name": "name",
                "storageKey": null
              },
              (v1/*: any*/)
            ],
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "pinned",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "runLink",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "priority",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "logPath",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "logUrl",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "logUploadError",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "scheduledAt",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "status",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "datasetId",
            "storageKey": null
          },
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "updatedAt",
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
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "runsPageQuery",
    "selections": (v2/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "runsPageQuery",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "d471ceb5fbc8eef8f076a9b821ba6a9d",
    "id": null,
    "metadata": {},
    "name": "runsPageQuery",
    "operationKind": "query",
    "text": "query runsPageQuery(\n  $filter: DelegatedOperationFilter = null\n  $order: DelegatedOperationOrderFieldsOrder = null\n  $page: Int!\n  $pageSize: Int!\n  $search: DelegatedOperationSearchFieldsSearch = null\n) {\n  delegatedOperationsPage(filter: $filter, order: $order, page: $page, pageSize: $pageSize, search: $search) {\n    nodeTotal\n    nodes {\n      operator\n      label\n      id\n      runState\n      startedAt\n      queuedAt\n      completedAt\n      failedAt\n      runBy {\n        name\n        id\n      }\n      pinned\n      runLink\n      priority\n      logPath\n      logUrl\n      logUploadError\n      scheduledAt\n      status\n      datasetId\n    }\n    pageTotal\n  }\n}\n"
  }
};
})();

(node as any).hash = "d9521f99feace236e88311facf985f63";

export default node;
