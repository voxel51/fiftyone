"""
3D utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np
import scipy.spatial as sps

import eta.core.numutils as etan


# Reference: https://github.com/AlienCat-K/3D-IoU-Python/blob/master/3D-IoU-Python.py
def compute_cuboid_iou(gt, pred, gt_crowd=False):
    """Computes the IoU between the given ground truth and predicted cuboids.

    Args:
        gt: a :class:`fiftyone.core.labels.Detection`
        pred: a :class:`fiftyone.core.labels.Detection`
        gt_crowd (False): whether the ground truth cuboid is a crowd

    Returns:
        the IoU, in ``[0, 1]``
    """
    corners1 = _3d_corners(gt)
    corners2 = _3d_corners(pred)

    # points are in counter-clockwise order
    rect1 = [(corners1[i, 0], corners1[i, 2]) for i in range(3, -1, -1)]
    rect2 = [(corners2[i, 0], corners2[i, 2]) for i in range(3, -1, -1)]

    _, inter_area = _convex_hull_intersection(rect1, rect2)
    ymax = min(corners1[0, 1], corners2[0, 1])
    ymin = max(corners1[4, 1], corners2[4, 1])
    inter_vol = inter_area * max(0.0, ymax - ymin)

    # area1 = _polygon_area(np.array(rect1)[:, 0], np.array(rect1)[:, 1])
    # area2 = _polygon_area(np.array(rect2)[:, 0], np.array(rect2)[:, 1])
    # iou_2d = inter_area / (area1 + area2 - inter_area)

    gt_vol = _cuboid_volume(corners1)
    pred_vol = _cuboid_volume(corners2)

    if gt_crowd:
        union = pred_vol
    else:
        union = gt_vol + pred_vol - inter_vol

    return min(etan.safe_divide(inter_vol, union), 1)


def _3d_corners(detection):
    rotation = np.array(detection.rotation)
    location = np.array(detection.location)
    x, y, z = np.array(detection.dimensions)
    R = _rotation_matrix(rotation)

    corners = np.vstack(
        [
            [x / 2, x / 2, -x / 2, -x / 2, x / 2, x / 2, -x / 2, -x / 2],
            [z / 2, z / 2, z / 2, z / 2, -z / 2, -z / 2, -z / 2, -z / 2],
            [y / 2, -y / 2, -y / 2, y / 2, y / 2, -y / 2, -y / 2, y / 2],
        ]
    )

    return (R @ corners + location[:, np.newaxis]).T


def _rotation_matrix(rotation):
    tx, ty, tz = rotation
    Rx = np.array(
        [[1, 0, 0], [0, np.cos(tx), -np.sin(tx)], [0, np.sin(tx), np.cos(tx)]]
    )
    Ry = np.array(
        [[np.cos(ty), 0, np.sin(ty)], [0, 1, 0], [-np.sin(ty), 0, np.cos(ty)]]
    )
    Rz = np.array(
        [[np.cos(tz), -np.sin(tz), 0], [np.sin(tz), np.cos(tz), 0], [0, 0, 1]]
    )
    return Rx @ Ry @ Rz


# @todo: remove this?
def _3d_corners_jacob(detection):
    heading = detection.rotation[1]
    center = np.array(detection.location)
    dimensions = np.array(detection.dimensions)

    def roty(t):
        c = np.cos(t)
        s = np.sin(t)
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

    R = roty(heading)
    l, w, h = dimensions
    x_corners = [l / 2, l / 2, -l / 2, -l / 2, l / 2, l / 2, -l / 2, -l / 2]
    y_corners = [h / 2, h / 2, h / 2, h / 2, -h / 2, -h / 2, -h / 2, -h / 2]
    z_corners = [w / 2, -w / 2, -w / 2, w / 2, w / 2, -w / 2, -w / 2, w / 2]
    corners_3d = np.dot(R, np.vstack([x_corners, y_corners, z_corners]))
    corners_3d[0, :] = corners_3d[0, :] + center[0]
    corners_3d[1, :] = corners_3d[1, :] + center[1]
    corners_3d[2, :] = corners_3d[2, :] + center[2]
    return np.transpose(corners_3d)


# Reference: https://rosettacode.org/wiki/Sutherland-Hodgman_polygon_clipping#Python
def _clip_polygon(subject_polygon, clip_polygon):
    """Clips a polygon with another polygon.

    All points must be in counter-clockwise order.

    Args:
        subject_polygon: a list of ``(x, y)`` points defining a polygon
        clip_polygon: a list of ``(x, y)`` points defining a **convex** polygon

    Returns:
        a list of ``(x, y)`` points defining the intersection polygon
    """
    out_polygon = subject_polygon
    cp1 = clip_polygon[-1]

    for clip_vertex in clip_polygon:
        cp2 = clip_vertex
        vertices = out_polygon
        out_polygon = []
        s = vertices[-1]

        for subject_vertex in vertices:
            e = subject_vertex
            if _is_inside(e, cp1, cp2):
                if not _is_inside(s, cp1, cp2):
                    out_polygon.append(_compute_intersection(cp1, cp2, s, e))

                out_polygon.append(e)
            elif _is_inside(s, cp1, cp2):
                out_polygon.append(_compute_intersection(cp1, cp2, s, e))

            s = e

        if not out_polygon:
            return None

        cp1 = cp2

    return out_polygon


def _is_inside(p, cp1, cp2):
    x = (cp2[0] - cp1[0]) * (p[1] - cp1[1])
    y = (cp2[1] - cp1[1]) * (p[0] - cp1[0])
    return x > y


def _compute_intersection(cp1, cp2, s, e):
    dc = [cp1[0] - cp2[0], cp1[1] - cp2[1]]
    dp = [s[0] - e[0], s[1] - e[1]]
    n1 = cp1[0] * cp2[1] - cp1[1] * cp2[0]
    n2 = s[0] * e[1] - s[1] * e[0]
    n3 = 1.0 / (dc[0] * dp[1] - dc[1] * dp[0])
    return [(n1 * dp[0] - n2 * dc[0]) * n3, (n1 * dp[1] - n2 * dc[1]) * n3]


# Reference: http://stackoverflow.com/questions/24467972/calculate-area-of-polygon-given-x-y-coordinates
def _polygon_area(x, y):
    """Computes the area of a polygon.

    Returns:
        the area
    """
    return 0.5 * np.abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))


def _convex_hull_intersection(p1, p2):
    """Computes the area of two convex hull's intersection.

    Args:
        p1: a list of ``(x, y)`` hull vertices
        p2: a list of ``(x, y)`` hull vertices

    Returns:
        a tuple of
        -   a list of ``(x, y)`` intersection vertices, or None
        -   the volume of the intersection, or 0.0
    """
    inter_p = _clip_polygon(p1, p2)
    if inter_p is None:
        return None, 0.0

    hull_inter = sps.ConvexHull(inter_p)  # pylint: disable=no-member
    return inter_p, hull_inter.volume


def _cuboid_volume(corners):
    a = np.sqrt(np.sum((corners[0, :] - corners[1, :]) ** 2))
    b = np.sqrt(np.sum((corners[1, :] - corners[2, :]) ** 2))
    c = np.sqrt(np.sum((corners[0, :] - corners[4, :]) ** 2))
    return a * b * c


def _is_clockwise(p):
    x = p[:, 0]
    y = p[:, 1]
    return np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)) > 0
