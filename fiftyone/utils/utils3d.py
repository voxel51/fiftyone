"""
3D utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import logging

import cv2
import numpy as np
import open3d as o3d

import eta.core.image as etai

import fiftyone.core.media as fom
import fiftyone.core.sample as fos
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov

o3d = fou.lazy_import("open3d", callback=lambda: fou.ensure_package("open3d"))


logger = logging.getLogger(__name__)


def compute_birds_eye_view_maps(
    samples,
    size,
    output_dir,
    rel_dir=None,
    in_group_slice=None,
    out_group_slice=None,
    out_media_field=None,
    bounds=None,
):
    """Computes bird's-eye view (BEV) maps for the point clouds in the given
    collection.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        size: the desired ``(width, height)`` for the generated maps
        output_dir: an output directory in which to store the BEV images
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier that is joined with
            ``output_dir`` to generate an output path for each image. This
            argument allows for populating nested subdirectories in
            ``output_dir`` that match the shape of the input paths
        in_group_slice (None): the name of the group slice containing the point
            cloud data. If ``samples`` is a grouped collection and this
            parameter is not provided, the first point cloud slice will be used
        out_group_slice (None): the name of a group slice to which to add
            samples containing the BEV images
        out_media_field (None): the name of a field in which to store the paths
            to the BEV images
        bounds (None): an optional ``([xmin, ymin, zmin], [xmax, ymax, zmax])``
            tuple defining the field of view for which to generate the map. By
            default, a tight crop of the point cloud is used

    Returns:
        the list of BEV image paths, only if neither ``out_group_slice`` or
        ``out_media_field`` are provided
    """
    if in_group_slice is None and samples.media_type == fom.GROUP:
        in_group_slice = _get_point_cloud_slice(samples)

    if in_group_slice is not None or out_group_slice is not None:
        fov.validate_collection(samples, media_type=fom.GROUP)
        group_field = samples.group_field

        point_cloud_view = samples.select_group_slices(in_group_slice)
        fov.validate_collection(samples, media_type=fom.POINT_CLOUD)

        filepaths, groups = point_cloud_view.values(["filepath", group_field])
    else:
        fov.validate_collection(samples, media_type=fom.POINT_CLOUD)
        point_cloud_view = samples

        filepaths = point_cloud_view.values("filepath")
        groups = itertools.repeat(None)

    filename_maker = fou.UniqueFilenameMaker(
        output_dir=output_dir, rel_dir=rel_dir, idempotent=False
    )

    if out_group_slice is not None:
        bev_samples = []
    else:
        bev_image_paths = []

    with fou.ProgressBar(total=len(filepaths)) as pb:
        for filepath, group in pb(zip(filepaths, groups)):
            bev_img = compute_birds_eye_view_map(filepath, size, bounds=bounds)

            bev_image_path = filename_maker.get_output_path(
                filepath, output_ext=".png"
            )
            etai.write(bev_img, bev_image_path)

            if out_group_slice is not None:
                bev_samples.append(
                    fos.Sample(
                        filepath=bev_image_path,
                        **{group_field: group.element(out_group_slice)},
                    )
                )
            else:
                bev_image_paths.append(bev_image_path)

    if out_group_slice is not None:
        samples.add_samples(bev_samples)
    elif out_media_field is not None:
        point_cloud_view.set_values(out_media_field, bev_image_paths)
    else:
        return bev_image_paths


def compute_birds_eye_view_map(filepath, size, bounds=None):
    """Generates a bird's-eye view (BEV) image for the given PCD file.

    The returned image is RGB encoding the intensity, height, and density of
    the point cloud.

    Args:
        filepath: the path to the ``.pcd`` file
        size: the desired ``(width, height)`` for the generated map
        bounds (None): an optional ``([xmin, ymin, zmin], [xmax, ymax, zmax])``
            tuple defining the field of view for which to generate the map. By
            default, a tight crop of the point cloud is used

    Returns:
        the BEV image
    """
    point_cloud = o3d.io.read_point_cloud(filepath)
    width, height = size

    if bounds is None:
        min_bound, max_bound = None, None
    else:
        min_bound, max_bound = bounds

    if min_bound is None:
        min_bound = np.amin(np.asarray(point_cloud.points), axis=0)

    if max_bound is None:
        max_bound = np.amax(np.asarray(point_cloud.points), axis=0)

    bbox = o3d.geometry.AxisAlignedBoundingBox(
        min_bound=min_bound, max_bound=max_bound
    )
    point_cloud = point_cloud.crop(bbox).translate((0, 0, -1 * min_bound[2]))

    discretization = (max_bound[0] - min_bound[0]) / height
    max_height = float(np.abs(max_bound[2] - min_bound[2]))

    # Extract points from o3d point cloud
    points = np.vstack(
        (np.copy(point_cloud.points).T, np.array(point_cloud.colors)[:, 0])
    ).T

    # Discretize feature map
    points[:, 0] = np.int_(np.floor(points[:, 0] / discretization))
    points[:, 1] = np.int_(
        np.floor(points[:, 1] / discretization) + (width + 1) / 2
    )

    # sort
    indices = np.lexsort((-points[:, 2], points[:, 1], points[:, 0]))
    points = points[indices]

    # Height map
    height_map = np.zeros((height + 1, width + 1))
    _, indices = np.unique(points[:, 0:2], axis=0, return_index=True)
    points_frac = points[indices]

    height_map[np.int_(points_frac[:, 0]), np.int_(points_frac[:, 1])] = (
        points_frac[:, 2] / max_height
    )

    # Intensity map and density map
    intensity_map = np.zeros((height + 1, width + 1))
    density_map = np.zeros((height + 1, width + 1))

    _, indices, counts = np.unique(
        points[:, 0:2], axis=0, return_index=True, return_counts=True
    )
    points_top = points[indices]
    normalized_counts = np.minimum(1.0, np.log(counts + 1) / np.log(64))

    intensity_map[
        np.int_(points_top[:, 0]), np.int_(points_top[:, 1])
    ] = points_top[:, 3]
    density_map[
        np.int_(points_top[:, 0]), np.int_(points_top[:, 1])
    ] = normalized_counts

    # Encode intensity, height, and density in RGB map
    rgb_map = np.zeros((3, height, width))
    rgb_map[2, :, :] = density_map[:height, :width]  # r_map
    rgb_map[1, :, :] = height_map[:height, :width]  # g_map
    rgb_map[0, :, :] = intensity_map[:height, :width]  # b_map

    # Reshape and rescale pixel values
    bev_map = np.einsum("ijk -> jki", rgb_map)

    # pylint: disable=no-member
    return cv2.rotate((255.0 * bev_map).astype(np.uint8), cv2.ROTATE_180)


def _get_point_cloud_slice(samples):
    point_cloud_slices = {
        s for s, m in samples.group_media_types.items if m == fom.POINT_CLOUD
    }
    if not point_cloud_slices:
        raise ValueError("%s has no point cloud slices" % type(samples))

    slice_name = next(iter(point_cloud_slices))

    if len(point_cloud_slices) > 1:
        logger.warning(
            "Found multiple point cloud slices; using '%s'", slice_name
        )

    return slice_name
