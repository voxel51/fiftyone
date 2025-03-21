"""
Embeddings operators.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
"""
from datetime import datetime

import fiftyone as fo
import fiftyone.core.patches as fop
import fiftyone.operators as foo
import fiftyone.operators.types as types
import fiftyone.zoo.models as fozm

# pylint:disable=import-error,no-name-in-module
import fiftyone.brain as fob


class ComputeVisualization(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_visualization",
            label="Compute visualization",
            dynamic=True,
            unlisted=True,
            allow_delegated_execution=True,
            allow_immediate_execution=True,
            default_choice_to_delegated=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        compute_visualization(ctx, inputs)

        view = types.View(label="Compute visualization")
        return types.Property(inputs, view=view)

    def execute(self, ctx):
        target = ctx.params.get("target", None)
        patches_field = ctx.params.get("patches_field", None)
        embeddings = ctx.params.get("embeddings", None) or None
        brain_key = ctx.params["brain_key"]
        model = ctx.params.get("model", None) or None
        method = ctx.params.get("method", None)
        batch_size = ctx.params.get("batch_size", None)
        num_workers = ctx.params.get("num_workers", None)
        skip_failures = ctx.params.get("skip_failures", True)

        kwargs = ctx.params.get("kwargs", {})
        if not kwargs.get("create_index", False):
            kwargs.pop("points_field", None)

        # No multiprocessing allowed when running synchronously
        if not ctx.delegated:
            num_workers = 0

        target_view = _get_target_view(ctx, target)
        fob.compute_visualization(
            target_view,
            patches_field=patches_field,
            embeddings=embeddings,
            brain_key=brain_key,
            model=model,
            method=method,
            batch_size=batch_size,
            num_workers=num_workers,
            skip_failures=skip_failures,
            **kwargs,
        )

    def resolve_output(self, ctx):
        outputs = types.Object()
        view = types.View(label="Request complete")
        return types.Property(outputs, view=view)


def compute_visualization(ctx, inputs):
    complete = brain_init(ctx, inputs)
    if not complete:
        return False

    method_choices = types.DropdownView()
    method_choices.add_choice(
        "umap",
        label="UMAP",
        description="Uniform Manifold Approximation and Projection",
    )
    method_choices.add_choice(
        "tsne",
        label="t-SNE",
        description="t-distributed Stochastic Neighbor Embedding",
    )
    method_choices.add_choice(
        "pca",
        label="PCA",
        description="Principal Component Analysis",
    )

    inputs.enum(
        "method",
        method_choices.values(),
        default="umap",
        required=True,
        label="method",
        description="The dimensionality reduction method to use",
        view=method_choices,
    )

    inputs.int(
        "num_dims",
        default=2,
        required=True,
        label="Number of dimensions",
        description="The dimension of the visualization space",
    )

    inputs.int(
        "seed",
        label="Random seed",
        description="An optional random seed to use",
    )

    num_dims = ctx.params.get("num_dims", None)
    if num_dims == 2:
        kwargs = types.Object()
        inputs.define_property("kwargs", kwargs)

        kwargs.bool(
            "create_index",
            default=False,
            label="Create index",
            description=(
                "Whether to create a spatial index for the computed points on "
                "your dataset. This is highly recommended for large datasets "
                "as it enables efficient querying when lassoing points in "
                "embeddings plot"
            ),
        )

        create_index = ctx.params.get("kwargs", {}).get("create_index", False)
        if create_index:
            brain_key = ctx.params["brain_key"]
            patches_field = ctx.params.get("patches_field", None)
            if patches_field is not None:
                loc = f"`{patches_field}` attribute"
            else:
                loc = "sample field"

            inputs.str(
                "points_field",
                default=brain_key,
                label="Points field",
                description=f"The {loc} in which to store the spatial index",
            )


class ManageVisualizationIndexes(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="manage_visualization_indexes",
            label="Manage visualization indexes",
            dynamic=True,
            allow_delegated_execution=True,
            allow_immediate_execution=True,
            default_choice_to_delegated=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        manage_visualization_indexes(ctx, inputs)

        view = types.View(label="Manage visualization indexes")
        return types.Property(inputs, view=view)

    def execute(self, ctx):
        brain_key = ctx.params["brain_key"]
        points_field = ctx.params.get("points_field", None)
        create_index = ctx.params.get("create_index", True)

        info = ctx.dataset.get_brain_info(brain_key)
        results = ctx.dataset.load_brain_results(brain_key)

        if info.config.points_field is not None:
            results.remove_index()
        else:
            results.index_points(
                points_field=points_field, create_index=create_index
            )

        if not ctx.delegated:
            ctx.trigger("reload_dataset")


def manage_visualization_indexes(ctx, inputs):
    brain_keys = ctx.dataset.list_brain_runs(type="visualization")

    if not brain_keys:
        warning = types.Warning(
            label="This dataset has no visualization results",
            description="https://docs.voxel51.com/user_guide/brain.html",
        )
        prop = inputs.view("warning", warning)
        prop.invalid = True

        return

    choices = types.DropdownView()
    for brain_key in brain_keys:
        choices.add_choice(brain_key, label=brain_key)

    inputs.enum(
        "brain_key",
        choices.values(),
        default=brain_keys[0],
        required=True,
        label="Brain key",
        description="Select a brain key",
        view=choices,
    )

    brain_key = ctx.params.get("brain_key", None)
    if not brain_key:
        return

    info = ctx.dataset.get_brain_info(brain_key)
    patches_field = info.config.patches_field
    points_field = info.config.points_field

    if points_field is not None:
        warning = types.Warning(
            label=(
                "These visualization results have a spatial index in the "
                f"`{points_field}` field. Would you like to remove it?"
            )
        )
        inputs.view("warning", warning)
    else:
        notice = types.Notice(
            label=(
                "These visualization results are not indexed. Creating a "
                "spatial index is highly recommended for large datasets as it "
                "enables efficient querying when lassoing points in "
                "embeddings plots. Would you like to create one?"
            )
        )
        inputs.view("notice", notice)

        if patches_field is not None:
            loc = f"`{patches_field}` attribute"
        else:
            loc = "sample field"

        inputs.str(
            "points_field",
            default=brain_key,
            label="Points field",
            description=f"The {loc} in which to store the spatial index",
        )

        # Database indexes are not yet supported for patch visualizations
        if patches_field is None:
            inputs.bool(
                "create_index",
                default=True,
                label="Create database index",
                description=(
                    "Whether to create a database index for the points. This "
                    "is recommended as it will further optimize queries when "
                    "lassoing points"
                ),
            )


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

    if patches_field is not None:
        loc = f"`{patches_field}` attribute"
    else:
        loc = "sample field"

    inputs.str(
        "embeddings",
        default=None,
        label="Embeddings",
        description=(
            f"An optional {loc} containing pre-computed embeddings to use. "
            f"Or when a model is provided, a new {loc} in which to store the "
            "embeddings"
        ),
        view=embeddings_choices,
    )

    embeddings = ctx.params.get("embeddings", None)

    if embeddings not in embeddings_fields:
        model_names, _ = _get_zoo_models_with_embeddings(ctx, inputs)

        model_choices = types.AutocompleteView()
        for name in sorted(model_names):
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


def _get_allowed_model_licenses(ctx, inputs):
    license = ctx.secrets.get("FIFTYONE_ZOO_ALLOWED_MODEL_LICENSES", None)
    if license is None:
        return None

    licenses = license.split(",")

    inputs.view(
        "licenses",
        types.Notice(
            label=(
                f"Only models with licenses {licenses} will be available below"
            )
        ),
    )

    return licenses


def _get_zoo_models_with_embeddings(ctx, inputs):
    licenses = _get_allowed_model_licenses(ctx, inputs)

    available_models = set()
    for model in fozm._list_zoo_models(license=licenses):
        if model.has_tag("embeddings"):
            available_models.add(model.name)

    return available_models, licenses


def _get_label_fields(sample_collection, label_types):
    schema = sample_collection.get_field_schema(flat=True)
    bad_roots = tuple(
        k + "." for k, v in schema.items() if isinstance(v, fo.ListField)
    )
    return [
        path
        for path, field in schema.items()
        if (
            isinstance(field, fo.EmbeddedDocumentField)
            and issubclass(field.document_type, label_types)
            and not path.startswith(bad_roots)
        )
    ]
