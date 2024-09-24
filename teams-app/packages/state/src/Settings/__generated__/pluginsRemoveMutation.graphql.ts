/**
 * @generated SignedSource<<dbf84058eb3e6d9ed09914b9a4274a3b>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type pluginsRemoveMutation$variables = {
  pluginName: string;
};
export type pluginsRemoveMutation$data = {
  readonly removePlugin: any | null;
};
export type pluginsRemoveMutation = {
  response: pluginsRemoveMutation$data;
  variables: pluginsRemoveMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "pluginName"
  }
],
v1 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "name",
        "variableName": "pluginName"
      }
    ],
    "kind": "ScalarField",
    "name": "removePlugin",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "pluginsRemoveMutation",
    "selections": (v1/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "pluginsRemoveMutation",
    "selections": (v1/*: any*/)
  },
  "params": {
    "cacheID": "de02dc31d443b4ab4860356953f6364b",
    "id": null,
    "metadata": {},
    "name": "pluginsRemoveMutation",
    "operationKind": "mutation",
    "text": "mutation pluginsRemoveMutation(\n  $pluginName: String!\n) {\n  removePlugin(name: $pluginName)\n}\n"
  }
};
})();

(node as any).hash = "47795aaef158eaa26bfef670e405a0f8";

export default node;
