"""
Data quality operators.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import cv2
import numpy as np
from PIL import Image

import fiftyone as fo
import fiftyone.core.patches as fop
import fiftyone.operators as foo
import fiftyone.operators.types as types
import fiftyone.zoo.models as fozm

# pylint:disable=no-name-in-module
from fiftyone.operators.builtins.operators.utils import (
    get_filepath,
    _convert_opencv_to_pillow,
    _convert_pillow_to_opencv,
    _crop_pillow_image,
    _get_opencv_grayscale_image,
    _get_pillow_patch,
    _handle_patch_inputs,
)

# pylint:disable=import-error,no-name-in-module
import fiftyone.brain as fob


###############################################################################
# Operator Setup
###############################################################################


def _handle_inputs(ctx, property_name):
    inputs = types.Object()

    label = f'Compute {property_name.replace("_", " ").title()}'
    inputs.message("computation_label", label=label)

    inputs.view_target(ctx)
    _handle_patch_inputs(ctx, inputs)
    return types.Property(inputs)


def _handle_execution(ctx, property_name):
    # UNCOMMENT below & delete line 51 if we ever want to overwrite existing samples w/ property_name
    #
    # new_sample_exist = (
    #     ctx.params.get("panel_state", {})
    #     .get("new_samples", {})
    #     .get(property_name, [0, False])[0]
    #     > 0
    # )
    #
    # view = (
    #     ctx.dataset.exists(property_name, bool=False)
    #     if new_sample_exist
    #     else ctx.target_view()
    # )

    view = ctx.dataset.exists(
        property_name, bool=False
    )  # default to always scanning samples w/o property_name

    patches_field = ctx.params.get("patches_field", None)
    compute_dataset_property(
        property_name, ctx.dataset, view=view, patches_field=patches_field
    )
    # update the flag that computation has been done
    print(f"Computation done for {property_name}")


###############################################################################
# Operators
###############################################################################


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
        _handle_execution(ctx, "brightness")


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
        _handle_execution(ctx, "entropy")


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
        _handle_execution(ctx, "aspect_ratio")


class ComputeExposure(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_exposure",
            label="Compute exposure",
            allow_delegated_execution=True,
            allow_immediate_execution=True,
            default_choice_to_delegated=True,
            dynamic=True,
            unlisted=True,
        )

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "exposure")

    def execute(self, ctx):
        _handle_execution(ctx, "exposure")


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
        _handle_execution(ctx, "blurriness")


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
        inputs = types.Object()

        target_view = get_target_view(ctx, inputs)
        get_embeddings(ctx, inputs, target_view, None)
        get_metric(ctx, inputs)

        view = types.View(label="Compute near duplicates")
        return types.Property(inputs, view=view)

    def execute(self, ctx):
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
        compute_filehashes(ctx.dataset)


def compute_dataset_property(property, dataset, view=None, patches_field=None):
    if view is None:
        view = dataset
    if patches_field is None:
        dataset.add_sample_field(property, fo.FloatField)
        for sample in view.iter_samples(autosave=True, progress=True):
            if sample is None:
                continue
            prop_value = prop_compute_function(
                property, "sample", {"sample": sample}
            )
            if property == "exposure":
                sample["min_exposure"] = prop_value[0]
                sample["max_exposure"] = prop_value[1]
            else:
                sample[property] = prop_value
    else:
        for sample in view.iter_samples(autosave=True, progress=True):
            if sample[patches_field] is None:
                continue
            for detection in sample[patches_field].detections:
                prop_value = prop_compute_function(
                    property,
                    "patch",
                    {"sample": sample, "detection": detection},
                )
                if property == "exposure":
                    detection["min_exposure"] = prop_value[0]
                    detection["max_exposure"] = prop_value[1]
                else:
                    detection[property] = prop_value
        dataset.add_dynamic_sample_fields()


def prop_compute_function(property, patch_or_sample, args):
    if patch_or_sample == "sample":
        if property == "brightness":
            return compute_sample_brightness(**args)
        elif property == "blurriness":
            return compute_sample_blurriness(**args)
        elif property == "entropy":
            return compute_sample_entropy(**args)
        elif property == "aspect_ratio":
            return compute_sample_aspect_ratio(**args)
        elif property == "exposure":
            return compute_sample_exposure(**args)
    elif patch_or_sample == "patch":
        if property == "brightness":
            return compute_patch_brightness(**args)
        elif property == "blurriness":
            return compute_patch_blurriness(**args)
        elif property == "entropy":
            return compute_patch_entropy(**args)
        elif property == "aspect_ratio":
            return compute_patch_aspect_ratio(**args)
        elif property == "exposure":
            return compute_patch_exposure(**args)


###############################################################################
# Operator Helper Functions
###############################################################################


def dhash(image, hash_size=8):
    """
    Compute the dHash for the input image.

    :param image: Input image to hash (as a NumPy array).
    :param hash_size: Size of the hash (default 8x8).
    :return: The dHash value of the image as a 64-bit integer.
    """
    # Convert the image to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Resize the image to (hash_size + 1, hash_size)
    resized = cv2.resize(gray, (hash_size + 1, hash_size))

    # Compute the differences between adjacent pixels
    diff = resized[:, 1:] > resized[:, :-1]

    # Convert the difference image to a binary hash
    # hash_value = sum([2 ** i for (i, v) in enumerate(diff.flatten()) if v])

    # Convert the difference image to a binary hash
    binary_string = "".join(["1" if v else "0" for v in diff.flatten()])

    # Convert the binary string to a hexadecimal string
    hex_hash = f"{int(binary_string, 2):0{hash_size * hash_size // 4}x}"

    return hex_hash


def compute_filehashes(sample_collection):
    for sample in sample_collection.iter_samples(autosave=True, progress=True):
        filepath = get_filepath(sample)
        with Image.open(filepath) as image:
            sample["filehash"] = dhash(_convert_pillow_to_opencv(image))


def gen_approx_duplicate_groups_view(ctx, index):
    """
    This function is used to generate the approximate duplicate groups view.
    """

    near_dup_view = index.duplicates_view()
    dup_ids = near_dup_view.values("id")
    view = ctx.dataset.select(dup_ids)

    for rep_id, dups in index.neighbors_map.items():
        ids = [rep_id] + [d[0] for d in dups]
        subview = view.select(ids)
        for sample in subview:
            sample["approx_dup_group_id"] = rep_id
            sample.save()

    approx_dup_groups_view = view.group_by("approx_dup_group_id")
    return near_dup_view, approx_dup_groups_view


###############################################################################
# Computation Functions
###############################################################################


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


def _compute_exposure(opencv_gray_img):
    # pylint: disable=no-member
    histogram = cv2.calcHist([opencv_gray_img], [0], None, [256], [0, 256])
    normalized_histogram = histogram.ravel() / histogram.max()
    min_exposure = normalized_histogram[0]
    max_exposure = normalized_histogram[-1]
    return min_exposure, max_exposure


def _compute_entropy(pillow_img):
    return pillow_img.entropy()


def _compute_aspect_ratio(width, height):
    ratio = width / height
    return min(ratio, 1 / ratio)


def _compute_blurriness(cv2_img):
    # pylint: disable=no-member
    gray = cv2.cvtColor(cv2_img, cv2.COLOR_BGR2GRAY)
    # pylint: disable=no-member
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    variance = laplacian.var()
    return variance


def compute_sample_brightness(sample):
    filepath = get_filepath(sample)
    with Image.open(filepath) as image:
        return _compute_brightness(image)


def compute_patch_brightness(sample, detection):
    patch = _get_pillow_patch(sample, detection)
    return _compute_brightness(patch)


def compute_sample_exposure(sample):
    gray_img = _get_opencv_grayscale_image(sample)
    return _compute_exposure(gray_img)


def compute_patch_exposure(sample, detection):
    gray_img = _get_opencv_grayscale_image(sample)
    pillow_image = _convert_opencv_to_pillow(gray_img)
    patch = _crop_pillow_image(pillow_image, detection)
    patch = _convert_pillow_to_opencv(patch)
    return _compute_exposure(patch)


def compute_sample_entropy(sample):
    filepath = get_filepath(sample)
    with Image.open(filepath) as image:
        return _compute_entropy(image)


def compute_patch_entropy(sample, detection):
    patch = _get_pillow_patch(sample, detection)
    return _compute_entropy(patch)


def compute_sample_aspect_ratio(sample):
    if sample.metadata is None:
        sample.compute_metadata()
    width, height = sample.metadata.width, sample.metadata.height
    return _compute_aspect_ratio(width, height)


def compute_patch_aspect_ratio(sample, detection):
    if sample.metadata is None:
        sample.compute_metadata()
    img_width, img_height = sample.metadata.width, sample.metadata.height
    bbox_width, bbox_height = detection.bounding_box[2:]
    width, height = bbox_width * img_width, bbox_height * img_height
    return _compute_aspect_ratio(width, height)


def compute_sample_blurriness(sample):
    # pylint: disable=no-member
    image = cv2.imread(get_filepath(sample))
    return _compute_blurriness(image)


def compute_patch_blurriness(sample, detection):
    patch = _get_pillow_patch(sample, detection)
    patch = _convert_pillow_to_opencv(patch)
    return _compute_blurriness(patch)


###############################################################################
# Near Duplicates Functions
###############################################################################


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


def get_metric(ctx, inputs):
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
