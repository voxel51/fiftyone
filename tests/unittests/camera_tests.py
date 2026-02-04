"""
FiftyOne Camera data model unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import math
import unittest

import numpy as np
import numpy.testing as nptest
from decorators import drop_datasets

import fiftyone as fo
import fiftyone.core.fields as fof
from fiftyone.core.camera import (
    CAMERA_CONVENTION_OPENGL,
    CameraIntrinsics,
    CameraIntrinsicsRef,
    CameraProjector,
    OpenCVCameraIntrinsics,
    OpenCVFisheyeCameraIntrinsics,
    PinholeCameraIntrinsics,
    StaticTransform,
    StaticTransformRef,
)


class CameraIntrinsicsTests(unittest.TestCase):
    """Tests for CameraIntrinsics classes."""

    def test_pinhole_intrinsics_creation(self):
        """Test creating pinhole camera intrinsics."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        self.assertEqual(intrinsics.fx, 1000.0)
        self.assertEqual(intrinsics.fy, 1000.0)
        self.assertEqual(intrinsics.cx, 960.0)
        self.assertEqual(intrinsics.cy, 540.0)
        self.assertEqual(intrinsics.skew, 0.0)

    def test_intrinsic_matrix_property(self):
        """Test the intrinsic matrix property."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
            skew=0.5,
        )

        K = intrinsics.intrinsic_matrix
        expected = np.array(
            [
                [1000.0, 0.5, 960.0],
                [0.0, 1000.0, 540.0],
                [0.0, 0.0, 1.0],
            ]
        )
        nptest.assert_array_almost_equal(K, expected)

    def test_from_matrix(self):
        """Test creating intrinsics from a matrix."""
        K = np.array(
            [
                [1200.0, 0.1, 640.0],
                [0.0, 1200.0, 480.0],
                [0.0, 0.0, 1.0],
            ]
        )

        intrinsics = PinholeCameraIntrinsics.from_matrix(K)

        self.assertAlmostEqual(intrinsics.fx, 1200.0)
        self.assertAlmostEqual(intrinsics.fy, 1200.0)
        self.assertAlmostEqual(intrinsics.cx, 640.0)
        self.assertAlmostEqual(intrinsics.cy, 480.0)
        self.assertAlmostEqual(intrinsics.skew, 0.1)

    def test_opencv_intrinsics_distortion(self):
        """Test OpenCV intrinsics with distortion coefficients."""
        intrinsics = OpenCVCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
            k1=-0.1,
            k2=0.05,
            p1=0.001,
            p2=-0.001,
            k3=0.002,
        )

        distortion = intrinsics.get_distortion_coeffs()
        expected = np.array([-0.1, 0.05, 0.001, -0.001, 0.002, 0.0, 0.0, 0.0])
        nptest.assert_array_almost_equal(distortion, expected)

    def test_fisheye_intrinsics_distortion(self):
        """Test fisheye intrinsics with distortion coefficients."""
        intrinsics = OpenCVFisheyeCameraIntrinsics(
            fx=500.0,
            fy=500.0,
            cx=320.0,
            cy=240.0,
            k1=0.1,
            k2=-0.05,
            k3=0.01,
            k4=0.02,
        )

        distortion = intrinsics.get_distortion_coeffs()
        expected = np.array([0.1, -0.05, 0.01, 0.02])
        nptest.assert_array_almost_equal(distortion, expected)

    def test_pinhole_no_distortion(self):
        """Test that pinhole intrinsics have no distortion."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        self.assertIsNone(intrinsics.get_distortion_coeffs())

    def test_camera_matrix_3x4(self):
        """Test the 3x4 camera projection matrix."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        P = intrinsics.camera_matrix_3x4()
        self.assertEqual(P.shape, (3, 4))

        # With identity extrinsics, P = K @ [I|0]
        K = intrinsics.intrinsic_matrix
        expected = K @ np.hstack([np.eye(3), np.zeros((3, 1))])
        nptest.assert_array_almost_equal(P, expected)

    def test_intrinsics_serialization(self):
        """Test serialization and deserialization of intrinsics."""
        intrinsics = OpenCVCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
            k1=-0.1,
            k2=0.05,
        )

        d = intrinsics.to_dict()
        intrinsics2 = OpenCVCameraIntrinsics.from_dict(d)

        self.assertEqual(intrinsics2.fx, intrinsics.fx)
        self.assertEqual(intrinsics2.fy, intrinsics.fy)
        self.assertEqual(intrinsics2.cx, intrinsics.cx)
        self.assertEqual(intrinsics2.cy, intrinsics.cy)
        self.assertEqual(intrinsics2.k1, intrinsics.k1)
        self.assertEqual(intrinsics2.k2, intrinsics.k2)


class StaticTransformTests(unittest.TestCase):
    """Tests for StaticTransform class."""

    def test_extrinsics_creation(self):
        """Test creating sensor extrinsics."""
        extrinsics = StaticTransform(
            translation=[1.0, 2.0, 3.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="ego",
        )

        self.assertEqual(extrinsics.translation, [1.0, 2.0, 3.0])
        self.assertEqual(extrinsics.quaternion, [0.0, 0.0, 0.0, 1.0])
        self.assertEqual(extrinsics.source_frame, "camera")
        self.assertEqual(extrinsics.target_frame, "ego")

    def test_extrinsics_default_values(self):
        """Test that translation and quaternion have sensible defaults."""
        extrinsics = StaticTransform(source_frame="camera")

        # translation defaults to zero
        self.assertEqual(extrinsics.translation, [0.0, 0.0, 0.0])
        # quaternion defaults to identity rotation
        self.assertEqual(extrinsics.quaternion, [0.0, 0.0, 0.0, 1.0])

    def test_extrinsics_source_frame_required(self):
        """Test that source_frame is required at construction."""
        with self.assertRaises(ValueError) as cm:
            StaticTransform()

        self.assertIn("source_frame", str(cm.exception))
        self.assertIn("required", str(cm.exception))

    def test_from_matrix_requires_source_frame(self):
        """Test that from_matrix raises ValueError without source_frame."""
        matrix = np.eye(4)
        matrix[:3, 3] = [1.0, 2.0, 3.0]

        with self.assertRaises(ValueError) as cm:
            StaticTransform.from_matrix(matrix)

        self.assertIn("source_frame", str(cm.exception))

    def test_rotation_matrix_identity(self):
        """Test rotation matrix for identity quaternion."""
        extrinsics = StaticTransform(
            source_frame="sensor",
            translation=[0.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
        )

        R = extrinsics.rotation_matrix
        nptest.assert_array_almost_equal(R, np.eye(3))

    def test_rotation_matrix_90deg_z(self):
        """Test rotation matrix for 90 degree rotation around z-axis."""
        # 90 degrees around z-axis: quat = [0, 0, sin(45), cos(45)]
        sin45 = np.sin(np.pi / 4)
        cos45 = np.cos(np.pi / 4)

        extrinsics = StaticTransform(
            source_frame="sensor",
            translation=[0.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, sin45, cos45],
        )

        R = extrinsics.rotation_matrix

        # Expected: rotate x -> y, y -> -x
        expected = np.array(
            [
                [0.0, -1.0, 0.0],
                [1.0, 0.0, 0.0],
                [0.0, 0.0, 1.0],
            ]
        )
        nptest.assert_array_almost_equal(R, expected)

    def test_transform_matrix(self):
        """Test the 4x4 extrinsic matrix."""
        extrinsics = StaticTransform(
            source_frame="sensor",
            translation=[1.0, 2.0, 3.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
        )

        T = extrinsics.transform_matrix
        self.assertEqual(T.shape, (4, 4))

        expected = np.eye(4)
        expected[:3, 3] = [1.0, 2.0, 3.0]
        nptest.assert_array_almost_equal(T, expected)

    def test_from_matrix_3x4(self):
        """Test creating extrinsics from a 3x4 matrix."""
        matrix = np.array(
            [
                [1.0, 0.0, 0.0, 5.0],
                [0.0, 1.0, 0.0, 10.0],
                [0.0, 0.0, 1.0, 15.0],
            ]
        )

        extrinsics = StaticTransform.from_matrix(
            matrix,
            source_frame="camera",
            target_frame="world",
        )

        nptest.assert_array_almost_equal(
            extrinsics.translation, [5.0, 10.0, 15.0]
        )
        nptest.assert_array_almost_equal(
            extrinsics.quaternion, [0.0, 0.0, 0.0, 1.0]
        )
        self.assertEqual(extrinsics.source_frame, "camera")
        self.assertEqual(extrinsics.target_frame, "world")

    def test_from_matrix_4x4(self):
        """Test creating extrinsics from a 4x4 matrix."""
        matrix = np.eye(4)
        matrix[:3, 3] = [1.0, 2.0, 3.0]

        extrinsics = StaticTransform.from_matrix(matrix, source_frame="sensor")

        nptest.assert_array_almost_equal(
            extrinsics.translation, [1.0, 2.0, 3.0]
        )
        self.assertEqual(extrinsics.source_frame, "sensor")

    def test_inverse(self):
        """Test inverse transformation."""
        extrinsics = StaticTransform(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="world",
        )

        inv = extrinsics.inverse()

        self.assertEqual(inv.source_frame, "world")
        self.assertEqual(inv.target_frame, "camera")
        nptest.assert_array_almost_equal(inv.translation, [-1.0, 0.0, 0.0])

        # T @ T_inv should be identity
        T = extrinsics.transform_matrix
        T_inv = inv.transform_matrix
        nptest.assert_array_almost_equal(T @ T_inv, np.eye(4))

    def test_compose(self):
        """Test composition of transformations."""
        # T1: A->B, translate by [1, 0, 0]
        t1 = StaticTransform(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="A",
            target_frame="B",
        )

        # T2: B->C, translate by [0, 2, 0]
        t2 = StaticTransform(
            translation=[0.0, 2.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="B",
            target_frame="C",
        )

        # Compose: A->B then B->C should give A->C
        # X_C = T_BC @ X_B = T_BC @ (T_AB @ X_A)
        # So T_AC = T_BC @ T_AB
        composed = t1.compose(t2)

        self.assertEqual(composed.source_frame, "A")
        self.assertEqual(composed.target_frame, "C")

        # Check transformation matrix: T_AC = T_BC @ T_AB
        # T_AB
        T1 = t1.transform_matrix
        # T_BC
        T2 = t2.transform_matrix
        # T_AC
        expected = T2 @ T1
        nptest.assert_array_almost_equal(composed.transform_matrix, expected)

        # Verify the composed transform does the right thing:
        # A point at origin in frame A should end up at [1, 2, 0] in frame C
        point_A = np.array([0, 0, 0, 1])
        point_C = composed.transform_matrix @ point_A
        nptest.assert_array_almost_equal(point_C[:3], [1.0, 2.0, 0.0])

    def test_extrinsics_serialization(self):
        """Test serialization and deserialization of extrinsics."""
        # Use exact unit quaternion: [0, 0, sin(45°), cos(45°)]
        sqrt2_2 = 0.7071067811865476
        extrinsics = StaticTransform(
            translation=[1.0, 2.0, 3.0],
            quaternion=[0.0, 0.0, sqrt2_2, sqrt2_2],
            source_frame="camera",
            target_frame="ego",
            timestamp=1234567890,
        )

        d = extrinsics.to_dict()
        extrinsics2 = StaticTransform.from_dict(d)

        nptest.assert_array_almost_equal(
            extrinsics2.translation, extrinsics.translation
        )
        nptest.assert_array_almost_equal(
            extrinsics2.quaternion, extrinsics.quaternion
        )
        self.assertEqual(extrinsics2.source_frame, extrinsics.source_frame)
        self.assertEqual(extrinsics2.target_frame, extrinsics.target_frame)
        self.assertEqual(extrinsics2.timestamp, extrinsics.timestamp)

    def test_compose_with_rotation(self):
        """Test composition with rotations, not just translations."""
        # T1: A->B, 90 degree rotation around z-axis
        sqrt2_2 = 0.7071067811865476
        t1 = StaticTransform(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, sqrt2_2, sqrt2_2],  # 90 deg around z
            source_frame="A",
            target_frame="B",
        )

        # T2: B->C, translation only
        t2 = StaticTransform(
            translation=[0.0, 1.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="B",
            target_frame="C",
        )

        composed = t1.compose(t2)

        self.assertEqual(composed.source_frame, "A")
        self.assertEqual(composed.target_frame, "C")

        # Verify a point transform: point at origin in A
        point_A = np.array([0, 0, 0, 1])
        point_C = composed.transform_matrix @ point_A
        # First rotate 90deg (x->y, y->-x) then translate by [1,0,0] -> [1,0,0]
        # Then translate by [0,1,0] in B frame -> [1,1,0]
        nptest.assert_array_almost_equal(point_C[:3], [1.0, 1.0, 0.0])

    def test_compose_frame_mismatch_raises(self):
        """Test that composing mismatched frames raises ValueError."""
        t1 = StaticTransform(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="A",
            target_frame="B",
        )

        t2 = StaticTransform(
            translation=[0.0, 1.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="C",  # Mismatch! Should be "B"
            target_frame="D",
        )

        with self.assertRaises(ValueError) as cm:
            t1.compose(t2)

        self.assertIn("Cannot compose", str(cm.exception))

    def test_compose_unspecified_target_frame_allowed(self):
        """Test that composition works when target_frame is unspecified."""
        t1 = StaticTransform(
            source_frame="A",
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
        )

        t2 = StaticTransform(
            source_frame="B",
            translation=[0.0, 1.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
        )

        composed = t1.compose(t2)
        self.assertEqual(composed.source_frame, "A")
        self.assertIsNone(composed.target_frame)

    def test_covariance_validation(self):
        """Test that covariance must have 6 elements."""
        StaticTransform(
            source_frame="sensor",
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            covariance=[0.01, 0.01, 0.01, 0.001, 0.001, 0.001],
        )

        with self.assertRaises(ValueError):
            StaticTransform(
                source_frame="sensor",
                translation=[1.0, 0.0, 0.0],
                quaternion=[0.0, 0.0, 0.0, 1.0],
                covariance=[0.01, 0.01],
            )

    def test_from_matrix_orthogonal_no_warning(self):
        """Test that orthogonal rotation matrix does not trigger warning."""
        import warnings

        # Valid orthogonal rotation matrix (90 deg around z)
        R = np.array(
            [
                [0.0, -1.0, 0.0],
                [1.0, 0.0, 0.0],
                [0.0, 0.0, 1.0],
            ]
        )
        matrix = np.eye(4)
        matrix[:3, :3] = R
        matrix[:3, 3] = [1.0, 2.0, 3.0]

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            StaticTransform.from_matrix(matrix, source_frame="sensor")
            # No warning should be raised for orthogonal matrix
            orthogonality_warnings = [
                x for x in w if "orthogonal" in str(x.message).lower()
            ]
            self.assertEqual(len(orthogonality_warnings), 0)

    def test_from_matrix_non_orthogonal_warns(self):
        """Test that non-orthogonal rotation matrix triggers warning."""
        import warnings

        # Non-orthogonal matrix (scaled, not a valid rotation)
        R = np.array(
            [
                [1.5, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 0.0, 1.0],
            ]
        )
        matrix = np.eye(4)
        matrix[:3, :3] = R
        matrix[:3, 3] = [1.0, 2.0, 3.0]

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            StaticTransform.from_matrix(matrix, source_frame="sensor")
            # Warning should be raised for non-orthogonal matrix
            orthogonality_warnings = [
                x for x in w if "orthogonal" in str(x.message).lower()
            ]
            self.assertEqual(len(orthogonality_warnings), 1)


class CameraProjectorTests(unittest.TestCase):
    """Tests for CameraProjector class."""

    def test_pinhole_projection(self):
        """Test pinhole projection of 3D points to 2D."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        projector = CameraProjector(intrinsics)

        # Point at (0, 0, 10) should project to principal point
        points_3d = np.array([[0.0, 0.0, 10.0]])
        points_2d = projector.project(points_3d, in_camera_frame=True)

        nptest.assert_array_almost_equal(points_2d, [[960.0, 540.0]])

    def test_pinhole_projection_multiple_points(self):
        """Test projection of multiple points."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        projector = CameraProjector(intrinsics)

        points_3d = np.array(
            [
                [0.0, 0.0, 10.0],
                [1.0, 0.0, 10.0],
                [0.0, 1.0, 10.0],
            ]
        )
        points_2d = projector.project(points_3d, in_camera_frame=True)

        expected = np.array(
            [
                [960.0, 540.0],
                # fx * (1/10) = 100
                [960.0 + 100.0, 540.0],
                # fy * (1/10) = 100
                [960.0, 540.0 + 100.0],
            ]
        )
        nptest.assert_array_almost_equal(points_2d, expected)

    def test_unproject_pinhole(self):
        """Test unprojection of 2D points to 3D."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        projector = CameraProjector(intrinsics)

        # Unproject principal point at depth 10
        points_2d = np.array([[960.0, 540.0]])
        depth = np.array([10.0])
        points_3d = projector.unproject(points_2d, depth, in_camera_frame=True)

        nptest.assert_array_almost_equal(points_3d, [[0.0, 0.0, 10.0]])

    def test_project_unproject_roundtrip(self):
        """Test that project -> unproject is identity (for pinhole)."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        projector = CameraProjector(intrinsics)

        original_3d = np.array(
            [
                [1.0, 2.0, 10.0],
                [-1.0, 0.5, 15.0],
                [0.0, 0.0, 5.0],
            ]
        )

        points_2d = projector.project(original_3d, in_camera_frame=True)
        depths = original_3d[:, 2]
        recovered_3d = projector.unproject(
            points_2d, depths, in_camera_frame=True
        )

        nptest.assert_array_almost_equal(recovered_3d, original_3d)

    def test_projection_with_extrinsics(self):
        """Test projection with camera-to-reference extrinsics."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        # Camera is at (0, 0, 0) looking down positive z
        # camera_to_reference: camera frame to world frame
        cam_to_world = StaticTransform(
            source_frame="camera",
            target_frame="world",
            translation=[0.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
        )

        projector = CameraProjector(intrinsics, cam_to_world)

        # Point at world (0, 0, 10) should project to principal point
        points_3d = np.array([[0.0, 0.0, 10.0]])
        points_2d = projector.project(points_3d, in_camera_frame=False)

        nptest.assert_array_almost_equal(points_2d, [[960.0, 540.0]])

    def test_opengl_convention(self):
        """Test OpenGL camera convention (z backward, y up)."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        projector = CameraProjector(
            intrinsics, camera_convention=CAMERA_CONVENTION_OPENGL
        )

        # In OpenGL, z is negative forward, y is up
        # A point at (0, 0, -10) in OpenGL = (0, 0, 10) in OpenCV
        points_3d = np.array([[0.0, 0.0, -10.0]])
        points_2d = projector.project(points_3d, in_camera_frame=True)

        nptest.assert_array_almost_equal(points_2d, [[960.0, 540.0]])

    def test_fisheye_projection(self):
        """Test fisheye projection using cv2.fisheye."""
        intrinsics = OpenCVFisheyeCameraIntrinsics(
            fx=500.0,
            fy=500.0,
            cx=320.0,
            cy=240.0,
            k1=0.1,
            k2=-0.05,
        )

        projector = CameraProjector(intrinsics)

        # Point on optical axis should project to principal point
        points_3d = np.array([[0.0, 0.0, 10.0]])
        points_2d = projector.project(points_3d, in_camera_frame=True)

        nptest.assert_array_almost_equal(points_2d, [[320.0, 240.0]])

    def test_fisheye_unprojection(self):
        """Test fisheye unprojection using cv2.fisheye."""
        intrinsics = OpenCVFisheyeCameraIntrinsics(
            fx=500.0,
            fy=500.0,
            cx=320.0,
            cy=240.0,
            k1=0.1,
            k2=-0.05,
        )

        projector = CameraProjector(intrinsics)

        # Principal point should unproject to optical axis
        points_2d = np.array([[320.0, 240.0]])
        depth = np.array([10.0])
        points_3d = projector.unproject(points_2d, depth, in_camera_frame=True)

        nptest.assert_array_almost_equal(points_3d, [[0.0, 0.0, 10.0]])

    def test_fisheye_roundtrip(self):
        """Test fisheye project/unproject roundtrip."""
        intrinsics = OpenCVFisheyeCameraIntrinsics(
            fx=500.0,
            fy=500.0,
            cx=320.0,
            cy=240.0,
            k1=0.1,
            k2=-0.05,
            k3=0.01,
            k4=-0.005,
        )

        projector = CameraProjector(intrinsics)

        # Original 3D points in camera frame
        original_3d = np.array(
            [
                [0.0, 0.0, 10.0],
                [1.0, 0.5, 10.0],
                [-0.5, 1.0, 10.0],
            ]
        )

        # Project to 2D then unproject back
        points_2d = projector.project(original_3d, in_camera_frame=True)
        depths = original_3d[:, 2]
        recovered_3d = projector.unproject(
            points_2d, depths, in_camera_frame=True
        )

        nptest.assert_array_almost_equal(recovered_3d, original_3d, decimal=5)

    def test_rational_model_roundtrip(self):
        """Test rational distortion model (k4-k6) project/unproject roundtrip."""
        # Intrinsics with rational model (k4, k5, k6 nonzero)
        intrinsics = OpenCVCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
            k1=-0.1,
            k2=0.05,
            p1=0.001,
            p2=-0.001,
            k3=0.01,
            # Rational model coefficient
            k4=0.001,
            k5=0.0002,
            k6=0.0001,
        )

        projector = CameraProjector(intrinsics)

        # Original 3D points
        original_3d = np.array(
            [
                [0.0, 0.0, 10.0],
                [1.0, 0.5, 10.0],
                [-0.5, 1.0, 10.0],
            ]
        )

        # Project to 2D then unproject back
        points_2d = projector.project(original_3d, in_camera_frame=True)
        depths = original_3d[:, 2]
        recovered_3d = projector.unproject(
            points_2d, depths, in_camera_frame=True
        )

        nptest.assert_array_almost_equal(recovered_3d, original_3d, decimal=5)

    def test_nontrivial_extrinsics_projection(self):
        """Test projection with translation, verifying hand-computed result."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        # Camera-to-world: camera is at (0, 0, -5) in world, looking at +z
        # (no rotation - identity quaternion)
        cam_to_world = StaticTransform(
            translation=[0.0, 0.0, -5.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="world",
        )

        projector = CameraProjector(intrinsics, cam_to_world)

        # A point at world (0, 0, 5) - 10 units in front of camera
        # In camera frame: world_to_cam inverts cam_to_world
        # cam_to_world: X_world = X_cam + [0,0,-5]
        # So world_to_cam: X_cam = X_world - [0,0,-5] = X_world + [0,0,5]
        # Point (0,0,5) in world -> (0,0,10) in camera frame
        world_point = np.array([[0.0, 0.0, 5.0]])

        points_2d = projector.project(world_point, in_camera_frame=False)

        # Point is on optical axis at z=10, should project to principal point
        nptest.assert_array_almost_equal(points_2d, [[960.0, 540.0]])

        # Test a point offset from optical axis
        # Point at (1, 0, 5) in world -> (1, 0, 10) in camera frame
        # u = fx * (x/z) + cx = 1000 * (1/10) + 960 = 1060
        # v = fy * (y/z) + cy = 1000 * (0/10) + 540 = 540
        world_point2 = np.array([[1.0, 0.0, 5.0]])
        points_2d2 = projector.project(world_point2, in_camera_frame=False)
        nptest.assert_array_almost_equal(points_2d2, [[1060.0, 540.0]])

    def test_from_reference_to_camera_constructor(self):
        """Test the from_reference_to_camera alternative constructor."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        # Create world-to-camera extrinsics (the "inverted" direction)
        # Camera at world (0, 0, -5), so world-to-camera adds 5 to z
        world_to_cam = StaticTransform(
            translation=[0.0, 0.0, 5.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="world",
            target_frame="camera",
        )

        # Use the alternative constructor
        projector = CameraProjector.from_reference_to_camera(
            intrinsics, world_to_cam
        )

        # Verify internal state is camera-to-reference
        self.assertEqual(projector.camera_to_reference.source_frame, "camera")
        self.assertEqual(projector.camera_to_reference.target_frame, "world")

        # World point at (0, 0, 5) should be 10 units in front of camera
        # (camera is at world z=-5, so point at z=5 is 10 units ahead)
        world_point = np.array([[0.0, 0.0, 5.0]])
        points_2d = projector.project(world_point, in_camera_frame=False)

        nptest.assert_array_almost_equal(points_2d, [[960.0, 540.0]])

    def test_intrinsics_mutation_reflected_in_projection(self):
        """Test that changes to intrinsics after projector creation are reflected."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        projector = CameraProjector(intrinsics)

        # Project a point at (1, 0, 10) with original intrinsics
        # u = fx * (1/10) + cx = 1000 * 0.1 + 960 = 1060
        points_3d = np.array([[1.0, 0.0, 10.0]])
        points_2d_before = projector.project(points_3d, in_camera_frame=True)
        nptest.assert_array_almost_equal(points_2d_before, [[1060.0, 540.0]])

        # Modify intrinsics after projector creation
        projector.intrinsics.fx = 2000.0

        # Project same point - should use updated fx
        # u = fx * (1/10) + cx = 2000 * 0.1 + 960 = 1160
        points_2d_after = projector.project(points_3d, in_camera_frame=True)
        nptest.assert_array_almost_equal(points_2d_after, [[1160.0, 540.0]])

    def test_extrinsics_mutation_reflected_in_projection(self):
        """Test that changes to extrinsics after projector creation are reflected."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        # Camera at origin, identity rotation
        cam_to_world = StaticTransform(
            translation=[0.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="world",
        )

        projector = CameraProjector(intrinsics, cam_to_world)

        # World point at (0, 0, 10) projects to principal point
        world_point = np.array([[0.0, 0.0, 10.0]])
        points_2d_before = projector.project(
            world_point, in_camera_frame=False
        )
        nptest.assert_array_almost_equal(points_2d_before, [[960.0, 540.0]])

        # Move camera 5 units back along z-axis (camera at world z=-5)
        # Now the world point (0, 0, 10) is 15 units in front of camera
        projector.camera_to_reference.translation = [0.0, 0.0, -5.0]

        # Project same world point - should use updated extrinsics
        # Point still on optical axis, projects to principal point
        points_2d_after = projector.project(world_point, in_camera_frame=False)
        nptest.assert_array_almost_equal(points_2d_after, [[960.0, 540.0]])

        # Test with an off-axis point to verify the transform changed
        # World point at (1, 0, 10): camera at z=-5 means point is at z=15 in camera frame
        # u = fx * (1/15) + cx = 1000 * (1/15) + 960 ≈ 1026.67
        world_point2 = np.array([[1.0, 0.0, 10.0]])
        points_2d2 = projector.project(world_point2, in_camera_frame=False)
        expected_u = 1000.0 * (1.0 / 15.0) + 960.0
        nptest.assert_array_almost_equal(points_2d2, [[expected_u, 540.0]])


class ReferenceTests(unittest.TestCase):
    """Tests for CameraIntrinsicsRef and StaticTransformRef."""

    def test_intrinsics_ref_creation(self):
        """Test creating an intrinsics reference."""
        ref = CameraIntrinsicsRef(ref="camera_front")
        self.assertEqual(ref.ref, "camera_front")

    def test_extrinsics_ref_creation(self):
        """Test creating an extrinsics reference."""
        ref = StaticTransformRef(ref="camera_front::ego")
        self.assertEqual(ref.ref, "camera_front::ego")

    def test_ref_serialization(self):
        """Test serialization of references."""
        ref = CameraIntrinsicsRef(ref="camera_front")
        d = ref.to_dict()
        ref2 = CameraIntrinsicsRef.from_dict(d)
        self.assertEqual(ref2.ref, ref.ref)


class DatasetIntegrationTests(unittest.TestCase):
    """Tests for camera data model integration with Dataset."""

    @drop_datasets
    def test_dataset_camera_intrinsics_property(self):
        """Test setting and getting camera intrinsics on a dataset."""
        dataset = fo.Dataset()

        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        dataset.camera_intrinsics = {"camera_front": intrinsics}

        self.assertIn("camera_front", dataset.camera_intrinsics)
        retrieved = dataset.camera_intrinsics["camera_front"]
        self.assertEqual(retrieved.fx, 1000.0)

    @drop_datasets
    def test_dataset_static_transforms_property(self):
        """Test setting and getting sensor extrinsics on a dataset."""
        dataset = fo.Dataset()

        extrinsics = StaticTransform(
            translation=[1.0, 0.0, 1.5],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="ego",
        )

        dataset.static_transforms = {"camera_front::ego": extrinsics}

        self.assertIn("camera_front::ego", dataset.static_transforms)
        retrieved = dataset.static_transforms["camera_front::ego"]
        self.assertEqual(retrieved.source_frame, "camera_front")
        self.assertEqual(retrieved.target_frame, "ego")

    @drop_datasets
    def test_dataset_persistence(self):
        """Test that camera data persists through save/reload."""
        dataset = fo.Dataset()
        dataset.persistent = True
        name = dataset.name

        intrinsics = OpenCVCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
            k1=-0.1,
        )
        # Use exact unit quaternion: [0, 0, sin(45°), cos(45°)]
        sqrt2_2 = 0.7071067811865476
        extrinsics = StaticTransform(
            translation=[1.0, 2.0, 3.0],
            quaternion=[0.0, 0.0, sqrt2_2, sqrt2_2],
            source_frame="camera",
            target_frame="world",
        )

        dataset.camera_intrinsics = {"camera": intrinsics}
        dataset.static_transforms = {"camera": extrinsics}
        dataset.save()

        dataset2 = fo.load_dataset(name)

        self.assertIn("camera", dataset2.camera_intrinsics)
        self.assertIn("camera", dataset2.static_transforms)

        retrieved_intrinsics = dataset2.camera_intrinsics["camera"]
        self.assertAlmostEqual(retrieved_intrinsics.fx, 1000.0)
        self.assertAlmostEqual(retrieved_intrinsics.k1, -0.1)

        retrieved_extrinsics = dataset2.static_transforms["camera"]
        nptest.assert_array_almost_equal(
            retrieved_extrinsics.translation, [1.0, 2.0, 3.0]
        )

        dataset2.delete()

    @drop_datasets
    def test_resolve_intrinsics_from_dataset(self):
        """Test resolving intrinsics from dataset-level storage."""
        dataset = fo.Dataset()

        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )
        dataset.camera_intrinsics = {"camera_front": intrinsics}

        sample = fo.Sample(filepath="test.jpg")
        sample["camera_intrinsics"] = CameraIntrinsicsRef(ref="camera_front")
        dataset.add_sample(sample)

        resolved = dataset.resolve_intrinsics(sample)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.fx, 1000.0)

    @drop_datasets
    def test_resolve_intrinsics_sample_override(self):
        """Test that sample-level intrinsics override dataset-level."""
        dataset = fo.Dataset()

        dataset_intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )
        dataset.camera_intrinsics = {"camera_front": dataset_intrinsics}

        sample_intrinsics = PinholeCameraIntrinsics(
            fx=1200.0,
            fy=1200.0,
            cx=640.0,
            cy=480.0,
        )

        sample = fo.Sample(filepath="test.jpg")
        sample["camera_intrinsics"] = sample_intrinsics
        dataset.add_sample(sample)

        resolved = dataset.resolve_intrinsics(sample)
        self.assertIsNotNone(resolved)
        # Sample override
        self.assertEqual(resolved.fx, 1200.0)

    @drop_datasets
    def test_resolve_transformation(self):
        """Test resolving extrinsics from dataset-level storage."""
        dataset = fo.Dataset()

        extrinsics = StaticTransform(
            translation=[1.0, 0.0, 1.5],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="ego",
        )
        dataset.static_transforms = {"camera_front::ego": extrinsics}

        sample = fo.Sample(filepath="test.jpg")
        dataset.add_sample(sample)

        resolved = dataset.resolve_transformation(
            sample, "camera_front", "ego"
        )
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.source_frame, "camera_front")
        self.assertEqual(resolved.target_frame, "ego")

    @drop_datasets
    def test_resolve_transformation_sample_override(self):
        """Test that sample-level extrinsics override dataset-level."""
        dataset = fo.Dataset()

        dataset_extrinsics = StaticTransform(
            translation=[1.0, 0.0, 1.5],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="ego",
        )
        dataset.static_transforms = {"camera_front::ego": dataset_extrinsics}

        sample_extrinsics = StaticTransform(
            translation=[99.0, 88.0, 77.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="ego",
        )

        sample = fo.Sample(filepath="test.jpg")
        sample["static_transforms"] = sample_extrinsics
        dataset.add_sample(sample)

        resolved = dataset.resolve_transformation(
            sample, "camera_front", "ego"
        )
        self.assertIsNotNone(resolved)
        # Sample-level should take precedence over dataset-level
        nptest.assert_array_almost_equal(
            resolved.translation, [99.0, 88.0, 77.0]
        )

    @drop_datasets
    def test_resolve_transformation_sample_override_in_group(self):
        """Test that sample-level extrinsics override dataset-level in grouped datasets."""
        dataset = fo.Dataset()
        dataset.add_group_field("group", default="camera_front")

        # Dataset-level extrinsics keyed by slice name (group inference would find this)
        dataset_extrinsics = StaticTransform(
            translation=[1.0, 0.0, 1.5],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="world",
        )
        dataset.static_transforms = {"camera_front": dataset_extrinsics}

        # Sample-level extrinsics should take precedence
        sample_extrinsics = StaticTransform(
            translation=[99.0, 88.0, 77.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="world",
        )

        group = fo.Group()
        sample = fo.Sample(
            filepath="front.jpg",
            group=group.element("camera_front"),
        )
        sample["static_transforms"] = sample_extrinsics
        dataset.add_sample(sample)

        dataset.group_slice = "camera_front"
        sample_front = dataset.first()

        # Even without specifying source_frame (letting it infer from group),
        # sample-level extrinsics should take precedence
        resolved = dataset.resolve_transformation(sample_front)
        self.assertIsNotNone(resolved)
        # Sample-level should take precedence over dataset-level/group inference
        nptest.assert_array_almost_equal(
            resolved.translation, [99.0, 88.0, 77.0]
        )

    @drop_datasets
    def test_resolve_transformation_implied_world(self):
        """Test resolving extrinsics with implied world target."""
        dataset = fo.Dataset()

        extrinsics = StaticTransform(
            translation=[0.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="lidar",
            target_frame="world",
        )
        dataset.static_transforms = {"lidar": extrinsics}

        sample = fo.Sample(filepath="test.pcd")
        dataset.add_sample(sample)

        resolved = dataset.resolve_transformation(sample, "lidar", "world")
        self.assertIsNotNone(resolved)

        resolved2 = dataset.resolve_transformation(sample, "lidar")
        self.assertIsNotNone(resolved2)

    @drop_datasets
    def test_get_transform_chain(self):
        """Test computing chained transformations."""
        dataset = fo.Dataset()

        # camera -> ego
        cam_to_ego = StaticTransform(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="ego",
        )
        # ego -> world
        ego_to_world = StaticTransform(
            translation=[0.0, 10.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="ego",
            target_frame="world",
        )

        dataset.static_transforms = {
            "camera::ego": cam_to_ego,
            "ego::world": ego_to_world,
        }

        transform = dataset.get_transform_chain(
            "camera", "world", intermediate_frames=["ego"]
        )

        self.assertIsNotNone(transform)

        # The composed transform should be translation [1, 10, 0]
        T = transform.transform_matrix
        nptest.assert_array_almost_equal(T[:3, 3], [1.0, 10.0, 0.0])

    @drop_datasets
    def test_get_transform_chain_missing(self):
        """Test that missing transforms return None."""
        dataset = fo.Dataset()

        result = dataset.get_transform_chain("camera", "world")
        self.assertIsNone(result)

    @drop_datasets
    def test_resolve_transformation_chain_via_dataset_level(self):
        """Test resolve_transformation with chain_via using dataset-level transforms."""
        dataset = fo.Dataset()

        # camera -> ego (dataset level)
        cam_to_ego = StaticTransform(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="ego",
        )
        # ego -> world (dataset level)
        ego_to_world = StaticTransform(
            translation=[0.0, 10.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="ego",
            target_frame="world",
        )

        dataset.static_transforms = {
            "camera::ego": cam_to_ego,
            "ego::world": ego_to_world,
        }

        sample = fo.Sample(filepath="test.jpg")
        dataset.add_sample(sample)

        # Direct lookup should fail (no camera::world)
        resolved_direct = dataset.resolve_transformation(
            sample, "camera", "world"
        )
        self.assertIsNone(resolved_direct)

        # Chain via ego should work
        resolved_chain = dataset.resolve_transformation(
            sample, "camera", "world", chain_via=["ego"]
        )
        self.assertIsNotNone(resolved_chain)

        # Composed transform: [1, 0, 0] + [0, 10, 0] = [1, 10, 0]
        nptest.assert_array_almost_equal(
            resolved_chain.translation, [1.0, 10.0, 0.0]
        )
        self.assertEqual(resolved_chain.source_frame, "camera")
        self.assertEqual(resolved_chain.target_frame, "world")

    @drop_datasets
    def test_resolve_transformation_chain_via_mixed_levels(self):
        """Test resolve_transformation with chain_via mixing sample and dataset levels."""
        dataset = fo.Dataset()

        # camera -> ego (dataset level, static calibration)
        cam_to_ego = StaticTransform(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="ego",
        )
        dataset.static_transforms = {"camera::ego": cam_to_ego}

        # ego -> world (sample level, dynamic pose)
        ego_to_world = StaticTransform(
            translation=[100.0, 50.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="ego",
            target_frame="world",
        )

        sample = fo.Sample(filepath="test.jpg")
        sample["ego_pose"] = ego_to_world
        dataset.add_sample(sample)

        # Chain via ego: dataset-level camera->ego + sample-level ego->world
        resolved = dataset.resolve_transformation(
            sample, "camera", "world", chain_via=["ego"]
        )
        self.assertIsNotNone(resolved)

        # Composed transform: [1, 0, 0] + [100, 50, 0] = [101, 50, 0]
        nptest.assert_array_almost_equal(
            resolved.translation, [101.0, 50.0, 0.0]
        )

    @drop_datasets
    def test_resolve_transformation_chain_via_missing_hop(self):
        """Test that chain_via returns None if any hop is missing."""
        dataset = fo.Dataset()

        # Only camera -> ego, missing ego -> world
        cam_to_ego = StaticTransform(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="ego",
        )
        dataset.static_transforms = {"camera::ego": cam_to_ego}

        sample = fo.Sample(filepath="test.jpg")
        dataset.add_sample(sample)

        # Chain should fail because ego->world is missing
        resolved = dataset.resolve_transformation(
            sample, "camera", "world", chain_via=["ego"]
        )
        self.assertIsNone(resolved)

    @drop_datasets
    def test_resolve_transformation_chain_via_in_group(self):
        """Test resolve_transformation with chain_via in a grouped dataset."""
        dataset = fo.Dataset()
        dataset.add_group_field("group", default="left")

        # left -> ego (dataset level, static calibration)
        left_to_ego = StaticTransform(
            translation=[1.5, 0.5, 1.2],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="left",
            target_frame="ego",
        )
        dataset.static_transforms = {"left::ego": left_to_ego}

        # ego -> world (sample level, dynamic pose)
        ego_to_world = StaticTransform(
            translation=[100.0, 50.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="ego",
            target_frame="world",
        )

        group = fo.Group()
        sample = fo.Sample(
            filepath="left.jpg",
            group=group.element("left"),
        )
        sample["ego_pose"] = ego_to_world
        dataset.add_sample(sample)

        dataset.group_slice = "left"
        sample_left = dataset.first()

        # Without source_frame (inferred from group slice), chain via ego
        resolved = dataset.resolve_transformation(
            sample_left, target_frame="world", chain_via=["ego"]
        )
        self.assertIsNotNone(resolved)

        # Composed: [1.5, 0.5, 1.2] + [100, 50, 0] = [101.5, 50.5, 1.2]
        nptest.assert_array_almost_equal(
            resolved.translation, [101.5, 50.5, 1.2]
        )

    @drop_datasets
    def test_resolve_transformation_direct_takes_priority_over_chain(self):
        """Test that direct match is returned even when chain_via is provided."""
        dataset = fo.Dataset()

        # Direct camera -> world
        cam_to_world_direct = StaticTransform(
            translation=[999.0, 888.0, 777.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="world",
        )
        # Also have camera -> ego -> world path
        cam_to_ego = StaticTransform(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="ego",
        )
        ego_to_world = StaticTransform(
            translation=[0.0, 10.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="ego",
            target_frame="world",
        )

        dataset.static_transforms = {
            "camera::world": cam_to_world_direct,
            "camera::ego": cam_to_ego,
            "ego::world": ego_to_world,
        }

        sample = fo.Sample(filepath="test.jpg")
        dataset.add_sample(sample)

        # Even with chain_via, direct match should be returned
        resolved = dataset.resolve_transformation(
            sample, "camera", "world", chain_via=["ego"]
        )
        self.assertIsNotNone(resolved)

        # Should get the direct transform, not the chained one
        nptest.assert_array_almost_equal(
            resolved.translation, [999.0, 888.0, 777.0]
        )

    @drop_datasets
    def test_sample_with_multiple_extrinsics_refs(self):
        """Test sample with multiple extrinsics references."""
        dataset = fo.Dataset()

        cam_to_ego = StaticTransform(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="ego",
        )
        # Use exact unit quaternion for small rotation around z-axis
        norm = math.sqrt(0.1**2 + 0.995**2)
        ego_to_world = StaticTransform(
            translation=[100.0, 200.0, 0.0],
            quaternion=[0.0, 0.0, 0.1 / norm, 0.995 / norm],
            source_frame="ego",
            target_frame="world",
        )
        dataset.static_transforms = {
            "camera::ego": cam_to_ego,
            "ego::world": ego_to_world,
        }

        sample = fo.Sample(filepath="test.jpg")
        sample["static_transforms"] = [
            StaticTransformRef(ref="camera::ego"),
            StaticTransformRef(ref="ego::world"),
        ]
        dataset.add_sample(sample)

        resolved_cam = dataset.resolve_transformation(sample, "camera", "ego")
        self.assertIsNotNone(resolved_cam)
        nptest.assert_array_almost_equal(
            resolved_cam.translation, [1.0, 0.0, 0.0]
        )

        resolved_ego = dataset.resolve_transformation(sample, "ego", "world")
        self.assertIsNotNone(resolved_ego)
        nptest.assert_array_almost_equal(
            resolved_ego.translation, [100.0, 200.0, 0.0]
        )

    @drop_datasets
    def test_sample_with_inline_extrinsics(self):
        """Test sample with inline (non-referenced) extrinsics."""
        dataset = fo.Dataset()

        # Store static transform at dataset level
        cam_to_ego = StaticTransform(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="ego",
        )
        dataset.static_transforms = {"camera::ego": cam_to_ego}

        # Dynamic ego to world pose stored inline on sample
        norm = math.sqrt(0.1**2 + 0.995**2)
        ego_to_world = StaticTransform(
            translation=[100.0, 200.0, 0.0],
            quaternion=[0.0, 0.0, 0.1 / norm, 0.995 / norm],
            source_frame="ego",
            target_frame="world",
        )

        sample = fo.Sample(filepath="test.jpg")
        sample["static_transforms"] = [ego_to_world]
        dataset.add_sample(sample)

        resolved_cam = dataset.resolve_transformation(sample, "camera", "ego")
        self.assertIsNotNone(resolved_cam)

        resolved_ego = dataset.resolve_transformation(sample, "ego", "world")
        self.assertIsNotNone(resolved_ego)
        nptest.assert_array_almost_equal(
            resolved_ego.translation, [100.0, 200.0, 0.0]
        )

    @drop_datasets
    def test_resolve_intrinsics_from_group_slice(self):
        """Test resolving intrinsics by inferring from group slice name."""
        dataset = fo.Dataset()
        dataset.add_group_field("group", default="camera_front")

        # Set up intrinsics keyed by slice names
        intrinsics_front = PinholeCameraIntrinsics(
            fx=1000.0, fy=1000.0, cx=960.0, cy=540.0
        )
        intrinsics_rear = PinholeCameraIntrinsics(
            fx=800.0, fy=800.0, cx=640.0, cy=480.0
        )
        dataset.camera_intrinsics = {
            "camera_front": intrinsics_front,
            "camera_rear": intrinsics_rear,
        }

        group = fo.Group()
        samples = [
            fo.Sample(
                filepath="front.jpg",
                group=group.element("camera_front"),
            ),
            fo.Sample(
                filepath="rear.jpg",
                group=group.element("camera_rear"),
            ),
        ]
        dataset.add_samples(samples)

        dataset.group_slice = "camera_front"
        sample_front = dataset.first()

        resolved_front = dataset.resolve_intrinsics(sample_front)
        self.assertIsNotNone(resolved_front)
        self.assertEqual(resolved_front.fx, 1000.0)

        dataset.group_slice = "camera_rear"
        sample_rear = dataset.first()

        resolved_rear = dataset.resolve_intrinsics(sample_rear)
        self.assertIsNotNone(resolved_rear)
        self.assertEqual(resolved_rear.fx, 800.0)

    @drop_datasets
    def test_resolve_intrinsics_group_slice_not_found(self):
        """Test that resolve_intrinsics returns None if slice not in intrinsics."""
        dataset = fo.Dataset()
        dataset.add_group_field("group", default="camera_front")

        intrinsics_front = PinholeCameraIntrinsics(
            fx=1000.0, fy=1000.0, cx=960.0, cy=540.0
        )
        dataset.camera_intrinsics = {"camera_front": intrinsics_front}

        group = fo.Group()
        samples = [
            fo.Sample(
                filepath="front.jpg",
                group=group.element("camera_front"),
            ),
            fo.Sample(
                filepath="side.jpg",
                # No intrinsics for this
                group=group.element("camera_side"),
            ),
        ]
        dataset.add_samples(samples)

        dataset.group_slice = "camera_side"
        sample_side = dataset.first()

        resolved = dataset.resolve_intrinsics(sample_side)
        self.assertIsNone(resolved)

    @drop_datasets
    def test_resolve_transformation_from_group_slice(self):
        """Test resolving extrinsics by inferring source_frame from group slice name."""
        dataset = fo.Dataset()
        dataset.add_group_field("group", default="camera_front")

        # Set up extrinsics keyed by slice names
        extrinsics_front = StaticTransform(
            translation=[1.0, 0.0, 1.5],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="world",
        )
        extrinsics_rear = StaticTransform(
            translation=[-1.0, 0.0, 1.5],
            quaternion=[0.0, 0.0, 1.0, 0.0],
            source_frame="camera_rear",
            target_frame="world",
        )
        dataset.static_transforms = {
            "camera_front": extrinsics_front,
            "camera_rear": extrinsics_rear,
        }

        group = fo.Group()
        samples = [
            fo.Sample(
                filepath="front.jpg",
                group=group.element("camera_front"),
            ),
            fo.Sample(
                filepath="rear.jpg",
                group=group.element("camera_rear"),
            ),
        ]
        dataset.add_samples(samples)

        dataset.group_slice = "camera_front"
        sample_front = dataset.first()

        resolved_front = dataset.resolve_transformation(sample_front)
        self.assertIsNotNone(resolved_front)
        self.assertEqual(resolved_front.translation[0], 1.0)

        dataset.group_slice = "camera_rear"
        sample_rear = dataset.first()

        resolved_rear = dataset.resolve_transformation(sample_rear)
        self.assertIsNotNone(resolved_rear)
        self.assertEqual(resolved_rear.translation[0], -1.0)

    @drop_datasets
    def test_resolve_transformation_group_slice_not_found(self):
        """Test that resolve_transformation returns None if slice not in extrinsics."""
        dataset = fo.Dataset()
        dataset.add_group_field("group", default="camera_front")

        extrinsics_front = StaticTransform(
            translation=[1.0, 0.0, 1.5],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="world",
        )
        dataset.static_transforms = {"camera_front": extrinsics_front}

        group = fo.Group()
        samples = [
            fo.Sample(
                filepath="front.jpg",
                group=group.element("camera_front"),
            ),
            fo.Sample(
                filepath="side.jpg",
                group=group.element("camera_side"),  # No extrinsics for this
            ),
        ]
        dataset.add_samples(samples)

        dataset.group_slice = "camera_side"
        sample_side = dataset.first()

        resolved = dataset.resolve_transformation(sample_side)
        self.assertIsNone(resolved)

    @drop_datasets
    def test_add_intrinsics(self):
        """Test adding intrinsics using the ergonomic add_intrinsics method."""
        dataset = fo.Dataset()

        # Add first intrinsics
        intrinsics1 = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )
        dataset.add_intrinsics("camera_front", intrinsics1)

        self.assertIn("camera_front", dataset.camera_intrinsics)
        retrieved1 = dataset.camera_intrinsics["camera_front"]
        self.assertEqual(retrieved1.fx, 1000.0)

        # Add second intrinsics (should not overwrite first)
        intrinsics2 = OpenCVCameraIntrinsics(
            fx=800.0,
            fy=800.0,
            cx=640.0,
            cy=360.0,
            k1=-0.1,
        )
        dataset.add_intrinsics("camera_rear", intrinsics2)

        # Both should exist
        self.assertIn("camera_front", dataset.camera_intrinsics)
        self.assertIn("camera_rear", dataset.camera_intrinsics)
        self.assertEqual(dataset.camera_intrinsics["camera_front"].fx, 1000.0)
        self.assertEqual(dataset.camera_intrinsics["camera_rear"].fx, 800.0)
        self.assertEqual(dataset.camera_intrinsics["camera_rear"].k1, -0.1)

    @drop_datasets
    def test_add_intrinsics_type_error(self):
        """Test that add_intrinsics raises TypeError for invalid input."""
        dataset = fo.Dataset()

        with self.assertRaises(TypeError) as cm:
            dataset.add_intrinsics("camera_front", {"fx": 1000.0})

        self.assertIn("CameraIntrinsics", str(cm.exception))

    @drop_datasets
    def test_add_static_transform_with_frames_in_object(self):
        """Test adding extrinsics with source/target frames in the object."""
        dataset = fo.Dataset()

        extrinsics = StaticTransform(
            translation=[1.5, 0.0, 1.2],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="ego",
        )
        dataset.add_static_transform(extrinsics)

        # Key should be auto-generated
        self.assertIn("camera_front::ego", dataset.static_transforms)
        retrieved = dataset.static_transforms["camera_front::ego"]
        self.assertEqual(retrieved.source_frame, "camera_front")
        self.assertEqual(retrieved.target_frame, "ego")
        nptest.assert_array_almost_equal(
            retrieved.translation, [1.5, 0.0, 1.2]
        )

    @drop_datasets
    def test_add_static_transform_with_both_frames(self):
        """Test adding extrinsics with both source and target frames set."""
        dataset = fo.Dataset()

        extrinsics = StaticTransform(
            translation=[0.0, 0.0, 2.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="lidar",
            target_frame="ego",
        )
        dataset.add_static_transform(extrinsics)

        self.assertIn("lidar::ego", dataset.static_transforms)
        retrieved = dataset.static_transforms["lidar::ego"]
        self.assertEqual(retrieved.source_frame, "lidar")
        self.assertEqual(retrieved.target_frame, "ego")

    @drop_datasets
    def test_add_static_transform_default_target_frame(self):
        """Test that target_frame defaults to 'world' if not specified."""
        dataset = fo.Dataset()

        extrinsics = StaticTransform(
            translation=[1.0, 2.0, 3.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="sensor",
        )
        dataset.add_static_transform(extrinsics)

        # Key should use "world" as default target
        self.assertIn("sensor::world", dataset.static_transforms)
        retrieved = dataset.static_transforms["sensor::world"]
        self.assertEqual(retrieved.target_frame, "world")

    @drop_datasets
    def test_add_static_transform_multiple(self):
        """Test adding multiple extrinsics incrementally."""
        dataset = fo.Dataset()

        # Add first extrinsics
        ext1 = StaticTransform(
            translation=[1.0, 0.0, 1.5],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="ego",
        )
        dataset.add_static_transform(ext1)

        # Add second extrinsics
        ext2 = StaticTransform(
            translation=[0.0, 0.0, 0.5],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="ego",
            target_frame="world",
        )
        dataset.add_static_transform(ext2)

        # Both should exist
        self.assertIn("camera::ego", dataset.static_transforms)
        self.assertIn("ego::world", dataset.static_transforms)

    def test_static_transforms_requires_source_frame(self):
        """Test that StaticTransform constructor requires source_frame."""
        with self.assertRaises(ValueError) as cm:
            StaticTransform(
                translation=[1.0, 0.0, 1.5],
                quaternion=[0.0, 0.0, 0.0, 1.0],
            )

        self.assertIn("source_frame", str(cm.exception))
        self.assertIn("required", str(cm.exception))

    @drop_datasets
    def test_add_static_transform_type_error(self):
        """Test that add_static_transform raises TypeError for invalid input."""
        dataset = fo.Dataset()

        with self.assertRaises(TypeError) as cm:
            dataset.add_static_transform({"translation": [1.0, 0.0, 1.5]})

        self.assertIn("StaticTransform", str(cm.exception))


class StaticTransformValidationTests(unittest.TestCase):
    """Tests for static_transforms key/field validation."""

    @drop_datasets
    def test_static_transforms_valid_matching_key_and_fields(self):
        """Test that valid extrinsics with matching key and fields passes."""
        dataset = fo.Dataset()

        extrinsics = StaticTransform(
            translation=[1.5, 0.0, 1.2],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="ego",
        )

        dataset.static_transforms = {"camera_front::ego": extrinsics}

        self.assertIn("camera_front::ego", dataset.static_transforms)

    @drop_datasets
    def test_static_transforms_valid_implied_world_target(self):
        """Test that key without :: implies world target."""
        dataset = fo.Dataset()

        extrinsics = StaticTransform(
            translation=[0.0, 0.0, 2.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="lidar",
            target_frame="world",
        )

        dataset.static_transforms = {"lidar": extrinsics}

        self.assertIn("lidar", dataset.static_transforms)

    def test_static_transforms_missing_source_frame_raises(self):
        """Test that StaticTransform with None source_frame raises ValueError at construction."""
        # source_frame is required at construction time
        with self.assertRaises(ValueError) as cm:
            StaticTransform(
                translation=[1.5, 0.0, 1.2],
                quaternion=[0.0, 0.0, 0.0, 1.0],
                # source_frame is None (required)
            )

        self.assertIn("source_frame", str(cm.exception))

    @drop_datasets
    def test_static_transforms_mismatched_source_frame(self):
        """Test that mismatched source_frame raises ValueError."""
        dataset = fo.Dataset()

        extrinsics = StaticTransform(
            translation=[1.5, 0.0, 1.2],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="wrong_source",  # Doesn't match key
            target_frame="ego",
        )

        with self.assertRaises(ValueError) as cm:
            dataset.static_transforms = {"camera_front::ego": extrinsics}

        self.assertIn("source_frame", str(cm.exception))
        self.assertIn("camera_front", str(cm.exception))
        self.assertIn("wrong_source", str(cm.exception))

    @drop_datasets
    def test_static_transforms_mismatched_target_frame(self):
        """Test that mismatched target_frame raises ValueError."""
        dataset = fo.Dataset()

        extrinsics = StaticTransform(
            translation=[1.5, 0.0, 1.2],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="wrong_target",  # Doesn't match key
        )

        with self.assertRaises(ValueError) as cm:
            dataset.static_transforms = {"camera_front::ego": extrinsics}

        self.assertIn("target_frame", str(cm.exception))
        self.assertIn("ego", str(cm.exception))
        self.assertIn("wrong_target", str(cm.exception))

    @drop_datasets
    def test_static_transforms_mismatched_implied_world(self):
        """Test that mismatched target_frame with implied world raises."""
        dataset = fo.Dataset()

        extrinsics = StaticTransform(
            translation=[0.0, 0.0, 2.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="lidar",
            # Key "lidar" implies "world", not "ego"
            target_frame="ego",
        )

        with self.assertRaises(ValueError) as cm:
            dataset.static_transforms = {"lidar": extrinsics}

        self.assertIn("target_frame", str(cm.exception))
        self.assertIn("world", str(cm.exception))
        self.assertIn("ego", str(cm.exception))

    @drop_datasets
    def test_static_transforms_multiple_valid(self):
        """Test multiple valid extrinsics in one assignment."""
        dataset = fo.Dataset()

        extrinsics_dict = {
            "camera_front::ego": StaticTransform(
                translation=[1.5, 0.0, 1.2],
                quaternion=[0.0, 0.0, 0.0, 1.0],
                source_frame="camera_front",
                target_frame="ego",
            ),
            "lidar::ego": StaticTransform(
                translation=[0.0, 0.0, 2.0],
                quaternion=[0.0, 0.0, 0.0, 1.0],
                source_frame="lidar",
                target_frame="ego",
            ),
            "ego": StaticTransform(
                translation=[100.0, 200.0, 0.0],
                quaternion=[0.0, 0.0, 0.0, 1.0],
                source_frame="ego",
                target_frame="world",
            ),
        }

        dataset.static_transforms = extrinsics_dict

        self.assertEqual(len(dataset.static_transforms), 3)

    @drop_datasets
    def test_static_transforms_partial_fields_source_only(self):
        """Test validation with only source_frame set (target_frame=None implies world)."""
        dataset = fo.Dataset()

        # source_frame matches (required), target_frame is None (implies "world")
        extrinsics = StaticTransform(
            translation=[1.5, 0.0, 1.2],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            # target_frame is None, which is treated as "world"
        )

        # Key uses implied "world" target (no ::target suffix)
        dataset.static_transforms = {"camera_front": extrinsics}
        self.assertIn("camera_front", dataset.static_transforms)

    def test_static_transforms_partial_fields_target_only_raises(self):
        """Test that missing source_frame raises ValueError at construction even if target_frame is set."""
        # source_frame is None (required), target_frame matches
        # Validation happens at construction time, not at dataset assignment
        with self.assertRaises(ValueError) as cm:
            StaticTransform(
                translation=[1.5, 0.0, 1.2],
                quaternion=[0.0, 0.0, 0.0, 1.0],
                # source_frame is None
                target_frame="ego",
            )

        self.assertIn("source_frame", str(cm.exception))
        self.assertIn("required", str(cm.exception).lower())


class PolymorphicIntrinsicsTests(unittest.TestCase):
    """Tests for polymorphic intrinsics storage."""

    @drop_datasets
    def test_mixed_intrinsics_types(self):
        """Test storing different intrinsics types in same dataset."""
        dataset = fo.Dataset()

        pinhole = PinholeCameraIntrinsics(
            fx=1000.0, fy=1000.0, cx=960.0, cy=540.0
        )
        opencv = OpenCVCameraIntrinsics(
            fx=800.0, fy=800.0, cx=640.0, cy=480.0, k1=-0.1
        )
        fisheye = OpenCVFisheyeCameraIntrinsics(
            fx=500.0, fy=500.0, cx=320.0, cy=240.0, k1=0.05
        )

        dataset.camera_intrinsics = {
            "camera_front": pinhole,
            "camera_side": opencv,
            "camera_fisheye": fisheye,
        }

        # Verify types are preserved
        self.assertIsInstance(
            dataset.camera_intrinsics["camera_front"],
            PinholeCameraIntrinsics,
        )
        self.assertIsInstance(
            dataset.camera_intrinsics["camera_side"],
            OpenCVCameraIntrinsics,
        )
        self.assertIsInstance(
            dataset.camera_intrinsics["camera_fisheye"],
            OpenCVFisheyeCameraIntrinsics,
        )


class CustomDerivationTests(unittest.TestCase):
    """Tests for custom classes derived from CameraIntrinsics and StaticTransform."""

    def test_custom_camera_intrinsics_derivation(self):
        """Test that customers can derive custom classes from CameraIntrinsics."""

        class CustomIntrinsics(CameraIntrinsics):
            """Custom intrinsics with additional field."""

            custom_field = fof.StringField(default="custom_value")

        intrinsics = CustomIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
            custom_field="test_value",
        )

        self.assertEqual(intrinsics.fx, 1000.0)
        self.assertEqual(intrinsics.fy, 1000.0)
        self.assertEqual(intrinsics.cx, 960.0)
        self.assertEqual(intrinsics.cy, 540.0)
        self.assertEqual(intrinsics.custom_field, "test_value")

        K = intrinsics.intrinsic_matrix
        self.assertEqual(K.shape, (3, 3))
        self.assertEqual(K[0, 0], 1000.0)
        self.assertEqual(K[1, 1], 1000.0)

    def test_custom_camera_intrinsics_serialization(self):
        """Test serialization of custom CameraIntrinsics subclass."""

        class CustomIntrinsics(CameraIntrinsics):
            custom_field = fof.StringField(default="default")

        intrinsics = CustomIntrinsics(
            fx=1000.0, fy=1000.0, cx=960.0, cy=540.0, custom_field="test"
        )

        d = intrinsics.to_dict()
        intrinsics2 = CustomIntrinsics.from_dict(d)

        self.assertEqual(intrinsics2.fx, 1000.0)
        self.assertEqual(intrinsics2.custom_field, "test")

    def test_custom_camera_extrinsics_derivation(self):
        """Test that customers can derive custom classes from StaticTransform."""

        class CustomExtrinsics(StaticTransform):
            """Custom extrinsics with additional field."""

            custom_field = fof.StringField(default="custom_value")

        extrinsics = CustomExtrinsics(
            translation=[1.0, 2.0, 3.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            custom_field="test_value",
        )

        self.assertEqual(extrinsics.translation, [1.0, 2.0, 3.0])
        self.assertEqual(extrinsics.quaternion, [0.0, 0.0, 0.0, 1.0])
        self.assertEqual(extrinsics.custom_field, "test_value")

        R = extrinsics.rotation_matrix
        nptest.assert_array_almost_equal(R, np.eye(3))

        T = extrinsics.transform_matrix
        self.assertEqual(T.shape, (4, 4))

    def test_custom_camera_extrinsics_alias_derivation(self):
        """Test that customers can derive from StaticTransform alias."""

        class CustomExtrinsics(StaticTransform):
            custom_field = fof.StringField(default="default")

        extrinsics = CustomExtrinsics(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            custom_field="test",
        )

        self.assertEqual(extrinsics.translation, [1.0, 0.0, 0.0])
        self.assertEqual(extrinsics.custom_field, "test")

    def test_custom_extrinsics_serialization(self):
        """Test serialization of custom StaticTransform subclass."""

        class CustomExtrinsics(StaticTransform):
            custom_field = fof.StringField(default="default")

        extrinsics = CustomExtrinsics(
            translation=[1.0, 2.0, 3.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            custom_field="test",
        )

        d = extrinsics.to_dict()
        extrinsics2 = CustomExtrinsics.from_dict(d)

        nptest.assert_array_almost_equal(
            extrinsics2.translation, [1.0, 2.0, 3.0]
        )
        self.assertEqual(extrinsics2.custom_field, "test")

    @drop_datasets
    def test_custom_intrinsics_with_dataset(self):
        """Test using custom CameraIntrinsics subclass with dataset."""

        class CustomIntrinsics(CameraIntrinsics):
            sensor_id = fof.StringField(default="unknown")

        dataset = fo.Dataset()

        intrinsics = CustomIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
            sensor_id="camera_001",
        )

        dataset.camera_intrinsics = {"custom_camera": intrinsics}

        retrieved = dataset.camera_intrinsics["custom_camera"]
        self.assertIsInstance(retrieved, CustomIntrinsics)
        self.assertEqual(retrieved.fx, 1000.0)
        self.assertEqual(retrieved.sensor_id, "camera_001")

    @drop_datasets
    def test_custom_extrinsics_with_dataset(self):
        """Test using custom StaticTransform subclass with dataset."""

        class CustomExtrinsics(StaticTransform):
            sensor_id = fof.StringField(default="unknown")

        dataset = fo.Dataset()

        extrinsics = CustomExtrinsics(
            translation=[1.0, 0.0, 1.5],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="ego",
            sensor_id="camera_001",
        )

        dataset.static_transforms = {"camera::ego": extrinsics}

        retrieved = dataset.static_transforms["camera::ego"]
        self.assertIsInstance(retrieved, CustomExtrinsics)
        self.assertEqual(retrieved.source_frame, "camera")
        self.assertEqual(retrieved.sensor_id, "camera_001")

    def test_custom_intrinsics_with_projector(self):
        """Test using custom CameraIntrinsics with CameraProjector."""

        class CustomIntrinsics(CameraIntrinsics):
            pass

        intrinsics = CustomIntrinsics(fx=1000.0, fy=1000.0, cx=960.0, cy=540.0)

        projector = CameraProjector(intrinsics)

        points_3d = np.array([[0.0, 0.0, 10.0]])
        points_2d = projector.project(points_3d, in_camera_frame=True)

        nptest.assert_array_almost_equal(points_2d, [[960.0, 540.0]])


class CameraPersistenceTests(unittest.TestCase):
    """Tests for camera data model persistence through database round-trips.

    These tests verify that camera_intrinsics and static_transforms are
    properly re-instantiated as their correct class types
    after loading a dataset from the database.
    """

    @drop_datasets
    def test_intrinsics_type_preserved_after_reload(self):
        """Test that camera_intrinsics values are CameraIntrinsics instances after reload."""
        dataset = fo.Dataset()
        dataset.persistent = True
        name = dataset.name

        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )
        dataset.camera_intrinsics = {"camera_front": intrinsics}
        dataset.save()

        dataset2 = fo.load_dataset(name)

        retrieved = dataset2.camera_intrinsics["camera_front"]

        self.assertIsInstance(retrieved, CameraIntrinsics)
        self.assertNotIsInstance(retrieved, dict)

        dataset2.delete()

    @drop_datasets
    def test_intrinsics_polymorphism_preserved_after_reload(self):
        """Test that CameraIntrinsics subclasses are correctly restored after reload."""
        dataset = fo.Dataset()
        dataset.persistent = True
        name = dataset.name

        pinhole = PinholeCameraIntrinsics(
            fx=1000.0, fy=1000.0, cx=960.0, cy=540.0
        )
        opencv = OpenCVCameraIntrinsics(
            fx=1200.0, fy=1200.0, cx=640.0, cy=480.0, k1=-0.1, k2=0.05
        )
        fisheye = OpenCVFisheyeCameraIntrinsics(
            fx=500.0, fy=500.0, cx=320.0, cy=240.0, k1=0.1, k2=-0.05
        )

        dataset.camera_intrinsics = {
            "pinhole": pinhole,
            "opencv": opencv,
            "fisheye": fisheye,
        }
        dataset.save()

        dataset2 = fo.load_dataset(name)

        self.assertIsInstance(
            dataset2.camera_intrinsics["pinhole"], PinholeCameraIntrinsics
        )
        self.assertIsInstance(
            dataset2.camera_intrinsics["opencv"], OpenCVCameraIntrinsics
        )
        self.assertIsInstance(
            dataset2.camera_intrinsics["fisheye"],
            OpenCVFisheyeCameraIntrinsics,
        )

        dataset2.delete()

    @drop_datasets
    def test_extrinsics_type_preserved_after_reload(self):
        """Test that static_transforms values are StaticTransform instances after reload."""
        dataset = fo.Dataset()
        dataset.persistent = True
        name = dataset.name

        extrinsics = StaticTransform(
            translation=[1.0, 2.0, 3.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="world",
        )
        dataset.static_transforms = {"camera": extrinsics}
        dataset.save()

        dataset2 = fo.load_dataset(name)

        retrieved = dataset2.static_transforms["camera"]

        self.assertIsInstance(retrieved, StaticTransform)
        self.assertNotIsInstance(retrieved, dict)

        dataset2.delete()


class UndistortImageTests(unittest.TestCase):
    """Tests for image undistortion functionality."""

    def test_pinhole_undistort_returns_copy(self):
        """Test that pinhole (no distortion) returns a copy of the image."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0, fy=1000.0, cx=320.0, cy=240.0
        )
        image = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

        result = intrinsics.undistort_image(image)

        nptest.assert_array_equal(result, image)
        # Ensure it's a copy, not the same object
        self.assertIsNot(result, image)

    def test_opencv_undistort_image_shape(self):
        """Test that OpenCV undistort preserves image shape."""
        intrinsics = OpenCVCameraIntrinsics(
            fx=500.0,
            fy=500.0,
            cx=320.0,
            cy=240.0,
            k1=-0.2,
            k2=0.1,
        )
        image = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

        result = intrinsics.undistort_image(image)

        self.assertEqual(result.shape, image.shape)
        self.assertEqual(result.dtype, image.dtype)

    def test_opencv_undistort_grayscale(self):
        """Test undistortion works with grayscale images."""
        intrinsics = OpenCVCameraIntrinsics(
            fx=500.0, fy=500.0, cx=320.0, cy=240.0, k1=-0.1
        )
        image = np.random.randint(0, 255, (480, 640), dtype=np.uint8)

        result = intrinsics.undistort_image(image)

        self.assertEqual(result.shape, image.shape)

    def test_opencv_undistort_with_alpha(self):
        """Test undistortion with different alpha values."""
        intrinsics = OpenCVCameraIntrinsics(
            fx=500.0,
            fy=500.0,
            cx=320.0,
            cy=240.0,
            k1=-0.3,
            k2=0.1,
        )
        image = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

        result_alpha0 = intrinsics.undistort_image(image, alpha=0.0)
        result_alpha1 = intrinsics.undistort_image(image, alpha=1.0)

        # Both should have correct shape
        self.assertEqual(result_alpha0.shape, image.shape)
        self.assertEqual(result_alpha1.shape, image.shape)

        # Results should be different (different cropping)
        self.assertFalse(np.array_equal(result_alpha0, result_alpha1))

    def test_opencv_undistort_new_size(self):
        """Test undistortion with custom output size."""
        intrinsics = OpenCVCameraIntrinsics(
            fx=500.0, fy=500.0, cx=320.0, cy=240.0, k1=-0.1
        )
        image = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

        result = intrinsics.undistort_image(image, new_size=(800, 600))

        self.assertEqual(result.shape, (600, 800, 3))

    def test_fisheye_undistort_image_shape(self):
        """Test that fisheye undistort preserves image shape."""
        intrinsics = OpenCVFisheyeCameraIntrinsics(
            fx=400.0,
            fy=400.0,
            cx=320.0,
            cy=240.0,
            k1=0.1,
            k2=-0.05,
        )
        image = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

        result = intrinsics.undistort_image(image)

        self.assertEqual(result.shape, image.shape)
        self.assertEqual(result.dtype, image.dtype)

    def test_fisheye_undistort_with_alpha(self):
        """Test fisheye undistortion with different alpha values."""
        intrinsics = OpenCVFisheyeCameraIntrinsics(
            fx=400.0,
            fy=400.0,
            cx=320.0,
            cy=240.0,
            k1=0.2,
            k2=-0.1,
        )
        image = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

        result_alpha0 = intrinsics.undistort_image(image, alpha=0.0)
        result_alpha1 = intrinsics.undistort_image(image, alpha=1.0)

        self.assertEqual(result_alpha0.shape, image.shape)
        self.assertEqual(result_alpha1.shape, image.shape)

    def test_undistort_invalid_image_raises(self):
        """Test that invalid image dimensions raise ValueError."""
        intrinsics = OpenCVCameraIntrinsics(
            fx=500.0, fy=500.0, cx=320.0, cy=240.0
        )

        with self.assertRaises(ValueError):
            intrinsics.undistort_image(np.array([1, 2, 3]))  # 1D array

        with self.assertRaises(ValueError):
            intrinsics.undistort_image(np.zeros((2, 3, 4, 5)))  # 4D array


if __name__ == "__main__":
    unittest.main()
