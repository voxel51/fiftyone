"""
FiftyOne's public interface.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.core.config as _foc

config = _foc.load_config()
annotation_config = _foc.load_annotation_config()
evaluation_config = _foc.load_evaluation_config()
app_config = _foc.load_app_config()

from .core.aggregations import (
    Aggregation,
    Bounds,
    Count,
    CountValues,
    Distinct,
    FacetAggregations,
    HistogramValues,
    Min,
    Max,
    Mean,
    Quantiles,
    Schema,
    ListSchema,
    Std,
    Sum,
    Values,
)
from .core.collections import SaveContext
from .core.config import AppConfig
from .core.dataset import (
    Dataset,
    DatasetNotFoundError,
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
    flatten_schema,
    ArrayField,
    BooleanField,
    ClassesField,
    ColorField,
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
    KeypointsField,
    ListField,
    ObjectIdField,
    PolylinePointsField,
    ReferenceField,
    StringField,
    MaskTargetsField,
    VectorField,
)
from .core.frame import Frame
from .core.groups import Group
from .core.labels import (
    Label,
    Attribute,
    BooleanAttribute,
    CategoricalAttribute,
    NumericAttribute,
    ListAttribute,
    Regression,
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
from .core.logging import (
    get_logging_level,
    set_logging_level,
)
from .core.metadata import (
    Metadata,
    ImageMetadata,
    VideoMetadata,
    SceneMetadata,
)
from .core.models import (
    apply_model,
    compute_embeddings,
    compute_patch_embeddings,
    load_model,
    Model,
    ModelConfig,
    LogitsMixin,
    EmbeddingsMixin,
    PromptMixin,
    SamplesMixin,
    TorchModelMixin,
    ModelManagerConfig,
    ModelManager,
)
from .core.odm import (
    ColorScheme,
    DatasetAppConfig,
    DynamicEmbeddedDocument,
    EmbeddedDocument,
    KeypointSkeleton,
    Panel,
    SidebarGroupDocument,
    Space,
)
from .core.plots import (
    plot_confusion_matrix,
    plot_pr_curve,
    plot_pr_curves,
    plot_roc_curve,
    lines,
    scatterplot,
    location_scatterplot,
    Plot,
    ResponsivePlot,
    InteractivePlot,
    ViewPlot,
    ViewGrid,
    CategoricalHistogram,
    NumericalHistogram,
)
from .core.runs import (
    RunConfig,
    Run,
    RunResults,
)
from .core.sample import Sample
from .core.threed import (
    BoxGeometry,
    CylinderGeometry,
    PlaneGeometry,
    SphereGeometry,
    FbxMesh,
    GltfMesh,
    ObjMesh,
    PlyMesh,
    StlMesh,
    PerspectiveCamera,
    PointLight,
    DirectionalLight,
    AmbientLight,
    SpotLight,
    PointCloud,
    MeshBasicMaterial,
    MeshDepthMaterial,
    MeshLambertMaterial,
    MeshPhongMaterial,
    PointCloudMaterial,
    Scene,
    SceneBackground,
    Euler,
    Quaternion,
    Vector3,
)
from .core.stages import (
    Concat,
    Exclude,
    ExcludeBy,
    ExcludeFields,
    ExcludeFrames,
    ExcludeGroups,
    ExcludeGroupSlices,
    ExcludeLabels,
    Exists,
    FilterField,
    FilterLabels,
    FilterKeypoints,
    Flatten,
    GeoNear,
    GeoWithin,
    GroupBy,
    Limit,
    LimitLabels,
    MapLabels,
    Match,
    MatchFrames,
    MatchLabels,
    MatchTags,
    Mongo,
    Select,
    SelectBy,
    SelectFields,
    SelectFrames,
    SelectGroups,
    SelectGroupSlices,
    SelectLabels,
    SetField,
    Shuffle,
    Skip,
    SortBy,
    SortBySimilarity,
    Take,
    ToPatches,
    ToEvaluationPatches,
    ToClips,
    ToTrajectories,
    ToFrames,
)
from .core.session import (
    close_app,
    launch_app,
    Session,
)
from .core.utils import (
    disable_progress_bars,
    pprint,
    pformat,
    report_progress,
    ProgressBar,
)
from .core.view import DatasetView
from .utils.eval.classification import (
    evaluate_classifications,
    ClassificationEvaluationConfig,
    ClassificationResults,
)
from .utils.eval.detection import (
    evaluate_detections,
    DetectionEvaluationConfig,
    DetectionResults,
)
from .utils.eval.regression import (
    evaluate_regressions,
    RegressionEvaluationConfig,
    RegressionResults,
)
from .utils.eval.segmentation import (
    evaluate_segmentations,
    SegmentationEvaluationConfig,
    SegmentationResults,
)
from .utils.quickstart import quickstart
