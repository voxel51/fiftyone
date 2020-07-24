"""
FiftyOne's basic, high-level public interface.

Parts of various fiftyone sub-packages are collected here and made available
under the top-level `fiftyone` package.

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
    list_dataset_names,
    dataset_exists,
    load_dataset,
    delete_dataset,
    delete_non_persistent_datasets,
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
from .core.labels import (
    Label,
    ImageLabel,
    Attribute,
    BooleanAttribute,
    CategoricalAttribute,
    NumericAttribute,
    VectorAttribute,
    Classification,
    Classifications,
    Detection,
    Detections,
    ImageLabels,
)
from .core.metadata import (
    Metadata,
    ImageMetadata,
)
from .core.sample import Sample
from .core.session import (
    close_app,
    launch_app,
    Session,
)
from .core.expressions import ViewField, ViewExpression
from .core.view import DatasetView
