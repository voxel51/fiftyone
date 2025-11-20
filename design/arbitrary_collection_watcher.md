# Arbitrary Collection Watcher Design Doc

## Goal

Decouple the notification service from the Execution Store to allow watching
arbitrary MongoDB collections. The system should support real-time updates via
server-side callbacks and Server-Sent Events (SSE) for any subscribed
collection.

## Architecture

### 1. Generic Notification Service

We will refactor `MongoChangeStreamNotificationService` to be a generic service
that watches a single MongoDB collection.

-   **Location**: `fiftyone/server/events/notification_service.py` (or similar,
    moving out of `operators/store`).
-   **Responsibilities**:
    -   Watch MongoDB Change Streams for a specific collection.
    -   Fallback to polling if change streams are unavailable.
    -   Transform raw MongoDB change events into `MessageData` objects using a
        configurable `MessageBuilder`.
    -   Notify local subscribers (callbacks).
    -   Notify remote subscribers (SSE) via `RemoteNotifier`.

### 2. Notification Manager

A central manager to handle multiple notification services (one per
collection).

-   **Location**: `fiftyone/server/events/manager.py`
-   **Responsibilities**:
    -   Dynamically start/stop watchers for different collections.
    -   Registry of active `ChangeNotificationService` instances.
    -   Proxy `subscribe`/`unsubscribe` calls to the appropriate service.
    -   Manage lifecycle (start/stop loops) for all services.

### 3. Message Data & Transformation

The `MessageData` class (currently in `fiftyone/operators/message.py`) is
tightly coupled to Key-Value pairs (`key`, `value`).

-   **Refactoring**:
    -   We will keep `MessageData` but allow it to represent generic document
        changes.
    -   **Default Mapping**:
        -   `key`: The document `_id` (as string).
        -   `value`: The full document (for insert/update).
    -   **Custom Mapping (e.g., Execution Store)**:
        -   A `MessageBuilder` callable will be passed to the service to define
            how to extract `key`, `value`, and `store_name` (channel) from the
            raw change document.

### 4. Remote Notifier (SSE)

The `SseNotifier` currently routes based on `store_name`.

-   **Generalization**: `store_name` will be treated as a generic "channel" or
    "topic".
-   For arbitrary collections, the channel is the collection name.
-   For Execution Store, the channel is the `store_name` field within the
    `execution_store` collection.

## Implementation Plan

1.  **Move & Refactor `NotificationService`**:

    -   Move `fiftyone/operators/store/notification_service.py` to
        `fiftyone/server/events/notification_service.py`.
    -   Rename `MongoChangeStreamNotificationService` to
        `MongoCollectionNotificationService` (or keep name but generalize).
    -   Add `message_builder` argument to constructor.

2.  **Create `NotificationManager`**:

    -   Implement `NotificationManager` in `fiftyone/server/events/manager.py`.
    -   Methods: `manage_collection(name)`, `subscribe(collection, callback)`,
        `stop_collection(name)`.

3.  **Update `app.py`**:

    -   Remove `default_notification_service` global from `operators/store`.
    -   Initialize `NotificationManager` in `app.py`.
    -   Register the `execution_store` watcher explicitly using the manager
        during startup.

4.  **Update `ExecutionStoreService`**:

    -   Update it to use the `NotificationManager` (or a specific service
        instance provided by it) instead of the hardcoded default.

5.  **Update SSE Operator**:
    -   Allow `SseOperator` to subscribe to generic collections via the
        manager.

## Key Interfaces

```python
# fiftyone/server/events/listener.py


class ChangeListener(ABC):
    async def on_change(self, message: MessageData):
        ...


# fiftyone/server/events/service.py


class NotificationService(ABC):
    def subscribe(self, callback: Callable[[MessageData], None]) -> str:
        ...

    def unsubscribe(self, sub_id: str):
        ...
```

## Directory Structure Changes

-   New directory: `fiftyone/server/events/`
    -   `__init__.py`
    -   `listener.py`
    -   `service.py` (The generic watcher)
    -   `manager.py` (The centralized manager)
