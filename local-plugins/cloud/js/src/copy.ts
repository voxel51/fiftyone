/**
 * User-facing strings and the formatters that build them.
 *
 * Error copy lives here rather than in the components so one kind reads the
 * same wherever it surfaces. A refusal is the exception: the server's
 * message is shown verbatim, because only the server knows why it said no.
 */

import { ErrorInfo, ErrorKind, PushStage } from "./types";

/** Copy per {@link ErrorKind}; `Refused` maps to the server's own message. */
export const ERROR_COPY: Record<ErrorKind, string | null> = {
  [ErrorKind.Unavailable]:
    "Could not reach FiftyOne Cloud — check the URL or try again",
  [ErrorKind.Refused]: null,
  [ErrorKind.SessionExpired]:
    "The upload session expired; run again to start a fresh one",
  [ErrorKind.KeyRefused]: "Your connection was rejected — reconnect",
  [ErrorKind.NotPaired]:
    "This machine isn't connected to FiftyOne Cloud — connect first",
  [ErrorKind.PairingExpired]: "Pairing expired — try again",
  [ErrorKind.PairingDenied]: "Pairing was declined",
  [ErrorKind.Unknown]: null,
};

const BYTE_UNITS = ["KB", "MB", "GB", "TB", "PB"];

/**
 * The line to show for an error. Refusals return `error.message`; unknown
 * errors return `Something went wrong: <message>`; everything else returns
 * its {@link ERROR_COPY} entry.
 */
export function errorMessage(error?: ErrorInfo): string {
  if (!error) {
    return "";
  }

  const copy = ERROR_COPY[error.kind];
  if (copy) {
    return copy;
  }

  if (error.kind === ErrorKind.Refused) {
    // The server said no for a reason it alone knows; paraphrasing it would
    // lose the reason.
    return error.message || "FiftyOne Cloud refused the request";
  }

  return error.message
    ? `Something went wrong: ${error.message}`
    : "Something went wrong";
}

/** `1.2 GB` — SI units, one decimal above KB. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1000) {
    return `${Math.max(0, Math.round(bytes || 0))} B`;
  }

  let value = bytes / 1000;
  let unit = BYTE_UNITS[0];
  for (let index = 1; index < BYTE_UNITS.length && value >= 1000; index++) {
    value /= 1000;
    unit = BYTE_UNITS[index];
  }

  return unit === "KB"
    ? `${Math.round(value)} ${unit}`
    : `${value.toFixed(1)} ${unit}`;
}

/** `m:ss` remaining until an ISO 8601 instant; `0:00` once past. */
export function formatCountdown(expiresAt: string, now: number): string {
  const remaining = Math.max(
    0,
    Math.floor((Date.parse(expiresAt) - now) / 1000),
  );
  if (!Number.isFinite(remaining)) {
    return "0:00";
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** `Expires in 29 days`, or `Expired` — for the connected bar. */
export function formatKeyExpiry(expiresAt?: string): string | null {
  if (!expiresAt) {
    return null;
  }

  const parsed = Date.parse(expiresAt);
  if (Number.isNaN(parsed)) {
    return null;
  }

  const seconds = Math.floor((parsed - Date.now()) / 1000);
  if (seconds <= 0) {
    return "Expired";
  }

  const days = Math.floor(seconds / 86400);
  if (days >= 1) {
    return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
  }

  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) {
    return `Expires in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  return "Expires soon";
}

/**
 * The progress line for a stage: `Uploading media 412 / 900`,
 * `Ingesting metadata batch 3 / 12`, `Finalizing…`.
 */
export function stageLabel(
  stage: PushStage | undefined,
  done: number,
  total: number,
): string {
  switch (stage) {
    case PushStage.Uploading:
      return `Uploading media ${done} / ${total}`;
    case PushStage.Ingesting:
      return `Ingesting metadata batch ${done} / ${total}`;
    case PushStage.Closing:
      return "Finalizing…";
    default:
      return "Uploading…";
  }
}

/** `N samples · F files · 1.2 GB · K skipped, media not found locally`. */
export function previewSummary(preview: {
  samples: number;
  files: number;
  total_bytes: number;
  missing: number;
}): string {
  const parts = [
    `${preview.samples} ${preview.samples === 1 ? "sample" : "samples"}`,
    `${preview.files} ${preview.files === 1 ? "file" : "files"}`,
    formatBytes(preview.total_bytes),
  ];

  if (preview.missing > 0) {
    parts.push(`${preview.missing} skipped, media not found locally`);
  }

  return parts.join(" · ");
}

/**
 * PROPOSAL (open question 2): the Cloud App's dataset URL pattern is not
 * settled, so the Done card shows no "Open in FiftyOne Cloud" link. The
 * proposal is `<api_url with the leading `api.` host label dropped>/datasets/
 * <encodeURIComponent(name)>` — e.g. `https://api.fiftyone.ai` +
 * `my-dataset` -> `https://fiftyone.ai/datasets/my-dataset`. Returns `null`
 * until the pattern is confirmed, and ResultCard renders the CTA only on a
 * non-null result, so confirming it is a one-function change.
 */
export function cloudDatasetUrl(
  apiUrl: string,
  datasetName: string,
): string | null {
  void apiUrl;
  void datasetName;
  return null;
}
