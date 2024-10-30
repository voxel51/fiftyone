"""
ComputeVisualization Operator for FiftyOne.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
"""
from datetime import datetime

import fiftyone as fo
import fiftyone.core.patches as fop
import fiftyone.operators as foo
import fiftyone.operators.types as types
import fiftyone.zoo.models as fozm
import fiftyone.brain as fob


class ComputeVisualization(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_visualization",
            label="Compute visualization",
            dynamic=True,
            unlisted=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        compute_visualization(ctx, inputs)

        view = types.View(label="Compute visualization")
        return types.Property(inputs, view=view)

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

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
        delegate = ctx.params.get("delegate", False)

        if not delegate:
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


def brain_init(ctx, inputs):
    target_view = get_target_view(ctx, inputs)

    brain_key = get_new_brain_key(ctx, inputs)
    if brain_key is None:
        return False

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

    return True


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
                "An optional name of a model from the FiftyOne Model Zoo to "
                "use to generate embeddings"
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
    description="Provide a brain key for this run",
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


def _execution_mode(ctx, inputs):
    delegate = ctx.params.get("delegate", False)

    if delegate:
        description = "Uncheck this box to execute the operation immediately"
    else:
        description = "Check this box to delegate execution of this task"

    inputs.bool(
        "delegate",
        default=False,
        label="Delegate execution?",
        description=description,
        view=types.CheckboxView(),
    )

    if delegate:
        inputs.view(
            "notice",
            types.Notice(
                label=(
                    "You've chosen delegated execution. Note that you must "
                    "have a delegated operation service running in order for "
                    "this task to be processed."
                )
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


def _get_label_fields(sample_collection, label_types):
    schema = sample_collection.get_field_schema(embedded_doc_type=label_types)
    return list(schema.keys())
