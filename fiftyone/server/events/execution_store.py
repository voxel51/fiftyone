"""
Execution Store specific event handling logic.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional, Set, Tuple

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from fiftyone.operators.message import MessageData, MessageMetadata
from fiftyone.server.events.constants import (
    OPERATION_TYPE_DELETE,
    OPERATION_TYPE_INSERT,
    OPERATION_TYPE_UPDATE,
)
from fiftyone.server.events.service import PollingStrategy

# Key used internally for store metadata
STORE_METADATA_KEY = "__store__"


def execution_store_message_builder(
    change: Dict[str, Any]
) -> Tuple[Optional[str], Optional[MessageData]]:
    """Build a message from a change stream document for Execution Store.

    Args:
        change: MongoDB change stream document.

    Returns:
        Tuple of (store_name, MessageData), or (None, None) if invalid.
    """
    operation_type = change.get("operationType")
    if not operation_type:
        return None, None

    # Get the store name from the document
    if "fullDocument" in change and change["fullDocument"]:
        store_name = change["fullDocument"].get("store_name")
        dataset_id = change["fullDocument"].get("dataset_id")
        key = change["fullDocument"].get("key")
        value = change["fullDocument"].get("value")
    else:
        # For delete operations, use the document key
        doc_id = change.get("documentKey", {}).get("_id", {})
        if isinstance(doc_id, dict):
            store_name = doc_id.get("store_name")
            dataset_id = doc_id.get("dataset_id")
            key = doc_id.get("key")
            value = None
        else:
            return None, None

    if not store_name:
        return None, None

    time_of_change = (
        change["wallTime"].isoformat()
        if "wallTime" in change
        else datetime.now(timezone.utc).isoformat()
    )

    message_data = MessageData(
        key=key,
        value=value,
        metadata=MessageMetadata(
            operation_type=operation_type,
            dataset_id=(str(dataset_id) if dataset_id is not None else None),
            timestamp=time_of_change,
        ),
    )

    return store_name, message_data


def execution_store_initial_state_builder(
    channel: str, dataset_id: Optional[str] = None
) -> Dict[str, Any]:
    """Build the query for initial state for Execution Store.

    Args:
        channel: The store name to get initial state for.
        dataset_id: Optional dataset ID to filter by.

    Returns:
        MongoDB query filter for initial state documents.
    """
    query: Dict[str, Any] = {
        "store_name": channel,
        "key": {"$ne": STORE_METADATA_KEY},
    }

    if dataset_id is not None:
        query["dataset_id"] = (
            ObjectId(dataset_id) if isinstance(dataset_id, str) else dataset_id
        )

    return query


class ExecutionStorePollingStrategy(PollingStrategy):
    """Polling strategy for Execution Store collections.

    Tracks keys per store to detect inserts, updates, and deletes
    when change streams are unavailable.
    """

    def __init__(self):
        self._last_keys: Dict[str, Set[str]] = {}

    async def poll(
        self,
        collection: AsyncIOMotorCollection,
        notify_callback: Callable[[str, MessageData], Any],
        last_poll_time: Optional[datetime],
    ) -> datetime:
        """Poll the execution store for changes.

        Args:
            collection: The MongoDB collection to poll.
            notify_callback: Async callback to notify of changes.
            last_poll_time: Time of last poll, or None for first poll.

        Returns:
            Timestamp of this poll.
        """
        now = datetime.now(timezone.utc)
        store_names = await collection.distinct("store_name")

        # First poll: initialize state
        if last_poll_time is None:
            for store_name in store_names:
                self._last_keys[store_name] = set(
                    await collection.distinct(
                        "key", {"store_name": store_name}
                    )
                )
            return now

        for store_name in store_names:
            current_keys = set(
                await collection.distinct("key", {"store_name": store_name})
            )
            previous_keys = self._last_keys.get(store_name, set())

            # Detect deleted keys
            deleted_keys = previous_keys - current_keys
            for key in deleted_keys:
                if key == STORE_METADATA_KEY:
                    continue
                message_data = MessageData(
                    key=key,
                    value=None,
                    metadata=MessageMetadata(
                        operation_type=OPERATION_TYPE_DELETE,
                        dataset_id=None,
                        timestamp=datetime.now(timezone.utc).isoformat(),
                    ),
                )
                await notify_callback(store_name, message_data)

            # Detect inserts and updates
            query = {
                "store_name": store_name,
                "updated_at": {"$gt": last_poll_time},
            }

            docs = await collection.find(query).to_list()
            for doc in docs:
                key = doc["key"]
                if key == STORE_METADATA_KEY:
                    continue
                value = doc["value"]
                dataset_id = doc.get("dataset_id")
                event = (
                    OPERATION_TYPE_INSERT
                    if key not in previous_keys
                    else OPERATION_TYPE_UPDATE
                )

                message_data = MessageData(
                    key=key,
                    value=value,
                    metadata=MessageMetadata(
                        operation_type=event,
                        dataset_id=(
                            str(dataset_id) if dataset_id is not None else None
                        ),
                        timestamp=datetime.now(timezone.utc).isoformat(),
                    ),
                )
                await notify_callback(store_name, message_data)

            self._last_keys[store_name] = current_keys

        return now
