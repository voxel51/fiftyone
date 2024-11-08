from collections import Counter

import fiftyone as fo
import fiftyone.operators as foo
import fiftyone.core.utils as fou
from fiftyone import ViewField as F
import fiftyone.operators.types as types
from .utils import get_filepath, _convert_pillow_to_opencv
import cv2
from PIL import Image


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


class ComputeHash(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="compute_hash",
            label="Data Quality Hashing",
            dynamic=True,
            # execute_as_generator=True
        )

    def resolve_delegation(self, ctx):
        return ctx.params.get("delegate", False)

    def resolve_input(self, ctx):
        inputs = types.Object()
        return types.Property(inputs)

    def execute(self, ctx):
        ctx.ops.track_event("data_quality_filehash")
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

        # ctx.ops.reload_dataset()
