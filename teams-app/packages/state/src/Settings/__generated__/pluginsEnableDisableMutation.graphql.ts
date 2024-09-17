/**
 * @generated SignedSource<<c48b65db9bc562e3a37cf01d9e55e79a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type pluginsEnableDisableMutation$variables = {
  enabled?: boolean | null;
  pluginName: string;
};
export type pluginsEnableDisableMutation$data = {
  readonly updatePlugin: {
    readonly enabled: boolean;
    readonly name: string;
  };
};
export type pluginsEnableDisableMutation = {
  response: pluginsEnableDisableMutation$data;
  variables: pluginsEnableDisableMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "enabled"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "pluginName"
},
v2 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "enabled",
        "variableName": "enabled"
      },
      {
        "kind": "Variable",
        "name": "name",
        "variableName": "pluginName"
      }
    ],
    "concreteType": "Plugin",
    "kind": "LinkedField",
    "name": "updatePlugin",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "name",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "enabled",
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
      (v1/*: any*/)
    ],
    "kind": "Fragment",
    "metadata": null,
    "name": "pluginsEnableDisableMutation",
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
    "name": "pluginsEnableDisableMutation",
    "selections": (v2/*: any*/)
  },
  "params": {
    "cacheID": "2fe808b85f34a0f357ba9ea697fc46c9",
    "id": null,
    "metadata": {},
    "name": "pluginsEnableDisableMutation",
    "operationKind": "mutation",
    "text": "mutation pluginsEnableDisableMutation(\n  $pluginName: String!\n  $enabled: Boolean\n) {\n  updatePlugin(name: $pluginName, enabled: $enabled) {\n    name\n    enabled\n  }\n}\n"
  }
};
})();

(node as any).hash = "22a3bc7dee102ee3da5bedbf1c3b1080";

export default node;
