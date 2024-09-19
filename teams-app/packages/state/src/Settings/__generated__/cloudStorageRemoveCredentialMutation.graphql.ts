/**
 * @generated SignedSource<<dd0f337343e2238cb7799fd916357994>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type CloudProvider = "AWS" | "AZURE" | "GCP" | "MINIO" | "%future added value";
export type cloudStorageRemoveCredentialMutation$variables = {
  prefixes?: ReadonlyArray<string> | null;
  provider: CloudProvider;
};
export type cloudStorageRemoveCredentialMutation$data = {
  readonly removeCloudCredentials: any | null;
};
export type cloudStorageRemoveCredentialMutation = {
  response: cloudStorageRemoveCredentialMutation$data;
  variables: cloudStorageRemoveCredentialMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "prefixes"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "provider"
},
v2 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "prefixes",
        "variableName": "prefixes"
      },
      {
        "kind": "Variable",
        "name": "provider",
        "variableName": "provider"
      }
    ],
    "kind": "ScalarField",
    "name": "removeCloudCredentials",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "cloudStorageRemoveCredentialMutation",
    "selections": (v2/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v1/*: any*/),
      (v0/*: any*/)
    ],
    "kind": "Operation",
    "name": "cloudStorageRemoveCredentialMutation",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "d4556c0a60b5177d1233fc52dfff1bbc",
    "id": null,
    "metadata": {},
    "name": "cloudStorageRemoveCredentialMutation",
    "operationKind": "mutation",
    "text": "mutation cloudStorageRemoveCredentialMutation(\n  $provider: CloudProvider!\n  $prefixes: [String!]\n) {\n  removeCloudCredentials(provider: $provider, prefixes: $prefixes)\n}\n"
  }
};
})();

(node as any).hash = "005a6d9be626a25e38085167bee47415";

export default node;
