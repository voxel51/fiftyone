"""
Data quality operators.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import contextlib
import logging

import cv2
import numpy as np
from PIL import Image

import fiftyone as fo
import fiftyone.core.collections as foc
import fiftyone.core.media as fom
import fiftyone.core.patches as fop
import fiftyone.core.utils as fou
import fiftyone.operators as foo
import fiftyone.operators.types as types
import fiftyone.zoo.models as fozm

# pylint:disable=import-error,no-name-in-module
import fiftyone.brain as fob


logger = logging.getLogger(__name__)


class ComputeBrightness(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_brightness",
            label="Compute brightness",
            allow_delegated_execution=True,
            allow_immediate_execution=True,
            default_choice_to_delegated=True,
            dynamic=True,
            unlisted=True,
        )

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "brightness")

    def execute(self, ctx):
        _handle_execution(ctx, "brightness", _compute_sample_brightness)


class ComputeEntropy(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_entropy",
            label="Compute entropy",
            allow_delegated_execution=True,
            allow_immediate_execution=True,
            default_choice_to_delegated=True,
            dynamic=True,
            unlisted=True,
        )

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "entropy")

    def execute(self, ctx):
        _handle_execution(ctx, "entropy", _compute_sample_entropy)


class ComputeAspectRatio(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_aspect_ratio",
            label="Compute aspect ratio",
            allow_delegated_execution=True,
            allow_immediate_execution=True,
            default_choice_to_delegated=True,
            dynamic=True,
            unlisted=True,
        )

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "aspect_ratio")

    def execute(self, ctx):
        _handle_execution(ctx, "aspect_ratio", _compute_sample_aspect_ratio)


class ComputeBlurriness(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_blurriness",
            label="Compute blurriness",
            allow_delegated_execution=True,
            allow_immediate_execution=True,
            default_choice_to_delegated=True,
            dynamic=True,
            unlisted=True,
        )

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "blurriness")

    def execute(self, ctx):
        _handle_execution(ctx, "blurriness", _compute_sample_blurriness)


class ComputeNearDuplicates(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_near_duplicates",
            label="Compute near duplicates",
            allow_delegated_execution=True,
            allow_immediate_execution=True,
            default_choice_to_delegated=True,
            dynamic=True,
            unlisted=True,
        )

    def resolve_input(self, ctx):
        return _handle_near_duplicates_inputs(ctx)

    def execute(self, ctx):
        _handle_near_duplicates_execution(ctx)


class ComputeExactDuplicates(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_exact_duplicates",
            label="Compute exact duplicates",
            allow_delegated_execution=True,
            allow_immediate_execution=True,
            default_choice_to_delegated=True,
            dynamic=True,
            unlisted=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        return types.Property(inputs)

    def execute(self, ctx):
        _handle_execution(ctx, "filehash", _compute_sample_filehash)


def _handle_inputs(ctx, field):
    inputs = types.Object()

    label = f'Compute {field.replace("_", " ").title()}'
    inputs.message("computation_label", label=label)

    inputs.view_target(ctx)

    return types.Property(inputs)


def _handle_execution(ctx, field, fcn, skip_failures=True, progress=None):
    if ctx.dataset.has_field(field):
        samples = ctx.dataset.exists(field, bool=False)
    else:
        samples = ctx.dataset

    with contextlib.ExitStack() as context:
        context.enter_context(
            samples.download_context(
                media_fields="filepath",
                skip_failures=skip_failures,
            )
        )

        pb = context.enter_context(fou.ProgressBar(progress=progress))
        ctx = context.enter_context(foc.SaveContext(samples))

        for sample in pb(samples):
            try:
                sample[field] = fcn(sample)
                ctx.save(sample)
            except Exception as e:
                if not skip_failures:
                    raise e

                logger.warning("Sample: %s\nError: %s\n", sample.id, e)


def _handle_near_duplicates_inputs(ctx):
    inputs = types.Object()

    target_view = _get_target_view_inputs(ctx, inputs)
    _get_embeddings_inputs(ctx, inputs, target_view)
    _get_metric_inputs(ctx, inputs)

    # @todo add warning that this method only supports <100k samples
    view = types.View(label="Compute near duplicates")
    return types.Property(inputs, view=view)


def _handle_near_duplicates_execution(ctx):
    target = ctx.params.get("target", None)
    embeddings = ctx.params.get("embeddings", None) or None
    model = ctx.params.get("model", None) or None
    batch_size = 8
    metric = ctx.params.get("metric", "cosine")

    # No multiprocessing allowed when running synchronously
    if not ctx.delegated:
        num_workers = 0
    else:
        num_workers = None

    target_view = _get_target_view(ctx, target)

    # @todo only compute embeddings for samples that don't have them
    index = fob.compute_similarity(
        target_view,
        brain_key=None,
        embeddings=embeddings,
        model=model,
        batch_size=batch_size,
        num_workers=num_workers,
        skip_failures=True,
        backend="sklearn",
        metric=metric,
    )

    nearest_inds, dists = index._kneighbors(k=1, return_dists=True)

    index_ids = index.current_sample_ids
    nearest_ids = np.array([index_ids[i[0]] for i in nearest_inds])
    dists = np.array([d[0] for d in dists])

    values = dict(zip(index_ids, dists))
    ctx.dataset.set_values("nearest_neighbor", values, key_field="id")

    values = dict(zip(index_ids, nearest_ids))
    ctx.dataset.set_values("nearest_id", values, key_field="id")


def _compute_sample_filehash(sample):
    filepath = sample.local_path
    method = "md5" if sample.media_type == fom.VIDEO else None
    return _compute_filehash(filepath, method=method)


def _compute_filehash(filepath, method=None):
    return fou.compute_filehash(filepath, method=method)


def _compute_sample_brightness(sample):
    filepath = sample.local_path
    with Image.open(filepath) as pillow_img:
        return _compute_brightness(pillow_img)


def _compute_brightness(pillow_img):
    pixels = np.array(pillow_img)
    if pixels.ndim == 3 and pixels.shape[-1] == 3:
        r, g, b = pixels.mean(axis=(0, 1))
    else:
        mean = pixels.mean()
        r, g, b = (
            mean,
            mean,
            mean,
        )

    ## equation from here:
    ## https://www.nbdtech.com/Blog/archive/2008/04/27/calculating-the-perceived-brightness-of-a-color.aspx
    ## and here:
    ## https://github.com/cleanlab/cleanvision/blob/72a1535019fe7b4636d43a9ef4e8e0060b8d66ec/src/cleanvision/issue_managers/image_property.py#L95
    brightness = (
        np.sqrt(0.241 * r**2 + 0.691 * g**2 + 0.068 * b**2) / 255
    )
    return brightness


def _compute_sample_entropy(sample):
    filepath = sample.local_path
    with Image.open(filepath) as pillow_img:
        return _compute_entropy(pillow_img)


def _compute_entropy(pillow_img):
    return pillow_img.entropy()


def _compute_sample_aspect_ratio(sample):
    if sample.metadata is None:
        sample.compute_metadata()

    width = sample.metadata.width
    height = sample.metadata.height
    return _compute_aspect_ratio(width, height)


def _compute_aspect_ratio(width, height):
    ratio = width / height
    return min(ratio, 1 / ratio)


def _compute_sample_blurriness(sample):
    filepath = sample.local_path
    # pylint: disable=no-member
    cv2_img = cv2.imread(filepath)
    return _compute_blurriness(cv2_img)


def _compute_blurriness(cv2_img):
    # pylint: disable=no-member
    gray = cv2.cvtColor(cv2_img, cv2.COLOR_BGR2GRAY)
    # pylint: disable=no-member
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    variance = laplacian.var()
    return variance


def _get_target_view(ctx, target):
    if target == "SELECTED_SAMPLES":
        return ctx.view.select(ctx.selected)

    if target == "BASE_VIEW":
        return ctx.view._base_view

    if target == "DATASET":
        return ctx.dataset

    return ctx.view


def _get_target_view_inputs(ctx, inputs, allow_selected=True):
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


def _get_embeddings_inputs(ctx, inputs, view):
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
            "use. Or when a model is provided, an optional field in which to "
            "store the embeddings"
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


def _get_metric_inputs(ctx, inputs):
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
