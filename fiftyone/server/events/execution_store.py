"""
Execution Store specific event handling logic.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set, Tuple, Callable

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from fiftyone.operators.message import MessageData, MessageMetadata
from fiftyone.server.events.service import PollingStrategy


def execution_store_message_builder(
    change: Dict[str, Any]
) -> Tuple[str, MessageData]:
    """Builds a message from a change stream document for Execution Store."""
    operation_type = change["operationType"]

    # Get the store name from the document
    if "fullDocument" in change and change["fullDocument"]:
        store_name = change["fullDocument"].get("store_name")
        dataset_id = change["fullDocument"].get("dataset_id")
        key = change["fullDocument"].get("key")
        value = change["fullDocument"].get("value")
    else:
        # For delete operations, we need to use the document key
        doc_id = change["documentKey"].get("_id", {})
        if isinstance(doc_id, dict):
            store_name = doc_id.get("store_name")
            dataset_id = doc_id.get("dataset_id")
            key = doc_id.get("key")
            value = None
        else:
            # If we can't get the store name, return None
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
    """Builds the query for initial state for Execution Store."""
    query = {
        "store_name": channel,
        "key": {"$ne": "__store__"},
    }

    if dataset_id is not None:
        query["dataset_id"] = (
            ObjectId(dataset_id) if isinstance(dataset_id, str) else dataset_id
        )

    return query


class ExecutionStorePollingStrategy(PollingStrategy):
    def __init__(self):
        self._last_keys: Dict[str, Set[str]] = {}

    async def poll(
        self,
        collection: AsyncIOMotorCollection,
        notify_callback: Callable[[str, MessageData], Any],
        last_poll_time: Optional[datetime],
    ) -> datetime:
        now = datetime.now(timezone.utc)
        store_names = await collection.distinct("store_name")

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
                if key == "__store__":
                    continue
                message_data = MessageData(
                    key=key,
                    value=None,
                    metadata=MessageMetadata(
                        operation_type="delete",
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
                if key == "__store__":
                    continue
                value = doc["value"]
                dataset_id = doc.get("dataset_id")
                event = "insert" if key not in previous_keys else "update"

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
