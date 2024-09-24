/**
 * @generated SignedSource<<fc04be800d6aed2740b50313691a7e8f>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { Fragment, ReaderFragment } from 'relay-runtime';
export type NotificationCode = "LICENSE_EXPIRATION" | "STRICT_COMPLIANCE" | "%future added value";
export type NotificationKind = "DIRECT" | "GLOBAL" | "%future added value";
export type NotificationLevel = "ERROR" | "INFO" | "WARNING" | "%future added value";
import { FragmentRefs } from "relay-runtime";
export type NotificationFrag$data = {
  readonly code: NotificationCode;
  readonly details: ReadonlyArray<string> | null;
  readonly kind: NotificationKind;
  readonly level: NotificationLevel;
  readonly read: boolean;
  readonly title: string;
  readonly " $fragmentType": "NotificationFrag";
};
export type NotificationFrag$key = {
  readonly " $data"?: NotificationFrag$data;
  readonly " $fragmentSpreads": FragmentRefs<"NotificationFrag">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "NotificationFrag",
  "selections": [
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "kind",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "code",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "level",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "title",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "details",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "read",
      "storageKey": null
    }
  ],
  "type": "Notification",
  "abstractKey": null
};

(node as any).hash = "a3b5ca981feb1484d82161f498978e85";

export default node;
