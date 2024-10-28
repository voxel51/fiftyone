/**
 * @generated SignedSource<<916ac8cf97b4917f9b6bb0ddee92ce85>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type DatasetMediaType = "GROUP" | "IMAGE" | "POINT_CLOUD" | "THREE_D" | "VIDEO" | "%future added value";
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type DatasetFilter = {
  createdBy?: StringFilter | null;
  mediaType?: DatasetMediaTypeComparisonFilter | null;
  name?: StringFilter | null;
  slug?: StringFilter | null;
  userPermission?: DatasetPermissionComparisonFilter | null;
  userPinned?: boolean | null;
};
export type StringFilter = {
  eq?: string | null;
  in?: ReadonlyArray<string> | null;
  ne?: string | null;
  regexp?: string | null;
};
export type DatasetPermissionComparisonFilter = {
  eq?: DatasetPermission | null;
  ge?: DatasetPermission | null;
  gt?: DatasetPermission | null;
  in?: ReadonlyArray<DatasetPermission> | null;
  le?: DatasetPermission | null;
  lt?: DatasetPermission | null;
  ne?: DatasetPermission | null;
};
export type DatasetMediaTypeComparisonFilter = {
  eq?: DatasetMediaType | null;
  ge?: DatasetMediaType | null;
  gt?: DatasetMediaType | null;
  in?: ReadonlyArray<DatasetMediaType> | null;
  le?: DatasetMediaType | null;
  lt?: DatasetMediaType | null;
  ne?: DatasetMediaType | null;
};
export type DatasetsCountQuery$variables = {
  filter?: DatasetFilter | null;
};
export type DatasetsCountQuery$data = {
  readonly " $fragmentSpreads": FragmentRefs<"DatasetsCountFragment">;
};
export type DatasetsCountQuery = {
  response: DatasetsCountQuery$data;
  variables: DatasetsCountQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "filter"
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "DatasetsCountQuery",
    "selections": [
      {
        "args": null,
        "kind": "FragmentSpread",
        "name": "DatasetsCountFragment"
      }
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "DatasetsCountQuery",
    "selections": [
      {
        "alias": null,
        "args": [
          {
            "kind": "Variable",
            "name": "filter",
            "variableName": "filter"
          }
        ],
        "kind": "ScalarField",
        "name": "datasetsCount",
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "3135dee934173a7b78eb1c74c936cfe8",
    "id": null,
    "metadata": {},
    "name": "DatasetsCountQuery",
    "operationKind": "query",
    "text": "query DatasetsCountQuery(\n  $filter: DatasetFilter\n) {\n  ...DatasetsCountFragment\n}\n\nfragment DatasetsCountFragment on Query {\n  datasetsCount(filter: $filter)\n}\n"
  }
};
})();

(node as any).hash = "3137ee16b3b51cea83d23a4e1f73f5ad";

export default node;
