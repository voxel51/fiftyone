"""
Sample collection event handling logic.

Example module demonstrating how to build message builders for watching
sample collections. This is provided as a reference implementation.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from fiftyone.operators.message import MessageData, MessageMetadata

logger = logging.getLogger(__name__)

# Default channel name for sample events
SAMPLE_CHANNEL = "samples"


def sample_message_builder(
    change: Dict[str, Any]
) -> Tuple[Optional[str], Optional[MessageData]]:
    """Build a message from a change stream document for a sample collection.

    This builder assumes it is watching a specific sample collection
    (e.g. 'samples.xyz'). It uses a fixed channel 'samples'.

    Args:
        change: MongoDB change stream document.

    Returns:
        Tuple of (channel, MessageData), or (None, None) if invalid.
    """
    operation_type = change.get("operationType")
    if not operation_type:
        return None, None

    # Extract the sample ID and value
    if "fullDocument" in change and change["fullDocument"]:
        sample_id = str(change["fullDocument"].get("_id", ""))
        value = change["fullDocument"]
    else:
        # For deletes
        doc_key = change.get("documentKey", {})
        sample_id = str(doc_key.get("_id", ""))
        value = None

    if not sample_id:
        return None, None

    time_of_change = (
        change["wallTime"].isoformat()
        if "wallTime" in change
        else datetime.now(timezone.utc).isoformat()
    )

    message_data = MessageData(
        key=sample_id,
        value=value,
        metadata=MessageMetadata(
            operation_type=operation_type,
            timestamp=time_of_change,
        ),
    )

    return SAMPLE_CHANNEL, message_data


def sample_initial_state_builder(
    channel: str,  # noqa: ARG001
    dataset_id: Optional[str] = None,  # noqa: ARG001
) -> Optional[Dict[str, Any]]:
    """Build the query for initial state for a sample collection.

    WARNING: Initial state sync for samples is disabled by default because
    syncing all samples could cause memory exhaustion on large datasets
    (millions of samples). This function returns None to skip initial state sync.

    If you need initial state sync for samples, implement a custom builder
    with appropriate limits and filters. Example:

        def limited_sample_initial_state_builder(channel, dataset_id):
            # Only sync recent samples with a limit
            return {"_rand": {"$gte": 0.99}}  # ~1% of samples

    Args:
        channel: The channel name (unused, but part of interface).
        dataset_id: Optional dataset ID filter (unused for samples).

    Returns:
        None to disable initial state sync for samples.
    """
    # Parameters are part of the InitialStateBuilder interface but unused here
    del channel, dataset_id  # Explicitly mark as unused

    # Return None to disable initial state sync
    # This is a safety measure for large sample collections
    return None
