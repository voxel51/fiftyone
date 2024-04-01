/**
 * @generated SignedSource<<39713965fa461d36cfb4e87942cc977d>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type IndexType = "asc" | "desc" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type indexesFragment$data = {
  readonly frameIndexes: ReadonlyArray<{
    readonly key: ReadonlyArray<{
      readonly field: string;
      readonly type: IndexType;
    }>;
    readonly name: string;
    readonly unique: boolean | null;
    readonly wildcardProjection: {
      readonly fields: ReadonlyArray<string>;
      readonly inclusion: boolean;
    } | null;
  }> | null;
  readonly sampleIndexes: ReadonlyArray<{
    readonly key: ReadonlyArray<{
      readonly field: string;
      readonly type: IndexType;
    }>;
    readonly name: string;
    readonly unique: boolean | null;
    readonly wildcardProjection: {
      readonly fields: ReadonlyArray<string>;
      readonly inclusion: boolean;
    } | null;
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
  },
  {
    "alias": null,
    "args": null,
    "concreteType": "WildcardProjection",
    "kind": "LinkedField",
    "name": "wildcardProjection",
    "plural": false,
    "selections": [
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "fields",
        "storageKey": null
      },
      {
        "alias": null,
        "args": null,
        "kind": "ScalarField",
        "name": "inclusion",
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

(node as any).hash = "f1359b235ae62c969aa612e1c62bc1bf";

export default node;
