"""
3D utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import logging
import os

import cv2
import numpy as np

import eta.core.image as etai

import fiftyone.core.media as fom
import fiftyone.core.sample as fos
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov

o3d = fou.lazy_import("open3d", callback=lambda: fou.ensure_package("open3d"))


logger = logging.getLogger(__name__)


def compute_birds_eye_view_map(filepath, size, bounds=None):
    """Generates a bird's-eye view (BEV) map for the given PCD file.

    The returned map is a three-channel numpy array encoding the intensity,
    height, and density of the point cloud.

    Args:
        filepath: the path to the ``.pcd`` file
        size: the desired ``(width, height)`` for the generated map. Either
            dimension can be None or negative, in which case the appropriate
            aspect-preserving value is used
        bounds (None): an optional ``([xmin, ymin, zmin], [xmax, ymax, zmax])``
            tuple defining the field of view for which to generate each map.
            Either element of the tuple or any/all of its values can be None,
            in which case a tight crop of the point cloud along the missing
            dimension(s) are used

    Returns:
        the BEV map
    """
    point_cloud = o3d.io.read_point_cloud(filepath)

    if bounds is None:
        min_bound, max_bound = None, None
    else:
        min_bound, max_bound = bounds

    if _contains_none(min_bound):
        _min_bound = np.amin(np.asarray(point_cloud.points), axis=0)
        min_bound = _fill_none(min_bound, _min_bound)

    if _contains_none(max_bound):
        _max_bound = np.amax(np.asarray(point_cloud.points), axis=0)
        max_bound = _fill_none(max_bound, _max_bound)

    width, height = _parse_size(size, (min_bound, max_bound))

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
    bev_map = np.stack(
        (
            density_map[:height, :width],  # r_map
            height_map[:height, :width],  # g_map
            intensity_map[:height, :width],  # b_map
        )
    )

    # Reshape and rescale pixel values
    bev_map = np.einsum("ijk -> jki", bev_map)

    # Reorder for etai.write()
    bev_map[:, :, [0, 2]] = bev_map[:, :, [2, 0]]
    return bev_map


def _parse_size(size, bounds):
    width, height = size
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


def compute_birds_eye_view_maps(
    samples,
    size,
    output_dir,
    rel_dir=None,
    in_group_slice=None,
    out_group_slice=None,
    out_image_field=None,
    out_map_field=None,
    bounds=None,
):
    """Computes bird's-eye view (BEV) maps for the point clouds in the given
    collection.

    If ``out_map_field`` is provided, the raw maps generated by
    :func:`compute_birds_eye_view_map` are written to disk as ``.npy`` files.

    If ``out_group_slice`` or ``out_image_field`` are provided, the BEV maps
    are written to disk as RGB images.

    Examples::

        import fiftyone as fo
        import fiftyone.utils.utils3d as fou3d
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-groups")

        #
        # Option 1: store bird's-eye view images in a new `bev` group slice
        #

        fou3d.compute_birds_eye_view_maps(
            dataset,
            (-1, 512),
            "/tmp/bev",
            out_group_slice="bev",
        )

        session = fo.launch_app(dataset)

        #
        # Option 2: store bird's-eye view images with size `size` in a new `bev_filepath`
        # field, with bounds `bounds`.
        #

        min_bound = (0, 0, 0)
        max_bound = (100, 200, 50)

        size = (400, 600)

        view = dataset.select_group_slices("pcd")
        fou3d.compute_birds_eye_view_maps(
            view,
            size,
            "/tmp/bev",
            bounds=(min_bound, max_bound)
            out_image_field="bev_filepath",
        )


        #
        # Option 3: store bird's-eye view images in a new `bev` group slice
        # and the bev feature map in a `feature_map_filepath` field on the 'bev' group
        # slice
        #

        fou3d.compute_birds_eye_view_maps(
            dataset,
            (-1, 512),
            "/tmp/bev",
            out_group_slice="bev",
            out_map_field="feature_map_filepath",
        )

        #
        # Option 4: generate the bird's-eye view images for a collection of point cloud
        # samples and store them in `bev_filepath`
        #


        ## Generate the point-cloud only dataset
        dataset = foz.load_zoo_dataset("quickstart-groups")
        dataset = dataset.select_group_slices("pcd").clone()

        fou3d.compute_birds_eye_view_maps(
            dataset,
            (-1, 512),
            "/tmp/bev",
            out_image_field="bev_filepath",
        )



    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        size: the desired ``(width, height)`` for the generated maps. Either
            dimension can be None or negative, in which case the appropriate
            aspect-preserving value is used
        output_dir: an output directory in which to store the images/maps
        rel_dir (None): an optional relative directory to strip from each input
            filepath to generate a unique identifier that is joined with
            ``output_dir`` to generate an output path for each image. This
            argument allows for populating nested subdirectories in
            ``output_dir`` that match the shape of the input paths
        in_group_slice (None): the name of the group slice containing the point
            cloud data. If ``samples`` is a grouped collection and this
            parameter is not provided, the first point cloud slice will be used
        out_group_slice (None): the name of a group slice to which to add
            samples containing the BEV images/maps
        out_image_field (None): the name of a field in which to store the paths
            to the BEV images. If ``in_group_slice`` is provided, this will
            always be set to ``filepath``
        out_map_field (None): an optional field in which to store the paths to
            the feature maps generated by :meth:`compute_birds_eye_view_map`.
            If this value is not provided, the maps are not written to disk
        bounds (None): an optional ``([xmin, ymin, zmin], [xmax, ymax, zmax])``
            tuple defining the field of view for which to generate each map.
            Either element of the tuple or any/all of its values can be None,
            in which case a tight crop of the point cloud along the missing
            dimension(s) are used
    """
    if in_group_slice is None and samples.media_type == fom.GROUP:
        in_group_slice = _get_point_cloud_slice(samples)

    if out_group_slice is not None:
        out_image_field = "filepath"

    if out_image_field is None and out_map_field is None:
        raise ValueError(
            "You must provide at least one of `out_group_slice`, "
            "`out_image_field`, or `out_map_field`"
        )

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
        bev_samples = []
    else:
        bev_image_paths = []
        bev_feature_paths = []

    with fou.ProgressBar(total=len(filepaths)) as pb:
        for filepath, group in pb(zip(filepaths, groups)):
            bev_image_path = filename_maker.get_output_path(
                filepath, output_ext=".png"
            )

            bev_map = compute_birds_eye_view_map(filepath, size, bounds=bounds)

            if out_image_field is not None:
                # pylint: disable=no-member
                bev_img = cv2.rotate(
                    (255.0 * bev_map).astype(np.uint8), cv2.ROTATE_180
                )
                etai.write(bev_img, bev_image_path)

            if out_map_field is not None:
                bev_feature_path = os.path.splitext(bev_image_path)[0] + ".npy"
                np.save(bev_feature_path, bev_map)

            if out_group_slice is not None:
                sample = fos.Sample(filepath=bev_image_path)
                sample[group_field] = group.element(out_group_slice)
                if out_map_field is not None:
                    sample[out_map_field] = bev_feature_path

                bev_samples.append(sample)
            else:
                if out_image_field is not None:
                    bev_image_paths.append(bev_image_path)

                if out_map_field is not None:
                    bev_feature_paths.append(bev_feature_path)

    if out_group_slice is not None:
        samples.add_samples(bev_samples)
    else:
        if out_image_field is not None:
            point_cloud_view.set_values(out_image_field, bev_image_paths)

        if out_map_field is not None:
            point_cloud_view.set_values(out_map_field, bev_feature_paths)


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
