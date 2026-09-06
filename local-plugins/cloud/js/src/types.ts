/**
 * The panel-data contract, mirrored from the Python side.
 *
 * Both channels — `patch_panel_data` and the `cloud_push` store over SSE —
 * carry exactly these shapes, so nothing downstream has to know which one a
 * snapshot arrived on. Keep in step with `models.py`.
 */

export enum ConnectionStatus {
  Disconnected = "disconnected",
  Pairing = "pairing",
  Connected = "connected",
}

export enum PushStatus {
  Idle = "idle",
  Planning = "planning",
  Preview = "preview",
  Running = "running",
  Done = "done",
  Failed = "failed",
}

export enum PushStage {
  Uploading = "uploading",
  Ingesting = "ingesting",
  Closing = "closing",
}

export enum PushMode {
  Preview = "preview",
  Push = "push",
}

export enum PushTarget {
  Dataset = "dataset",
  View = "view",
}

export enum ErrorKind {
  Unavailable = "unavailable",
  Refused = "refused",
  SessionExpired = "session_expired",
  KeyRefused = "key_refused",
  NotPaired = "not_paired",
  PairingExpired = "pairing_expired",
  PairingDenied = "pairing_denied",
  Unknown = "unknown",
}

/** What `poll_pairing` answers. A superset of the RFC's own codes. */
export enum PollStatus {
  Pending = "pending",
  SlowDown = "slow_down",
  Issued = "issued",
  Expired = "expired",
  Denied = "denied",
  Refused = "refused",
  Unavailable = "unavailable",
}

export interface ErrorInfo {
  kind: ErrorKind;
  message: string;
}

/** Pairing fields safe to persist: no `device_code`. */
export interface PairingDisplay {
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  /** ISO 8601. */
  expires_at: string;
  /** Seconds between polls, per RFC 8628. */
  interval: number;
}

export interface ConnectionData {
  status: ConnectionStatus;
  /** Populated even when disconnected — env, then stored profile, then defaults. */
  api_url: string;
  auth_url: string;
  key_scope?: string;
  /** ISO 8601. */
  key_expires_at?: string;
  pairing?: PairingDisplay;
  error?: ErrorInfo;
}

export interface PreviewInfo {
  samples: number;
  files: number;
  total_bytes: number;
  missing: number;
}

/** Present only when a partial upload of this cloud dataset exists locally. */
export interface ResumableInfo {
  uploaded: number;
  total: number;
}

export interface RejectionInfo {
  index: number;
  reason: string;
}

export interface OutcomeInfo {
  dataset: string;
  samples: number;
  uploaded: number;
  skipped_uploads: number;
  missing_files: number;
  accepted: number;
  /** The true count; `rejected` carries only the first 20 reasons. */
  rejected_count: number;
  rejected: RejectionInfo[];
  shortfall: number;
}

export interface PushData {
  status: PushStatus;
  /** ISO 8601; the heartbeat every staleness rule reads. */
  updated_at: string;
  local_dataset: string;
  dataset_name?: string;
  stage?: PushStage;
  done: number;
  total: number;
  detail?: string;
  /** Set on `preview`; echoed back on `mode: "push"` to reuse the plan. */
  plan_token?: string;
  preview?: PreviewInfo;
  resumable?: ResumableInfo;
  outcome?: OutcomeInfo;
  error?: ErrorInfo;
}

export interface PanelData {
  connection?: ConnectionData;
  push?: PushData;
}

/**
 * What `CloudPanel.render` puts on the view: the panel-method URIs the
 * browser calls back through, plus the local dataset context the React side
 * cannot derive on its own.
 */
export interface CloudPanelSchemaView {
  start_pairing: string;
  poll_pairing: string;
  cancel_pairing: string;
  disconnect: string;
  reset_push: string;
  local_dataset: string;
  dataset_count: number;
  view_count: number;
  has_view: boolean;
}

export interface CloudPanelProps {
  data: PanelData;
  schema: { view: CloudPanelSchemaView };
}

/** Params for `push_to_cloud`. */
export interface PushParams {
  mode: PushMode;
  target: PushTarget;
  dataset_name: string;
  fresh: boolean;
  plan_token?: string;
  panel_id: string;
}

/** What the user has selected on the Upload form. */
export interface UploadSelection {
  target: PushTarget;
  datasetName: string;
}
