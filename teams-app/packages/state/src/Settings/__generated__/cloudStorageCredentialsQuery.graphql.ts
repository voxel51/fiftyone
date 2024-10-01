/**
 * @generated SignedSource<<f545babfcb085ffa766804b21b7fd63a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Query } from 'relay-runtime';
export type CloudProvider = "AWS" | "AZURE" | "GCP" | "MINIO" | "%future added value";
export type cloudStorageCredentialsQuery$variables = {};
export type cloudStorageCredentialsQuery$data = {
  readonly cloudCredentials: ReadonlyArray<{
    readonly createdAt: string;
    readonly description: string | null;
    readonly prefixes: ReadonlyArray<string>;
    readonly provider: CloudProvider;
  }>;
};
export type cloudStorageCredentialsQuery = {
  response: cloudStorageCredentialsQuery$data;
  variables: cloudStorageCredentialsQuery$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "concreteType": "CloudProviderCredentials",
    "kind": "LinkedField",
    "name": "cloudCredentials",
    "plural": true,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "createdAt",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "description",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "prefixes",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "provider",
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
    "name": "cloudStorageCredentialsQuery",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "cloudStorageCredentialsQuery",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "7b1b1e89ef5f7a849ddcf496d49116e9",
    "id": null,
    "metadata": {},
    "name": "cloudStorageCredentialsQuery",
    "operationKind": "query",
    "text": "query cloudStorageCredentialsQuery {\n  cloudCredentials {\n    createdAt\n    description\n    prefixes\n    provider\n  }\n}\n"
  }
};
})();

(node as any).hash = "98b21b436186b2e01145ac37987f92f4";

export default node;
