"""JSON serialization

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import datetime
from typing import Any, Union

import fiftyone.core.labels as fol
import fiftyone.core.sample as fos


def _try_parse_datetime(value: str) -> Union[datetime.datetime, None]:
    """Attempts to parse an ISO datetime string.

    Args:
        value: The string to parse

    Returns:
        The parsed datetime, or None if parsing fails.
    """
    try:
        # Handle 'Z' suffix (UTC) by converting to +00:00
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return datetime.datetime.fromisoformat(value)
    except ValueError:
        return None


def deserialize(value: Any) -> Any:
    """Deserializes a value into an a known type.

    Args:
        value: The value to deserialize

    Returns:
        The deserialized value if able to deserialize, otherwise the input
        value.
    """

    if isinstance(value, dict):
        if cls_name := value.get("_cls"):
            cls = next(
                (
                    cls
                    for cls in (
                        fol.Classification,
                        fol.Classifications,
                        fol.Detection,
                        fol.Detections,
                        fol.Polyline,
                        fol.Polylines,
                    )
                    if cls.__name__ == cls_name
                ),
                None,
            )

            if cls is None:
                raise ValueError(
                    f"No deserializer registered for class '{cls_name}'"
                )

            return cls.from_dict(value)
    elif isinstance(value, str):
        if parsed_dt := _try_parse_datetime(value):
            return parsed_dt

    return value


def serialize(value: Any) -> Any:
    """Serializes an value

    Args:
        value: The value to serialize

    Returns:
        The serialized value if able to serialize, otherwise the input value.
    """

    cls = type(value)
    if cls == fos.Sample:
        return value.to_dict(include_private=True)

    if hasattr(value, "to_dict"):
        return value.to_dict()

    return value
