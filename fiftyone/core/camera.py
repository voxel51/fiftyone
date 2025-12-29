"""
Camera calibration data model for multi-sensor geometry workflows.

This module provides first-class data models for camera intrinsics and
extrinsics, enabling 3D-to-2D projection, 2D-to-3D unprojection, and
multi-sensor fusion workflows.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Optional, Union

import numpy as np
from scipy.spatial.transform import Rotation

import fiftyone.core.fields as fof
from fiftyone.core.odm.embedded_document import (
    DynamicEmbeddedDocument,
    EmbeddedDocument,
)


class CameraIntrinsics(DynamicEmbeddedDocument):
    """Base class for camera intrinsics.

    All camera intrinsics models share the following parameters:

    Args:
        fx: focal length in pixels (x-axis)
        fy: focal length in pixels (y-axis)
        cx: principal point x-coordinate in pixels
        cy: principal point y-coordinate in pixels
        skew (0.0): skew coefficient (typically 0 for modern cameras)

    Attributes:
        intrinsic_matrix: the 3x3 intrinsic matrix K

    Example::

        import fiftyone as fo

        intrinsics = fo.PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        # Access the 3x3 intrinsic matrix
        K = intrinsics.intrinsic_matrix
    """

    meta = {"allow_inheritance": True}

    fx = fof.FloatField(required=True)
    fy = fof.FloatField(required=True)
    cx = fof.FloatField(required=True)
    cy = fof.FloatField(required=True)
    skew = fof.FloatField(default=0.0)

    @property
    def intrinsic_matrix(self) -> np.ndarray:
        """Returns the 3x3 intrinsic matrix K.

        The matrix has the form::

            [[fx,  s, cx],
             [ 0, fy, cy],
             [ 0,  0,  1]]

        Returns:
            a (3, 3) numpy array
        """
        s = self.skew if self.skew is not None else 0.0
        return np.array(
            [
                [self.fx, s, self.cx],
                [0, self.fy, self.cy],
                [0, 0, 1],
            ],
            dtype=np.float64,
        )

    @classmethod
    def from_matrix(cls, matrix: np.ndarray, **kwargs) -> "CameraIntrinsics":
        """Creates a CameraIntrinsics instance from a 3x3 intrinsic matrix.

        Args:
            matrix: a (3, 3) intrinsic matrix K
            **kwargs: additional fields to set on the instance

        Returns:
            a :class:`CameraIntrinsics` instance
        """
        matrix = np.asarray(matrix, dtype=np.float64)
        if matrix.shape != (3, 3):
            raise ValueError(f"Expected (3, 3) matrix, got {matrix.shape}")

        return cls(
            fx=float(matrix[0, 0]),
            fy=float(matrix[1, 1]),
            cx=float(matrix[0, 2]),
            cy=float(matrix[1, 2]),
            skew=float(matrix[0, 1]),
            **kwargs,
        )

    def get_distortion_coeffs(self) -> Optional[np.ndarray]:
        """Returns the distortion coefficients for this camera model.

        Returns:
            a numpy array of distortion coefficients, or None if no distortion
        """
        return None

    def camera_matrix_3x4(
        self, extrinsics: Optional["SensorExtrinsics"] = None
    ) -> np.ndarray:
        """Returns the 3x4 camera projection matrix P = K @ [R|t].

        Note: This matrix is only valid when distortion is zero or has been
        pre-corrected in the image.

        Args:
            extrinsics: optional extrinsics to combine with intrinsics

        Returns:
            a (3, 4) numpy array
        """
        K = self.intrinsic_matrix
        if extrinsics is None:
            return K @ np.hstack([np.eye(3), np.zeros((3, 1))])
        else:
            R = extrinsics.rotation_matrix
            t = np.asarray(extrinsics.translation).reshape(3, 1)
            return K @ np.hstack([R, t])


class PinholeCameraIntrinsics(CameraIntrinsics):
    """Pinhole camera model with no distortion.

    Args:
        fx: focal length in pixels (x-axis)
        fy: focal length in pixels (y-axis)
        cx: principal point x-coordinate in pixels
        cy: principal point y-coordinate in pixels
        skew (0.0): skew coefficient (typically 0 for modern cameras)

    Example::

        import fiftyone as fo

        intrinsics = fo.PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )
    """

    pass


class OpenCVCameraIntrinsics(CameraIntrinsics):
    """OpenCV Brown-Conrady camera model with radial and tangential distortion.

    Distortion coefficients follow the OpenCV ordering: (k1, k2, p1, p2, k3,
    k4, k5, k6).

    The radial distortion model is::

        x_distorted = x * (1 + k1*r^2 + k2*r^4 + k3*r^6) /
                          (1 + k4*r^2 + k5*r^4 + k6*r^6)

    The tangential distortion model is::

        x_distorted += 2*p1*x*y + p2*(r^2 + 2*x^2)
        y_distorted += p1*(r^2 + 2*y^2) + 2*p2*x*y

    Args:
        fx: focal length in pixels (x-axis)
        fy: focal length in pixels (y-axis)
        cx: principal point x-coordinate in pixels
        cy: principal point y-coordinate in pixels
        skew (0.0): skew coefficient
        k1 (0.0): radial distortion coefficient
        k2 (0.0): radial distortion coefficient
        p1 (0.0): tangential distortion coefficient
        p2 (0.0): tangential distortion coefficient
        k3 (0.0): radial distortion coefficient
        k4 (0.0): radial distortion coefficient (rational model)
        k5 (0.0): radial distortion coefficient (rational model)
        k6 (0.0): radial distortion coefficient (rational model)

    Example::

        import fiftyone as fo

        intrinsics = fo.OpenCVCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
            k1=-0.1,
            k2=0.05,
            p1=0.001,
            p2=-0.001,
        )
    """

    k1 = fof.FloatField(default=0.0)
    k2 = fof.FloatField(default=0.0)
    p1 = fof.FloatField(default=0.0)
    p2 = fof.FloatField(default=0.0)
    k3 = fof.FloatField(default=0.0)
    k4 = fof.FloatField(default=0.0)
    k5 = fof.FloatField(default=0.0)
    k6 = fof.FloatField(default=0.0)

    def get_distortion_coeffs(self) -> np.ndarray:
        """Returns the OpenCV distortion coefficients.

        Returns:
            a (8,) numpy array with coefficients (k1, k2, p1, p2, k3, k4, k5, k6)
        """
        return np.array(
            [
                self.k1 or 0.0,
                self.k2 or 0.0,
                self.p1 or 0.0,
                self.p2 or 0.0,
                self.k3 or 0.0,
                self.k4 or 0.0,
                self.k5 or 0.0,
                self.k6 or 0.0,
            ],
            dtype=np.float64,
        )


class OpenCVFisheyeCameraIntrinsics(CameraIntrinsics):
    """OpenCV fisheye camera model with equidistant projection.

    Uses 4 distortion coefficients (k1, k2, k3, k4) for the fisheye model.

    Args:
        fx: focal length in pixels (x-axis)
        fy: focal length in pixels (y-axis)
        cx: principal point x-coordinate in pixels
        cy: principal point y-coordinate in pixels
        skew (0.0): skew coefficient
        k1 (0.0): fisheye distortion coefficient
        k2 (0.0): fisheye distortion coefficient
        k3 (0.0): fisheye distortion coefficient
        k4 (0.0): fisheye distortion coefficient

    Example::

        import fiftyone as fo

        intrinsics = fo.OpenCVFisheyeCameraIntrinsics(
            fx=500.0,
            fy=500.0,
            cx=640.0,
            cy=480.0,
            k1=0.1,
            k2=-0.05,
        )
    """

    k1 = fof.FloatField(default=0.0)
    k2 = fof.FloatField(default=0.0)
    k3 = fof.FloatField(default=0.0)
    k4 = fof.FloatField(default=0.0)

    def get_distortion_coeffs(self) -> np.ndarray:
        """Returns the fisheye distortion coefficients.

        Returns:
            a (4,) numpy array with coefficients (k1, k2, k3, k4)
        """
        return np.array(
            [
                self.k1 or 0.0,
                self.k2 or 0.0,
                self.k3 or 0.0,
                self.k4 or 0.0,
            ],
            dtype=np.float64,
        )


class SensorExtrinsics(DynamicEmbeddedDocument):
    """Represents a rigid 3D transformation (6-DOF pose).

    Stored as translation + quaternion for efficiency. Defines transformation
    from ``source_frame`` to ``target_frame``::

        X_target = R @ X_source + t

    The quaternion uses scalar-last convention [qx, qy, qz, qw], matching
    scipy and ROS conventions.

    Args:
        translation: 3-element list [tx, ty, tz] (position in target frame)
        quaternion: unit quaternion [qx, qy, qz, qw] (scalar-last convention)
        source_frame (None): name of source coordinate frame (e.g.,
            "camera_front")
        target_frame (None): name of target coordinate frame (e.g., "ego",
            "world")
        timestamp (None): optional timestamp in nanoseconds for interpolation
        covariance (None): optional 6-element diagonal pose uncertainty

    Attributes:
        rotation_matrix: the 3x3 rotation matrix R
        extrinsic_matrix: the 4x4 homogeneous transformation matrix

    Example::

        import fiftyone as fo

        # Camera to ego transformation
        extrinsics = fo.SensorExtrinsics(
            translation=[1.5, 0.0, 1.2],
            quaternion=[0.0, 0.0, 0.0, 1.0],  # identity rotation
            source_frame="camera_front",
            target_frame="ego",
        )

        # Access the 4x4 transformation matrix
        T = extrinsics.extrinsic_matrix
    """

    meta = {"allow_inheritance": True}

    translation = fof.ListField(fof.FloatField(), default=None)
    quaternion = fof.ListField(fof.FloatField(), default=None)
    source_frame = fof.StringField(default=None)
    target_frame = fof.StringField(default=None)
    timestamp = fof.IntField(default=None)
    covariance = fof.ListField(fof.FloatField(), default=None)

    def _validate(self):
        """Validates the extrinsics data."""
        if self.translation is not None and len(self.translation) != 3:
            raise ValueError(
                f"Translation must have 3 elements, got {len(self.translation)}"
            )
        if self.quaternion is not None and len(self.quaternion) != 4:
            raise ValueError(
                f"Quaternion must have 4 elements, got {len(self.quaternion)}"
            )
        if self.quaternion is not None:
            q = np.array(self.quaternion)
            norm = np.linalg.norm(q)
            if not np.isclose(norm, 1.0, atol=1e-6):
                raise ValueError(
                    f"Quaternion must be unit quaternion, got norm={norm}"
                )

    @property
    def rotation_matrix(self) -> np.ndarray:
        """Returns the 3x3 rotation matrix R.

        Returns:
            a (3, 3) numpy array
        """
        if self.quaternion is None:
            return np.eye(3, dtype=np.float64)

        # scipy uses scalar-last convention [x, y, z, w]
        q = np.array(self.quaternion, dtype=np.float64)
        return Rotation.from_quat(q).as_matrix()

    @property
    def extrinsic_matrix(self) -> np.ndarray:
        """Returns the 4x4 homogeneous transformation matrix.

        The matrix has the form::

            [[R, t],
             [0, 1]]

        where R is the 3x3 rotation and t is the 3x1 translation.

        Returns:
            a (4, 4) numpy array
        """
        T = np.eye(4, dtype=np.float64)
        T[:3, :3] = self.rotation_matrix
        if self.translation is not None:
            T[:3, 3] = np.array(self.translation, dtype=np.float64)
        return T

    @classmethod
    def from_matrix(
        cls,
        matrix: np.ndarray,
        source_frame: Optional[str] = None,
        target_frame: Optional[str] = None,
        **kwargs,
    ) -> "SensorExtrinsics":
        """Creates a SensorExtrinsics instance from a 3x4 or 4x4 matrix.

        Args:
            matrix: a (3, 4) or (4, 4) transformation matrix [R|t]
            source_frame: name of source coordinate frame
            target_frame: name of target coordinate frame
            **kwargs: additional fields to set on the instance

        Returns:
            a :class:`SensorExtrinsics` instance
        """
        matrix = np.asarray(matrix, dtype=np.float64)
        if matrix.shape not in ((3, 4), (4, 4)):
            raise ValueError(
                f"Expected (3, 4) or (4, 4) matrix, got {matrix.shape}"
            )

        R = matrix[:3, :3]
        t = matrix[:3, 3]

        # Convert rotation matrix to quaternion (scalar-last)
        quat = Rotation.from_matrix(R).as_quat()

        return cls(
            translation=t.tolist(),
            quaternion=quat.tolist(),
            source_frame=source_frame,
            target_frame=target_frame,
            **kwargs,
        )

    def inverse(self) -> "SensorExtrinsics":
        """Returns the inverse transformation.

        If this transform is source_frame -> target_frame, the inverse is
        target_frame -> source_frame.

        Returns:
            a :class:`SensorExtrinsics` representing the inverse transform
        """
        R = self.rotation_matrix
        t = np.array(self.translation or [0, 0, 0], dtype=np.float64)

        # Inverse: R_inv = R^T, t_inv = -R^T @ t
        R_inv = R.T
        t_inv = -R_inv @ t

        # Convert back to quaternion
        quat_inv = Rotation.from_matrix(R_inv).as_quat()

        return SensorExtrinsics(
            translation=t_inv.tolist(),
            quaternion=quat_inv.tolist(),
            source_frame=self.target_frame,
            target_frame=self.source_frame,
        )

    def compose(self, other: "SensorExtrinsics") -> "SensorExtrinsics":
        """Composes this transform with another: self @ other.

        If self is A->B and other is B->C, the result is A->C.

        Args:
            other: another :class:`SensorExtrinsics` to compose with

        Returns:
            a :class:`SensorExtrinsics` representing the composed transform
        """
        T1 = self.extrinsic_matrix
        T2 = other.extrinsic_matrix
        T_composed = T1 @ T2

        return SensorExtrinsics.from_matrix(
            T_composed,
            source_frame=other.source_frame,
            target_frame=self.target_frame,
        )


# Alias for backward compatibility and generality
CameraExtrinsics = SensorExtrinsics


class CameraIntrinsicsRef(EmbeddedDocument):
    """Reference to dataset-level camera intrinsics.

    Use this to reference intrinsics stored at the dataset level rather than
    embedding the full intrinsics data in each sample.

    Args:
        ref: the sensor/camera name key in ``dataset.camera_intrinsics``

    Example::

        import fiftyone as fo

        # Reference dataset-level intrinsics
        sample["camera_intrinsics"] = fo.CameraIntrinsicsRef(ref="camera_front")
    """

    meta = {"strict": False}

    ref = fof.StringField(required=True)


class SensorExtrinsicsRef(EmbeddedDocument):
    """Reference to dataset-level sensor extrinsics.

    Use this to reference extrinsics stored at the dataset level rather than
    embedding the full extrinsics data in each sample.

    Args:
        ref: the key in ``dataset.sensor_extrinsics``, either
            "source_frame::target_frame" or just "source_frame" (implies
            target is "world")

    Example::

        import fiftyone as fo

        # Reference dataset-level extrinsics
        sample["camera_extrinsics"] = [
            fo.SensorExtrinsicsRef(ref="camera_front::ego"),
        ]
    """

    meta = {"strict": False}

    ref = fof.StringField(required=True)


# Alias for backward compatibility
CameraExtrinsicsRef = SensorExtrinsicsRef


class CameraProjector:
    """Utility class for projecting points between 3D and 2D.

    Combines camera intrinsics and optional extrinsics to perform projection
    and unprojection operations.

    Args:
        intrinsics: a :class:`CameraIntrinsics` instance
        extrinsics (None): optional :class:`SensorExtrinsics` defining the
            camera-to-world (or camera-to-reference) transformation. If
            provided, 3D points are assumed to be in the target frame and
            will be transformed to camera frame before projection
        camera_convention ("opencv"): coordinate convention, either "opencv"
            (z-forward, x-right, y-down) or "opengl" (z-backward, x-right,
            y-up)

    Example::

        import fiftyone as fo
        import numpy as np

        intrinsics = fo.PinholeCameraIntrinsics(
            fx=1000.0, fy=1000.0, cx=960.0, cy=540.0
        )

        projector = fo.CameraProjector(intrinsics)

        # Project 3D points to 2D
        points_3d = np.array([[0, 0, 10], [1, 2, 10]])
        points_2d = projector.project(points_3d, in_camera_frame=True)

        # Unproject 2D points to 3D rays
        depth = np.array([10, 10])
        points_3d_back = projector.unproject(points_2d, depth)
    """

    def __init__(
        self,
        intrinsics: CameraIntrinsics,
        extrinsics: Optional[SensorExtrinsics] = None,
        camera_convention: str = "opencv",
    ):
        if camera_convention not in ("opencv", "opengl"):
            raise ValueError(
                f"camera_convention must be 'opencv' or 'opengl', "
                f"got '{camera_convention}'"
            )

        self.intrinsics = intrinsics
        self.extrinsics = extrinsics
        self.camera_convention = camera_convention

        # Precompute matrices
        self._K = intrinsics.intrinsic_matrix
        self._K_inv = np.linalg.inv(self._K)

        if extrinsics is not None:
            # Transform from world to camera
            self._world_to_camera = extrinsics.inverse().extrinsic_matrix
        else:
            self._world_to_camera = None

    def project(
        self,
        points_3d: np.ndarray,
        in_camera_frame: bool = False,
    ) -> np.ndarray:
        """Projects 3D points to 2D image coordinates.

        Args:
            points_3d: (N, 3) array of 3D points
            in_camera_frame: if True, points are already in camera frame;
                if False and extrinsics are provided, points are transformed
                from the extrinsics' target frame to camera frame

        Returns:
            (N, 2) array of 2D pixel coordinates
        """
        points = np.atleast_2d(points_3d).astype(np.float64)
        if points.shape[1] != 3:
            raise ValueError(
                f"Expected (N, 3) points, got shape {points.shape}"
            )

        # Transform to camera frame if needed
        if not in_camera_frame and self._world_to_camera is not None:
            # Apply world-to-camera transformation
            ones = np.ones((points.shape[0], 1))
            points_h = np.hstack([points, ones])
            points = (self._world_to_camera @ points_h.T).T[:, :3]

        # Handle OpenGL convention (flip z and y)
        if self.camera_convention == "opengl":
            points = points.copy()
            points[:, 1] = -points[:, 1]
            points[:, 2] = -points[:, 2]

        # Check for points behind camera
        z = points[:, 2]
        if np.any(z <= 0):
            import warnings

            warnings.warn(
                "Some points are at or behind the camera (z <= 0). "
                "Results for these points may be invalid."
            )

        # Apply distortion if available
        distortion = self.intrinsics.get_distortion_coeffs()
        if distortion is not None and np.any(distortion != 0):
            points_2d = self._project_with_distortion(points, distortion)
        else:
            points_2d = self._project_pinhole(points)

        return points_2d

    def _project_pinhole(self, points: np.ndarray) -> np.ndarray:
        """Simple pinhole projection without distortion."""
        # Normalize by z
        x = points[:, 0] / points[:, 2]
        y = points[:, 1] / points[:, 2]

        # Apply intrinsics
        u = self._K[0, 0] * x + self._K[0, 1] * y + self._K[0, 2]
        v = self._K[1, 1] * y + self._K[1, 2]

        return np.column_stack([u, v])

    def _project_with_distortion(
        self, points: np.ndarray, distortion: np.ndarray
    ) -> np.ndarray:
        """Projection with OpenCV distortion model."""
        # Normalize by z
        x = points[:, 0] / points[:, 2]
        y = points[:, 1] / points[:, 2]

        r2 = x * x + y * y
        r4 = r2 * r2
        r6 = r4 * r2

        # Radial distortion
        if len(distortion) >= 8:
            k1, k2, p1, p2, k3, k4, k5, k6 = distortion[:8]
            radial_num = 1 + k1 * r2 + k2 * r4 + k3 * r6
            radial_den = 1 + k4 * r2 + k5 * r4 + k6 * r6
            radial = radial_num / radial_den
        elif len(distortion) >= 5:
            k1, k2, p1, p2, k3 = distortion[:5]
            radial = 1 + k1 * r2 + k2 * r4 + k3 * r6
        else:
            k1, k2, p1, p2 = distortion[:4]
            radial = 1 + k1 * r2 + k2 * r4

        x_distorted = x * radial + 2 * p1 * x * y + p2 * (r2 + 2 * x * x)
        y_distorted = y * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y

        # Apply intrinsics
        u = (
            self._K[0, 0] * x_distorted
            + self._K[0, 1] * y_distorted
            + self._K[0, 2]
        )
        v = self._K[1, 1] * y_distorted + self._K[1, 2]

        return np.column_stack([u, v])

    def unproject(
        self,
        points_2d: np.ndarray,
        depth: Union[float, np.ndarray],
        in_camera_frame: bool = False,
    ) -> np.ndarray:
        """Unprojects 2D image points to 3D given depth.

        Note: For monocular cameras, depth must be provided from an external
        source (e.g., stereo, LiDAR, depth sensor, or depth estimation).

        The depth is interpreted as z-depth in the camera coordinate frame
        (not Euclidean distance from camera center).

        Args:
            points_2d: (N, 2) array of 2D pixel coordinates
            depth: scalar or (N,) array of z-depth values in camera frame
            in_camera_frame: if True, returns points in camera frame; if False
                and extrinsics are provided, transforms to the extrinsics'
                target frame

        Returns:
            (N, 3) array of 3D points
        """
        points = np.atleast_2d(points_2d).astype(np.float64)
        if points.shape[1] != 2:
            raise ValueError(
                f"Expected (N, 2) points, got shape {points.shape}"
            )

        depth = np.atleast_1d(depth).astype(np.float64)
        if depth.size == 1:
            depth = np.full(points.shape[0], depth[0])

        if depth.shape[0] != points.shape[0]:
            raise ValueError(
                f"Depth array length {depth.shape[0]} doesn't match "
                f"points length {points.shape[0]}"
            )

        # Undistort points if distortion is present
        distortion = self.intrinsics.get_distortion_coeffs()
        if distortion is not None and np.any(distortion != 0):
            # For simplicity, use iterative undistortion
            # In production, you'd use cv2.undistortPoints
            points_normalized = self._undistort_iterative(points, distortion)
        else:
            # Apply inverse intrinsics
            u = points[:, 0]
            v = points[:, 1]
            x = (
                u
                - self._K[0, 2]
                - self._K[0, 1] * (v - self._K[1, 2]) / self._K[1, 1]
            ) / self._K[0, 0]
            y = (v - self._K[1, 2]) / self._K[1, 1]
            points_normalized = np.column_stack([x, y])

        # Scale by depth
        x_cam = points_normalized[:, 0] * depth
        y_cam = points_normalized[:, 1] * depth
        z_cam = depth

        points_3d = np.column_stack([x_cam, y_cam, z_cam])

        # Handle OpenGL convention
        if self.camera_convention == "opengl":
            points_3d[:, 1] = -points_3d[:, 1]
            points_3d[:, 2] = -points_3d[:, 2]

        # Transform to world frame if requested
        if not in_camera_frame and self.extrinsics is not None:
            T = self.extrinsics.extrinsic_matrix
            ones = np.ones((points_3d.shape[0], 1))
            points_h = np.hstack([points_3d, ones])
            points_3d = (T @ points_h.T).T[:, :3]

        return points_3d

    def _undistort_iterative(
        self, points: np.ndarray, distortion: np.ndarray, iterations: int = 10
    ) -> np.ndarray:
        """Iteratively undistort points (approximate)."""
        # Initial guess: apply inverse intrinsics without distortion
        u = points[:, 0]
        v = points[:, 1]
        x = (u - self._K[0, 2]) / self._K[0, 0]
        y = (v - self._K[1, 2]) / self._K[1, 1]

        x0, y0 = x.copy(), y.copy()

        k1, k2, p1, p2 = distortion[:4]
        k3 = distortion[4] if len(distortion) > 4 else 0

        for _ in range(iterations):
            r2 = x * x + y * y
            r4 = r2 * r2
            r6 = r4 * r2

            radial = 1 + k1 * r2 + k2 * r4 + k3 * r6
            dx = 2 * p1 * x * y + p2 * (r2 + 2 * x * x)
            dy = p1 * (r2 + 2 * y * y) + 2 * p2 * x * y

            x = (x0 - dx) / radial
            y = (y0 - dy) / radial

        return np.column_stack([x, y])
