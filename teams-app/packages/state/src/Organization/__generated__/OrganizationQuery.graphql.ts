/**
 * @generated SignedSource<<902c1d91ba21e9e048560dc791194b3e>>
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
    readonly roleReupgradeGracePeriod: number | null;
    readonly roleReupgradePeriod: number | null;
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
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "roleReupgradeGracePeriod",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "roleReupgradePeriod",
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
    "cacheID": "0019b01942f901517efeba5dcdec613f",
    "id": null,
    "metadata": {},
    "name": "OrganizationQuery",
    "operationKind": "query",
    "text": "query OrganizationQuery {\n  organization {\n    displayName\n    pypiToken\n    roleReupgradeGracePeriod\n    roleReupgradePeriod\n  }\n}\n"
  }
};
})();

(node as any).hash = "f92155551d83cc8d38023c79a30e30b2";

export default node;
