"""JSON serialization

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Any

import fiftyone.core.labels as fol
import fiftyone.core.sample as fos


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
