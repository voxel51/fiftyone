"""
FiftyOne Cloud plugin: the OSS → cloud conversion path without leaving the
App.

A hybrid plugin. ``CloudPanel`` (``panel.py``) is the surface — a React view
over Python methods that are all sub-second — and ``PushToCloud``
(``operators.py``) owns every slow thing behind it: the dataset scan, the
preview, and the upload itself. ``CloudPushSubscription`` republishes the
``cloud_push`` execution store over SSE so progress survives a closed panel.

Everything cloud-facing lives in the plugin-local ``engine`` package, which
has no fiftyone imports; this package and ``cli.py`` are the two shells
around it.
"""

from .constants import (
    ALREADY_RUNNING_MESSAGE,
    API_URL_ENV_VAR,
    AUTH_URL_ENV_VAR,
    AUTO_CONFIRM_FILE_LIMIT,
    DEFAULT_API_URL,
    DEFAULT_AUTH_URL,
    HEARTBEAT_STALE_S,
    NOT_PAIRED_MESSAGE,
    PLAN_CACHE_TTL_S,
    PUSH_KEY,
    REJECTED_PREVIEW_LIMIT,
    RUNNING_GUARD_S,
    STALLED_MESSAGE,
    STORE_NAME,
    TERMINAL_SURFACE_S,
    TERMINAL_TTL_S,
    ConnectionStatus,
    ErrorKind,
    ParamKey,
    PollStatusValue,
    PushMode,
    PushStatus,
    PushTarget,
)
from .models import (
    ConnectionData,
    ErrorInfo,
    OutcomeInfo,
    PairingDisplay,
    PreviewInfo,
    PushData,
    RejectionInfo,
    ResumableInfo,
)
from .operators import CloudPushSubscription, OpenCloudPanel, PushToCloud
from .panel import CloudPanel
from .plan_cache import PLAN_CACHE, PlanCache
from .progress import (
    CompositeSink,
    PanelDataSink,
    ProgressSink,
    PushWorker,
    StoreSink,
    Throttle,
)


def register(plugin):
    plugin.register(CloudPanel)
    plugin.register(PushToCloud)
    plugin.register(CloudPushSubscription)
    plugin.register(OpenCloudPanel)
