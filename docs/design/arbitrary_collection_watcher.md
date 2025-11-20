# Arbitrary Collection Watcher - Design Documentation

## Overview

This document describes the refactored notification service architecture that
decouples MongoDB change stream watching from the Execution Store, enabling
real-time subscriptions to arbitrary MongoDB collections.

## Goals

1. **Decouple from Execution Store**: The notification service should not be
   tied to the `execution_store` collection schema
2. **Parameterize Everything**: No hardcoded defaults - all behavior should be
   configurable
3. **Support Arbitrary Collections**: Watch any MongoDB collection with custom
   transformation logic
4. **Maintain SSE and Server-Side Subscriptions**: Support both browser (SSE)
   and Python (callback) subscribers
5. **Centralized Management**: Single manager to coordinate multiple collection
   watchers

## Architecture

### Core Components

#### 1. MongoCollectionNotificationService

**Location**: `fiftyone/server/events/service.py`

**Purpose**: Generic service that watches a single MongoDB collection for
changes.

**Key Features**:

-   Watches MongoDB Change Streams (with polling fallback)
-   Accepts a `message_builder` function to transform change documents into
    `MessageData`
-   Supports both local (callback) and remote (SSE) subscribers
-   Uses a `channel` abstraction instead of hardcoded "store_name"
-   Optional `initial_state_builder` for syncing current state to new
    subscribers
-   Optional `PollingStrategy` for custom polling logic when change streams
    unavailable

**Constructor Parameters**:

```python
def __init__(
    self,
    collection_name: str,  # MongoDB collection to watch
    message_builder: Callable[[Dict[str, Any]], Tuple[str, MessageData]],
    remote_notifier: Optional[RemoteNotifier] = None,
    registry: Optional[LocalSubscriptionRegistry] = None,
    polling_strategy: Optional[PollingStrategy] = None,
    initial_state_builder: Optional[Callable[[str, Optional[str]], Dict[str, Any]]] = None,
)
```

**Message Builder Function**:

-   Input: MongoDB change stream document
-   Output: Tuple of (channel_name, MessageData)
-   Allows custom extraction logic for different collection schemas

#### 2. NotificationManager

**Location**: `fiftyone/server/events/manager.py`

**Purpose**: Centralized manager for multiple notification services.

**Key Features**:

-   Manages lifecycle of multiple `MongoCollectionNotificationService`
    instances
-   Runs services in a dedicated event loop/thread
-   Dynamic start/stop of watchers for different collections
-   Proxy methods for subscribe/unsubscribe operations

**Key Methods**:

```python
def manage_collection(
    collection_name: str,
    message_builder: Callable,
    remote_notifier: Optional[RemoteNotifier] = None,
    registry: Optional[LocalSubscriptionRegistry] = None,
    polling_strategy: Optional[PollingStrategy] = None,
    initial_state_builder: Optional[Callable] = None,
) -> MongoCollectionNotificationService

def get_service(collection_name: str) -> Optional[MongoCollectionNotificationService]
def subscribe(collection_name: str, channel: str, callback: Callable, ...) -> str
def unsubscribe(subscription_id: str)
def start()
def stop()
```

#### 3. RemoteNotifier (SSE)

**Location**: `fiftyone/operators/remote_notifier.py`

**Refactoring**:

-   Changed from `store_name` to generic `channel` terminology
-   `broadcast_to_store()` → `broadcast_to_channel()`
-   `get_event_source_response()` now accepts `collection_name` parameter
-   `sync_current_state_for_client()` fetches notification service from manager

**Key Change**:

```python
# Old
async def broadcast_to_store(self, store_name: str, message: str)

# New
async def broadcast_to_channel(self, channel: str, message: str)
```

#### 4. Execution Store Integration

**Location**: `fiftyone/server/events/execution_store.py`

**Purpose**: Provides Execution Store-specific logic as a concrete
implementation.

**Components**:

-   `execution_store_message_builder`: Extracts `store_name`, `key`, `value`
    from change docs
-   `execution_store_initial_state_builder`: Builds query for initial state
    sync
-   `ExecutionStorePollingStrategy`: Implements polling logic for execution
    store schema

This demonstrates how to adapt the generic notification service to a specific
collection schema.

#### 5. LocalSubscriptionRegistry

**Location**: `fiftyone/server/events/subscription.py`

**Refactoring**:

-   Changed from `store_name` to generic `channel` terminology
-   Thread-safe registry for server-side callback subscriptions

### Data Flow

#### Subscription Flow (Server-Side)

```
ExecutionStoreRepo.subscribe()
    → NotificationManager.subscribe()
        → MongoCollectionNotificationService.subscribe()
            → LocalSubscriptionRegistry.subscribe()
```

#### Subscription Flow (Browser via SSE)

```
Browser → SSE Operator → SseNotifier.get_event_source_response()
    → Registers queue in channel_queues
    → sync_current_state_for_client()
        → Fetches service from NotificationManager
        → Broadcasts initial state
```

#### Change Notification Flow

```
MongoDB Change → MongoCollectionNotificationService._handle_change()
    → message_builder(change) → (channel, MessageData)
    → notify(channel, message_data)
        → Local subscribers: callback(message_data)
        → Remote subscribers: RemoteNotifier.broadcast_to_channel()
            → SSE queues: queue.put_nowait(message.to_json())
```

### Bootstrapping in app.py

**Location**: `fiftyone/server/app.py`

**Startup**:

```python
@app.on_event("startup")
async def startup_event():
    manager = get_default_notification_manager()
    manager.start()

    # Register execution_store watcher
    manager.manage_collection(
        collection_name="execution_store",
        message_builder=execution_store_message_builder,
        remote_notifier=default_sse_notifier,
        polling_strategy=ExecutionStorePollingStrategy(),
        initial_state_builder=execution_store_initial_state_builder,
    )

    app.state.notification_manager = manager
```

**Shutdown**:

```python
@app.on_event("shutdown")
async def shutdown_event():
    if hasattr(app.state, "notification_manager"):
        await asyncio.to_thread(app.state.notification_manager.stop)
```

## Design Considerations

### 1. Generic Message Data

**Decision**: Keep `MessageData` structure but make `message_builder`
responsible for populating it.

**Rationale**:

-   `MessageData` with `key`, `value`, `metadata` is flexible enough for most
    use cases
-   For collections with different schemas, `message_builder` can map fields
    appropriately
-   Keeps serialization/deserialization consistent

### 2. Channel vs Store Name

**Decision**: Use "channel" as the generic term for subscription topics.

**Rationale**:

-   For Execution Store: channel = store_name (logical store within collection)
-   For arbitrary collections: channel = collection_name or a field extracted
    from documents
-   Decouples terminology from Execution Store domain

### 3. Message Builder Pattern

**Decision**: Accept a callable that transforms change documents to (channel,
MessageData).

**Rationale**:

-   Maximum flexibility for different schemas
-   Separation of concerns: notification service handles watching/distribution,
    builder handles schema mapping
-   Easy to test independently

**Example**:

```python
def execution_store_message_builder(change: Dict[str, Any]) -> Tuple[str, MessageData]:
    operation_type = change["operationType"]
    doc = change.get("fullDocument", {})
    store_name = doc.get("store_name")  # This becomes the channel
    key = doc.get("key")
    value = doc.get("value")

    return store_name, MessageData(
        key=key,
        value=value,
        metadata=MessageMetadata(operation_type=operation_type, ...)
    )
```

### 4. Initial State Sync

**Decision**: Optional `initial_state_builder` function to query current state.

**Rationale**:

-   New subscribers need current state, not just future changes
-   Different collections may have different query requirements
-   Keeps initial state logic separate from change stream logic

### 5. Polling Strategy

**Decision**: Abstract `PollingStrategy` class for collections without change
stream support.

**Rationale**:

-   Change streams require MongoDB replica set configuration
-   Polling provides fallback for simpler deployments
-   Different collections may have different polling logic (e.g., tracking
    `updated_at` fields)

### 6. Single Manager with Multiple Services

**Decision**: One `NotificationManager` manages multiple
`MongoCollectionNotificationService` instances.

**Rationale**:

-   Centralized lifecycle management
-   Single event loop shared across all watchers (more efficient)
-   Easy to add/remove watchers at runtime
-   Simplified startup/shutdown

## Usage Examples

### Watching Execution Store (Current Behavior)

```python
# Automatically registered at startup in app.py
service = manager.manage_collection(
    collection_name="execution_store",
    message_builder=execution_store_message_builder,
    remote_notifier=default_sse_notifier,
    polling_strategy=ExecutionStorePollingStrategy(),
    initial_state_builder=execution_store_initial_state_builder,
)
```

### Watching an Arbitrary Collection

```python
# Define message builder for your collection
def my_collection_builder(change: Dict) -> Tuple[str, MessageData]:
    doc = change.get("fullDocument", {})
    channel = doc.get("category")  # Use category as channel
    return channel, MessageData(
        key=str(doc["_id"]),
        value=doc,
        metadata=MessageMetadata(operation_type=change["operationType"], ...)
    )

# Register with manager
manager = get_default_notification_manager()
service = manager.manage_collection(
    collection_name="my_collection",
    message_builder=my_collection_builder,
    remote_notifier=default_sse_notifier,  # Optional: enable SSE
)

# Subscribe from Python
def my_callback(msg: MessageData):
    print(f"Received: {msg.key} = {msg.value}")

sub_id = service.subscribe("my_channel", my_callback)
```

### Subscribing via SSE (Browser)

```python
# Create SSE operator
class MyCollectionSseOperator(foo.SseOperator):
    @property
    def subscription_config(self):
        return foo.SseOperatorConfig(
            name="subscribe_my_collection",
            label="Subscribe To My Collection",
            store_name="my_channel"  # The channel to subscribe to
        )
```

```javascript
// React hook usage
const { unsubscribe } = useExecutionStoreSubscribe({
    operatorUri: "@myorg/subscribe_my_collection",
    callback: (key, value, metadata) => {
        console.log(`Change: ${key}`, value);
    },
});
```

## Migration Notes

### Breaking Changes

1. `MongoChangeStreamNotificationService` →
   `MongoCollectionNotificationService`
2. `store_name` parameter → `channel` in registries and notifiers
3. `broadcast_to_store()` → `broadcast_to_channel()`
4. `default_notification_service` removed - use
   `get_default_notification_manager().get_service("execution_store")`

### Backward Compatibility

-   Execution Store API remains unchanged at the public interface level
-   `ExecutionStoreRepo.subscribe()` and `ExecutionStoreService.subscribe()`
    work as before
-   Existing SSE operators continue to work (updated internally)

## Security Considerations

-   Permission checking happens at operator/service level (not changed)
-   Dataset filtering via `dataset_id` still supported
-   No new security surface introduced

## Performance Considerations

-   Single event loop for all watchers (more efficient than multiple threads)
-   Change streams are efficient (MongoDB push-based)
-   Polling fallback has configurable interval
-   SSE queues have bounded size to prevent memory issues

## Future Enhancements

1. **Filtering Support**: Add filter predicates to subscriptions
2. **Batching**: Batch multiple changes in single SSE message
3. **Reconnection Logic**: Automatic reconnection for SSE clients
4. **Metrics**: Track subscription counts, message rates, etc.
5. **Multiple Channels Per Collection**: Allow subscribing to patterns or
   multiple channels at once

## Conclusion

The refactored architecture successfully decouples the notification service
from Execution Store while maintaining backward compatibility and providing a
clean, extensible API for watching arbitrary MongoDB collections. The design
follows SOLID principles with clear separation of concerns and dependency
injection throughout.
