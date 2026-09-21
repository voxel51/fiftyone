/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The App's own notices: errors, links, and messages it raises through Recoil.
 */

import * as fos from "@fiftyone/state";
import {
  Anchor,
  Button,
  LaunchIcon,
  Size,
  Toast,
  Variant,
} from "@voxel51/voodo";
import { SnackbarProvider } from "notistack";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useRecoilState } from "recoil";

import styles from "./Snackbar.module.css";

const SNACK_VISIBLE_DURATION = 5000;

const Notice = ({
  children,
  dismiss,
}: {
  children: ReactNode;
  dismiss: () => void;
}) => {
  // Notices see themselves out, where a voodo toast stays until it is closed.
  // One timer per notice: the ref keeps a re-render from re-arming it.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => {
    const timeout = setTimeout(
      () => dismissRef.current(),
      SNACK_VISIBLE_DURATION,
    );
    return () => clearTimeout(timeout);
  }, []);

  return (
    <Toast
      open
      anchor={Anchor.Bottom}
      className={styles.notice}
      description={children}
      onClose={dismiss}
      action={
        <Button
          data-cy="btn-dismiss-alert"
          variant={Variant.Primary}
          size={Size.Sm}
          onClick={dismiss}
        >
          Dismiss
        </Button>
      }
    />
  );
};

function SnackbarErrors() {
  const [snackErrors, setSnackErrors] = useRecoilState(fos.snackbarErrors);

  if (!snackErrors.length) return null;

  return (
    <Notice key={snackErrors.join("\n")} dismiss={() => setSnackErrors([])}>
      {snackErrors}
    </Notice>
  );
}

function SnackbarLinks() {
  const [snackLink, setSnackLink] = useRecoilState(fos.snackbarLink);

  if (!snackLink) return null;

  return (
    <Notice key={snackLink.link} dismiss={() => setSnackLink(null)}>
      <a
        className={styles.link}
        href={snackLink.link}
        target="_blank"
        rel="noreferrer"
      >
        {snackLink.message}
        <LaunchIcon size={Size.Sm} />
      </a>
    </Notice>
  );
}

function SnackbarMessage() {
  const [message, setSnackMessage] = useRecoilState(fos.snackbarMessage);

  if (!message) return null;

  return (
    <Notice key={message} dismiss={() => setSnackMessage(null)}>
      {message}
    </Notice>
  );
}

export default function Snackbar() {
  return (
    <>
      <SnackbarErrors />
      <SnackbarLinks />
      <SnackbarMessage />
      {/* The host for `useNotification`, which is its own queue */}
      <SnackbarProvider />
    </>
  );
}
