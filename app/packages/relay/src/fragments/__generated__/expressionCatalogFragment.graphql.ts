/**
 * @generated SignedSource<<9dfd1da6fa86e82dd16237b59cff2edd>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type Kind = "ANY" | "ARRAY" | "BOOLEAN" | "DATE" | "ID" | "NUMBER" | "OBJECT" | "STRING" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type expressionCatalogFragment$data = {
  readonly viewExpressionAstVersion: number;
  readonly viewExpressionFieldKinds: ReadonlyArray<{
    readonly ftype: string;
    readonly kind: Kind;
  }>;
  readonly viewExpressionOperators: ReadonlyArray<{
    readonly argKinds: ReadonlyArray<Kind>;
    readonly display: string;
    readonly maxArgs: number | null;
    readonly minArgs: number;
    readonly name: string;
    readonly reflected: boolean;
    readonly returns: Kind;
    readonly selfKind: Kind;
    readonly summary: string;
    readonly syntax: string;
    readonly typed: boolean;
  }>;
  readonly " $fragmentType": "expressionCatalogFragment";
};
export type expressionCatalogFragment$key = {
  readonly " $data"?: expressionCatalogFragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"expressionCatalogFragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "expressionCatalogFragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "viewExpressionAstVersion",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "FieldKind",
      "kind": "LinkedField",
      "name": "viewExpressionFieldKinds",
      "plural": true,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "ftype",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "kind",
          "storageKey": null
        }
      ],
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "ViewExpressionOperator",
      "kind": "LinkedField",
      "name": "viewExpressionOperators",
      "plural": true,
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
          "name": "display",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "syntax",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "selfKind",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "argKinds",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "returns",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "minArgs",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "maxArgs",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "reflected",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "typed",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "summary",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};

(node as any).hash = "09a4a6113a0087a2648b62508ae8d10f";

export default node;
