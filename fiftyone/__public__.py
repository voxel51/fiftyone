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

from .core.aggregations import (
    Bounds,
    ConfidenceBounds,
    Count,
    CountLabels,
    CountValues,
    Distinct,
    DistinctLabels,
)
from .core.dataset import (
    Dataset,
    list_datasets,
    dataset_exists,
    load_dataset,
    delete_dataset,
    delete_datasets,
    delete_non_persistent_datasets,
    get_default_dataset_name,
    make_unique_dataset_name,
    get_default_dataset_dir,
)
from .core.expressions import (
    ViewField,
    ViewExpression,
)
from .core.fields import (
    Field,
    BooleanField,
    IntField,
    FrameNumberField,
    FloatField,
    StringField,
    ListField,
    KeypointsField,
    PolylinePointsField,
    DictField,
    EmbeddedDocumentField,
    VectorField,
    ArrayField,
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
)
from .core.metadata import (
    Metadata,
    ImageMetadata,
    VideoMetadata,
)
from .core.models import (
    apply_model,
    compute_embeddings,
    compute_patch_embeddings,
    load_model,
    Model,
    ModelConfig,
    EmbeddingsMixin,
    TorchModelMixin,
    ModelManagerConfig,
    ModelManager,
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
