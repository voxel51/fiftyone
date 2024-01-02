"""
3D utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import logging
import warnings

import numpy as np
import scipy.spatial as sp

import eta.core.numutils as etan

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
from fiftyone.core.sample import Sample
import fiftyone.core.utils as fou
import fiftyone.core.validation as fov
from fiftyone.core.odm import DynamicEmbeddedDocument
import fiftyone.utils.image as foui

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

_EDGES = (
    [1, 5],
    [2, 6],
    [3, 7],
    [4, 8],  # lines along x-axis
    [1, 3],
    [5, 7],
    [2, 4],
    [6, 8],  # lines along y-axis
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],  # lines along z-axis
)

# The vertices are ordered according to the left-hand rule, so the normal
# vector of each face will point inward the box.
_FACES = np.array(
    [
        [5, 6, 8, 7],  # +x on yz plane
        [1, 3, 4, 2],  # -x on yz plane
        [3, 7, 8, 4],  # +y on xz plane = top
        [1, 2, 6, 5],  # -y on xz plane
        [2, 4, 8, 6],  # +z on xy plane = front
        [1, 5, 7, 3],  # -z on xy plane
    ]
)

_UNIT_BOX = np.asarray(
    [
        [0.0, 0.0, 0.0],
        [-0.5, -0.5, -0.5],
        [-0.5, -0.5, 0.5],
        [-0.5, 0.5, -0.5],
        [-0.5, 0.5, 0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [0.5, 0.5, -0.5],
        [0.5, 0.5, 0.5],
    ]
)

_NUM_KEYPOINTS = 9
_FRONT_FACE_ID = 4
_TOP_FACE_ID = 2

_PLANE_THICKNESS_EPSILON = 0.000001
_POINT_IN_FRONT_OF_PLANE = 1
_POINT_ON_PLANE = 0
_POINT_BEHIND_PLANE = -1


# References
# https://github.com/google-research-datasets/Objectron/blob/master/objectron/dataset/box.py
# https://github.com/google-research-datasets/Objectron/blob/master/objectron/dataset/iou.py
def compute_cuboid_iou(gt, pred, gt_crowd=False):
    """Computes the IoU between the given ground truth and predicted cuboids.

    Args:
        gt: a :class:`fiftyone.core.labels.Detection`
        pred: a :class:`fiftyone.core.labels.Detection`
        gt_crowd (False): whether the ground truth cuboid is a crowd

    Returns:
        the IoU, in ``[0, 1]``
    """
    gt_box = _Box(gt.rotation, gt.location, gt.dimensions)
    pred_box = _Box(pred.rotation, pred.location, pred.dimensions)

    intersection_points = _compute_intersection_points(
        gt_box, pred_box
    ) + _compute_intersection_points(pred_box, gt_box)

    if not intersection_points:
        return 0.0

    try:
        # pylint: disable=no-member
        inter = sp.ConvexHull(intersection_points).volume
    except Exception as e:
        msg = str(e)
        warnings.warn(msg)
        return 0.0

    if gt_crowd:
        union = pred_box.volume
    else:
        union = gt_box.volume + pred_box.volume - inter

    return min(etan.safe_divide(inter, union), 1)


class _Box(object):
    def __init__(self, rotation, location, scale):
        rotation = np.array(rotation)
        location = np.array(location)
        scale = np.array(scale)

        if rotation.size == 3:
            self.rotation = sp.transform.Rotation.from_rotvec(
                rotation.tolist()
            ).as_matrix()
        else:
            self.rotation = rotation

        self.translation = location
        self.scale = scale
        self.volume = np.prod(scale)

        self.transformation = np.identity(4)
        self.transformation[:3, :3] = self.rotation
        self.transformation[:3, 3] = self.translation

        scaled_identity_box = self._scaled_axis_aligned_vertices(scale)
        vertices = np.zeros((_NUM_KEYPOINTS, 3))
        for i in range(_NUM_KEYPOINTS):
            vertices[i, :] = (
                np.matmul(rotation, scaled_identity_box[i, :])
                + location.flatten()
            )

        self.vertices = vertices

    def _inside(self, point):
        inv_trans = np.linalg.inv(self.transformation)
        scale = self.scale
        point_w = np.matmul(inv_trans[:3, :3], point) + inv_trans[:3, 3]
        for i in range(3):
            if abs(point_w[i]) > scale[i] / 2.0:
                return False

        return True

    def _apply_transformation(self, transformation):
        new_rotation = np.matmul(transformation[:3, :3], self.rotation)
        new_translation = transformation[:3, 3] + (
            np.matmul(transformation[:3, :3], self.translation)
        )
        return _Box(new_rotation, new_translation, self.scale)

    def _scaled_axis_aligned_vertices(self, scale):
        """Returns axis-aligned verticies for a box of the given scale."""
        x = scale[0] / 2.0
        y = scale[1] / 2.0
        z = scale[2] / 2.0
        return np.array(
            [
                [0.0, 0.0, 0.0],
                [-x, -y, -z],
                [-x, -y, +z],
                [-x, +y, -z],
                [-x, +y, +z],
                [+x, -y, -z],
                [+x, -y, +z],
                [+x, +y, -z],
                [+x, +y, +z],
            ]
        )

    def _get_ground_plane(self, gravity_axis=1):
        """Gets the ground plane under the box."""
        gravity = np.zeros(3)
        gravity[gravity_axis] = 1

        def _get_face_normal(face, center):
            v1 = self.vertices[face[0], :] - center
            v2 = self.vertices[face[1], :] - center
            normal = np.cross(v1, v2)
            return normal

        def _get_face_center(face):
            center = np.zeros(3)
            for vertex in face:
                center += self.vertices[vertex, :]
            center /= len(face)
            return center

        ground_plane_id = 0
        ground_plane_error = 10.0

        # The ground plane is defined as a plane aligned with gravity.
        # gravity is the (0, 1, 0) vector in the world coordinate system.
        for i in [0, 2, 4]:
            face = _FACES[i, :]
            center = _get_face_center(face)
            normal = _get_face_normal(face, center)
            w = np.cross(gravity, normal)
            w_sq_norm = np.linalg.norm(w)
            if w_sq_norm < ground_plane_error:
                ground_plane_error = w_sq_norm
                ground_plane_id = i

        face = _FACES[ground_plane_id, :]
        center = _get_face_center(face)
        normal = _get_face_normal(face, center)

        # For each face, we also have a parallel face that it's normal is also
        # aligned with gravity vector. We pick the face with lower height
        # (y-value). The parallel to face 0 is 1, face 2 is 3, and face 4 is 5.
        parallel_face_id = ground_plane_id + 1
        parallel_face = _FACES[parallel_face_id]
        parallel_face_center = _get_face_center(parallel_face)
        parallel_face_normal = _get_face_normal(
            parallel_face, parallel_face_center
        )
        if parallel_face_center[gravity_axis] < center[gravity_axis]:
            center = parallel_face_center
            normal = parallel_face_normal
        return center, normal


def _inside(plane, point, axis):
    """Checks whether a given point is on a 2D plane."""
    x, y = axis
    u = plane[0] - point
    v = plane[1] - point

    a = u[x] * v[y]
    b = u[y] * v[x]
    return a >= b


def _classify_point_to_plane(point, plane, normal, axis):
    """Classify position of a point w.r.t the given plane.

    See Real-Time Collision Detection, by Christer Ericson, page 364.

    Args:
        point: 3x1 vector indicating the point
        plane: 3x1 vector indicating a point on the plane
        normal: scalar (+1, or -1) indicating the normal to the vector
        axis: scalar (0, 1, or 2) indicating the xyz axis

    Returns:
        which side of the plane the point is located
    """
    signed_distance = normal * (point[axis] - plane[axis])
    if signed_distance > _PLANE_THICKNESS_EPSILON:
        return _POINT_IN_FRONT_OF_PLANE

    if signed_distance < -_PLANE_THICKNESS_EPSILON:
        return _POINT_BEHIND_PLANE

    return _POINT_ON_PLANE


def _clip_poly(poly, plane, normal, axis):
    """Clips the polygon with the plane using the Sutherland-Hodgman algorithm.

    See https://en.wikipedia.org/wiki/Sutherland%E2%80%93Hodgman_algorithm for
    an overview of the Sutherland-Hodgman algorithm. Here we adopted a robust
    implementation from "Real-Time Collision Detection", by Christer Ericson,
    page 370.

    Args:
        poly: list of 3D vertices defining the polygon
        plane: the 3D vertices of the (2D) axis-aligned plane
        normal: normal
        axis: a tuple defining a 2D axis

    Returns:
        the list of 3D vertices of the clipped polygon
    """
    result = []

    if len(poly) <= 1:
        return result

    # polygon is fully located on clipping plane
    poly_in_plane = True

    # Test all the edges in the polygon against the clipping plane.
    for i, current_poly_point in enumerate(poly):
        prev_poly_point = poly[(i + len(poly) - 1) % len(poly)]
        d1 = _classify_point_to_plane(prev_poly_point, plane, normal, axis)
        d2 = _classify_point_to_plane(current_poly_point, plane, normal, axis)
        if d2 == _POINT_BEHIND_PLANE:
            poly_in_plane = False
            if d1 == _POINT_IN_FRONT_OF_PLANE:
                intersection = _intersect(
                    plane, prev_poly_point, current_poly_point, axis
                )
                result.append(intersection)
            elif d1 == _POINT_ON_PLANE:
                if not result or (
                    not np.array_equal(result[-1], prev_poly_point)
                ):
                    result.append(prev_poly_point)
        elif d2 == _POINT_IN_FRONT_OF_PLANE:
            poly_in_plane = False
            if d1 == _POINT_BEHIND_PLANE:
                intersection = _intersect(
                    plane, prev_poly_point, current_poly_point, axis
                )
                result.append(intersection)
            elif d1 == _POINT_ON_PLANE:
                if not result or (
                    not np.array_equal(result[-1], prev_poly_point)
                ):
                    result.append(prev_poly_point)

            result.append(current_poly_point)
        else:
            if d1 != _POINT_ON_PLANE:
                result.append(current_poly_point)

    if poly_in_plane:
        return poly

    return result


def _intersect_box_poly(box, poly):
    """Clips the polygon against the faces of the axis-aligned box."""
    for axis in range(3):
        poly = _clip_poly(poly, box.vertices[1, :], 1.0, axis)
        poly = _clip_poly(poly, box.vertices[8, :], -1.0, axis)

    return poly


def _intersect(plane, prev_point, current_point, axis):
    """Computes the intersection of a line with an axis-aligned plane.

    Args:
        plane: formulated as two 3D points on the plane
        prev_point: the point on the edge of the line
        current_point: the other end of the line
        axis: a tuple defining a 2D axis

    Returns:
        A 3D point intersection of the poly edge with the plane
    """
    alpha = (current_point[axis] - plane[axis]) / (
        current_point[axis] - prev_point[axis]
    )

    # Compute the intersecting points using linear interpolation
    return alpha * prev_point + (1.0 - alpha) * current_point


def _compute_intersection_points(box1, box2):
    """Computes the intersection of two boxes."""
    intersection_points = []

    # Transform box1 to be axis-aligned
    inv_transform = np.linalg.inv(box1.transformation)
    box1_axis_aligned = box1._apply_transformation(inv_transform)
    box2_in_box1_coord = box2._apply_transformation(inv_transform)
    for face in range(len(_FACES)):
        indices = _FACES[face, :]
        poly = [box2_in_box1_coord.vertices[indices[i], :] for i in range(4)]
        clip = _intersect_box_poly(box1_axis_aligned, poly)
        for point in clip:
            # Transform the intersection point back to the world coordinate
            point_w = np.matmul(box1.rotation, point) + box1.translation
            intersection_points.append(point_w)

    for point_id in range(_NUM_KEYPOINTS):
        v = box2_in_box1_coord.vertices[point_id, :]
        if box1_axis_aligned._inside(v):
            point_w = np.matmul(box1.rotation, v) + box1.translation
            intersection_points.append(point_w)

    return intersection_points


class OrthographicProjectionMetadata(DynamicEmbeddedDocument, fol._HasMedia):
    """Class for storing metadata about orthographic projections.

    Args:
        filepath (None): the path to the orthographic projection on disk
        min_bound (None): the ``[xmin, ymin]`` of the image in the projection
            plane
        max_bound (None): the ``[xmax, ymax]`` of the image in the projection
            plane
        width: the width of the image, in pixels
        height: the height of the image, in pixels
    """

    _MEDIA_FIELD = "filepath"

    filepath = fof.StringField()
    min_bound = fof.ListField(fof.FloatField())
    max_bound = fof.ListField(fof.FloatField())
    width = fof.IntField()
    height = fof.IntField()


def compute_orthographic_projection_images(
    samples,
    size,
    output_dir,
    rel_dir=None,
    in_group_slice=None,
    out_group_slice=None,
    metadata_field="orthographic_projection_metadata",
    shading_mode=None,
    colormap=None,
    subsampling_rate=None,
    projection_normal=None,
    bounds=None,
    progress=None,
):
    """Computes orthographic projection images for the point clouds in the
    given collection.

    This operation will populate :class:`OrthographicProjectionMetadata`
    instances for each projection in the ``metadata_field`` of each sample.

    Examples::

        import fiftyone as fo
        import fiftyone.utils.utils3d as fou3d
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-groups")
        view = dataset.select_group_slices("pcd")

        fou3d.compute_orthographic_projection_images(view, (-1, 512), "/tmp/proj")

        session = fo.launch_app(view)

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
            cloud data. Only applicable if ``samples`` is a grouped collection.
            If ``samples`` is a grouped collection and this parameter is not
            provided, the first point cloud slice will be used
        out_group_slice (None): the name of a group slice to which to add new
            samples containing the feature images/maps. Only applicable if
            ``samples`` is a grouped collection
        metadata_field ("orthographic_projection_metadata"): the name of the
            field in which to store :class:`OrthographicProjectionMetadata`
            instances for each projection
        shading_mode (None): an optional shading algorithm for the points.
            Supported values are ``("intensity", "rgb", or "height")``. The
            ``"intensity"`` and ``"rgb"`` options are only valid if the PCD's
            header contains the ``"rgb"`` flag. By default, all points are
            shaded white
        colormap (None): an optional colormap to use when shading gradients,
            formatted as either:

            -   a dict mapping values in ``[0, 1]`` to ``(R, G, B)`` tuples in
                ``[0, 255]``
            -   a list of of ``(R, G, B)`` tuples in ``[0, 255]`` that cover
                ``[0, 1]`` linearly spaced
        subsampling_rate (None): an optional unsigned int that, if provided,
            defines a uniform subsampling rate. The selected point indices are
            [0, k, 2k, ...], where ``k = subsampling_rate``
        projection_normal (None): the normal vector of the plane onto which to
            perform the projection. By default, ``(0, 0, 1)`` is used
        bounds (None): an optional ``((xmin, ymin, zmin), (xmax, ymax, zmax))``
            tuple defining the field of view in the projected plane for which
            to generate each map. Either element of the tuple or any/all of its
            values can be None, in which case a tight crop of the point cloud
            along the missing dimension(s) are used
        progress (None): whether to render a progress bar (True/False), use the
            default value ``fiftyone.config.show_progress_bars`` (None), or a
            progress callback function to invoke instead
    """
    if in_group_slice is None and samples.media_type == fom.GROUP:
        in_group_slice = _get_point_cloud_slice(samples)

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

    all_metadata = []

    with fou.ProgressBar(total=len(filepaths), progress=progress) as pb:
        for filepath, group in pb(zip(filepaths, groups)):
            image_path = filename_maker.get_output_path(
                filepath, output_ext=".png"
            )

            img, metadata = compute_orthographic_projection_image(
                filepath,
                size,
                shading_mode=shading_mode,
                colormap=colormap,
                subsampling_rate=subsampling_rate,
                projection_normal=projection_normal,
                bounds=bounds,
            )

            foui.write(img, image_path)
            metadata.filepath = image_path

            if out_group_slice is not None:
                sample = Sample(filepath=image_path)
                sample[group_field] = group.element(out_group_slice)
                sample[metadata_field] = metadata
                out_samples.append(sample)

            all_metadata.append(metadata)

    if out_group_slice is not None:
        samples.add_samples(out_samples)

    point_cloud_view.set_values(metadata_field, all_metadata)


def compute_orthographic_projection_image(
    filepath,
    size,
    shading_mode=None,
    colormap=None,
    subsampling_rate=None,
    projection_normal=None,
    bounds=None,
):
    """Generates an orthographic projection image for the given PCD file onto
    the specified plane (default xy plane).

    The returned image is a three-channel array encoding the intensity, height,
    and density of the point cloud.

    Args:
        filepath: the path to the ``.pcd`` file
        size: the desired ``(width, height)`` for the generated maps. Either
            dimension can be None or negative, in which case the appropriate
            aspect-preserving value is used
        shading_mode (None): an optional shading algorithm for the points.
            Supported values are ``("intensity", "rgb", or "height")``. The
            ``"intensity"`` and ``"rgb"`` options are only valid if the PCD's
            header contains the ``"rgb"`` flag. By default, all points are
            shaded white
        colormap (None): an optional colormap to use when shading gradients,
            formatted as either:

            -   a dict mapping values in ``[0, 1]`` to ``(R, G, B)`` tuples in
                ``[0, 255]``
            -   a list of of ``(R, G, B)`` tuples in ``[0, 255]`` that cover
                ``[0, 1]`` linearly spaced
        subsampling_rate (None): an unsigned ``int`` that, if defined,
            defines a uniform subsampling rate. The selected point indices are
            [0, k, 2k, ...], where ``k = subsampling_rate``
        projection_normal (None): the normal vector of the plane onto which to
            perform the projection. By default, ``(0, 0, 1)`` is used
        bounds (None): an optional ``((xmin, ymin, zmin), (xmax, ymax, zmax))``
            tuple defining the field of view for which to generate each map in
            the projected plane. Either element of the tuple or any/all of its
            values can be None, in which case a tight crop of the point cloud
            along the missing dimension(s) are used

    Returns:
        a tuple of

        -   the orthographic projection image
        -   an :class:`OrthographicProjectionMetadata` instance
    """
    if colormap is None:
        colormap = DEFAULT_SHADING_GRADIENT_MAP

    if not isinstance(colormap, dict):
        colormap = dict(zip(np.linspace(0, 1, len(colormap)), colormap))

    points, colors, metadata = _parse_point_cloud(
        filepath,
        size=size,
        bounds=bounds,
        projection_normal=projection_normal,
        subsampling_rate=subsampling_rate,
    )

    min_bound = metadata.min_bound
    max_bound = metadata.max_bound
    width = metadata.width
    height = metadata.height

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
                intensities_normalized_t, list(colormap.keys())
            )
            rgbs = np.array([colormap[v] for v in rgb_refs])
            image[np.int_(points[:, 0]), np.int_(points[:, 1]), :] = rgbs
    elif shading_mode == "height":
        # color by height (z)
        max_z = np.max(points[:, 2])
        min_z = np.min(points[:, 2])
        z_normalized = (points[:, 2] - min_z) / (max_z - min_z)

        # map z value to color
        rgb_refs = _clamp_to_discrete(z_normalized, list(colormap.keys()))
        rgbs = np.array([colormap[v] for v in rgb_refs])
        image[np.int_(points[:, 0]), np.int_(points[:, 1]), :] = rgbs
    else:
        image[np.int_(points[:, 0]), np.int_(points[:, 1]), :] = 255.0

    # change axis orientation such that y is up
    image = np.rot90(image, k=1, axes=(0, 1))

    return image, metadata


def _parse_point_cloud(
    filepath,
    size=None,
    bounds=None,
    projection_normal=None,
    subsampling_rate=None,
):
    pc = o3d.io.read_point_cloud(filepath)

    if projection_normal is not None and not np.array_equal(
        projection_normal, np.array([0, 0, 1])
    ):
        # rotate points so that they are perpendicular to the projection plane
        # as opposed to the default XY plane
        R = _rotation_matrix_from_vectors(projection_normal, [0, 0, 1])
        pc = pc.rotate(R, center=[0, 0, 0])

    if bounds is None:
        min_bound, max_bound = None, None
    else:
        min_bound, max_bound = bounds

    if _contains_none(min_bound):
        _min_bound = np.nanmin(np.asarray(pc.points), axis=0)
        min_bound = _fill_none(min_bound, _min_bound)

    if _contains_none(max_bound):
        _max_bound = np.nanmax(np.asarray(pc.points), axis=0)
        max_bound = _fill_none(max_bound, _max_bound)

    bbox = o3d.geometry.AxisAlignedBoundingBox(
        min_bound=min_bound, max_bound=max_bound
    )

    # crop bounds and translate so that min bound is at the origin
    pc = pc.crop(bbox).translate((-min_bound[0], -min_bound[1], -min_bound[2]))

    if subsampling_rate is not None and subsampling_rate > 0:
        pc = pc.uniform_down_sample(subsampling_rate)

    points = np.asarray(pc.points)
    colors = np.asarray(pc.colors)

    if size is not None:
        width, height = _parse_size(size, (min_bound, max_bound))
    else:
        width, height = None, None

    metadata = OrthographicProjectionMetadata(
        min_bound=min_bound,
        max_bound=max_bound,
        width=width,
        height=height,
    )

    return points, colors, metadata


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


def _clamp_to_discrete(arr, discrete):
    """Discretize by mapping each continuous value in ``arr`` to the closest
    value in ``discrete``.
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
        raise ValueError("Both width and height cannot be undefined")

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
