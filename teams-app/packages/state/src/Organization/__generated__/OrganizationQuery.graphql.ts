/**
 * @generated SignedSource<<9a24fa12f74ebf7e76a500237ca59387>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type OrganizationQuery$variables = {};
export type OrganizationQuery$data = {
  readonly organization: {
    readonly displayName: string;
    readonly pypiToken: string | null;
  };
};
export type OrganizationQuery = {
  response: OrganizationQuery$data;
  variables: OrganizationQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "Organization",
    "kind": "LinkedField",
    "name": "organization",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "displayName",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "pypiToken",
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
    "name": "OrganizationQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "OrganizationQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "55439e566a0288ed387e9f7a6b340c03",
    "id": null,
    "metadata": {},
    "name": "OrganizationQuery",
    "operationKind": "query",
    "text": "query OrganizationQuery {\n  organization {\n    displayName\n    pypiToken\n  }\n}\n"
  }
};
})();

(node as any).hash = "150a7f11aa4603096f1e13f29b4cb332";

export default node;
