/**
 * @generated SignedSource<<0ef85ec9b62e64f0982e69346443bb5b>>
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
export type runsPageStatusQuery$variables = {
  filter?: DelegatedOperationFilter | null;
  order?: DelegatedOperationOrderFieldsOrder | null;
  page: number;
  pageSize: number;
  search?: DelegatedOperationSearchFieldsSearch | null;
};
export type runsPageStatusQuery$data = {
  readonly delegatedOperationsPage: {
    readonly nodes: ReadonlyArray<{
      readonly id: string;
      readonly runState: string;
      readonly status: any | null;
    }>;
  };
};
export type runsPageStatusQuery = {
  response: runsPageStatusQuery$data;
  variables: runsPageStatusQuery$variables;
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
v1 = [
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
        "concreteType": "DelegatedOperation",
        "kind": "LinkedField",
        "name": "nodes",
        "plural": true,
        "selections": [
          {
            "alias": null,
            "args": null,
            "kind": "ScalarField",
            "name": "id",
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
            "name": "runState",
            "storageKey": null
          }
        ],
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
    "name": "runsPageStatusQuery",
    "selections": (v1/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "runsPageStatusQuery",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "0bcb9ba9054e1e74ae92ec9dd57ebfe8",
    "id": null,
    "metadata": {},
    "name": "runsPageStatusQuery",
    "operationKind": "query",
    "text": "query runsPageStatusQuery(\n  $filter: DelegatedOperationFilter = null\n  $order: DelegatedOperationOrderFieldsOrder = null\n  $page: Int!\n  $pageSize: Int!\n  $search: DelegatedOperationSearchFieldsSearch = null\n) {\n  delegatedOperationsPage(filter: $filter, order: $order, page: $page, pageSize: $pageSize, search: $search) {\n    nodes {\n      id\n      status\n      runState\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "257dc3077af0a59cc7e1b870a9e6971a";

export default node;
