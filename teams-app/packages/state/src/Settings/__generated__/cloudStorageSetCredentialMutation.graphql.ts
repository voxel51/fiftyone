/**
 * @generated SignedSource<<b3e15e2ee7e80a75f28e99c941c3cf94>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type CloudProvider = "AWS" | "AZURE" | "GCP" | "MINIO" | "%future added value";
export type cloudStorageSetCredentialMutation$variables = {
  credentials: string;
  description?: string | null;
  prefixes?: ReadonlyArray<string> | null;
  provider: CloudProvider;
};
export type cloudStorageSetCredentialMutation$data = {
  readonly setCloudCredentials: {
    readonly provider: CloudProvider;
  };
};
export type cloudStorageSetCredentialMutation = {
  response: cloudStorageSetCredentialMutation$data;
  variables: cloudStorageSetCredentialMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "credentials"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "description"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "prefixes"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "provider"
},
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "credentials",
        "variableName": "credentials"
      },
      {
        "kind": "Variable",
        "name": "description",
        "variableName": "description"
      },
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
    "concreteType": "CloudProviderCredentials",
    "kind": "LinkedField",
    "name": "setCloudCredentials",
    "plural": false,
    "selections": [
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
    "argumentDefinitions": [
      (v0/*: any*/),
      (v1/*: any*/),
      (v2/*: any*/),
      (v3/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "cloudStorageSetCredentialMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v0/*: any*/),
      (v3/*: any*/),
      (v2/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "cloudStorageSetCredentialMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "714612dc9784be130e422e9953089678",
    "id": null,
    "metadata": {},
    "name": "cloudStorageSetCredentialMutation",
    "operationKind": "mutation",
    "text": "mutation cloudStorageSetCredentialMutation(\n  $credentials: String!\n  $provider: CloudProvider!\n  $prefixes: [String!]\n  $description: String\n) {\n  setCloudCredentials(credentials: $credentials, provider: $provider, prefixes: $prefixes, description: $description) {\n    provider\n  }\n}\n"
  }
};
})();

(node as any).hash = "71382e52639bd618e64106a1015d5b5a";

export default node;
