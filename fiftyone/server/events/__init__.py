"""
FiftyOne Server events module.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.server.events.constants import (
    OPERATION_TYPE_DELETE,
    OPERATION_TYPE_INITIAL,
    OPERATION_TYPE_INSERT,
    OPERATION_TYPE_UPDATE,
    get_poll_interval_seconds,
    get_startup_timeout_seconds,
    is_notification_service_disabled,
)
from fiftyone.server.events.execution_store import (
    ExecutionStorePollingStrategy,
    execution_store_initial_state_builder,
    execution_store_message_builder,
)
from fiftyone.server.events.manager import (
    NotificationManager,
    get_default_notification_manager,
)
from fiftyone.server.events.samples import (
    sample_initial_state_builder,
    sample_message_builder,
)
from fiftyone.server.events.service import (
    ChangeStreamNotificationService,
    InitialStateBuilder,
    MessageBuilder,
    MongoCollectionNotificationService,
    PollingStrategy,
)
from fiftyone.server.events.subscription import (
    InLocalMemorySubscriptionRegistry,
    LocalSubscriptionRegistry,
    SubscriptionCallback,
    default_subscription_registry,
)

__all__ = [
    # Constants
    "OPERATION_TYPE_DELETE",
    "OPERATION_TYPE_INITIAL",
    "OPERATION_TYPE_INSERT",
    "OPERATION_TYPE_UPDATE",
    # Configuration helpers
    "get_poll_interval_seconds",
    "get_startup_timeout_seconds",
    "is_notification_service_disabled",
    # Manager
    "NotificationManager",
    "get_default_notification_manager",
    # Service
    "ChangeStreamNotificationService",
    "MongoCollectionNotificationService",
    "PollingStrategy",
    # Type aliases
    "InitialStateBuilder",
    "MessageBuilder",
    "SubscriptionCallback",
    # Subscription
    "LocalSubscriptionRegistry",
    "InLocalMemorySubscriptionRegistry",
    "default_subscription_registry",
    # Execution Store
    "execution_store_message_builder",
    "execution_store_initial_state_builder",
    "ExecutionStorePollingStrategy",
    # Samples
    "sample_message_builder",
    "sample_initial_state_builder",
]
