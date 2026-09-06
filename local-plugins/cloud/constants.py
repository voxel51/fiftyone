"""
Names and tunables shared by the panel, the operators, and the progress
sinks. Kept in its own module so every shell can import them without
importing the plugin package root, which registers operators.
"""

from enum import Enum

# --- URL resolution -------------------------------------------------------

API_URL_ENV_VAR = "FIFTYONE_CLOUD_API_URL"
AUTH_URL_ENV_VAR = "FIFTYONE_CLOUD_AUTH_URL"

# PROPOSAL (open question 1): production hostnames are not settled, so the
# defaults ship empty and the panel auto-expands "Advanced" when neither the
# environment nor a stored profile supplies a URL. When the hostnames land,
# the candidates are "https://api.fiftyone.ai" and
# "https://auth.fiftyone.ai/cas/api" (CAS bases carry their path prefix).
DEFAULT_API_URL = ""
DEFAULT_AUTH_URL = ""

# --- Execution store ------------------------------------------------------

STORE_NAME = "cloud_push"
PUSH_KEY = "push"

# A stored ``running`` snapshot older than this means the worker stopped
# reporting; ``on_load`` surfaces it as failed rather than as live progress.
HEARTBEAT_STALE_S = 60

# A fresh ``running`` snapshot within this window refuses a second push.
RUNNING_GUARD_S = 30

# How long a terminal snapshot keeps being shown to a reopened panel.
TERMINAL_SURFACE_S = 3600

# TTL written on the store key once the push reaches a terminal state.
TERMINAL_TTL_S = 86400

# --- Push mechanics -------------------------------------------------------

# Only this many rejection reasons are carried in the outcome; the full list
# is unbounded and the store value has a 16 MB cap.
REJECTED_PREVIEW_LIMIT = 20

# A built plan is parked here between the preview and the confirm.
PLAN_CACHE_TTL_S = 600

# Live channel: at most one panel-data patch per this interval, unless the
# status or stage changed or the snapshot is terminal.
PANEL_THROTTLE_S = 0.25

# Durable channel: at most one store write per this interval, same escapes.
STORE_THROTTLE_S = 2.0

# The generator drains the worker's event queue on this cadence.
QUEUE_POLL_S = 0.25

# A preview with no missing media, fewer files than this, and no resumable
# state skips the confirm step in the App.
AUTO_CONFIRM_FILE_LIMIT = 100

# --- Operator / panel URIs ------------------------------------------------

PLUGIN_NAME = "@voxel51/cloud"
PANEL_NAME = "cloud_panel"
PANEL_LABEL = "FiftyOne Cloud"
PUSH_OPERATOR_NAME = "push_to_cloud"
SUBSCRIPTION_OPERATOR_NAME = "cloud_push_subscription"
OPEN_PANEL_OPERATOR_NAME = "open_cloud_panel"

PUSH_OPERATOR_URI = f"{PLUGIN_NAME}/{PUSH_OPERATOR_NAME}"
SUBSCRIPTION_OPERATOR_URI = f"{PLUGIN_NAME}/{SUBSCRIPTION_OPERATOR_NAME}"

# The React component registered by the JS bundle.
PANEL_COMPONENT = "CloudPanelView"


class ParamKey(str, Enum):
    """Keys the App sends into panel methods and the push operator.

    Panel-method params arrive at the top level of ``ctx.params`` alongside
    ``panel_id`` and ``panel_state``.
    """

    API_URL = "api_url"
    AUTH_URL = "auth_url"
    DEVICE_CODE = "device_code"
    MODE = "mode"
    TARGET = "target"
    DATASET_NAME = "dataset_name"
    FRESH = "fresh"
    PLAN_TOKEN = "plan_token"
    PANEL_ID = "panel_id"


class PanelDataKey(str, Enum):
    """Top-level keys of panel ``data``. ``patch_panel_data`` replaces a whole
    top-level key, so every patch under one of these is a complete object."""

    CONNECTION = "connection"
    PUSH = "push"


class PushMode(str, Enum):
    """Which half of ``push_to_cloud`` the caller wants."""

    PREVIEW = "preview"
    PUSH = "push"


class PushTarget(str, Enum):
    DATASET = "dataset"
    VIEW = "view"


class ConnectionStatus(str, Enum):
    DISCONNECTED = "disconnected"
    PAIRING = "pairing"
    CONNECTED = "connected"


class PushStatus(str, Enum):
    IDLE = "idle"
    PLANNING = "planning"
    PREVIEW = "preview"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"

    @property
    def is_terminal(self) -> bool:
        """Terminal statuses get a TTL on the store key and always write
        through the throttles."""
        return self in (PushStatus.DONE, PushStatus.FAILED)


class PollStatusValue(str, Enum):
    """What ``poll_pairing`` reports back to the browser. A superset of the
    engine's ``PollStatus``: the two transport faults the panel method
    catches rather than raises are statuses here."""

    PENDING = "pending"
    SLOW_DOWN = "slow_down"
    ISSUED = "issued"
    EXPIRED = "expired"
    DENIED = "denied"
    REFUSED = "refused"
    UNAVAILABLE = "unavailable"


class ErrorKind(str, Enum):
    """The taxonomy the App renders copy from. One kind per engine error
    class; anything unmapped is ``UNKNOWN``."""

    UNAVAILABLE = "unavailable"
    REFUSED = "refused"
    SESSION_EXPIRED = "session_expired"
    KEY_REFUSED = "key_refused"
    NOT_PAIRED = "not_paired"
    PAIRING_EXPIRED = "pairing_expired"
    PAIRING_DENIED = "pairing_denied"
    UNKNOWN = "unknown"


# Messages the server does not own. A refusal carries the server's own
# message verbatim, so it has no entry here.
STALLED_MESSAGE = "The upload stopped reporting progress; run again to resume"
ALREADY_RUNNING_MESSAGE = "An upload of this dataset is already running"
NOT_PAIRED_MESSAGE = "This machine is not connected to FiftyOne Cloud"
