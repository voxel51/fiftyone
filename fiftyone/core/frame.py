"""
Video frames.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId

from fiftyone.core.data import Document, field
import fiftyone.core.utils as fou
from fiftyone.core.validators import frame_number_validator

fov = fou.lazy_import("fiftyone.core.view")


class Frame(Document):
    frame_number: int = field(validator=frame_number_validator, required=True)
    sample_id: str = field(
        link="_sample_id", dump=ObjectId, load=str, required=True
    )
    _sample_id: ObjectId = field(default_factory=ObjectId, required=True)


class FrameView(Document):
    pass
