"""
Constants for the notification service.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os

# Operation types for change stream events
OPERATION_TYPE_INSERT = "insert"
OPERATION_TYPE_UPDATE = "update"
OPERATION_TYPE_DELETE = "delete"
OPERATION_TYPE_INITIAL = "initial"

# Environment variable names
ENV_NOTIFICATION_POLL_INTERVAL = "FIFTYONE_NOTIFICATION_POLL_INTERVAL_SECONDS"
ENV_NOTIFICATION_SERVICE_DISABLED = "FIFTYONE_NOTIFICATION_SERVICE_DISABLED"
ENV_NOTIFICATION_STARTUP_TIMEOUT = (
    "FIFTYONE_NOTIFICATION_STARTUP_TIMEOUT_SECONDS"
)

# Legacy environment variable (for backward compatibility)
ENV_LEGACY_POLL_INTERVAL = "FIFTYONE_EXECUTION_STORE_POLL_INTERVAL_SECONDS"
ENV_LEGACY_SERVICE_DISABLED = (
    "FIFTYONE_EXECUTION_STORE_NOTIFICATION_SERVICE_DISABLED"
)

# Default values
DEFAULT_POLL_INTERVAL_SECONDS = 5
DEFAULT_STARTUP_TIMEOUT_SECONDS = 10


def get_poll_interval_seconds() -> int:
    """Get the poll interval from environment variables.

    Checks the new variable first, falls back to legacy variable.
    """
    # Check new variable first
    value = os.getenv(ENV_NOTIFICATION_POLL_INTERVAL)
    if value is not None:
        return int(value)

    # Fall back to legacy variable
    value = os.getenv(ENV_LEGACY_POLL_INTERVAL)
    if value is not None:
        return int(value)

    return DEFAULT_POLL_INTERVAL_SECONDS


def get_startup_timeout_seconds() -> int:
    """Get the startup timeout from environment variables."""
    value = os.getenv(ENV_NOTIFICATION_STARTUP_TIMEOUT)
    if value is not None:
        return int(value)
    return DEFAULT_STARTUP_TIMEOUT_SECONDS


def is_notification_service_disabled() -> bool:
    """Check if the notification service is disabled.

    Checks the new variable first, falls back to legacy variable.
    """
    # Check new variable first
    value = os.getenv(ENV_NOTIFICATION_SERVICE_DISABLED)
    if value is not None:
        return value.lower() == "true"

    # Fall back to legacy variable
    value = os.getenv(ENV_LEGACY_SERVICE_DISABLED)
    if value is not None:
        return value.lower() == "true"

    return False
