"""
FiftyOne Camera data model unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import math
import unittest

import numpy as np
import numpy.testing as nptest
from decorators import drop_datasets

import fiftyone as fo
from fiftyone.core.camera import (
    CameraExtrinsics,
    CameraExtrinsicsRef,
    CameraIntrinsicsRef,
    CameraProjector,
    OpenCVCameraIntrinsics,
    OpenCVFisheyeCameraIntrinsics,
    PinholeCameraIntrinsics,
    SensorExtrinsics,
    SensorExtrinsicsRef,
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


class SensorExtrinsicsTests(unittest.TestCase):
    """Tests for SensorExtrinsics class."""

    def test_extrinsics_creation(self):
        """Test creating sensor extrinsics."""
        extrinsics = SensorExtrinsics(
            translation=[1.0, 2.0, 3.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="ego",
        )

        self.assertEqual(extrinsics.translation, [1.0, 2.0, 3.0])
        self.assertEqual(extrinsics.quaternion, [0.0, 0.0, 0.0, 1.0])
        self.assertEqual(extrinsics.source_frame, "camera")
        self.assertEqual(extrinsics.target_frame, "ego")

    def test_rotation_matrix_identity(self):
        """Test rotation matrix for identity quaternion."""
        extrinsics = SensorExtrinsics(
            translation=[0.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],  # identity
        )

        R = extrinsics.rotation_matrix
        nptest.assert_array_almost_equal(R, np.eye(3))

    def test_rotation_matrix_90deg_z(self):
        """Test rotation matrix for 90 degree rotation around z-axis."""
        # 90 degrees around z-axis: quat = [0, 0, sin(45), cos(45)]
        sin45 = np.sin(np.pi / 4)
        cos45 = np.cos(np.pi / 4)

        extrinsics = SensorExtrinsics(
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

    def test_extrinsic_matrix(self):
        """Test the 4x4 extrinsic matrix."""
        extrinsics = SensorExtrinsics(
            translation=[1.0, 2.0, 3.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
        )

        T = extrinsics.extrinsic_matrix
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

        extrinsics = SensorExtrinsics.from_matrix(
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

        extrinsics = SensorExtrinsics.from_matrix(matrix)

        nptest.assert_array_almost_equal(
            extrinsics.translation, [1.0, 2.0, 3.0]
        )

    def test_inverse(self):
        """Test inverse transformation."""
        extrinsics = SensorExtrinsics(
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
        T = extrinsics.extrinsic_matrix
        T_inv = inv.extrinsic_matrix
        nptest.assert_array_almost_equal(T @ T_inv, np.eye(4))

    def test_compose(self):
        """Test composition of transformations."""
        # T1: A->B, translate by [1, 0, 0]
        t1 = SensorExtrinsics(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="A",
            target_frame="B",
        )

        # T2: B->C, translate by [0, 2, 0]
        t2 = SensorExtrinsics(
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
        T1 = t1.extrinsic_matrix  # T_AB
        T2 = t2.extrinsic_matrix  # T_BC
        expected = T2 @ T1  # T_AC
        nptest.assert_array_almost_equal(composed.extrinsic_matrix, expected)

        # Verify the composed transform does the right thing:
        # A point at origin in frame A should end up at [1, 2, 0] in frame C
        point_A = np.array([0, 0, 0, 1])
        point_C = composed.extrinsic_matrix @ point_A
        nptest.assert_array_almost_equal(point_C[:3], [1.0, 2.0, 0.0])

    def test_extrinsics_serialization(self):
        """Test serialization and deserialization of extrinsics."""
        # Use exact unit quaternion: [0, 0, sin(45°), cos(45°)]
        sqrt2_2 = 0.7071067811865476
        extrinsics = SensorExtrinsics(
            translation=[1.0, 2.0, 3.0],
            quaternion=[0.0, 0.0, sqrt2_2, sqrt2_2],
            source_frame="camera",
            target_frame="ego",
            timestamp=1234567890,
        )

        d = extrinsics.to_dict()
        extrinsics2 = SensorExtrinsics.from_dict(d)

        nptest.assert_array_almost_equal(
            extrinsics2.translation, extrinsics.translation
        )
        nptest.assert_array_almost_equal(
            extrinsics2.quaternion, extrinsics.quaternion
        )
        self.assertEqual(extrinsics2.source_frame, extrinsics.source_frame)
        self.assertEqual(extrinsics2.target_frame, extrinsics.target_frame)
        self.assertEqual(extrinsics2.timestamp, extrinsics.timestamp)

    def test_camera_extrinsics_alias(self):
        """Test that CameraExtrinsics is an alias for SensorExtrinsics."""
        self.assertIs(CameraExtrinsics, SensorExtrinsics)

    def test_compose_with_rotation(self):
        """Test composition with rotations, not just translations."""
        # T1: A->B, 90 degree rotation around z-axis
        sqrt2_2 = 0.7071067811865476
        t1 = SensorExtrinsics(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, sqrt2_2, sqrt2_2],  # 90 deg around z
            source_frame="A",
            target_frame="B",
        )

        # T2: B->C, translation only
        t2 = SensorExtrinsics(
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
        point_C = composed.extrinsic_matrix @ point_A
        # First rotate 90deg (x->y, y->-x) then translate by [1,0,0] -> [1,0,0]
        # Then translate by [0,1,0] in B frame -> [1,1,0]
        nptest.assert_array_almost_equal(point_C[:3], [1.0, 1.0, 0.0])

    def test_compose_frame_mismatch_raises(self):
        """Test that composing mismatched frames raises ValueError."""
        t1 = SensorExtrinsics(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="A",
            target_frame="B",
        )

        t2 = SensorExtrinsics(
            translation=[0.0, 1.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="C",  # Mismatch! Should be "B"
            target_frame="D",
        )

        with self.assertRaises(ValueError) as cm:
            t1.compose(t2)

        self.assertIn("Cannot compose", str(cm.exception))

    def test_compose_unspecified_frames_allowed(self):
        """Test that composition works when frames are unspecified."""
        t1 = SensorExtrinsics(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            # No source_frame or target_frame
        )

        t2 = SensorExtrinsics(
            translation=[0.0, 1.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
        )

        # Should not raise - frames are unspecified
        composed = t1.compose(t2)
        self.assertIsNone(composed.source_frame)
        self.assertIsNone(composed.target_frame)

    def test_covariance_validation(self):
        """Test that covariance must have 6 elements."""
        # Valid covariance
        extrinsics = SensorExtrinsics(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            covariance=[0.01, 0.01, 0.01, 0.001, 0.001, 0.001],
        )
        # Should not raise - validation happens in __init__

        # Invalid covariance (wrong length) - should raise during construction
        with self.assertRaises(ValueError):
            SensorExtrinsics(
                translation=[1.0, 0.0, 0.0],
                quaternion=[0.0, 0.0, 0.0, 1.0],
                covariance=[0.01, 0.01],  # Only 2 elements
            )


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
                [960.0 + 100.0, 540.0],  # fx * (1/10) = 100
                [960.0, 540.0 + 100.0],  # fy * (1/10) = 100
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
        """Test projection with extrinsics (world to camera transform)."""
        intrinsics = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )

        # Camera is at (0, 0, 0) looking down positive z
        # Extrinsics: camera frame to world frame
        extrinsics = SensorExtrinsics(
            translation=[0.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
        )

        projector = CameraProjector(intrinsics, extrinsics)

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

        projector = CameraProjector(intrinsics, camera_convention="opengl")

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
            k4=0.001,  # Rational model coefficient
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
        cam_to_world = SensorExtrinsics(
            translation=[0.0, 0.0, -5.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],  # identity
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


class ReferenceTests(unittest.TestCase):
    """Tests for CameraIntrinsicsRef and SensorExtrinsicsRef."""

    def test_intrinsics_ref_creation(self):
        """Test creating an intrinsics reference."""
        ref = CameraIntrinsicsRef(ref="camera_front")
        self.assertEqual(ref.ref, "camera_front")

    def test_extrinsics_ref_creation(self):
        """Test creating an extrinsics reference."""
        ref = SensorExtrinsicsRef(ref="camera_front::ego")
        self.assertEqual(ref.ref, "camera_front::ego")

    def test_extrinsics_ref_alias(self):
        """Test that CameraExtrinsicsRef is an alias."""
        self.assertIs(CameraExtrinsicsRef, SensorExtrinsicsRef)

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
    def test_dataset_sensor_extrinsics_property(self):
        """Test setting and getting sensor extrinsics on a dataset."""
        dataset = fo.Dataset()

        extrinsics = SensorExtrinsics(
            translation=[1.0, 0.0, 1.5],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="ego",
        )

        dataset.sensor_extrinsics = {"camera_front::ego": extrinsics}

        self.assertIn("camera_front::ego", dataset.sensor_extrinsics)
        retrieved = dataset.sensor_extrinsics["camera_front::ego"]
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
        extrinsics = SensorExtrinsics(
            translation=[1.0, 2.0, 3.0],
            quaternion=[0.0, 0.0, sqrt2_2, sqrt2_2],
            source_frame="camera",
            target_frame="world",
        )

        dataset.camera_intrinsics = {"camera": intrinsics}
        dataset.sensor_extrinsics = {"camera": extrinsics}
        dataset.save()

        # Reload the dataset
        dataset2 = fo.load_dataset(name)

        self.assertIn("camera", dataset2.camera_intrinsics)
        self.assertIn("camera", dataset2.sensor_extrinsics)

        retrieved_intrinsics = dataset2.camera_intrinsics["camera"]
        self.assertAlmostEqual(retrieved_intrinsics.fx, 1000.0)
        self.assertAlmostEqual(retrieved_intrinsics.k1, -0.1)

        retrieved_extrinsics = dataset2.sensor_extrinsics["camera"]
        nptest.assert_array_almost_equal(
            retrieved_extrinsics.translation, [1.0, 2.0, 3.0]
        )

        # Cleanup
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
        self.assertEqual(resolved.fx, 1200.0)  # Sample override

    @drop_datasets
    def test_resolve_intrinsics_by_sensor_name(self):
        """Test resolving intrinsics using explicit sensor_name parameter."""
        dataset = fo.Dataset()

        intrinsics_front = PinholeCameraIntrinsics(
            fx=1000.0,
            fy=1000.0,
            cx=960.0,
            cy=540.0,
        )
        intrinsics_rear = PinholeCameraIntrinsics(
            fx=800.0,
            fy=800.0,
            cx=640.0,
            cy=480.0,
        )
        dataset.camera_intrinsics = {
            "camera_front": intrinsics_front,
            "camera_rear": intrinsics_rear,
        }

        # Sample without camera_intrinsics field
        sample = fo.Sample(filepath="test.jpg")
        dataset.add_sample(sample)

        # Should return None without sensor_name
        resolved = dataset.resolve_intrinsics(sample)
        self.assertIsNone(resolved)

        # Should resolve with explicit sensor_name
        resolved_front = dataset.resolve_intrinsics(
            sample, sensor_name="camera_front"
        )
        self.assertIsNotNone(resolved_front)
        self.assertEqual(resolved_front.fx, 1000.0)

        resolved_rear = dataset.resolve_intrinsics(
            sample, sensor_name="camera_rear"
        )
        self.assertIsNotNone(resolved_rear)
        self.assertEqual(resolved_rear.fx, 800.0)

        # Non-existent sensor returns None
        resolved_none = dataset.resolve_intrinsics(
            sample, sensor_name="camera_side"
        )
        self.assertIsNone(resolved_none)

    @drop_datasets
    def test_resolve_extrinsics(self):
        """Test resolving extrinsics from dataset-level storage."""
        dataset = fo.Dataset()

        extrinsics = SensorExtrinsics(
            translation=[1.0, 0.0, 1.5],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="ego",
        )
        dataset.sensor_extrinsics = {"camera_front::ego": extrinsics}

        sample = fo.Sample(filepath="test.jpg")
        dataset.add_sample(sample)

        resolved = dataset.resolve_extrinsics(sample, "camera_front", "ego")
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.source_frame, "camera_front")
        self.assertEqual(resolved.target_frame, "ego")

    @drop_datasets
    def test_resolve_extrinsics_implied_world(self):
        """Test resolving extrinsics with implied world target."""
        dataset = fo.Dataset()

        extrinsics = SensorExtrinsics(
            translation=[0.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="lidar",
            target_frame="world",
        )
        dataset.sensor_extrinsics = {"lidar": extrinsics}

        sample = fo.Sample(filepath="test.pcd")
        dataset.add_sample(sample)

        # Should find with explicit world target
        resolved = dataset.resolve_extrinsics(sample, "lidar", "world")
        self.assertIsNotNone(resolved)

        # Should also find with implied world target (None)
        resolved2 = dataset.resolve_extrinsics(sample, "lidar")
        self.assertIsNotNone(resolved2)

    @drop_datasets
    def test_get_transform_chain(self):
        """Test computing chained transformations."""
        dataset = fo.Dataset()

        # camera -> ego
        cam_to_ego = SensorExtrinsics(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="ego",
        )
        # ego -> world
        ego_to_world = SensorExtrinsics(
            translation=[0.0, 10.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="ego",
            target_frame="world",
        )

        dataset.sensor_extrinsics = {
            "camera::ego": cam_to_ego,
            "ego::world": ego_to_world,
        }

        # Get camera -> world via ego
        transform = dataset.get_transform_chain(
            "camera", "world", intermediate_frames=["ego"]
        )

        self.assertIsNotNone(transform)

        # The composed transform should be translation [1, 10, 0]
        T = transform.extrinsic_matrix
        nptest.assert_array_almost_equal(T[:3, 3], [1.0, 10.0, 0.0])

    @drop_datasets
    def test_get_transform_chain_missing(self):
        """Test that missing transforms return None."""
        dataset = fo.Dataset()

        result = dataset.get_transform_chain("camera", "world")
        self.assertIsNone(result)

    @drop_datasets
    def test_sample_with_multiple_extrinsics_refs(self):
        """Test sample with multiple extrinsics references."""
        dataset = fo.Dataset()

        cam_to_ego = SensorExtrinsics(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="ego",
        )
        # Use exact unit quaternion for small rotation around z-axis
        norm = math.sqrt(0.1**2 + 0.995**2)
        ego_to_world = SensorExtrinsics(
            translation=[100.0, 200.0, 0.0],
            quaternion=[0.0, 0.0, 0.1 / norm, 0.995 / norm],
            source_frame="ego",
            target_frame="world",
        )
        dataset.sensor_extrinsics = {
            "camera::ego": cam_to_ego,
            "ego::world": ego_to_world,
        }

        sample = fo.Sample(filepath="test.jpg")
        # Use list of references (all same type for mongoengine compatibility)
        sample["sensor_extrinsics"] = [
            SensorExtrinsicsRef(ref="camera::ego"),
            SensorExtrinsicsRef(ref="ego::world"),
        ]
        dataset.add_sample(sample)

        # Should resolve camera -> ego from dataset via ref
        resolved_cam = dataset.resolve_extrinsics(sample, "camera", "ego")
        self.assertIsNotNone(resolved_cam)
        nptest.assert_array_almost_equal(
            resolved_cam.translation, [1.0, 0.0, 0.0]
        )

        # Should resolve ego -> world from dataset via ref
        resolved_ego = dataset.resolve_extrinsics(sample, "ego", "world")
        self.assertIsNotNone(resolved_ego)
        nptest.assert_array_almost_equal(
            resolved_ego.translation, [100.0, 200.0, 0.0]
        )

    @drop_datasets
    def test_sample_with_inline_extrinsics(self):
        """Test sample with inline (non-referenced) extrinsics."""
        dataset = fo.Dataset()

        # Store static transform at dataset level
        cam_to_ego = SensorExtrinsics(
            translation=[1.0, 0.0, 0.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera",
            target_frame="ego",
        )
        dataset.sensor_extrinsics = {"camera::ego": cam_to_ego}

        # Dynamic ego to world pose stored inline on sample
        # Use exact unit quaternion for small rotation around z-axis
        norm = math.sqrt(0.1**2 + 0.995**2)
        ego_to_world = SensorExtrinsics(
            translation=[100.0, 200.0, 0.0],
            quaternion=[0.0, 0.0, 0.1 / norm, 0.995 / norm],
            source_frame="ego",
            target_frame="world",
        )

        sample = fo.Sample(filepath="test.jpg")
        # Store dynamic extrinsics directly (list of same type)
        sample["sensor_extrinsics"] = [ego_to_world]
        dataset.add_sample(sample)

        # Should resolve camera -> ego from dataset level
        resolved_cam = dataset.resolve_extrinsics(sample, "camera", "ego")
        self.assertIsNotNone(resolved_cam)

        # Should resolve ego -> world from sample's inline extrinsics
        resolved_ego = dataset.resolve_extrinsics(sample, "ego", "world")
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

        # Create grouped samples
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

        # Get sample from camera_front slice (default)
        dataset.group_slice = "camera_front"
        sample_front = dataset.first()

        # Should resolve intrinsics by inferring from group slice name
        resolved_front = dataset.resolve_intrinsics(sample_front)
        self.assertIsNotNone(resolved_front)
        self.assertEqual(resolved_front.fx, 1000.0)

        # Get sample from camera_rear slice
        dataset.group_slice = "camera_rear"
        sample_rear = dataset.first()

        # Should resolve intrinsics by inferring from group slice name
        resolved_rear = dataset.resolve_intrinsics(sample_rear)
        self.assertIsNotNone(resolved_rear)
        self.assertEqual(resolved_rear.fx, 800.0)

    @drop_datasets
    def test_resolve_intrinsics_group_slice_not_found(self):
        """Test that resolve_intrinsics returns None if slice not in intrinsics."""
        dataset = fo.Dataset()
        dataset.add_group_field("group", default="camera_front")

        # Set up intrinsics for only camera_front
        intrinsics_front = PinholeCameraIntrinsics(
            fx=1000.0, fy=1000.0, cx=960.0, cy=540.0
        )
        dataset.camera_intrinsics = {"camera_front": intrinsics_front}

        # Create grouped samples
        group = fo.Group()
        samples = [
            fo.Sample(
                filepath="front.jpg",
                group=group.element("camera_front"),
            ),
            fo.Sample(
                filepath="side.jpg",
                group=group.element("camera_side"),  # No intrinsics for this
            ),
        ]
        dataset.add_samples(samples)

        # Get sample from camera_side slice (no intrinsics defined)
        dataset.group_slice = "camera_side"
        sample_side = dataset.first()

        # Should return None since camera_side not in camera_intrinsics
        resolved = dataset.resolve_intrinsics(sample_side)
        self.assertIsNone(resolved)


class SensorExtrinsicsValidationTests(unittest.TestCase):
    """Tests for sensor_extrinsics key/field validation."""

    @drop_datasets
    def test_sensor_extrinsics_valid_matching_key_and_fields(self):
        """Test that valid extrinsics with matching key and fields passes."""
        dataset = fo.Dataset()

        extrinsics = SensorExtrinsics(
            translation=[1.5, 0.0, 1.2],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="ego",
        )

        # Should not raise
        dataset.sensor_extrinsics = {"camera_front::ego": extrinsics}

        self.assertIn("camera_front::ego", dataset.sensor_extrinsics)

    @drop_datasets
    def test_sensor_extrinsics_valid_implied_world_target(self):
        """Test that key without :: implies world target."""
        dataset = fo.Dataset()

        extrinsics = SensorExtrinsics(
            translation=[0.0, 0.0, 2.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="lidar",
            target_frame="world",
        )

        # Should not raise - key "lidar" implies target_frame="world"
        dataset.sensor_extrinsics = {"lidar": extrinsics}

        self.assertIn("lidar", dataset.sensor_extrinsics)

    @drop_datasets
    def test_sensor_extrinsics_valid_none_fields(self):
        """Test that extrinsics with None fields skips validation."""
        dataset = fo.Dataset()

        extrinsics = SensorExtrinsics(
            translation=[1.5, 0.0, 1.2],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            # source_frame and target_frame are None
        )

        # Should not raise - no validation when fields are None
        dataset.sensor_extrinsics = {"camera_front::ego": extrinsics}

        self.assertIn("camera_front::ego", dataset.sensor_extrinsics)

    @drop_datasets
    def test_sensor_extrinsics_mismatched_source_frame(self):
        """Test that mismatched source_frame raises ValueError."""
        dataset = fo.Dataset()

        extrinsics = SensorExtrinsics(
            translation=[1.5, 0.0, 1.2],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="wrong_source",  # Doesn't match key
            target_frame="ego",
        )

        with self.assertRaises(ValueError) as cm:
            dataset.sensor_extrinsics = {"camera_front::ego": extrinsics}

        self.assertIn("source_frame", str(cm.exception))
        self.assertIn("camera_front", str(cm.exception))
        self.assertIn("wrong_source", str(cm.exception))

    @drop_datasets
    def test_sensor_extrinsics_mismatched_target_frame(self):
        """Test that mismatched target_frame raises ValueError."""
        dataset = fo.Dataset()

        extrinsics = SensorExtrinsics(
            translation=[1.5, 0.0, 1.2],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            target_frame="wrong_target",  # Doesn't match key
        )

        with self.assertRaises(ValueError) as cm:
            dataset.sensor_extrinsics = {"camera_front::ego": extrinsics}

        self.assertIn("target_frame", str(cm.exception))
        self.assertIn("ego", str(cm.exception))
        self.assertIn("wrong_target", str(cm.exception))

    @drop_datasets
    def test_sensor_extrinsics_mismatched_implied_world(self):
        """Test that mismatched target_frame with implied world raises."""
        dataset = fo.Dataset()

        extrinsics = SensorExtrinsics(
            translation=[0.0, 0.0, 2.0],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="lidar",
            target_frame="ego",  # Key "lidar" implies "world", not "ego"
        )

        with self.assertRaises(ValueError) as cm:
            dataset.sensor_extrinsics = {"lidar": extrinsics}

        self.assertIn("target_frame", str(cm.exception))
        self.assertIn("world", str(cm.exception))
        self.assertIn("ego", str(cm.exception))

    @drop_datasets
    def test_sensor_extrinsics_multiple_valid(self):
        """Test multiple valid extrinsics in one assignment."""
        dataset = fo.Dataset()

        extrinsics_dict = {
            "camera_front::ego": SensorExtrinsics(
                translation=[1.5, 0.0, 1.2],
                quaternion=[0.0, 0.0, 0.0, 1.0],
                source_frame="camera_front",
                target_frame="ego",
            ),
            "lidar::ego": SensorExtrinsics(
                translation=[0.0, 0.0, 2.0],
                quaternion=[0.0, 0.0, 0.0, 1.0],
                source_frame="lidar",
                target_frame="ego",
            ),
            "ego": SensorExtrinsics(
                translation=[100.0, 200.0, 0.0],
                quaternion=[0.0, 0.0, 0.0, 1.0],
                source_frame="ego",
                target_frame="world",
            ),
        }

        # Should not raise
        dataset.sensor_extrinsics = extrinsics_dict

        self.assertEqual(len(dataset.sensor_extrinsics), 3)

    @drop_datasets
    def test_sensor_extrinsics_partial_fields_source_only(self):
        """Test validation with only source_frame set."""
        dataset = fo.Dataset()

        # source_frame matches, target_frame is None (skip target validation)
        extrinsics = SensorExtrinsics(
            translation=[1.5, 0.0, 1.2],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            source_frame="camera_front",
            # target_frame is None
        )

        # Should not raise
        dataset.sensor_extrinsics = {"camera_front::ego": extrinsics}

    @drop_datasets
    def test_sensor_extrinsics_partial_fields_target_only(self):
        """Test validation with only target_frame set."""
        dataset = fo.Dataset()

        # source_frame is None (skip source validation), target_frame matches
        extrinsics = SensorExtrinsics(
            translation=[1.5, 0.0, 1.2],
            quaternion=[0.0, 0.0, 0.0, 1.0],
            # source_frame is None
            target_frame="ego",
        )

        # Should not raise
        dataset.sensor_extrinsics = {"camera_front::ego": extrinsics}


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


if __name__ == "__main__":
    unittest.main()
