/**
 * @generated SignedSource<<2e21e55f66b4e035934048a917c8c440>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type UserRole = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type manageDatasetGetAccessPage_userFrag$data = {
  readonly activePermission: DatasetPermission;
  readonly attributes: ReadonlyArray<{
    readonly " $fragmentSpreads": FragmentRefs<"UserAttrFrag">;
  }>;
  readonly email: string;
  readonly name: string;
  readonly picture: string | null;
  readonly role: UserRole;
  readonly userId: string;
  readonly userPermission: DatasetPermission | null;
  readonly " $fragmentType": "manageDatasetGetAccessPage_userFrag";
};
export type manageDatasetGetAccessPage_userFrag$key = {
  readonly " $data"?: manageDatasetGetAccessPage_userFrag$data;
  readonly " $fragmentSpreads": FragmentRefs<"manageDatasetGetAccessPage_userFrag">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "manageDatasetGetAccessPage_userFrag",
  "selections": [
    {
      "alias": "userId",
      "args": null,
      "kind": "ScalarField",
      "name": "id",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "email",
      "storageKey": null
    },
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
      "name": "role",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "picture",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "userPermission",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "activePermission",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": null,
      "kind": "LinkedField",
      "name": "attributes",
      "plural": true,
      "selections": [
        {
          "args": null,
          "kind": "FragmentSpread",
          "name": "UserAttrFrag"
        }
      ],
      "storageKey": null
    }
  ],
  "type": "DatasetUser",
  "abstractKey": null
};

(node as any).hash = "d57fe4502f5eb5d644db4f6997f20956";

export default node;
