/**
 * @generated SignedSource<<27eb760d2c49ae39129a125ad4cf5a80>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
export type securitySetOrganizationSettingsMutation$variables = {
  defaultDatasetPermission?: DatasetPermission | null;
  defaultOperatorMinimumDatasetPermission?: DatasetPermission | null;
  defaultOperatorMinimumRole?: UserRole | null;
  defaultUserRole?: UserRole | null;
};
export type securitySetOrganizationSettingsMutation$data = {
  readonly setOrganizationSettings: {
    readonly defaultDatasetPermission: DatasetPermission;
    readonly defaultOperatorMinimumDatasetPermission: DatasetPermission;
    readonly defaultOperatorMinimumRole: UserRole;
    readonly defaultUserRole: UserRole;
  };
};
export type securitySetOrganizationSettingsMutation = {
  response: securitySetOrganizationSettingsMutation$data;
  variables: securitySetOrganizationSettingsMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "defaultDatasetPermission"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "defaultOperatorMinimumDatasetPermission"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "defaultOperatorMinimumRole"
  },
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "defaultUserRole"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "defaultDatasetPermission",
        "variableName": "defaultDatasetPermission"
      },
      {
        "kind": "Variable",
        "name": "defaultOperatorMinimumDatasetPermission",
        "variableName": "defaultOperatorMinimumDatasetPermission"
      },
      {
        "kind": "Variable",
        "name": "defaultOperatorMinimumRole",
        "variableName": "defaultOperatorMinimumRole"
      },
      {
        "kind": "Variable",
        "name": "defaultUserRole",
        "variableName": "defaultUserRole"
      }
    ],
    "concreteType": "OrganizationSettings",
    "kind": "LinkedField",
    "name": "setOrganizationSettings",
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
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "securitySetOrganizationSettingsMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "securitySetOrganizationSettingsMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "0979ba328b47fb64a70f8556cfdcaed3",
    "id": null,
    "metadata": {},
    "name": "securitySetOrganizationSettingsMutation",
    "operationKind": "mutation",
    "text": "mutation securitySetOrganizationSettingsMutation(\n  $defaultDatasetPermission: DatasetPermission\n  $defaultOperatorMinimumDatasetPermission: DatasetPermission\n  $defaultOperatorMinimumRole: UserRole\n  $defaultUserRole: UserRole\n) {\n  setOrganizationSettings(defaultDatasetPermission: $defaultDatasetPermission, defaultOperatorMinimumDatasetPermission: $defaultOperatorMinimumDatasetPermission, defaultOperatorMinimumRole: $defaultOperatorMinimumRole, defaultUserRole: $defaultUserRole) {\n    defaultDatasetPermission\n    defaultOperatorMinimumDatasetPermission\n    defaultOperatorMinimumRole\n    defaultUserRole\n  }\n}\n"
  }
};
})();

(node as any).hash = "2e0806297d92c2bd681ff868d9fa3d7e";

export default node;
