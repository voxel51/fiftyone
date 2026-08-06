/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { LoadingDots, LoadingSpinner } from "@fiftyone/components";
import { createPortal } from "react-dom";
import styles from "./Loading.module.css";

const LOADING_MESSAGE = "Initializing plugins runtime";

/** Full screen placeholder shown while a blocking runtime initializes. */
export function PluginRuntimeLoadingScreen() {
  return (
    <div className={styles.screen} data-cy="plugin-runtime-loading-screen">
      <LoadingSpinner size="large" />
      <div className={styles.title}>
        <LoadingDots text={LOADING_MESSAGE} />
      </div>
      <div className={styles.subtitle}>
        Loading installed plugins, operators, and panels
      </div>
    </div>
  );
}

/** Unobtrusive indicator shown while a non-blocking runtime initializes. */
export function PluginRuntimeLoadingCard() {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={styles.card} data-cy="plugin-runtime-loading-card">
      <LoadingSpinner size="small" />
      <LoadingDots text={LOADING_MESSAGE} />
    </div>,
    document.body,
  );
}
