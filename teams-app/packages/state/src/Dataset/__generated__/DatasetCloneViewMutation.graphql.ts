/**
 * @generated SignedSource<<08cd9570d065868a6c8c638b1212b22c>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest, Mutation } from 'relay-runtime';
export type ViewSelectors = {
  filters?: any | null;
  sampleIds?: ReadonlyArray<string> | null;
  viewStages?: ReadonlyArray<any> | null;
};
export type DatasetCloneViewMutation$variables = {
  name: string;
  snapshot?: string | null;
  sourceIdentifier: string;
  sourceView: ViewSelectors;
};
export type DatasetCloneViewMutation$data = {
  readonly createDatasetFromView: {
    readonly slug: string;
  };
};
export type DatasetCloneViewMutation = {
  response: DatasetCloneViewMutation$data;
  variables: DatasetCloneViewMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "name"
},
v1 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "snapshot"
},
v2 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "sourceIdentifier"
},
v3 = {
  "defaultValue": null,
  "kind": "LocalArgument",
  "name": "sourceView"
},
v4 = [
  {
    "alias": null,
    "args": [
      {
        "kind": "Variable",
        "name": "name",
        "variableName": "name"
      },
      {
        "kind": "Variable",
        "name": "snapshot",
        "variableName": "snapshot"
      },
      {
        "kind": "Variable",
        "name": "sourceIdentifier",
        "variableName": "sourceIdentifier"
      },
      {
        "kind": "Variable",
        "name": "sourceView",
        "variableName": "sourceView"
      }
    ],
    "concreteType": "Dataset",
    "kind": "LinkedField",
    "name": "createDatasetFromView",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "slug",
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
    "name": "DatasetCloneViewMutation",
    "selections": (v4/*: any*/),
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [
      (v2/*: any*/),
      (v3/*: any*/),
      (v0/*: any*/),
      (v1/*: any*/)
    ],
    "kind": "Operation",
    "name": "DatasetCloneViewMutation",
    "selections": (v4/*: any*/)
  },
  "params": {
    "cacheID": "8aa05f4374fe7b5843eac6a12c70acca",
    "id": null,
    "metadata": {},
    "name": "DatasetCloneViewMutation",
    "operationKind": "mutation",
    "text": "mutation DatasetCloneViewMutation(\n  $sourceIdentifier: String!\n  $sourceView: ViewSelectors!\n  $name: String!\n  $snapshot: String = null\n) {\n  createDatasetFromView(sourceIdentifier: $sourceIdentifier, sourceView: $sourceView, name: $name, snapshot: $snapshot) {\n    slug\n  }\n}\n"
  }
};
})();

(node as any).hash = "db0345530e2842e883f62779d9c44e7f";

export default node;
