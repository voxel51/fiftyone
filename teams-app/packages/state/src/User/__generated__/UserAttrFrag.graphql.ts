/**
 * @generated SignedSource<<2cd012e0bc3dc6c99312f7740caf96af>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type DatasetAccessLevel = "ALL" | "EXPLICIT" | "IMPLICIT" | "%future added value";
export type DatasetPermission = "EDIT" | "MANAGE" | "NO_ACCESS" | "TAG" | "VIEW" | "%future added value";
export type UserAttribute = "ACT_ON_BEHALF_OF_USER" | "CREATE_DATASETS" | "DATASET_ACCESS_LEVEL" | "EDIT_USERS" | "EXECUTE_BUILTIN_PLUGINS" | "EXECUTE_CUSTOM_PLUGINS" | "EXPORT_DATASETS" | "MANAGE_INVITATIONS" | "MANAGE_ORGANIZATION" | "MAX_DATASET_PERMISSION" | "USE_API_KEYS" | "VIEW_USERS" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type UserAttrFrag$data = {
  readonly __typename: "BoolUserAttributeInfo";
  readonly attribute: UserAttribute;
  readonly boolOptions: ReadonlyArray<boolean>;
  readonly boolValue: boolean;
  readonly description: string;
  readonly display: string;
  readonly " $fragmentType": "UserAttrFrag";
} | {
  readonly __typename: "DatasetAccessLevelUserAttributeInfo";
  readonly accessLevelOptions: ReadonlyArray<DatasetAccessLevel>;
  readonly accessLevelValue: DatasetAccessLevel;
  readonly attribute: UserAttribute;
  readonly description: string;
  readonly display: string;
  readonly " $fragmentType": "UserAttrFrag";
} | {
  readonly __typename: "DatasetPermissionUserAttributeInfo";
  readonly attribute: UserAttribute;
  readonly description: string;
  readonly display: string;
  readonly permissionOptions: ReadonlyArray<DatasetPermission>;
  readonly permissionValue: DatasetPermission;
  readonly " $fragmentType": "UserAttrFrag";
} | {
  // This will never be '%other', but we need some
  // value in case none of the concrete values match.
  readonly __typename: "%other";
  readonly " $fragmentType": "UserAttrFrag";
};
export type UserAttrFrag$key = {
  readonly " $data"?: UserAttrFrag$data;
  readonly " $fragmentSpreads": FragmentRefs<"UserAttrFrag">;
};

const node: ReaderFragment = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "attribute",
  "storageKey": null
},
v1 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "display",
  "storageKey": null
},
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "description",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "__typename",
  "storageKey": null
};
return {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "UserAttrFrag",
  "selections": [
    {
      "kind": "InlineFragment",
      "selections": [
        (v0/*: any*/),
        (v1/*: any*/),
        (v2/*: any*/),
        (v3/*: any*/),
        {
          "alias": "boolValue",
          "args": null,
          "kind": "ScalarField",
          "name": "value",
          "storageKey": null
        },
        {
          "alias": "boolOptions",
          "args": null,
          "kind": "ScalarField",
          "name": "options",
          "storageKey": null
        }
      ],
      "type": "BoolUserAttributeInfo",
      "abstractKey": null
    },
    {
      "kind": "InlineFragment",
      "selections": [
        (v0/*: any*/),
        (v1/*: any*/),
        (v2/*: any*/),
        (v3/*: any*/),
        {
          "alias": "accessLevelValue",
          "args": null,
          "kind": "ScalarField",
          "name": "value",
          "storageKey": null
        },
        {
          "alias": "accessLevelOptions",
          "args": null,
          "kind": "ScalarField",
          "name": "options",
          "storageKey": null
        }
      ],
      "type": "DatasetAccessLevelUserAttributeInfo",
      "abstractKey": null
    },
    {
      "kind": "InlineFragment",
      "selections": [
        (v0/*: any*/),
        (v1/*: any*/),
        (v2/*: any*/),
        (v3/*: any*/),
        {
          "alias": "permissionValue",
          "args": null,
          "kind": "ScalarField",
          "name": "value",
          "storageKey": null
        },
        {
          "alias": "permissionOptions",
          "args": null,
          "kind": "ScalarField",
          "name": "options",
          "storageKey": null
        }
      ],
      "type": "DatasetPermissionUserAttributeInfo",
      "abstractKey": null
    }
  ],
  "type": "UserAttributeInfo",
  "abstractKey": "__isUserAttributeInfo"
};
})();

(node as any).hash = "6eb93f8daec5733970c74e1442c4e4c8";

export default node;
