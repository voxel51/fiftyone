"""
FiftyOne's public interface.

| Copyright 2017-2024, Voxel51, Inc.
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
    ListSchema,
    Mean,
    Quantiles,
    Schema,
    Std,
    Sum,
    Values,
)
from .core.collections import SaveContext
from .core.config import AppConfig
from .core.dataset import (
    Dataset,
    dataset_exists,
    delete_dataset,
    delete_datasets,
    delete_non_persistent_datasets,
    get_default_dataset_dir,
    get_default_dataset_name,
    list_datasets,
    load_dataset,
    make_unique_dataset_name,
)
from .core.expressions import (
    VALUE,
    ViewExpression,
    ViewField,
)
from .core.fields import (
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
    FloatField,
    FrameNumberField,
    FrameSupportField,
    GeoLineStringField,
    GeoMultiLineStringField,
    GeoMultiPointField,
    GeoMultiPolygonField,
    GeoPointField,
    GeoPolygonField,
    IntField,
    KeypointsField,
    ListField,
    MaskTargetsField,
    ObjectIdField,
    PolylinePointsField,
    ReferenceField,
    StringField,
    VectorField,
    flatten_schema,
)
from .core.frame import Frame
from .core.groups import Group
from .core.labels import (
    Attribute,
    BooleanAttribute,
    CategoricalAttribute,
    Classification,
    Classifications,
    Detection,
    Detections,
    GeoLocation,
    GeoLocations,
    Heatmap,
    Keypoint,
    Keypoints,
    Label,
    ListAttribute,
    NumericAttribute,
    Polyline,
    Polylines,
    Regression,
    Segmentation,
    TemporalDetection,
    TemporalDetections,
)
from .core.logging import (
    get_logging_level,
    set_logging_level,
)
from .core.metadata import (
    ImageMetadata,
    Metadata,
    VideoMetadata,
)
from .core.models import (
    EmbeddingsMixin,
    Model,
    ModelConfig,
    ModelManager,
    ModelManagerConfig,
    TorchModelMixin,
    apply_model,
    compute_embeddings,
    compute_patch_embeddings,
    load_model,
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
    CategoricalHistogram,
    InteractivePlot,
    NumericalHistogram,
    Plot,
    ResponsivePlot,
    ViewGrid,
    ViewPlot,
    lines,
    location_scatterplot,
    plot_confusion_matrix,
    plot_pr_curve,
    plot_pr_curves,
    plot_roc_curve,
    scatterplot,
)
from .core.runs import (
    Run,
    RunConfig,
    RunResults,
)
from .core.sample import Sample
from .core.session import (
    Session,
    close_app,
    launch_app,
)
from .core.stages import (
    Concat,
    Exclude,
    ExcludeBy,
    ExcludeFields,
    ExcludeFrames,
    ExcludeGroups,
    ExcludeLabels,
    Exists,
    FilterField,
    FilterKeypoints,
    FilterLabels,
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
    ToClips,
    ToEvaluationPatches,
    ToFrames,
    ToPatches,
    ToTrajectories,
)
from .core.threed import (
    AmbientLight,
    BoxGeometry,
    CylinderGeometry,
    DirectionalLight,
    Euler,
    FbxMesh,
    GltfMesh,
    MeshBasicMaterial,
    MeshDepthMaterial,
    MeshLambertMaterial,
    MeshPhongMaterial,
    ObjMesh,
    PerspectiveCamera,
    PlaneGeometry,
    PlyMesh,
    PointCloud,
    PointCloudMaterial,
    PointLight,
    Quaternion,
    Scene,
    SceneBackground,
    SphereGeometry,
    SpotLight,
    StlMesh,
    Vector3,
)
from .core.utils import (
    ProgressBar,
    disable_progress_bars,
    pformat,
    pprint,
    report_progress,
)
from .core.view import DatasetView
from .utils.eval.classification import (
    ClassificationEvaluationConfig,
    ClassificationResults,
    evaluate_classifications,
)
from .utils.eval.detection import (
    DetectionEvaluationConfig,
    DetectionResults,
    evaluate_detections,
)
from .utils.eval.regression import (
    RegressionEvaluationConfig,
    RegressionResults,
    evaluate_regressions,
)
from .utils.eval.segmentation import (
    SegmentationEvaluationConfig,
    SegmentationResults,
    evaluate_segmentations,
)
from .utils.quickstart import quickstart
