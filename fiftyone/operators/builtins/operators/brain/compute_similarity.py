"""
Brain operators.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import base64
from collections import defaultdict
import json

from bson import json_util

import fiftyone as fo
import fiftyone.core.patches as fop
import fiftyone.operators as foo
import fiftyone.operators.types as types
import fiftyone.zoo.models as fozm

# pylint:disable=import-error,no-name-in-module
import fiftyone.brain as fob
from fiftyone.brain import Similarity


class ComputeSimilarity(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_similarity",
            label="Compute similarity",
            allow_delegated_execution=True,
            allow_immediate_execution=True,
            default_choice_to_delegated=True,
            dynamic=True,
            unlisted=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        compute_similarity(ctx, inputs)

        view = types.View(label="Compute similarity")
        return types.Property(inputs, view=view)

    def execute(self, ctx):
        kwargs = ctx.params.copy()
        target = kwargs.pop("target", None)
        patches_field = kwargs.pop("patches_field", None)
        embeddings = kwargs.pop("embeddings", None) or None
        brain_key = kwargs.pop("brain_key")
        model = kwargs.pop("model", None) or None
        batch_size = kwargs.pop("batch_size", None)
        num_workers = kwargs.pop("num_workers", None)
        skip_failures = kwargs.pop("skip_failures", True)
        backend = kwargs.pop("backend", None)

        _inject_brain_secrets(ctx)
        _get_similarity_backend(backend).parse_parameters(ctx, kwargs)

        # No multiprocessing allowed when running synchronously
        if not ctx.delegated:
            num_workers = 0

        target_view = _get_target_view(ctx, target)
        fob.compute_similarity(
            target_view,
            patches_field=patches_field,
            embeddings=embeddings,
            brain_key=brain_key,
            model=model,
            batch_size=batch_size,
            num_workers=num_workers,
            skip_failures=skip_failures,
            backend=backend,
            **kwargs,
        )


def compute_similarity(ctx, inputs):
    ready = brain_init(ctx, inputs)
    if not ready:
        return False

    default_backend = fob.brain_config.default_similarity_backend
    backends = fob.brain_config.similarity_backends

    backend_choices = types.DropdownView()
    for backend in sorted(backends.keys()):
        backend_choices.add_choice(backend, label=backend)

    inputs.enum(
        "backend",
        backend_choices.values(),
        default=default_backend,
        required=True,
        label="Backend",
        description="The similarity backend to use",
        view=backend_choices,
    )

    backend = ctx.params.get("backend", default_backend)

    _get_similarity_backend(backend).get_parameters(ctx, inputs)

    return True


def _get_similarity_backend(backend):
    if backend == "sklearn":
        return SklearnBackend(backend)

    if backend == "pinecone":
        return PineconeBackend(backend)

    if backend == "qdrant":
        return QdrantBackend(backend)

    if backend == "milvus":
        return MilvusBackend(backend)

    if backend == "lancedb":
        return LanceDBBackend(backend)

    if backend == "redis":
        return RedisBackend(backend)

    if backend == "mongodb":
        return MongoDBBackend(backend)

    return SimilarityBackend(backend)


class SimilarityBackend(object):
    def __init__(self, name):
        self.name = name

    def get_parameters(self, ctx, inputs):
        pass

    def parse_parameters(self, ctx, params):
        pass


class SklearnBackend(SimilarityBackend):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "sklearn",
            types.Header(
                label="Sklearn options",
                description="https://docs.voxel51.com/user_guide/brain.html#similarity-api",
                divider=True,
            ),
        )

        metric_choices = types.DropdownView()
        metric_choices.add_choice("cosine", label="cosine")
        metric_choices.add_choice("euclidean", label="euclidean")

        inputs.enum(
            "metric",
            metric_choices.values(),
            default="cosine",
            required=True,
            label="Metric",
            description="The embedding distance metric to use",
            view=metric_choices,
        )


class PineconeBackend(SimilarityBackend):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "pinecone",
            types.Header(
                label="Pinecone options",
                description="https://docs.voxel51.com/integrations/pinecone.html#pinecone-config-parameters",
                divider=True,
            ),
        )

        inputs.str(
            "index_name",
            label="Index name",
            description=(
                "An optional name of a Pinecone index to use or create"
            ),
        )

        metric_choices = types.DropdownView()
        metric_choices.add_choice("cosine", label="cosine")
        metric_choices.add_choice("dotproduct", label="dotproduct")
        metric_choices.add_choice("euclidean", label="euclidean")

        inputs.enum(
            "metric",
            metric_choices.values(),
            default="cosine",
            required=True,
            label="Metric",
            description=(
                "The embedding distance metric to use when creating a new "
                "index"
            ),
            view=metric_choices,
        )

        inputs.str(
            "index_type",
            label="Index type",
            description=(
                "An optional index type to use when creating a new index"
            ),
        )
        inputs.str(
            "namespace",
            label="Namespace",
            description=(
                "An optional namespace under which to store vectors added to "
                "the index"
            ),
        )
        inputs.int(
            "replicas",
            label="Replicas",
            description=(
                "An optional number of replicas when creating a new index"
            ),
        )
        inputs.int(
            "shards",
            label="Shards",
            description=(
                "An optional number of shards when creating a new index"
            ),
        )
        inputs.int(
            "pods",
            label="Pods",
            description="An optional number of pods when creating a new index",
        )
        inputs.str(
            "pod_type",
            label="Pod type",
            description="An optional pod type when creating a new index",
        )


class QdrantBackend(SimilarityBackend):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "qdrant",
            types.Header(
                label="Qdrant options",
                description="https://docs.voxel51.com/integrations/qdrant.html#qdrant-config-parameters",
                divider=True,
            ),
        )

        inputs.str(
            "collection_name",
            label="Collection name",
            description=(
                "An optional name of a Qdrant collection to use or create"
            ),
        )

        metric_choices = types.DropdownView()
        metric_choices.add_choice("cosine", label="cosine")
        metric_choices.add_choice("dotproduct", label="dotproduct")
        metric_choices.add_choice("euclidean", label="euclidean")

        inputs.enum(
            "metric",
            metric_choices.values(),
            default="cosine",
            required=True,
            label="Metric",
            description=(
                "The embedding distance metric to use when creating a new "
                "collection"
            ),
            view=metric_choices,
        )

        inputs.str(
            "replication_factor",
            label="Replication factor",
            description=(
                "An optional replication factor to use when creating a new "
                "index"
            ),
        )
        inputs.int(
            "shard_number",
            label="Shard number",
            description=(
                "An optional number of shards to use when creating a new index"
            ),
        )
        inputs.int(
            "write_consistency_factor",
            label="Write consistency factor",
            description=(
                "An optional write consistency factor to use when creating a "
                "new index"
            ),
        )


class MilvusBackend(SimilarityBackend):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "milvus",
            types.Header(
                label="Milvus options",
                description="https://docs.voxel51.com/user_guide/brain.html#similarity-api",
                divider=True,
            ),
        )

        inputs.str(
            "collection_name",
            label="Collection name",
            description=(
                "An optional name of a Milvus collection to use or create"
            ),
        )

        metric_choices = types.DropdownView()
        metric_choices.add_choice("dotproduct", label="dotproduct")
        metric_choices.add_choice("euclidean", label="euclidean")

        inputs.enum(
            "metric",
            metric_choices.values(),
            default="dotproduct",
            required=True,
            label="Metric",
            description=(
                "The embedding distance metric to use when creating a new "
                "collection"
            ),
            view=metric_choices,
        )

        consistency_level_choices = types.DropdownView()
        consistency_level_choices.add_choice("Session", label="Session")
        consistency_level_choices.add_choice("Strong", label="Strong")
        consistency_level_choices.add_choice("Bounded", label="Bounded")
        consistency_level_choices.add_choice("Eventually", label="Eventually")

        inputs.enum(
            "consistency_level",
            consistency_level_choices.values(),
            default="Session",
            required=True,
            label="Consistency level",
            description="The consistency level to use.",
            view=consistency_level_choices,
        )


class LanceDBBackend(SimilarityBackend):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "lancedb",
            types.Header(
                label="LanceDB options",
                description="https://docs.voxel51.com/user_guide/brain.html#similarity-api",
                divider=True,
            ),
        )

        inputs.str(
            "table_name",
            label="Table name",
            description=(
                "An optional name of a LanceDB table to use or create"
            ),
        )

        metric_choices = types.DropdownView()
        metric_choices.add_choice("cosine", label="cosine")
        metric_choices.add_choice("euclidean", label="euclidean")

        inputs.enum(
            "metric",
            metric_choices.values(),
            default="cosine",
            required=True,
            label="Metric",
            description=(
                "The embedding distance metric to use when creating a new "
                "table"
            ),
            view=metric_choices,
        )


class RedisBackend(SimilarityBackend):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "redis",
            types.Header(
                label="Redis options",
                description="https://docs.voxel51.com/user_guide/brain.html#similarity-api",
                divider=True,
            ),
        )

        inputs.str(
            "index_name",
            label="Index name",
            description="An optional name of a Redis index to use or create",
        )

        metric_choices = types.DropdownView()
        metric_choices.add_choice("cosine", label="cosine")
        metric_choices.add_choice("dotproduct", label="dotproduct")
        metric_choices.add_choice("euclidean", label="euclidean")

        inputs.enum(
            "metric",
            metric_choices.values(),
            default="cosine",
            required=True,
            label="Metric",
            description=(
                "The embedding distance metric to use when creating a new "
                "index"
            ),
            view=metric_choices,
        )

        algorithm_choices = types.DropdownView()
        algorithm_choices.add_choice("FLAT", label="FLAT")
        algorithm_choices.add_choice("HNSW", label="HNSW")

        inputs.enum(
            "algorithm",
            algorithm_choices.values(),
            default="FLAT",
            required=True,
            label="Algorithm",
            description=(
                "The search algorithm to use when creating a new index"
            ),
            view=algorithm_choices,
        )


class MongoDBBackend(SimilarityBackend):
    def get_parameters(self, ctx, inputs):
        inputs.view(
            "mongodb",
            types.Header(
                label="MongoDB options",
                description="https://docs.voxel51.com/user_guide/brain.html#similarity-api",
                divider=True,
            ),
        )

        inputs.str(
            "index_name",
            label="Index name",
            required=True,
            description=(
                "An optional name of a MongoDB vector search index to use or "
                "create"
            ),
        )

        metric_choices = types.DropdownView()
        metric_choices.add_choice("cosine", label="cosine")
        metric_choices.add_choice("dotproduct", label="dotproduct")
        metric_choices.add_choice("euclidean", label="euclidean")

        inputs.enum(
            "metric",
            metric_choices.values(),
            default="cosine",
            required=True,
            label="Metric",
            description=(
                "The embedding distance metric to use when creating a new "
                "index"
            ),
            view=metric_choices,
        )


def _get_label_fields(sample_collection, label_types):
    schema = sample_collection.get_field_schema(embedded_doc_type=label_types)
    return list(schema.keys())


def brain_init(ctx, inputs):
    target_view = get_target_view(ctx, inputs)

    brain_key = get_new_brain_key(
        ctx,
        inputs,
        description="Provide a brain key to use to refer to this run",
    )

    patches_fields = _get_label_fields(
        target_view,
        (fo.Detection, fo.Detections, fo.Polyline, fo.Polylines),
    )

    if patches_fields:
        patches_field_choices = types.DropdownView()
        for field_name in sorted(patches_fields):
            patches_field_choices.add_choice(field_name, label=field_name)

        inputs.str(
            "patches_field",
            default=None,
            label="Patches field",
            description=(
                "An optional sample field defining the image patches in each "
                "sample that have been/will be embedded. If omitted, the "
                "full images are processed"
            ),
            view=patches_field_choices,
        )

    patches_field = ctx.params.get("patches_field", None)

    get_embeddings(ctx, inputs, target_view, patches_field)

    return bool(brain_key)


def get_embeddings(ctx, inputs, view, patches_field):
    if patches_field is not None:
        root, _ = view._get_label_field_root(patches_field)
        field = view.get_field(root, leaf=True)
        schema = field.get_field_schema(ftype=fo.VectorField)
        embeddings_fields = set(root + "." + k for k in schema.keys())
    else:
        schema = view.get_field_schema(ftype=fo.VectorField)
        embeddings_fields = set(schema.keys())

    embeddings_choices = types.AutocompleteView()
    for field_name in sorted(embeddings_fields):
        embeddings_choices.add_choice(field_name, label=field_name)

    inputs.str(
        "embeddings",
        default=None,
        label="Embeddings",
        description=(
            "An optional sample field containing pre-computed embeddings to "
            "use. Or when a model is provided, a new field in which to store "
            "the embeddings"
        ),
        view=embeddings_choices,
    )

    embeddings = ctx.params.get("embeddings", None)

    if embeddings not in embeddings_fields:
        model_choices = types.AutocompleteView()
        for name in sorted(_get_zoo_models()):
            model_choices.add_choice(name, label=name)

        inputs.enum(
            "model",
            model_choices.values(),
            default=None,
            required=False,
            label="Model",
            description=(
                "An optional name of a model from the "
                "[FiftyOne Model Zoo](https://docs.voxel51.com/user_guide/model_zoo/models.html) "
                "to use to generate embeddings"
            ),
            view=model_choices,
        )

        model = ctx.params.get("model", None)

        if model:
            inputs.int(
                "batch_size",
                default=None,
                label="Batch size",
                description=(
                    "A batch size to use when computing embeddings "
                    "(if applicable)"
                ),
            )

            inputs.int(
                "num_workers",
                default=None,
                label="Num workers",
                description=(
                    "A number of workers to use for Torch data loaders "
                    "(if applicable)"
                ),
            )

            inputs.bool(
                "skip_failures",
                default=True,
                label="Skip failures",
                description=(
                    "Whether to gracefully continue without raising an error "
                    "if embeddings cannot be generated for a sample"
                ),
            )


def _get_zoo_models():
    if hasattr(fozm, "_list_zoo_models"):
        manifest = fozm._list_zoo_models()
    else:
        # Can remove this code path if we require fiftyone>=1.0.0
        manifest = fozm._load_zoo_models_manifest()

    # pylint: disable=no-member
    available_models = set()
    for model in manifest:
        if model.has_tag("embeddings"):
            available_models.add(model.name)

    return available_models


def get_new_brain_key(
    ctx,
    inputs,
    name="brain_key",
    label="Brain key",
    description=None,
):
    prop = inputs.str(
        name,
        required=True,
        label=label,
        description=description,
    )

    brain_key = ctx.params.get(name, None)
    if brain_key is not None and brain_key in ctx.dataset.list_brain_runs():
        prop.invalid = True
        prop.error_message = "Brain key already exists"
        brain_key = None

    return brain_key


def get_target_view(ctx, inputs, allow_selected=True):
    has_base_view = isinstance(ctx.view, fop.PatchesView)
    if has_base_view:
        has_view = ctx.view != ctx.view._base_view
    else:
        has_view = ctx.view != ctx.dataset.view()
    has_selected = allow_selected and bool(ctx.selected)
    default_target = None

    if has_view or has_selected:
        target_choices = types.RadioGroup(orientation="horizontal")

        if has_base_view:
            target_choices.add_choice(
                "BASE_VIEW",
                label="Base view",
                description="Process the base view",
            )
        else:
            target_choices.add_choice(
                "DATASET",
                label="Entire dataset",
                description="Process the entire dataset",
            )

        if has_view:
            target_choices.add_choice(
                "CURRENT_VIEW",
                label="Current view",
                description="Process the current view",
            )
            default_target = "CURRENT_VIEW"

        if has_selected:
            target_choices.add_choice(
                "SELECTED_SAMPLES",
                label="Selected samples",
                description="Process only the selected samples",
            )
            default_target = "SELECTED_SAMPLES"

        inputs.enum(
            "target",
            target_choices.values(),
            default=default_target,
            required=True,
            label="Target view",
            view=target_choices,
        )

    target = ctx.params.get("target", default_target)

    return _get_target_view(ctx, target)


def _get_target_view(ctx, target):
    if target == "SELECTED_SAMPLES":
        return ctx.view.select(ctx.selected)

    if target == "BASE_VIEW":
        return ctx.view._base_view

    if target == "DATASET":
        return ctx.dataset

    return ctx.view


def serialize_view(view):
    return json.loads(json_util.dumps(view._serialize()))


def get_brain_run_type(ctx, inputs):
    run_types = defaultdict(list)
    for brain_key in ctx.dataset.list_brain_runs():
        run_type = _get_brain_run_type(ctx.dataset, brain_key)
        run_types[run_type].append(brain_key)

    choices = types.DropdownView()
    choices.add_choice(None, label="- all -")
    for run_type in sorted(run_types.keys()):
        choices.add_choice(run_type, label=run_type)

    inputs.str(
        "run_type",
        label="Run type",
        description=(
            "You can optionally choose a specific brain run type of interest "
            "to narrow your search"
        ),
        view=choices,
    )

    return ctx.params.get("run_type", None)


def _get_brain_run_type(dataset, brain_key):
    info = dataset.get_brain_info(brain_key)
    config = info.config
    for type_str, cls in _BRAIN_RUN_TYPES.items():
        if issubclass(config.run_cls, cls):
            return type_str

    return None


_BRAIN_RUN_TYPES = {
    "similarity": Similarity,
}


def get_brain_key(
    ctx,
    inputs,
    label="Brain key",
    description="Select a brain key",
    run_type=None,
    dataset=None,
    brain_keys=None,
    dynamic_param_name=False,
    show_default=True,
    error_message=None,
    **kwargs,
):
    if dataset is None:
        dataset = ctx.dataset

    if brain_keys is None:
        type = _BRAIN_RUN_TYPES.get(run_type, None)
        brain_keys = dataset.list_brain_runs(type=type, **kwargs)

    if not brain_keys:
        if error_message is None:
            error_message = "This dataset has no brain runs"
            if run_type is not None:
                error_message += f" of type {run_type}"

        warning = types.Warning(
            label=error_message,
            description="https://docs.voxel51.com/user_guide/brain.html",
        )
        prop = inputs.view("warning", warning)
        prop.invalid = True

        return

    choices = types.DropdownView()
    for brain_key in brain_keys:
        choices.add_choice(brain_key, label=brain_key)

    if dynamic_param_name:
        brain_key_param = _get_brain_key_param(run_type)
    else:
        brain_key_param = "brain_key"

    if show_default:
        default = brain_keys[0]
    else:
        default = None

    inputs.str(
        brain_key_param,
        default=default,
        required=True,
        label=label,
        description=description,
        view=choices,
    )

    return ctx.params.get(brain_key_param, None)


def _get_brain_key_param(run_type):
    if run_type is None:
        return "brain_key"

    return "brain_key_%s" % run_type


def _get_dynamic_brain_key(ctx):
    run_type = ctx.params.get("run_type", None)
    brain_key_param = _get_brain_key_param(run_type)
    return ctx.params[brain_key_param]


def _inject_brain_secrets(ctx):
    for key, value in getattr(ctx, "secrets", {}).items():
        # FIFTYONE_BRAIN_SIMILARITY_[UPPER_BACKEND]_[UPPER_KEY]
        if key.startswith("FIFTYONE_BRAIN_SIMILARITY_"):
            _key = key[len("FIFTYONE_BRAIN_SIMILARITY_") :].lower()
            _backend, _key = _key.split("_", 1)
            fob.brain_config.similarity_backends[_backend][_key] = value
