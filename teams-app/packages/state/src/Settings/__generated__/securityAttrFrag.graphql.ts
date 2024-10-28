/**
 * @generated SignedSource<<71024731f22bbcbace30394910fe0351>>
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
export type securityAttrFrag$data = {
  readonly __typename: "BoolUserAttributeInfo";
  readonly attribute: UserAttribute;
  readonly boolOptions: ReadonlyArray<boolean>;
  readonly boolValue: boolean;
  readonly description: string;
  readonly display: string;
  readonly " $fragmentType": "securityAttrFrag";
} | {
  readonly __typename: "DatasetAccessLevelUserAttributeInfo";
  readonly accessLevelOptions: ReadonlyArray<DatasetAccessLevel>;
  readonly accessLevelValue: DatasetAccessLevel;
  readonly attribute: UserAttribute;
  readonly description: string;
  readonly display: string;
  readonly " $fragmentType": "securityAttrFrag";
} | {
  readonly __typename: "DatasetPermissionUserAttributeInfo";
  readonly attribute: UserAttribute;
  readonly description: string;
  readonly display: string;
  readonly permissionOptions: ReadonlyArray<DatasetPermission>;
  readonly permissionValue: DatasetPermission;
  readonly " $fragmentType": "securityAttrFrag";
} | {
  // This will never be '%other', but we need some
  // value in case none of the concrete values match.
  readonly __typename: "%other";
  readonly " $fragmentType": "securityAttrFrag";
};
export type securityAttrFrag$key = {
  readonly " $data"?: securityAttrFrag$data;
  readonly " $fragmentSpreads": FragmentRefs<"securityAttrFrag">;
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
  "name": "securityAttrFrag",
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

(node as any).hash = "c35942524a5175067e9ac076cedf0d12";

export default node;
