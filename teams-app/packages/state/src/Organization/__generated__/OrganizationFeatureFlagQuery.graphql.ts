/**
 * @generated SignedSource<<92db7aca4445b3f4303b3da29d0fd201>>
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
    readonly invitationsEnabled: boolean;
    readonly sendEmailInvitations: boolean;
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
        "name": "sendEmailInvitations",
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
    "cacheID": "270a0316e222ce31e76a273adc9d2c78",
    "id": null,
    "metadata": {},
    "name": "OrganizationFeatureFlagQuery",
    "operationKind": "query",
    "text": "query OrganizationFeatureFlagQuery {\n  featureFlag {\n    invitationsEnabled\n    sendEmailInvitations\n  }\n}\n"
  }
};
})();

(node as any).hash = "92746b5b9b0ef060b17aa6cd4e69f205";

export default node;
