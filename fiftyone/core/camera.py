"""
Camera calibration data model for multi-sensor geometry workflows.

This module provides first-class data models for camera intrinsics and
static transforms (poses), enabling 3D-to-2D projection, 2D-to-3D unprojection,
and multi-sensor fusion workflows.

Key classes:

-   :class:`CameraIntrinsics`: Base class for camera intrinsic parameters
-   :class:`PinholeCameraIntrinsics`: Pinhole model (no distortion)
-   :class:`OpenCVCameraIntrinsics`: OpenCV model with radial/tangential distortion
-   :class:`OpenCVFisheyeCameraIntrinsics`: Fisheye model with equidistant projection
-   :class:`StaticTransform`: Rigid 6-DOF transformation (rotation + translation)
-   :class:`CameraProjector`: Utility for projecting/unprojecting points

For low-level transformation utilities (quaternion math, coordinate system
conversions, matrix operations), see :mod:`fiftyone.utils.transforms`.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from abc import ABC, abstractmethod
from typing import Optional, Tuple, Union
import warnings

import cv2
import numpy as np

import fiftyone.core.fields as fof
from fiftyone.core.odm.embedded_document import (
    DynamicEmbeddedDocument,
    EmbeddedDocument,
)
import fiftyone.utils.transforms as fout

#: Supported 3D camera axis conventions
CAMERA_CONVENTION_OPENCV = "opencv"
CAMERA_CONVENTION_OPENGL = "opengl"
SUPPORTED_CAMERA_CONVENTIONS = (
    CAMERA_CONVENTION_OPENCV,
    CAMERA_CONVENTION_OPENGL,
)

#: Default target frame for static transforms
DEFAULT_TRANSFORM_TARGET_FRAME = "world"


class ProjectionModel(ABC):
    """Abstract base class for camera projection models.

    Encapsulates projection and undistortion operations for different camera
    models.
    """

    @abstractmethod
    def project(
        self,
        points: np.ndarray,
        K: np.ndarray,
        distortion: Optional[np.ndarray],
    ) -> np.ndarray:
        """Project 3D points to 2D image coordinates.

        Args:
            points: (N, 3) array of 3D points in camera frame
            K: (3, 3) intrinsic matrix
            distortion: distortion coefficients, or None

        Returns:
            (N, 2) array of 2D pixel coordinates
        """
        raise NotImplementedError

    @abstractmethod
    def undistort(
        self,
        points: np.ndarray,
        K: np.ndarray,
        distortion: Optional[np.ndarray],
    ) -> np.ndarray:
        """Undistort 2D image points, returning normalized coordinates.

        Args:
            points: (N, 2) array of 2D pixel coordinates
            K: (3, 3) intrinsic matrix
            distortion: distortion coefficients, or None

        Returns:
            (N, 2) array of normalized coordinates (z=1 plane in camera frame)
        """
        raise NotImplementedError

    @abstractmethod
    def undistort_image(
        self,
        image: np.ndarray,
        K: np.ndarray,
        distortion: Optional[np.ndarray],
        alpha: float = 0.0,
        new_size: Optional[Tuple[int, int]] = None,
    ) -> np.ndarray:
        """Undistort an image using this projection model."""
        raise NotImplementedError


class OpenCVProjectionModel(ProjectionModel):
    """Standard OpenCV camera model with radial and tangential distortion."""

    def project(
        self,
        points: np.ndarray,
        K: np.ndarray,
        distortion: Optional[np.ndarray],
    ) -> np.ndarray:
        """Project points using OpenCV's standard camera model."""
        rvec = np.zeros(3, dtype=np.float64)
        tvec = np.zeros(3, dtype=np.float64)

        if distortion is None:
            distortion = np.zeros(5, dtype=np.float64)

        points_2d, _ = cv2.projectPoints(
            points.reshape(-1, 1, 3),
            rvec,
            tvec,
            K,
            distortion,
        )
        return points_2d.reshape(-1, 2)

    def undistort(
        self,
        points: np.ndarray,
        K: np.ndarray,
        distortion: Optional[np.ndarray],
    ) -> np.ndarray:
        """Undistort points using OpenCV's standard camera model.

        Returns normalized (x, y) coordinates (z=1 plane in camera frame).
        """
        if distortion is None:
            distortion = np.zeros(5, dtype=np.float64)

        undistorted = cv2.undistortPoints(
            points.reshape(-1, 1, 2),
            K,
            distortion,
        )
        return undistorted.reshape(-1, 2)

    def undistort_image(
        self,
        image: np.ndarray,
        K: np.ndarray,
        distortion: Optional[np.ndarray],
        alpha: float = 0.0,
        new_size: Optional[Tuple[int, int]] = None,
    ) -> np.ndarray:
        h, w = image.shape[:2]
        image_size = (w, h)
        output_size = new_size if new_size is not None else image_size

        if distortion is None:
            distortion = np.zeros(5, dtype=np.float64)

        new_K, _ = cv2.getOptimalNewCameraMatrix(
            K, distortion, image_size, alpha, output_size
        )
        map1, map2 = cv2.initUndistortRectifyMap(
            K, distortion, None, new_K, output_size, cv2.CV_32FC1
        )
        return cv2.remap(image, map1, map2, cv2.INTER_LINEAR)


class FisheyeProjectionModel(ProjectionModel):
    """OpenCV fisheye camera model with equidistant projection."""

    def project(
        self,
        points: np.ndarray,
        K: np.ndarray,
        distortion: Optional[np.ndarray],
    ) -> np.ndarray:
        """Project points using OpenCV's fisheye camera model."""
        rvec = np.zeros(3, dtype=np.float64)
        tvec = np.zeros(3, dtype=np.float64)

        if distortion is None:
            distortion = np.zeros(4, dtype=np.float64)

        points_2d, _ = cv2.fisheye.projectPoints(
            points.reshape(1, -1, 3),
            rvec,
            tvec,
            K,
            distortion,
        )
        return points_2d.reshape(-1, 2)

    def undistort(
        self,
        points: np.ndarray,
        K: np.ndarray,
        distortion: Optional[np.ndarray],
    ) -> np.ndarray:
        """Undistort points using OpenCV's fisheye camera model.

        Returns normalized (x, y) coordinates (z=1 plane in camera frame).
        """
        if distortion is None:
            distortion = np.zeros(4, dtype=np.float64)

        undistorted = cv2.fisheye.undistortPoints(
            points.reshape(-1, 1, 2),
            K,
            distortion,
        )
        return undistorted.reshape(-1, 2)

    def undistort_image(
        self,
        image: np.ndarray,
        K: np.ndarray,
        distortion: Optional[np.ndarray],
        alpha: float = 0.0,
        new_size: Optional[Tuple[int, int]] = None,
    ) -> np.ndarray:
        h, w = image.shape[:2]
        image_size = (w, h)
        output_size = new_size if new_size is not None else image_size

        if distortion is None:
            distortion = np.zeros(4, dtype=np.float64)

        new_K = cv2.fisheye.estimateNewCameraMatrixForUndistortRectify(
            K,
            distortion,
            image_size,
            np.eye(3),
            balance=alpha,
            new_size=output_size,
        )
        map1, map2 = cv2.fisheye.initUndistortRectifyMap(
            K, distortion, np.eye(3), new_K, output_size, cv2.CV_32FC1
        )
        return cv2.remap(image, map1, map2, cv2.INTER_LINEAR)


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

    def get_projection_model(self) -> ProjectionModel:
        """Returns the ProjectionModel instance for this camera model.

        Returns:
            a :class:`ProjectionModel` instance
        """
        return OpenCVProjectionModel()

    def camera_matrix_3x4(
        self, transform: Optional["StaticTransform"] = None
    ) -> np.ndarray:
        """Returns the 3x4 camera projection matrix P = K @ [R|t].

        Note: This matrix is only valid when distortion is zero or has been
        pre-corrected in the image.

        Args:
            transform: optional transform defining the world-to-camera
                transformation (i.e., source_frame=world, target_frame=camera).
                If your transform is camera-to-world, call
                ``transform.inverse()`` first.

        Returns:
            a (3, 4) numpy array
        """
        K = self.intrinsic_matrix
        if transform is None:
            return K @ np.hstack([np.eye(3), np.zeros((3, 1))])
        else:
            R = transform.rotation_matrix
            t = transform.translation
            if t is None:
                t = np.zeros((3, 1))
            else:
                t = np.asarray(t).reshape(3, 1)
            return K @ np.hstack([R, t])

    def undistort_image(
        self,
        image: np.ndarray,
        alpha: float = 0.0,
        new_size: Optional[Tuple[int, int]] = None,
    ) -> np.ndarray:
        """Undistort an image using this camera's intrinsics and distortion.

        Removes lens distortion from an image, producing a rectified image
        that follows the pinhole camera model.

        Args:
            image: input distorted image as a numpy array with shape (H, W) for
                grayscale or (H, W, C) for color images
            alpha: free scaling parameter between 0 and 1:

                -   0: returns undistorted image with all pixels valid (cropped
                    to remove black borders)
                -   1: retains all source image pixels (may have black borders
                    where no source data exists)

                Intermediate values blend between the two extremes
            new_size: optional output image size as (width, height). If None,
                uses the input image size

        Returns:
            undistorted image as a numpy array with the same dtype as input

        Example::

            import fiftyone as fo
            import cv2

            intrinsics = fo.OpenCVCameraIntrinsics(
                fx=1000.0, fy=1000.0, cx=960.0, cy=540.0,
                k1=-0.1, k2=0.05,
            )

            distorted = cv2.imread("distorted.jpg")
            rectified = intrinsics.undistort_image(distorted)

            # Keep all pixels (with black borders)
            rectified_full = intrinsics.undistort_image(distorted, alpha=1.0)
        """
        if image.ndim < 2 or image.ndim > 3:
            raise ValueError(
                f"Expected image with 2 or 3 dimensions, got {image.ndim}"
            )

        h, w = image.shape[:2]
        image_size = (w, h)
        output_size = new_size if new_size is not None else image_size

        # pylint: disable=assignment-from-none
        dist = self.get_distortion_coeffs()
        if dist is None:
            # No distortion - return resized copy if needed, else just copy
            if output_size != image_size:
                return cv2.resize(image, output_size)
            return image.copy()

        # Delegate to projection model
        return self.get_projection_model().undistort_image(
            image, self.intrinsic_matrix, dist, alpha, new_size
        )


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

    def get_projection_model(self) -> ProjectionModel:
        """Returns the ProjectionModel instance for fisheye distortion.

        Returns:
            a :class:`FisheyeProjectionModel` instance
        """
        return FisheyeProjectionModel()


class StaticTransform(DynamicEmbeddedDocument):
    """Represents a rigid 3D transformation (6-DOF pose).

    Stored as translation + quaternion for efficiency. Defines transformation
    from ``source_frame`` to ``target_frame``::

        X_target = R @ X_source + t

    The quaternion uses scalar-last convention [qx, qy, qz, qw], matching
    scipy and ROS conventions.

    Args:
        source_frame: name of source coordinate frame (e.g., "camera_front").
            This is a required argument.
        translation ([0, 0, 0]): 3-element list [tx, ty, tz] (position in
            target frame)
        quaternion ([0, 0, 0, 1]): unit quaternion [qx, qy, qz, qw]
            (scalar-last convention, defaults to identity rotation)
        target_frame (None): name of target coordinate frame (e.g., "ego",
            "world")
        timestamp (None): optional timestamp in nanoseconds for interpolation
        covariance (None): optional 6-element diagonal pose uncertainty
            [σx, σy, σz, σroll, σpitch, σyaw] where translations are in
            metric and rotations are in radians

    Attributes:
        rotation_matrix: the 3x3 rotation matrix R
        transform_matrix: the 4x4 homogeneous transformation matrix

    Example::

        import fiftyone as fo

        # Camera to ego transformation
        transform = fo.StaticTransform(
            translation=[1.5, 0.0, 1.2],
            # identity rotation
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="ego",
        )

        # Access the 4x4 transformation matrix
        T = transform.transform_matrix
    """

    translation = fof.ListField(
        fof.FloatField(), default=lambda: [0.0, 0.0, 0.0]
    )
    quaternion = fof.ListField(
        fof.FloatField(), default=lambda: [0.0, 0.0, 0.0, 1.0]
    )
    source_frame = fof.StringField(default=None)
    target_frame = fof.StringField(default=None)
    timestamp = fof.IntField(default=None)
    covariance = fof.ListField(fof.FloatField(), default=None)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.source_frame is None:
            raise ValueError(
                "source_frame is required for StaticTransform. "
                "Please specify the source coordinate frame name."
            )

    def validate(self, clean=True):
        """Validates the transform data.

        This method is called by mongoengine during save/validation.
        """
        super().validate(clean=clean)

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
        if self.covariance is not None and len(self.covariance) != 6:
            raise ValueError(
                f"Covariance must have 6 elements (diagonal pose uncertainty "
                f"[σx, σy, σz, σroll, σpitch, σyaw]), got {len(self.covariance)}"
            )

    @property
    def rotation_matrix(self) -> np.ndarray:
        """Returns the 3x3 rotation matrix R.

        Returns:
            a (3, 3) numpy array
        """
        if self.quaternion is None:
            return np.eye(3, dtype=np.float64)

        return fout.quaternion_to_rotation_matrix(self.quaternion)

    @property
    def transform_matrix(self) -> np.ndarray:
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
    ) -> "StaticTransform":
        """Creates a StaticTransform instance from a 3x4 or 4x4 matrix.

        Args:
            matrix: a (3, 4) or (4, 4) transformation matrix [R|t]
            source_frame: name of source coordinate frame
            target_frame: name of target coordinate frame
            **kwargs: additional fields to set on the instance

        Returns:
            a :class:`StaticTransform` instance
        """
        matrix = np.asarray(matrix, dtype=np.float64)
        if matrix.shape not in ((3, 4), (4, 4)):
            raise ValueError(
                f"Expected (3, 4) or (4, 4) matrix, got {matrix.shape}"
            )

        R = matrix[:3, :3]
        t = matrix[:3, 3]

        # Check rotation matrix validity
        if not np.allclose(R @ R.T, np.eye(3), atol=1e-6):
            warnings.warn(
                "Rotation matrix is not orthogonal; projecting to nearest valid rotation",
                stacklevel=2,
            )

        quat = fout.rotation_matrix_to_quaternion(R)

        return cls(
            translation=t.tolist(),
            quaternion=quat.tolist(),
            source_frame=source_frame,
            target_frame=target_frame,
            **kwargs,
        )

    def inverse(self) -> "StaticTransform":
        """Returns the inverse transformation.

        If this transform is source_frame -> target_frame, the inverse is
        target_frame -> source_frame.

        Returns:
            a :class:`StaticTransform` representing the inverse transform
        """
        T_inv = fout.invert_transform_matrix(self.transform_matrix)

        return StaticTransform.from_matrix(
            T_inv,
            source_frame=self.target_frame,
            target_frame=self.source_frame,
        )

    def compose(self, other: "StaticTransform") -> "StaticTransform":
        """Composes this transform with another.

        If self is A->B and other is B->C, the result is A->C.

        Mathematically:
            X_C = T_BC @ X_B = T_BC @ (T_AB @ X_A)
            So T_AC = T_BC @ T_AB (other @ self)

        Args:
            other: another :class:`StaticTransform` to compose with.
                The source_frame of ``other`` should match target_frame of
                ``self`` for the frames to chain correctly.

        Returns:
            a :class:`StaticTransform` representing the composed transform

        Raises:
            ValueError: if the frames don't chain (self.target_frame !=
                other.source_frame when both are specified)
        """
        # Validate frame chainability if both frames are specified
        if (
            self.target_frame
            and other.source_frame
            and self.target_frame != other.source_frame
        ):
            raise ValueError(
                f"Cannot compose transforms: self.target_frame "
                f"({self.target_frame!r}) != other.source_frame "
                f"({other.source_frame!r}). Transforms must chain: "
                f"A->B composed with B->C gives A->C."
            )

        # compose_transforms(A->B, B->C) = A->C
        T_composed = fout.compose_transforms(
            self.transform_matrix, other.transform_matrix
        )

        return StaticTransform.from_matrix(
            T_composed,
            # A
            source_frame=self.source_frame,
            # C
            target_frame=other.target_frame,
        )


class CameraIntrinsicsRef(EmbeddedDocument):
    """Reference to dataset-level camera intrinsics.

    Use this to reference intrinsics stored at the dataset level rather than
    embedding the full intrinsics data in each sample.

    Args:
        ref: the sensor/camera name key in ``dataset.camera_intrinsics``

    Example::

        import fiftyone as fo

        # Reference dataset-level intrinsics (field name can be anything)
        sample["intrinsics"] = fo.CameraIntrinsicsRef(ref="camera_front")
    """

    ref = fof.StringField(required=True)


class StaticTransformRef(EmbeddedDocument):
    """Reference to dataset-level static transform.

    Use this to reference transforms stored at the dataset level rather than
    embedding the full transform data in each sample.

    Args:
        ref: the key in ``dataset.static_transforms``, either
            "source_frame::target_frame" or just "source_frame" (implies
            target is "world")

    Example::

        import fiftyone as fo

        # Reference dataset-level transform (field name can be anything)
        sample["transform"] = [
            fo.StaticTransformRef(ref="camera_front::ego"),
        ]
    """

    ref = fof.StringField(required=True)


class CameraProjector:
    """Utility class for projecting points between 3D and 2D.

    Combines camera intrinsics and optional transforms to perform projection
    and unprojection operations.

    Args:
        intrinsics: a :class:`CameraIntrinsics` instance
        camera_to_reference (None): optional :class:`StaticTransform`
            defining the **camera-to-reference** transformation (i.e., the
            camera's pose in the reference frame). If provided, 3D points
            passed to :meth:`project` are assumed to be in the reference
            frame (``camera_to_reference.target_frame``) and will be
            transformed to camera frame before projection.

            The transform should have:

            - ``source_frame``: the camera/sensor name (e.g., "cam_front")
            - ``target_frame``: the reference frame (e.g., "world", "ego")

        camera_convention ("opencv"): 3D camera axis convention, either
            "opencv" (z-forward, x-right, y-down) or "opengl" (z-backward,
            x-right, y-up). Note: This only affects the 3D coordinate axes.
            Pixel coordinates always follow image-space convention with
            +x right, +y down, origin at top-left

    Important:
        **Transform direction**: This class expects **camera-to-reference**
        transforms, NOT reference-to-camera. If you have a reference-to-camera
        transform (e.g., world-to-camera), invert it first::

            projector = fo.CameraProjector(intrinsics, world_to_cam.inverse())

        Or use the :meth:`from_reference_to_camera` constructor.

    Example::

        import fiftyone as fo
        import numpy as np

        intrinsics = fo.PinholeCameraIntrinsics(
            fx=1000.0, fy=1000.0, cx=960.0, cy=540.0
        )

        # Project points already in camera frame
        projector = fo.CameraProjector(intrinsics)
        points_3d = np.array([[0, 0, 10], [1, 2, 10]])
        points_2d = projector.project(points_3d, in_camera_frame=True)

        # Project world points using camera-to-world transform
        cam_to_world = fo.StaticTransform(
            translation=[0.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="world",
        )
        projector = fo.CameraProjector(intrinsics, cam_to_world)
        world_points = np.array([[0, 0, 10]])
        pixels = projector.project(world_points, in_camera_frame=False)
    """

    def __init__(
        self,
        intrinsics: CameraIntrinsics,
        camera_to_reference: Optional[StaticTransform] = None,
        camera_convention: str = "opencv",
    ):
        if camera_convention not in SUPPORTED_CAMERA_CONVENTIONS:
            raise ValueError(
                f"camera_convention must be one of {SUPPORTED_CAMERA_CONVENTIONS}, "
                f"got '{camera_convention}'"
            )

        # Validate transform direction and warn if it looks backwards
        if camera_to_reference is not None:
            self._validate_transform_direction(camera_to_reference)

        self.intrinsics = intrinsics
        self.camera_to_reference = camera_to_reference
        self.camera_convention = camera_convention
        self._projection_model = intrinsics.get_projection_model()

    @classmethod
    def from_reference_to_camera(
        cls,
        intrinsics: CameraIntrinsics,
        reference_to_camera: StaticTransform,
        camera_convention: str = "opencv",
    ) -> "CameraProjector":
        """Creates a CameraProjector from reference-to-camera transform.

        Use this constructor if your transform converts points FROM the
        reference frame TO the camera frame (e.g., world-to-camera). This
        is common when loading from some datasets or calibration tools.

        This method automatically inverts the transform to the expected
        camera-to-reference format.

        Args:
            intrinsics: a :class:`CameraIntrinsics` instance
            reference_to_camera: a :class:`StaticTransform` that transforms
                points from the reference frame to the camera frame
            camera_convention: "opencv" or "opengl"

        Returns:
            a :class:`CameraProjector` instance

        Example::

            # If you have world-to-camera transform:
            world_to_cam = fo.StaticTransform(
                translation=[...],
                quaternion=[...],
                source_frame="world",
                target_frame="camera",
            )
            projector = fo.CameraProjector.from_reference_to_camera(
                intrinsics, world_to_cam
            )
        """
        return cls(
            intrinsics=intrinsics,
            camera_to_reference=reference_to_camera.inverse(),
            camera_convention=camera_convention,
        )

    def _validate_transform_direction(
        self, transform: StaticTransform
    ) -> None:
        """Warns if transform appears to be in the wrong direction."""
        reference_keywords = (
            "world",
            "global",
            "map",
            "ego",
            "vehicle",
            "base",
        )
        camera_keywords = ("cam", "camera", "sensor", "image")

        src = (transform.source_frame or "").lower()
        tgt = (transform.target_frame or "").lower()

        # Check if source_frame looks like a reference frame (not a camera)
        src_looks_like_reference = any(kw in src for kw in reference_keywords)
        tgt_looks_like_camera = any(kw in tgt for kw in camera_keywords)

        if src_looks_like_reference or tgt_looks_like_camera:
            warnings.warn(
                f"CameraProjector expects camera-to-reference transform, "
                f"but received source_frame='{transform.source_frame}', "
                f"target_frame='{transform.target_frame}'. "
                f"This looks like reference-to-camera transform. "
                f"If so, either:\n"
                f"  1. Call transform.inverse() before passing to CameraProjector\n"
                f"  2. Use CameraProjector.from_reference_to_camera() instead\n"
                f"Expected: source_frame=<camera_name>, "
                f"target_frame=<reference_frame>",
                UserWarning,
                stacklevel=3,
            )

    @property
    def _K(self) -> np.ndarray:
        """Returns the intrinsic matrix, always reflecting current intrinsics."""
        return self.intrinsics.intrinsic_matrix

    @property
    def _K_inv(self) -> np.ndarray:
        """Returns the inverse intrinsic matrix."""
        return np.linalg.inv(self.intrinsics.intrinsic_matrix)

    @property
    def _reference_to_camera(self) -> Optional[np.ndarray]:
        """Returns the reference-to-camera transformation matrix."""
        if self.camera_to_reference is not None:
            return self.camera_to_reference.inverse().transform_matrix
        return None

    def project(
        self,
        points_3d: np.ndarray,
        in_camera_frame: bool = False,
    ) -> np.ndarray:
        """Projects 3D points to 2D image coordinates.

        Args:
            points_3d: (N, 3) array of 3D points
            in_camera_frame: if True, points are already in camera frame;
                if False and camera_to_reference is provided, points are
                transformed from the reference frame to camera frame

        Returns:
            (N, 2) array of 2D pixel coordinates
        """

        points = np.atleast_2d(points_3d).astype(np.float64)
        if points.shape[1] != 3:
            raise ValueError(
                f"Expected (N, 3) points, got shape {points.shape}"
            )

        # Transform to camera frame if needed
        if not in_camera_frame and self._reference_to_camera is not None:
            # Apply reference-to-camera transformation
            ones = np.ones((points.shape[0], 1))
            points_h = np.hstack([points, ones])
            points = (self._reference_to_camera @ points_h.T).T[:, :3]

        # Convert to OpenCV for projection
        if self.camera_convention == CAMERA_CONVENTION_OPENGL:
            points = fout.opengl_to_opencv_points(points)

        # Check for points behind camera
        z = points[:, 2]
        if np.any(z <= 0):
            warnings.warn(
                "Some points are at or behind the camera (z <= 0). "
                "Results for these points may be invalid.",
                stacklevel=2,
            )

        distortion = self.intrinsics.get_distortion_coeffs()
        points_2d = self._projection_model.project(points, self._K, distortion)

        return points_2d

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
                and camera_to_reference is provided, transforms to the
                reference frame

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

        distortion = self.intrinsics.get_distortion_coeffs()
        points_normalized = self._projection_model.undistort(
            points, self._K, distortion
        )

        x_cam = points_normalized[:, 0] * depth
        y_cam = points_normalized[:, 1] * depth
        z_cam = depth

        points_3d = np.column_stack([x_cam, y_cam, z_cam])

        if self.camera_convention == CAMERA_CONVENTION_OPENGL:
            points_3d = fout.opencv_to_opengl_points(points_3d)

        # Transform to reference frame if requested
        if not in_camera_frame and self.camera_to_reference is not None:
            T = self.camera_to_reference.transform_matrix
            ones = np.ones((points_3d.shape[0], 1))
            points_h = np.hstack([points_3d, ones])
            points_3d = (T @ points_h.T).T[:, :3]

        return points_3d
