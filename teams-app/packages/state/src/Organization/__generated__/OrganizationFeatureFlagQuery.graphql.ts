/**
 * @generated SignedSource<<6dfdf39642a684ba575bf681408d5f9f>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type OrganizationFeatureFlagQuery$variables = {};
export type OrganizationFeatureFlagQuery$data = {
  readonly featureFlag: {
    readonly invitationEmailsEnabled: boolean;
    readonly invitationsEnabled: boolean;
  };
};
export type OrganizationFeatureFlagQuery = {
  response: OrganizationFeatureFlagQuery$data;
  variables: OrganizationFeatureFlagQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "FeatureFlag",
    "kind": "LinkedField",
    "name": "featureFlag",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "invitationsEnabled",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "invitationEmailsEnabled",
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
    "name": "OrganizationFeatureFlagQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "OrganizationFeatureFlagQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "a3322f9b59fff62f7d73610ef11572f5",
    "id": null,
    "metadata": {},
    "name": "OrganizationFeatureFlagQuery",
    "operationKind": "query",
    "text": "query OrganizationFeatureFlagQuery {\n  featureFlag {\n    invitationsEnabled\n    invitationEmailsEnabled\n  }\n}\n"
  }
};
})();

(node as any).hash = "2785a3b002046a42dc69ae3927ac8c4d";

export default node;
