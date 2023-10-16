/**
 * @generated SignedSource<<03c8815e06282d9400a510c40412d53e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type IndexType = "asc" | "desc" | "sphere" | "text" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type indexesFragment$data = {
  readonly frameIndexes: ReadonlyArray<{
    readonly key: ReadonlyArray<{
      readonly field: string;
      readonly type: IndexType;
    }>;
    readonly name: string;
    readonly unique: boolean | null;
  }> | null;
  readonly sampleIndexes: ReadonlyArray<{
    readonly key: ReadonlyArray<{
      readonly field: string;
      readonly type: IndexType;
    }>;
    readonly name: string;
    readonly unique: boolean | null;
  }> | null;
  readonly " $fragmentType": "indexesFragment";
};
export type indexesFragment$key = {
  readonly " $data"?: indexesFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"indexesFragment">;
};

const node: ReaderFragment = (function(){
var v0 = [
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
    "name": "unique",
    "storageKey": null
  },
  {
    "alias": null,
    "args": null,
    "concreteType": "IndexFields",
    "kind": "LinkedField",
    "name": "key",
    "plural": true,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "field",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "type",
        "storageKey": null
      }
    ],
    "storageKey": null
  }
];
return {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "indexesFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "concreteType": "Index",
      "kind": "LinkedField",
      "name": "frameIndexes",
      "plural": true,
      "selections": (v0/*: any*/),
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "Index",
      "kind": "LinkedField",
      "name": "sampleIndexes",
      "plural": true,
      "selections": (v0/*: any*/),
      "storageKey": null
    }
  ],
  "type": "Dataset",
  "abstractKey": null
};
})();

(node as any).hash = "a35e50e6357ed1613baf3a20a3385fe3";

export default node;
