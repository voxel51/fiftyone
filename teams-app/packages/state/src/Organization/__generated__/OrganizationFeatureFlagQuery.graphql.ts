/**
 * @generated SignedSource<<579582f26bf904c466ed6093e50217ef>>
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
    "cacheID": "456327711af7b9c3815abb363d50a53b",
    "id": null,
    "metadata": {},
    "name": "OrganizationFeatureFlagQuery",
    "operationKind": "query",
    "text": "query OrganizationFeatureFlagQuery {\n  featureFlag {\n    invitationsEnabled\n  }\n}\n"
  }
};
})();

(node as any).hash = "efb6cc70fd5807b84bffde160853851f";

export default node;
