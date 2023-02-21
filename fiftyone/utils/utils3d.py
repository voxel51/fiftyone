"""
3D utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import logging
import os
from typing import Tuple
from typing_extensions import Literal

import eta.core.image as etai
import numpy as np

import fiftyone.core.fields as fof
import fiftyone.core.media as fom
import fiftyone.core.sample as fos
import fiftyone.core.config as foc
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov
from fiftyone.core.odm import DynamicEmbeddedDocument

o3d = fou.lazy_import("open3d", callback=lambda: fou.ensure_package("open3d"))

logger = logging.getLogger(__name__)

DEFAULT_SHADING_GRADIENT_MAP = {
    # lowest value is red
    0.000: (165, 0, 38),
    0.111: (215, 48, 39),
    0.222: (244, 109, 67),
    0.333: (253, 174, 97),
    0.444: (254, 224, 144),
    # mid-value is gray
    0.555: (224, 243, 248),
    0.666: (171, 217, 233),
    0.777: (116, 173, 209),
    0.888: (69, 117, 180),
    # highest value is blue
    1.000: (49, 54, 149),
}

if "FIFTYONE_APP_COLORSCALE" in os.environ:
    shading_map_colors = foc.load_app_config().get_colormap(n=10)
    shading_gradient_map = {
        discrete_value: rgb_color
        for (discrete_value, rgb_color) in zip(
            DEFAULT_SHADING_GRADIENT_MAP, shading_map_colors
        )
    }
else:
    shading_gradient_map = DEFAULT_SHADING_GRADIENT_MAP


class OrthographicProjectionMetadata(DynamicEmbeddedDocument):
    """
    Metadata class to store orthographic projection results
    """

    filepath = fof.StringField()
    min_bound = fof.ListField(fof.FloatField())
    max_bound = fof.ListField(fof.FloatField())
    width = fof.IntField()
    height = fof.IntField()


def compute_orthographic_projection_images(
    samples,
    size,
    output_dir,
    shading_mode=None,
    rel_dir=None,
    projection_normal=None,
    in_group_slice=None,
    out_group_slice=None,
    subsampling_rate=None,
    bounds=None,
):
    """Computes orthographic projection images for the point clouds in the given
    collection.

    This operation will add ``orthographic_projection_metadata``
    field to each sample.

    Examples::

        import fiftyone as fo
        import fiftyone.utils.utils3d as fou3d
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-groups")
        view = dataset.select_group_slices("pcd")

        fou3d.compute_orthographic_projection_images(
            view,
            (-1, 512),
            "/tmp/proj"
        )

        session = fo.launch_app(dataset)

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        size: the desired ``(width, height)`` for the generated maps. Either
            dimension can be None or negative, in which case the appropriate
            aspect-preserving value is used
        output_dir: an output directory in which to store the images/maps
        shading_mode: one of "intensity", "rgb", or "height" to specify
            the shading algorithm for points. "intensity" and "rgb" are
            only valid if the header contains "rgb" flag, or else
            it'll default to ``None``. If it's ``None``,
            all points are shaded white.
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier that is joined with
            ``output_dir`` to generate an output path for each image. This
            argument allows for populating nested subdirectories in
            ``output_dir`` that match the shape of the input paths
        projection_normal (None): (experimental) the normal vector of the plane
            onto which to perform the orthographic projection.
            By default, ``(0, 0, 1)`` is used
        in_group_slice (None): the name of the group slice containing the point
            cloud data. If ``samples`` is a grouped collection and this
            parameter is not provided, the first point cloud slice will be used
        out_group_slice (None): the name of a group slice to which to add
            samples containing the feature images/maps
        subsampling_rate (None): an unsigned ``int`` that, if defined,
            defines a uniform subsampling rate. The selected point indices are
            [0, k, 2k, ...], where ``k = subsampling_rate``.
        bounds (None): an optional ``((xmin, ymin, zmin), (xmax, ymax, zmax))``
            tuple defining the field of view in the projected plane for which
            to generate each map. Either element of the tuple or any/all of its
            values can be None, in which case a tight crop of the point cloud
            along the missing dimension(s) are used
    """
    if in_group_slice is None and samples.media_type == fom.GROUP:
        in_group_slice = _get_point_cloud_slice(samples)

    out_field = "orthographic_projection_metadata"

    if in_group_slice is not None or out_group_slice is not None:
        fov.validate_collection(samples, media_type=fom.GROUP)
        group_field = samples.group_field

        point_cloud_view = samples.select_group_slices(in_group_slice)
        fov.validate_collection(point_cloud_view, media_type=fom.POINT_CLOUD)

        filepaths, groups = point_cloud_view.values(["filepath", group_field])
    else:
        fov.validate_collection(samples, media_type=fom.POINT_CLOUD)
        point_cloud_view = samples

        filepaths = point_cloud_view.values("filepath")
        groups = itertools.repeat(None)

    filename_maker = fou.UniqueFilenameMaker(
        output_dir=output_dir, rel_dir=rel_dir
    )

    if out_group_slice is not None:
        out_samples = []
    else:
        all_metadata = []

    with fou.ProgressBar(total=len(filepaths)) as pb:
        for filepath, group in pb(zip(filepaths, groups)):
            image_path = filename_maker.get_output_path(
                filepath, output_ext=".png"
            )

            img, processed_bounds = compute_orthographic_projection_image(
                filepath,
                size,
                shading_mode=shading_mode,
                projection_normal=projection_normal,
                subsampling_rate=subsampling_rate,
                bounds=bounds,
            )

            etai.write(img, image_path)

            metadata = OrthographicProjectionMetadata(
                filepath=image_path,
                min_bound=(
                    processed_bounds[0],
                    processed_bounds[2],
                ),  # xmin, ymin
                max_bound=(
                    processed_bounds[1],
                    processed_bounds[3],
                ),  # ymin, ymax
                width=img.shape[0],
                height=img.shape[1],
            )

            if out_group_slice is not None:
                sample = fos.Sample(filepath=image_path)
                sample[group_field] = group.element(out_group_slice)

                sample[out_field] = metadata

                out_samples.append(sample)
            else:
                all_metadata.append(metadata)

    if out_group_slice is not None:
        samples.add_samples(out_samples)
    else:
        point_cloud_view.set_values(out_field, all_metadata)


def compute_orthographic_projection_image(
    filepath,
    size,
    shading_mode=None,
    projection_normal=None,
    subsampling_rate=None,
    bounds=None,
):
    """Generates an orthographic projection map for the given PCD file onto the
    specified plane (default xy plane).

    The returned map is a three-channel array encoding the intensity, height,
    and density of the point cloud.

    Args:
        filepath: the path to the ``.pcd`` file
        size: the desired ``(width, height)`` for the generated maps. Either
            dimension can be None or negative, in which case the appropriate
            aspect-preserving value is used
        shading_mode: one of "intensity", "rgb", or "height" to specify
            the shading algorithm for points. "intensity" and "rgb" are
            only valid if the header contains "rgb" flag, or else
            it'll default to ``None``. If it's ``None``,
            all points are shaded white.
        projection_normal (None): **(experimental)** the normal vector of the
            plane onto which to perform the projection.
            By default, ``(0, 0, 1)`` is used
        subsampling_rate (None): an unsigned ``int`` that, if defined,
            defines a uniform subsampling rate. The selected point indices are
            [0, k, 2k, ...], where ``k = subsampling_rate``.
        bounds (None): an optional ``((xmin, ymin, zmin), (xmax, ymax, zmax))``
            tuple defining the field of view for which to generate each map in
            the projected plane. Either element of the tuple or any/all of its
            values can be None, in which case a tight crop of the point cloud
            along the missing dimension(s) are used

    Returns:
        a tuple of

        -   the orthographic projection image
        -   the ``(xmin, xmax, ymin, ymax)`` bounds in the projected plane
    """
    pc = o3d.io.read_point_cloud(filepath)

    if projection_normal is not None and not np.array_equal(
        projection_normal, np.array([0, 0, 1])
    ):
        R = _rotation_matrix_from_vectors(projection_normal, [0, 0, 1])
        # rotate points so that they are perpendicular to the projection plane
        # as opposed to the default XY plane
        pc = pc.rotate(R, center=[0, 0, 0])

    if bounds is None:
        min_bound, max_bound = None, None
    else:
        min_bound, max_bound = bounds

    if _contains_none(min_bound):
        _min_bound = np.amin(np.asarray(pc.points), axis=0)
        min_bound = _fill_none(min_bound, _min_bound)

    if _contains_none(max_bound):
        _max_bound = np.amax(np.asarray(pc.points), axis=0)
        max_bound = _fill_none(max_bound, _max_bound)

    width, height = _parse_size(size, (min_bound, max_bound))

    bbox = o3d.geometry.AxisAlignedBoundingBox(
        min_bound=min_bound, max_bound=max_bound
    )

    # crop bounds and translate so that min bound is at the origin
    pc = pc.crop(bbox).translate((-min_bound[0], -min_bound[1], -min_bound[2]))

    if subsampling_rate is not None and subsampling_rate > 0:
        pc = pc.uniform_down_sample(subsampling_rate)

    points = np.asarray(pc.points)
    colors = np.asarray(pc.colors)

    # scale and normalize XY points based on width / height and bounds
    points[:, 0] *= (width - 1) / (max_bound[0] - min_bound[0])
    points[:, 1] *= (height - 1) / (max_bound[1] - min_bound[1])

    image = np.zeros((width, height, 3), dtype=np.uint8)

    if (
        len(colors) == len(points)
        and shading_mode is not None
        and shading_mode != "height"
    ):
        if shading_mode == "rgb":
            image[np.int_(points[:, 0]), np.int_(points[:, 1]), :] = (
                colors * 255.0
            )
        else:
            # use R channel for intensity, discard G and B channels
            min_intensity = np.min(colors[:, 0])
            max_intensity = np.max(colors[:, 1])
            intensities_normalized_t = (colors[:, 0] - min_intensity) / (
                max_intensity - min_intensity
            )
            # map intensity value to RGB
            rgb_refs = _clamp_to_discrete(
                intensities_normalized_t, list(shading_gradient_map.keys())
            )
            rgbs = np.array([shading_gradient_map[v] for v in rgb_refs])
            image[np.int_(points[:, 0]), np.int_(points[:, 1]), :] = rgbs
    elif shading_mode == "height":
        # color by height (z)
        max_z = np.max(points[:, 2])
        min_z = np.min(points[:, 2])
        z_normalized = (points[:, 2] - min_z) / (max_z - min_z)
        # map z value to color
        rgb_refs = _clamp_to_discrete(
            z_normalized, list(shading_gradient_map.keys())
        )
        rgbs = np.array([shading_gradient_map[v] for v in rgb_refs])
        image[np.int_(points[:, 0]), np.int_(points[:, 1]), :] = rgbs
    else:
        image[np.int_(points[:, 0]), np.int_(points[:, 1]), :] = 255.0

    # change axis orientation such that y is up
    image = np.rot90(image, k=1, axes=(0, 1))
    bounds = [min_bound[0], max_bound[0], min_bound[1], max_bound[1]]
    return image, bounds


def _get_point_cloud_slice(samples):
    point_cloud_slices = {
        s for s, m in samples.group_media_types.items() if m == fom.POINT_CLOUD
    }
    if not point_cloud_slices:
        raise ValueError("%s has no point cloud slices" % type(samples))

    slice_name = next(iter(point_cloud_slices))

    if len(point_cloud_slices) > 1:
        logger.warning(
            "Found multiple point cloud slices; using '%s'", slice_name
        )

    return slice_name


def _clamp_to_discrete(arr: np.ndarray, discrete: list[float]):
    """
    Discretize by mapping each continuous value in ``arr``
    to the closest value in ``discrete``.
    """
    clamp_list = np.sort(np.array(discrete))
    idx = np.searchsorted(clamp_list, arr - 1e-8)
    return clamp_list[np.clip(idx, 0, len(clamp_list) - 1)]


# Reference: https://math.stackexchange.com/q/180418
def _rotation_matrix_from_vectors(vec1, vec2):
    """Returns the rotation matrix that aligns vec1 to vec2."""
    a = (np.asarray(vec1) / np.linalg.norm(vec1)).reshape(3)
    b = (np.asarray(vec2) / np.linalg.norm(vec2)).reshape(3)
    v = np.cross(a, b)
    c = np.dot(a, b)
    s = np.linalg.norm(v)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K.dot(K) * ((1 - c) / (s**2))


def _parse_size(size, bounds):
    width, height = size

    if width is None and height is None:
        raise ValueError("both width and height cannot be undefined")

    min_bounds, max_bounds = bounds

    w = max_bounds[0] - min_bounds[0]
    h = max_bounds[1] - min_bounds[1]

    if height is None or height < 0:
        height = int(round(h * (width * 1.0 / w)))

    if width is None or width < 0:
        width = int(round(w * (height * 1.0 / h)))

    return width, height


def _contains_none(values):
    if values is None:
        return True

    return any(v is None for v in values)


def _fill_none(values, ref_values):
    if values is None:
        return ref_values

    return [v if v is not None else r for v, r in zip(values, ref_values)]
