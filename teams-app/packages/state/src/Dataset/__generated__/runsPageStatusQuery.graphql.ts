/**
 * @generated SignedSource<<0d80a8c02a66d75937ab0cc6971e6c19>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DelegatedOperationOrderFields = "completedAt" | "failedAt" | "operator" | "queuedAt" | "startedAt" | "updatedAt" | "%future added value";
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
    "cacheID": "883da2225144b6b628fe2e9aba7dc456",
    "id": null,
    "metadata": {},
    "name": "runsPageStatusQuery",
    "operationKind": "query",
    "text": "query runsPageStatusQuery(\n  $filter: DelegatedOperationFilter = null\n  $order: DelegatedOperationOrderFieldsOrder = null\n  $page: Int!\n  $pageSize: Int!\n  $search: DelegatedOperationSearchFieldsSearch = null\n) {\n  delegatedOperationsPage(filter: $filter, order: $order, page: $page, pageSize: $pageSize, search: $search) {\n    nodes {\n      id\n      status\n    }\n  }\n}\n"
  }
};
})();

(node as any).hash = "b34440d4c954edbd09a548928fbc06bb";

export default node;
