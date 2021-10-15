"""
FiftyOne's public interface.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.config as foc
import fiftyone.core.odm as foo

config = foc.load_config()
annotation_config = foc.load_annotation_config()
app_config = foc.load_app_config()
foo.establish_db_conn(config)

from .core.aggregations import (
    Bounds,
    Count,
    CountValues,
    Distinct,
    HistogramValues,
    Mean,
    Std,
    Sum,
    Values,
)
from .core.config import AppConfig
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
    VALUE,
)
from .core.fields import (
    ArrayField,
    BooleanField,
    ClassesField,
    DateField,
    DateTimeField,
    DictField,
    EmbeddedDocumentField,
    EmbeddedDocumentListField,
    Field,
    FrameNumberField,
    FrameSupportField,
    FloatField,
    GeoPointField,
    GeoLineStringField,
    GeoPolygonField,
    GeoMultiPointField,
    GeoMultiLineStringField,
    GeoMultiPolygonField,
    IntField,
    IntDictField,
    KeypointsField,
    ListField,
    ObjectIdField,
    PolylinePointsField,
    StringField,
    TargetsField,
    VectorField,
)
from .core.frame import Frame
from .core.labels import (
    Label,
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
    Heatmap,
    TemporalDetection,
    TemporalDetections,
    GeoLocation,
    GeoLocations,
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
from .core.plots import (
    plot_confusion_matrix,
    plot_pr_curve,
    plot_pr_curves,
    plot_roc_curve,
    location_scatterplot,
    scatterplot,
    Plot,
    ResponsivePlot,
    InteractivePlot,
    ViewPlot,
    ViewGrid,
    CategoricalHistogram,
    NumericalHistogram,
)
from .core.sample import Sample
from .core.stages import (
    Exclude,
    ExcludeBy,
    ExcludeFields,
    ExcludeFrames,
    ExcludeLabels,
    Exists,
    FilterField,
    FilterLabels,
    FilterClassifications,
    FilterDetections,
    FilterPolylines,
    FilterKeypoints,
    Limit,
    LimitLabels,
    GeoNear,
    GeoWithin,
    GroupBy,
    MapLabels,
    Match,
    MatchFrames,
    MatchLabels,
    MatchTags,
    Mongo,
    Shuffle,
    Select,
    SelectBy,
    SelectFields,
    SelectFrames,
    SelectLabels,
    SetField,
    Skip,
    SortBy,
    SortBySimilarity,
    Take,
    ToPatches,
    ToEvaluationPatches,
    ToClips,
    ToFrames,
)
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
from .utils.eval.classification import (
    evaluate_classifications,
    ClassificationResults,
    BinaryClassificationResults,
)
from .utils.eval.detection import (
    evaluate_detections,
    DetectionResults,
)
from .utils.eval.segmentation import (
    evaluate_segmentations,
    SegmentationResults,
)
from .utils.quickstart import quickstart
