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
import fiftyone.zoo as foz
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
        return types.Property(types.Object())

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
        return types.Property(types.Object())

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
        return types.Property(types.Object())

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
        return types.Property(types.Object())

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
        return types.Property(types.Object())

    def execute(self, ctx):
        _handle_execution(ctx, "filehash", _compute_sample_filehash)


def _handle_execution(ctx, field, fcn, skip_failures=True, progress=None):
    # Only process samples that don't yet have the field populated
    if ctx.dataset.has_field(field):
        samples = ctx.dataset.exists(field, bool=False).select_fields(field)
    else:
        samples = ctx.dataset.select_fields()

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

    _get_embeddings_inputs(ctx, inputs)

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

    num_samples = ctx.dataset._sample_collection.estimated_document_count()
    if num_samples > 100000:
        inputs.str(
            "warning",
            label=(
                "Near Duplicates scans are not recommended for datasets with "
                "over 100k samples"
            ),
            view=types.Warning(),
        )

    view = types.View(label="Compute Near Duplicates")
    return types.Property(inputs, view=view)


def _handle_near_duplicates_execution(ctx):
    model_name = ctx.params.get("model", None) or None
    embeddings_field = ctx.params.get("embeddings", None) or None
    metric = ctx.params.get("metric", "cosine")
    batch_size = 8  # will be ignored if chosen model doesn't support batching

    # No multiprocessing allowed when running synchronously
    if not ctx.delegated:
        num_workers = 0
    else:
        num_workers = None

    # If all samples already have nearest neighbors populated, there's nothing
    # for us to do here
    if ctx.dataset.has_field("nearest_neighbor"):
        if len(ctx.dataset.exists("nearest_neighbor", bool=False)) == 0:
            return

    # Store embeddings on dataset if requested
    if model_name is not None and embeddings_field is not None:
        if ctx.dataset.has_field(embeddings_field):
            view = ctx.dataset.exists(embeddings_field, bool=False)
        else:
            view = ctx.dataset

        if len(view) > 0:
            model = foz.load_zoo_model(model_name)
            view.compute_embeddings(
                model,
                embeddings_field=embeddings_field,
                batch_size=batch_size,
                num_workers=num_workers,
                skip_failures=True,
            )

        # Don't pass model to `compute_similarity()` because embeddings are
        # stored on the dataset
        model_name = None

    index = fob.compute_similarity(
        ctx.dataset,
        brain_key=None,
        embeddings=embeddings_field,
        model=model_name,
        batch_size=batch_size,
        num_workers=num_workers,
        skip_failures=True,
        backend="sklearn",
        metric=metric,
    )

    # NOTE: we always recompute nearest neighbors for all samples because
    # adding a single new sample could change everybody's nearest neighbor
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
        r, g, b = mean, mean, mean

    # source: https://www.nbdtech.com/Blog/archive/2008/04/27/calculating-the-perceived-brightness-of-a-color.aspx
    return np.sqrt(0.241 * r**2 + 0.691 * g**2 + 0.068 * b**2) / 255


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
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    variance = laplacian.var()
    return variance


def _get_embeddings_inputs(ctx, inputs):
    schema = ctx.dataset.get_field_schema(ftype=fo.VectorField)
    embeddings_fields = set(schema.keys())

    embeddings_choices = types.AutocompleteView()
    for field_name in sorted(embeddings_fields):
        embeddings_choices.add_choice(field_name, label=field_name)

    model_choices = types.AutocompleteView()
    for name in sorted(_get_zoo_models_with_embeddings()):
        model_choices.add_choice(name, label=name)

    prop = inputs.enum(
        "model",
        model_choices.values(),
        default=None,
        required=False,
        label="Model",
        description=(
            "A model from the "
            "[FiftyOne Model Zoo](https://docs.voxel51.com/user_guide/model_zoo/models.html) "
            "to use to generate embeddings"
        ),
        view=model_choices,
    )

    inputs.str(
        "embeddings",
        default=None,
        required=False,
        label="Embeddings field",
        description=(
            "A sample field containing pre-computed embeddings to use. Or "
            "when a model is provided, an optional field in which to store "
            "the embeddings"
        ),
        view=embeddings_choices,
    )

    model = ctx.params.get("model", None)
    embeddings = ctx.params.get("embeddings", None)

    if not model and embeddings not in embeddings_fields:
        prop.error_message = (
            "You must choose a model or an existing embeddings field"
        )
        prop.invalid = True


def _get_zoo_models_with_embeddings():
    available_models = set()
    for model in fozm._list_zoo_models():
        if model.has_tag("embeddings"):
            available_models.add(model.name)

    return available_models
