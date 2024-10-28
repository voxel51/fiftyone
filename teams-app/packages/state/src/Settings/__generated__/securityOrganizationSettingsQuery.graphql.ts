/**
 * @generated SignedSource<<b4ce9d9976204b0cdbe619289e857167>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type securityOrganizationSettingsQuery$variables = {};
export type securityOrganizationSettingsQuery$data = {
  readonly organizationSettings: {
    readonly defaultDatasetPermission: DatasetPermission;
    readonly defaultOperatorMinimumDatasetPermission: DatasetPermission;
    readonly defaultOperatorMinimumRole: UserRole;
    readonly defaultUserRole: UserRole;
  };
};
export type securityOrganizationSettingsQuery = {
  response: securityOrganizationSettingsQuery$data;
  variables: securityOrganizationSettingsQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "OrganizationSettings",
    "kind": "LinkedField",
    "name": "organizationSettings",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "defaultDatasetPermission",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "defaultOperatorMinimumDatasetPermission",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "defaultOperatorMinimumRole",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "defaultUserRole",
        "storageKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "securityOrganizationSettingsQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "securityOrganizationSettingsQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "d9fc4b8f8b827116b6af0af2e8674e9c",
    "id": null,
    "metadata": {},
    "name": "securityOrganizationSettingsQuery",
    "operationKind": "query",
    "text": "query securityOrganizationSettingsQuery {\n  organizationSettings {\n    defaultDatasetPermission\n    defaultOperatorMinimumDatasetPermission\n    defaultOperatorMinimumRole\n    defaultUserRole\n  }\n}\n"
  }
};
})();

(node as any).hash = "61f78400b00b8772129827de2fd1bd1d";

export default node;
