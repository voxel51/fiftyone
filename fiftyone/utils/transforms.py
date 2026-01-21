"""
Pure mathematical 3D transformation utilities.

This module provides stateless functions for 3D transformations including:

- Quaternion operations (conversion, multiplication, inversion)
- Transform matrix construction and decomposition
- Coordinate system conversions (OpenCV, OpenGL, ROS, etc.)
- Point transformation utilities

All functions use numpy arrays and follow consistent conventions:
- Quaternions use [qx, qy, qz, qw] (scalar-last) format
- Rotation matrices are 3x3 numpy arrays
- Transform matrices are 4x4 homogeneous matrices
- Points are Nx3 numpy arrays

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import numpy as np
from scipy.spatial.transform import Rotation


# =============================================================================
# Coordinate System Constants
# =============================================================================

# Camera conventions
# OpenCV: Right-Down-Forward (RDF) - X right, Y down, Z forward
# OpenGL: Right-Up-Back (RUB) - X right, Y up, Z backward

AXIS_FLIP_OPENCV_TO_OPENGL = np.array(
    [[1, 0, 0], [0, -1, 0], [0, 0, -1]], dtype=np.float64
)
"""3x3 matrix to convert from OpenCV (RDF) to OpenGL (RUB) camera convention."""

AXIS_FLIP_OPENGL_TO_OPENCV = AXIS_FLIP_OPENCV_TO_OPENGL  # Self-inverse
"""3x3 matrix to convert from OpenGL (RUB) to OpenCV (RDF) camera convention."""

# Supported coordinate conventions
_COORDINATE_CONVENTIONS = {
    # Camera conventions
    "opencv": "rdf",  # Right-Down-Forward
    "opengl": "rub",  # Right-Up-Back
    "rdf": "rdf",
    "rub": "rub",
    # Robotics conventions
    "ros": "flu",  # Forward-Left-Up (ROS standard)
    "flu": "flu",  # Forward-Left-Up
    "fru": "fru",  # Forward-Right-Up
    # Aviation/Geographic conventions
    "ned": "ned",  # North-East-Down
    "enu": "enu",  # East-North-Up
}

# Axis direction mappings: convention -> (forward, right, up) in terms of +X, +Y, +Z
# Each entry is (axis_for_forward, axis_for_right, axis_for_up) where axis is 0=X, 1=Y, 2=Z
# and sign indicates direction
# Axis direction mappings: where each convention's X, Y, Z axes point in canonical RDF frame
# Canonical RDF: X=Right, Y=Down, Z=Forward
_CONVENTION_AXES = {
    "rdf": {
        "x": (1, 0, 0),
        "y": (0, 1, 0),
        "z": (0, 0, 1),
    },  # identity (Right-Down-Forward)
    "rub": {
        "x": (1, 0, 0),
        "y": (0, -1, 0),
        "z": (0, 0, -1),
    },  # Right-Up-Back (OpenGL)
    "flu": {
        "x": (0, 0, 1),
        "y": (-1, 0, 0),
        "z": (0, -1, 0),
    },  # Forward-Left-Up (ROS)
    "fru": {
        "x": (0, 0, 1),
        "y": (1, 0, 0),
        "z": (0, -1, 0),
    },  # Forward-Right-Up
    "ned": {
        "x": (0, 0, 1),
        "y": (1, 0, 0),
        "z": (0, 1, 0),
    },  # North-East-Down (aviation)
    "enu": {
        "x": (1, 0, 0),
        "y": (0, 0, 1),
        "z": (0, -1, 0),
    },  # East-North-Up (geographic)
}


# =============================================================================
# Quaternion Utilities
# =============================================================================


def quaternion_to_rotation_matrix(q):
    """Convert a quaternion to a 3x3 rotation matrix.

    Args:
        q: quaternion as [qx, qy, qz, qw] (scalar-last convention)

    Returns:
        a (3, 3) numpy array representing the rotation matrix
    """
    q = np.asarray(q, dtype=np.float64)
    return Rotation.from_quat(q).as_matrix()


def rotation_matrix_to_quaternion(R):
    """Convert a 3x3 rotation matrix to a quaternion.

    Args:
        R: a (3, 3) rotation matrix

    Returns:
        quaternion as [qx, qy, qz, qw] (scalar-last convention)
    """
    R = np.asarray(R, dtype=np.float64)
    return Rotation.from_matrix(R).as_quat()


def quaternion_multiply(q1, q2):
    """Multiply two quaternions using Hamilton product.

    The result represents the composition of rotations: first q1, then q2.

    Args:
        q1: first quaternion as [qx, qy, qz, qw]
        q2: second quaternion as [qx, qy, qz, qw]

    Returns:
        product quaternion as [qx, qy, qz, qw]
    """
    q1 = np.asarray(q1, dtype=np.float64)
    q2 = np.asarray(q2, dtype=np.float64)

    r1 = Rotation.from_quat(q1)
    r2 = Rotation.from_quat(q2)

    # scipy composes as r2 * r1 when using *, so r2 is applied after r1
    combined = r2 * r1
    return combined.as_quat()


def quaternion_inverse(q):
    """Compute the inverse of a unit quaternion.

    For unit quaternions, the inverse equals the conjugate:
    q^(-1) = [-qx, -qy, -qz, qw]

    Args:
        q: unit quaternion as [qx, qy, qz, qw]

    Returns:
        inverse quaternion as [qx, qy, qz, qw]
    """
    q = np.asarray(q, dtype=np.float64)
    return Rotation.from_quat(q).inv().as_quat()


def quaternion_from_euler(angles, seq="xyz"):
    """Convert Euler angles to quaternion.

    Args:
        angles: Euler angles in radians as [angle1, angle2, angle3]
        seq: rotation sequence, e.g., "xyz", "zyx", "ZYX" (default "xyz").
            Lowercase letters represent rotations about axes of the rotated
            frame (intrinsic), uppercase about the fixed frame (extrinsic).

    Returns:
        quaternion as [qx, qy, qz, qw]
    """
    angles = np.asarray(angles, dtype=np.float64)
    return Rotation.from_euler(seq, angles).as_quat()


def euler_from_quaternion(q, seq="xyz"):
    """Convert quaternion to Euler angles.

    Args:
        q: quaternion as [qx, qy, qz, qw]
        seq: rotation sequence, e.g., "xyz", "zyx", "ZYX" (default "xyz").
            Lowercase letters represent rotations about axes of the rotated
            frame (intrinsic), uppercase about the fixed frame (extrinsic).

    Returns:
        Euler angles in radians as [angle1, angle2, angle3]
    """
    q = np.asarray(q, dtype=np.float64)
    return Rotation.from_quat(q).as_euler(seq)


# =============================================================================
# Transform Matrix Utilities
# =============================================================================


def make_transform_matrix(R, t):
    """Construct a 4x4 homogeneous transformation matrix from rotation and translation.

    The resulting matrix has the form::

        [[R, t],
         [0, 1]]

    Args:
        R: a (3, 3) rotation matrix
        t: a (3,) translation vector

    Returns:
        a (4, 4) homogeneous transformation matrix
    """
    R = np.asarray(R, dtype=np.float64)
    t = np.asarray(t, dtype=np.float64).flatten()

    T = np.eye(4, dtype=np.float64)
    T[:3, :3] = R
    T[:3, 3] = t
    return T


def decompose_transform_matrix(T):
    """Extract rotation and translation from a 4x4 transformation matrix.

    Args:
        T: a (4, 4) or (3, 4) homogeneous transformation matrix

    Returns:
        tuple of (R, t) where R is a (3, 3) rotation matrix and t is a (3,)
        translation vector
    """
    T = np.asarray(T, dtype=np.float64)

    if T.shape not in ((3, 4), (4, 4)):
        raise ValueError(f"Expected (3, 4) or (4, 4) matrix, got {T.shape}")

    R = T[:3, :3].copy()
    t = T[:3, 3].copy()
    return R, t


def invert_transform_matrix(T):
    """Efficiently invert a rigid transformation matrix.

    For a rigid transform [R|t], the inverse is [R^T | -R^T @ t].
    This is more numerically stable and efficient than general matrix inversion.

    Args:
        T: a (4, 4) homogeneous transformation matrix

    Returns:
        a (4, 4) inverse transformation matrix
    """
    T = np.asarray(T, dtype=np.float64)

    R, t = decompose_transform_matrix(T)
    R_inv = R.T
    t_inv = -R_inv @ t

    return make_transform_matrix(R_inv, t_inv)


def compose_transforms(T1, T2):
    """Compose two transformation matrices.

    If T1 represents A->B and T2 represents B->C, the result is A->C.

    Mathematically: T_result = T2 @ T1

    Args:
        T1: first transformation matrix (4, 4) representing A->B
        T2: second transformation matrix (4, 4) representing B->C

    Returns:
        composed transformation matrix (4, 4) representing A->C
    """
    T1 = np.asarray(T1, dtype=np.float64)
    T2 = np.asarray(T2, dtype=np.float64)

    return T2 @ T1


# =============================================================================
# Axis Flip / Coordinate System Utilities
# =============================================================================


def _normalize_convention(convention):
    """Normalize convention name to standard form."""
    convention = convention.lower()
    if convention not in _COORDINATE_CONVENTIONS:
        supported = ", ".join(sorted(_COORDINATE_CONVENTIONS.keys()))
        raise ValueError(
            f"Unknown coordinate convention: {convention!r}. "
            f"Supported: {supported}"
        )
    return _COORDINATE_CONVENTIONS[convention]


def axis_flip_matrix(from_conv, to_conv):
    """Get the 3x3 rotation matrix to convert between coordinate conventions.

    Supported conventions:
        - Camera: "opencv" (RDF), "opengl" (RUB)
        - Robotics: "ros"/"flu" (Forward-Left-Up), "fru" (Forward-Right-Up)
        - Aviation/Geo: "ned" (North-East-Down), "enu" (East-North-Up)

    Args:
        from_conv: source coordinate convention
        to_conv: target coordinate convention

    Returns:
        a (3, 3) rotation matrix that transforms points from the source
        convention to the target convention
    """
    from_norm = _normalize_convention(from_conv)
    to_norm = _normalize_convention(to_conv)

    if from_norm == to_norm:
        return np.eye(3, dtype=np.float64)

    # Build transformation matrix from convention axes
    # Each row of the result matrix tells us where each source axis goes
    from_axes = _CONVENTION_AXES[from_norm]
    to_axes = _CONVENTION_AXES[to_norm]

    # Build inverse of to_axes (transpose since orthogonal)
    to_matrix = np.array(
        [to_axes["x"], to_axes["y"], to_axes["z"]], dtype=np.float64
    ).T
    from_matrix = np.array(
        [from_axes["x"], from_axes["y"], from_axes["z"]], dtype=np.float64
    ).T

    # Transform is: to_matrix^T @ from_matrix
    # This maps from_convention -> canonical -> to_convention
    return to_matrix.T @ from_matrix


def opencv_to_opengl_points(pts):
    """Convert points from OpenCV to OpenGL camera convention.

    OpenCV: X-right, Y-down, Z-forward (RDF)
    OpenGL: X-right, Y-up, Z-backward (RUB)

    This flips Y and Z axes: (x, y, z) -> (x, -y, -z)

    Args:
        pts: (N, 3) array of points in OpenCV convention

    Returns:
        (N, 3) array of points in OpenGL convention
    """
    pts = np.atleast_2d(pts).astype(np.float64)
    result = pts.copy()
    result[:, 1] = -result[:, 1]
    result[:, 2] = -result[:, 2]
    return result


def opengl_to_opencv_points(pts):
    """Convert points from OpenGL to OpenCV camera convention.

    OpenGL: X-right, Y-up, Z-backward (RUB)
    OpenCV: X-right, Y-down, Z-forward (RDF)

    This flips Y and Z axes: (x, y, z) -> (x, -y, -z)

    Args:
        pts: (N, 3) array of points in OpenGL convention

    Returns:
        (N, 3) array of points in OpenCV convention
    """
    # The transformation is self-inverse
    return opencv_to_opengl_points(pts)


def transform_points_by_convention(pts, from_conv, to_conv):
    """Transform points between coordinate conventions.

    Args:
        pts: (N, 3) array of points
        from_conv: source coordinate convention
        to_conv: target coordinate convention

    Returns:
        (N, 3) array of transformed points
    """
    R = axis_flip_matrix(from_conv, to_conv)
    return rotate_points(pts, R)


# =============================================================================
# Point Transformation Utilities
# =============================================================================


def transform_points(pts, T):
    """Apply a 4x4 transformation matrix to 3D points.

    Args:
        pts: (N, 3) array of 3D points
        T: (4, 4) homogeneous transformation matrix

    Returns:
        (N, 3) array of transformed points
    """
    pts = np.atleast_2d(pts).astype(np.float64)
    T = np.asarray(T, dtype=np.float64)

    if pts.shape[1] != 3:
        raise ValueError(f"Expected (N, 3) points, got shape {pts.shape}")

    # Convert to homogeneous coordinates
    ones = np.ones((pts.shape[0], 1), dtype=np.float64)
    pts_h = np.hstack([pts, ones])

    # Apply transformation
    result_h = (T @ pts_h.T).T

    return result_h[:, :3]


def rotate_points(pts, R):
    """Apply a 3x3 rotation matrix to 3D points.

    Args:
        pts: (N, 3) array of 3D points
        R: (3, 3) rotation matrix

    Returns:
        (N, 3) array of rotated points
    """
    pts = np.atleast_2d(pts).astype(np.float64)
    R = np.asarray(R, dtype=np.float64)

    if pts.shape[1] != 3:
        raise ValueError(f"Expected (N, 3) points, got shape {pts.shape}")

    return (R @ pts.T).T


def translate_points(pts, t):
    """Translate 3D points by a vector.

    Args:
        pts: (N, 3) array of 3D points
        t: (3,) translation vector

    Returns:
        (N, 3) array of translated points
    """
    pts = np.atleast_2d(pts).astype(np.float64)
    t = np.asarray(t, dtype=np.float64).flatten()

    if pts.shape[1] != 3:
        raise ValueError(f"Expected (N, 3) points, got shape {pts.shape}")
    if t.shape[0] != 3:
        raise ValueError(f"Expected (3,) translation, got shape {t.shape}")

    return pts + t
