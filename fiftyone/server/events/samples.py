"""
Sample collection event handling logic.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from fiftyone.operators.message import MessageData, MessageMetadata


def sample_message_builder(change: Dict[str, Any]) -> Tuple[str, MessageData]:
    """Builds a message from a change stream document for a sample collection.

    This builder assumes it is watching a specific sample collection (e.g. 'samples.xyz').
    It uses the collection name as the channel, or a fixed channel 'samples'.
    """
    operation_type = change["operationType"]

    # Extract the sample ID
    if "fullDocument" in change and change["fullDocument"]:
        sample_id = str(change["fullDocument"].get("_id"))
        value = change["fullDocument"]
    else:
        # For deletes
        sample_id = str(change["documentKey"].get("_id"))
        value = None

    time_of_change = (
        change["wallTime"].isoformat()
        if "wallTime" in change
        else datetime.now(timezone.utc).isoformat()
    )

    # We use "samples" as the channel name for subscribers
    # Or we could use the collection name if available in the context
    # For now, let's assume the subscriber subscribes to "samples" channel on this service
    channel = "samples"

    message_data = MessageData(
        key=sample_id,
        value=value,
        metadata=MessageMetadata(
            operation_type=operation_type,
            timestamp=time_of_change,
        ),
    )

    return channel, message_data


def sample_initial_state_builder(
    channel: str, dataset_id: Optional[str] = None
) -> Dict[str, Any]:
    """Builds the query for initial state for a sample collection.

    Note: For large sample collections, initial state sync might be expensive.
    """
    # Return all samples? Or filter?
    # For now, return all.
    return {}
