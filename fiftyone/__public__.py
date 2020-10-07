"""
FiftyOne's public interface.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.config as foc
import fiftyone.core.service as fos

_database_service = fos.DatabaseService()
config = foc.load_config()

from .core.dataset import (
    Dataset,
    list_datasets,
    dataset_exists,
    load_dataset,
    delete_dataset,
    delete_datasets,
    delete_non_persistent_datasets,
)
from .core.expressions import (
    ViewField,
    ViewExpression,
)
from .core.fields import (
    Field,
    BooleanField,
    IntField,
    FloatField,
    StringField,
    ListField,
    DictField,
    EmbeddedDocumentField,
    VectorField,
    ArrayField,
    ImageLabelsField,
)
from .core.frame import Frame
from .core.labels import (
    Label,
    ImageLabel,
    Attribute,
    BooleanAttribute,
    CategoricalAttribute,
    NumericAttribute,
    ListAttribute,
    Classification,
    Classifications,
    Detection,
    Detections,
    Polyline,
    Polylines,
    Keypoint,
    Keypoints,
    Segmentation,
    ImageLabels,
)
from .core.metadata import (
    Metadata,
    ImageMetadata,
    VideoMetadata,
)
from .core.sample import Sample
from .core.session import (
    close_app,
    launch_app,
    Session,
)
from .core.utils import (
    pprint,
    pformat,
    ProgressBar,
)
from .core.view import DatasetView
from .utils.quickstart import quickstart
