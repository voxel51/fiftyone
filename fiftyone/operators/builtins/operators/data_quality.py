import fiftyone as fo
import fiftyone.operators as foo
import fiftyone.operators.types as types
import numpy as np
import cv2

from PIL import Image

########## COMMENT below && UNCOMMENT for OSS to WORK ################

# from .utils import (
#     get_filepath,
#     _convert_opencv_to_pillow,
#     _convert_pillow_to_opencv,
#     _crop_pillow_image,
#     _get_opencv_grayscale_image,
#     _get_pillow_patch,
#     _handle_patch_inputs,
# )

########## COMMENT ^ && UNCOMMENT for TEAMS to WORK ################
# pylint:disable=import-error,no-name-in-module
from fiftyone.operators.builtins.operators.utils import (
    get_filepath,
    _convert_opencv_to_pillow,
    _convert_pillow_to_opencv,
    _crop_pillow_image,
    _get_opencv_grayscale_image,
    _get_pillow_patch,
    _handle_patch_inputs,
)

########################## ################ ################ ################


###
# Operator Setup
###


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


def _handle_calling(
    uri, sample_collection, patches_field=None, delegate=False
):
    ctx = dict(view=sample_collection.view())
    params = dict(
        target="CURRENT_VIEW",
        patches_field=patches_field,
        delegate=delegate,
    )
    return foo.execute_operator(uri, ctx, params=params)


###
# Operators
###


class ComputeBrightness(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_brightness",
            label="Data Quality Panel Brightness",
            dynamic=True,
            allow_delegated_execution=True,
            # default_choice_to_delegated=True,
        )

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "brightness")

    def execute(self, ctx):
        _handle_execution(ctx, "brightness")

    def __call__(self, sample_collection, patches_field=None, delegate=False):
        return _handle_calling(
            self.uri,
            sample_collection,
            patches_field=patches_field,
            delegate=delegate,
        )


class ComputeEntropy(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_entropy",
            label="Data Quality Panel Entropy",
            dynamic=True,
            allow_delegated_execution=True,
            # default_choice_to_delegated=True,
        )

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "entropy")

    def execute(self, ctx):
        _handle_execution(ctx, "entropy")

    def __call__(self, sample_collection, patches_field=None, delegate=False):
        return _handle_calling(
            self.uri,
            sample_collection,
            patches_field=patches_field,
            delegate=delegate,
        )


class ComputeAspectRatio(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_aspect_ratio",
            label="Data Quality Panel Aspect Ratio",
            dynamic=True,
            allow_delegated_execution=True,
            # default_choice_to_delegated=True,
        )

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "aspect_ratio")

    def execute(self, ctx):
        _handle_execution(ctx, "aspect_ratio")

    def __call__(self, sample_collection, patches_field=None, delegate=False):
        return _handle_calling(
            self.uri,
            sample_collection,
            patches_field=patches_field,
            delegate=delegate,
        )


class ComputeExposure(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_exposure",
            label="Data Quality Panel Exposure",
            dynamic=True,
            allow_delegated_execution=True,
            # default_choice_to_delegated=True,
        )

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "exposure")

    def execute(self, ctx):
        _handle_execution(ctx, "exposure")

    def __call__(self, sample_collection, patches_field=None, delegate=False):
        return _handle_calling(
            self.uri,
            sample_collection,
            patches_field=patches_field,
            delegate=delegate,
        )


class ComputeBlurriness(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_blurriness",
            label="Data Quality Panel Blur",
            dynamic=True,
            allow_delegated_execution=True,
            # default_choice_to_delegated=True,
        )

    def resolve_input(self, ctx):
        return _handle_inputs(ctx, "blurriness")

    def execute(self, ctx):
        _handle_execution(ctx, "blurriness")

    def __call__(self, sample_collection, patches_field=None, delegate=False):
        return _handle_calling(
            self.uri,
            sample_collection,
            patches_field=patches_field,
            delegate=delegate,
        )


class ComputeHash(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_hash",
            label="Data Quality Hashing",
            dynamic=True,
            allow_delegated_execution=True,
            # default_choice_to_delegated=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        return types.Property(inputs)

    def execute(self, ctx):
        compute_filehashes(ctx.dataset)

        # filehash_counts = Counter(
        #     sample.filehash for sample in ctx.dataset
        # )
        # dup_filehashes = [
        #     k for k, v in filehash_counts.items() if v > 1
        # ]
        # print(ctx.panel_id)
        # ctx.ops.set_panel_state()
        # ctx.ops.patch_panel_state({'temp': "dfgdfg"}, panel_id=ctx.panel_id)

        # ctx.panel.state.exact_dup_filehashs = dup_filehashes


class DeleteSamples(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_samples",
            label="Delete Quality Issue Samples",
            dynamic=True,
            unlisted=True,
        )

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.md(
            """Are you sure you want to remove these samples from your dataset?
                  """
        )
        radio_group = types.RadioGroup()
        radio_group.add_choice(
            "yes", label="Yes", description="Remove the selected samples"
        )
        radio_group.add_choice(
            "no",
            label="No",
            description="Will not remove the selected samples",
        )
        inputs.enum("choice", radio_group.values(), view=radio_group)

        # Ask user if they want to make this the default method for handling
        # this issue
        radio_group2 = types.RadioGroup()
        radio_group2.add_choice(
            "yes",
            label="Yes",
            description="Make this the default method for handling this issue",
        )
        radio_group2.add_choice(
            "no",
            label="No",
            description="Do not make this the default method for handling this issue",
        )
        inputs.enum("save_default", radio_group2.values(), view=radio_group2)
        inputs.view_target(ctx)
        return types.Property(inputs)

    def execute(self, ctx):
        target_view = ctx.target_view()
        if ctx.params["choice"] == "yes":
            if ctx.params["save_default"] == "yes":
                issue_config = ctx.panel.state.issue_config
                issue_config[ctx.panel.state.issue_type][
                    "default_method"
                ] = "delete"
                ctx.panel.state.issue_config = issue_config
            ctx.dataset.delete_samples(target_view)
            ctx.ops.set_view(ctx.dataset.view())


class TagSamples(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="tag_samples",
            label="Tag Quality Issue Samples",
            dynamic=True,
            unlisted=True,
        )

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.md(
            """What names would you like to tag these samples with?
                  """
        )
        # Add text input for tag name
        inputs.str("tag_name", label="Tag Name", required=True)

        # Ask user if they want to make this the default method for handling
        # this issue
        radio_group2 = types.RadioGroup()
        radio_group2.add_choice(
            "yes",
            label="Yes",
            description="Make this the default method for handling this issue",
        )
        radio_group2.add_choice(
            "no",
            label="No",
            description="Do not make this the default method for handling this issue",
        )
        inputs.enum("save_default", radio_group2.values(), view=radio_group2)

        inputs.view_target(ctx)
        return types.Property(inputs)

    def execute(self, ctx):
        target_view = ctx.target_view()
        if ctx.params["save_default"] == "yes":
            issue_config = ctx.panel.state.issue_config
            issue_config[ctx.panel.state.issue_type]["default_method"] = "tag"
            ctx.panel.state.issue_config = issue_config
        target_view.tag_samples(ctx.params["tag_name"])


class SaveView(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="save_view",
            label="Data Quality Panel Save View",
            dynamic=True,
            unlisted=True,
        )

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str(
            "temp_text",
            view=types.HeaderView(
                title="title",
                label="Create View",
            ),
        )
        inputs.str("view_name", description="Name", view=types.TextFieldView())
        inputs.str(
            "description", description="Description", view=types.FieldView()
        )
        # TODO: Fix color picker
        inputs.str("Color", view=types.ColorView())

        # Ask user if they want to make this the default method for handling
        # this issue
        radio_group2 = types.RadioGroup()
        radio_group2.add_choice(
            "yes",
            label="Yes",
            description="Make this the default method for handling this issue",
        )
        radio_group2.add_choice(
            "no",
            label="No",
            description="Do not make this the default method for handling this issue",
        )
        inputs.enum("save_default", radio_group2.values(), view=radio_group2)

        inputs.view_target(ctx)
        return types.Property(inputs)

    def execute(self, ctx):
        target_view = ctx.target_view()

        if ctx.params["save_default"] == "yes":
            issue_config = ctx.panel.state.issue_config
            issue_config[ctx.panel.state.issue_type][
                "default_method"
            ] = "save_view"
            ctx.panel.state.issue_config = issue_config

        ctx.dataset.save_view(
            ctx.params["view_name"], target_view, ctx.params["description"]
        )
        ctx.ops.set_view(name=ctx.params["view_name"])


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


###
# Operator Helper Functions
###


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


###
# Computation Functions
###


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
