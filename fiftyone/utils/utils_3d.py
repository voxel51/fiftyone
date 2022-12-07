import numpy as np
import cv2
import open3d as o3d
import numbers
import logging

import fiftyone.core.sample as fosa
import fiftyone.core.utils as fou

fod = fou.lazy_import("fiftyone.core.dataset")
fos = fou.lazy_import("fiftyone.core.stages")
fov = fou.lazy_import("fiftyone.core.view")
foua = fou.lazy_import("fiftyone.utils.annotations")
foud = fou.lazy_import("fiftyone.utils.data")
foue = fou.lazy_import("fiftyone.utils.eval")

logger = logging.getLogger(__name__)


def generate_bev_map_from_pcd_file(
    pcd_filepath,
    bev_width,
    bev_height,
    min_bound,
    max_bound,
):
    """procedure for turning point cloud into a bird's eye view 2D RGB map
    of intensity, height, and density"""

    point_cloud = o3d.io.read_point_cloud(pcd_filepath)

    ### Cropping
    if min_bound is None:
        min_bound = np.amin(np.array(point_cloud.points), axis=0)
    if max_bound is None:
        max_bound = np.amax(np.array(point_cloud.points), axis=0)

    bbox = o3d.geometry.AxisAlignedBoundingBox(
        min_bound=min_bound, max_bound=max_bound
    )
    point_cloud = point_cloud.crop(bbox).translate((0, 0, -1 * min_bound[2]))

    discretization = (max_bound[0] - min_bound[0]) / bev_height
    max_height = float(np.abs(max_bound[2] - min_bound[2]))

    # Extract points from o3d point cloud
    points = np.vstack(
        (np.copy(point_cloud.points).T, np.array(point_cloud.colors)[:, 0])
    ).T

    # Discretize Feature Map
    points[:, 0] = np.int_(np.floor(points[:, 0] / discretization))
    points[:, 1] = np.int_(
        np.floor(points[:, 1] / discretization) + (bev_width + 1) / 2
    )

    # sort
    indices = np.lexsort((-points[:, 2], points[:, 1], points[:, 0]))
    points = points[indices]

    # Height Map
    height_map = np.zeros((bev_height + 1, bev_width + 1))
    _, indices = np.unique(points[:, 0:2], axis=0, return_index=True)
    points_frac = points[indices]

    height_map[np.int_(points_frac[:, 0]), np.int_(points_frac[:, 1])] = (
        points_frac[:, 2] / max_height
    )

    # Intensity Map & Density Map
    intensity_map = np.zeros((bev_height + 1, bev_width + 1))
    density_map = np.zeros((bev_height + 1, bev_width + 1))

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
    rgb_map = np.zeros((3, bev_height, bev_width))
    rgb_map[2, :, :] = density_map[:bev_height, :bev_width]  # r_map
    rgb_map[1, :, :] = height_map[:bev_height, :bev_width]  # g_map
    rgb_map[0, :, :] = intensity_map[:bev_height, :bev_width]  # b_map
    return np.einsum(
        "ijk -> jki", rgb_map
    )  ## reshape and rescale pixel values


def compute_birds_eye_view_maps(
    samples,
    bev_width,
    bev_height,
    group_field="group",
    in_group_slice="pcd",
    out_group_slice="bev",
    bev_filepath=None,
    min_bound=None,
    max_bound=None,
):
    """Computes bird's eye view (BEV) RGB maps for point clouds in `.pcd` format
    in the group slice `in_group_slice`.

    The `Dataset` must be a grouped dataset, and at least one of the group
    slices must be a point cloud.

    Args:
        samples: collection of samples on which to compute and store the
            bird's eye view map.
        bev_width: Numeric value specifying the number of width in pixels
            along the x direction of the resulting BEV image. If input is
            not an integer, it is rounded down to the nearest whole number.
        bev_height: Numeric value specifying the number of height in pixels
            along the y direction of the resulting BEV image. If input is
            not an integer, it is rounded down to the nearest whole number.
        group_field: the name of the group field for the `Dataset`.
        in_group_slice: the name of the group slice to use to compute
            BEV RGB maps.
        out_group_slice: the name of the new group slice which will be
            added to each group in the group dataset corresponding to the
            BEV image.
        bev_filepath (None): the directory in which to store the BEV images.
            If none is provided, one is automatically generated.
        min_bound (None): a tuple (x_{min}, y_{min}, z_{min}) used to crop the
            point cloud before the BEV image is generated. If none is
            given, then the BEV map is not cropped from below.
        max_bound (None): a tuple (x_{max}, y_{max}, z_{max}) used to crop the
            point cloud before the BEV image is generated. If none is
            given, then the BEV map is not cropped from above.


    Returns: ``None``
    """

    if type(samples) == fosa.Sample:
        samples = [samples]

    if min_bound is not None:
        try:
            assert len(min_bound) == 3 and all(
                isinstance(x, numbers.Number) for x in min_bound
            )
        except:
            raise ValueError(
                "`min_bound` must be a list or tuple of three numeric values"
            )
    if max_bound is not None:
        try:
            assert len(max_bound) == 3 and all(
                isinstance(x, numbers.Number) for x in max_bound
            )
        except:
            raise ValueError(
                "`max_bound` must be a list or tuple of three numeric values"
            )

    if min_bound is not None and max_bound is not None:
        try:
            x_cond = min_bound[0] < max_bound[0]
            y_cond = min_bound[1] < max_bound[1]
            z_cond = min_bound[2] < max_bound[2]
            assert x_cond and y_cond and z_cond
        except:
            raise ValueError(
                "Lower bounds `min_bound` must be strictly less than upper bounds `max_bound`"
            )

    def make_map(uuid):
        if bev_filepath is None:
            opath = "/".join(uuid.split("/")[:-2] + ["bev"])
        opath = opath + "/" + ".".join(uuid.split("/")[-1].split(".")[:-1])
        return opath

    logger.info("Parsing samples...")
    with fou.ProgressBar() as pb:

        for sample in pb(samples):
            try:
                assert sample.media_type == "point-cloud"
            except:
                raise ValueError("Sample must be a point cloud")

            dataset = sample._dataset

            try:
                assert dataset.media_type == "group"
            except:
                raise ValueError("Dataset must be a grouped Dataset")
            try:
                assert in_group_slice in dataset.group_slices
            except:
                raise ValueError("`in_group_slice` must be in group slices")

            uuid = sample["filepath"]
            opath = make_map(uuid)
            bev_im_path, bev_feature_path = opath + ".png", opath + ".npy"
            group = dataset[uuid].group

            rgb_map = generate_bev_map_from_pcd_file(
                uuid, bev_width, bev_height, min_bound, max_bound
            )

            # pylint: disable=no-member
            rgb_image = cv2.rotate(
                (255 * rgb_map).astype(np.uint8), cv2.ROTATE_180
            )
            cv2.imwrite(bev_im_path, rgb_image)
            np.save(bev_feature_path, rgb_map)
            bev_sample = fosa.Sample(filepath=bev_im_path)
            bev_sample[group_field] = group.element(out_group_slice)
            bev_sample["feature_map_filepath"] = bev_feature_path
            dataset.add_sample(bev_sample)
            dataset.save()
