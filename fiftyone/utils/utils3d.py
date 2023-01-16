"""
3D utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import warnings

import numpy as np
import scipy.spatial as sp

import eta.core.numutils as etan

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
