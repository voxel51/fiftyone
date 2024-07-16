/**
 * @generated SignedSource<<9a3eda8bc1d80f655857b7c413ed35fc>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type setSampleMutation$variables = {
  groupId?: string | null;
  sampleId?: string | null;
  session?: string | null;
  subscription: string;
};
export type setSampleMutation$data = {
  readonly setSample: boolean;
};
export type setSampleMutation = {
  response: setSampleMutation$data;
  variables: setSampleMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "groupId"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "sampleId"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "session"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "subscription"
},
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "groupId",
        "variableName": "groupId"
      },
      {
        "kind": "Variable",
        "name": "sampleId",
        "variableName": "sampleId"
      },
      {
        "kind": "Variable",
        "name": "session",
        "variableName": "session"
      },
      {
        "kind": "Variable",
        "name": "subscription",
        "variableName": "subscription"
      }
    ],
    "kind": "ScalarField",
    "name": "setSample",
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
    "name": "setSampleMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v3/*: any*/),
      (v2/*: any*/),
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "setSampleMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "07a21e2136b50962f10b209b090d54fb",
    "id": null,
    "metadata": {},
    "name": "setSampleMutation",
    "operationKind": "mutation",
    "text": "mutation setSampleMutation(\n  $subscription: String!\n  $session: String\n  $groupId: String\n  $sampleId: String\n) {\n  setSample(subscription: $subscription, session: $session, groupId: $groupId, sampleId: $sampleId)\n}\n"
  }
};
})();

(node as any).hash = "4a353e4ff46091a87de9da830257306b";

export default node;
