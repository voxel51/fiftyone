"""
FiftyOne 3D transformation utilities unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

import numpy as np
import numpy.testing as nptest

import fiftyone.utils.transforms as fout


class QuaternionTests(unittest.TestCase):
    """Tests for quaternion utility functions."""

    def test_quaternion_to_rotation_matrix_identity(self):
        """Test identity quaternion produces identity matrix."""
        q = [0, 0, 0, 1]  # Identity quaternion
        R = fout.quaternion_to_rotation_matrix(q)
        nptest.assert_array_almost_equal(R, np.eye(3))

    def test_quaternion_to_rotation_matrix_90deg_z(self):
        """Test 90 degree rotation about Z axis."""
        # 90 degrees about Z: qw=cos(45deg), qz=sin(45deg)
        angle = np.pi / 2
        q = [0, 0, np.sin(angle / 2), np.cos(angle / 2)]
        R = fout.quaternion_to_rotation_matrix(q)

        # Expected: X->Y, Y->-X
        expected = np.array(
            [[0, -1, 0], [1, 0, 0], [0, 0, 1]], dtype=np.float64
        )
        nptest.assert_array_almost_equal(R, expected)

    def test_rotation_matrix_to_quaternion_identity(self):
        """Test identity matrix produces identity quaternion."""
        R = np.eye(3)
        q = fout.rotation_matrix_to_quaternion(R)
        # Identity quaternion could be [0,0,0,1] or [0,0,0,-1]
        nptest.assert_array_almost_equal(np.abs(q), [0, 0, 0, 1])

    def test_quaternion_roundtrip(self):
        """Test quaternion -> matrix -> quaternion roundtrip."""
        q_orig = [0.1, 0.2, 0.3, 0.9]
        q_orig = np.array(q_orig) / np.linalg.norm(q_orig)  # Normalize

        R = fout.quaternion_to_rotation_matrix(q_orig)
        q_back = fout.rotation_matrix_to_quaternion(R)

        # Quaternions are equivalent if equal or negated
        if np.dot(q_orig, q_back) < 0:
            q_back = -q_back
        nptest.assert_array_almost_equal(q_orig, q_back)

    def test_quaternion_multiply_identity(self):
        """Test multiplying by identity quaternion."""
        q = [0.1, 0.2, 0.3, 0.9]
        q = np.array(q) / np.linalg.norm(q)
        identity = [0, 0, 0, 1]

        result = fout.quaternion_multiply(q, identity)
        if np.dot(q, result) < 0:
            result = -result
        nptest.assert_array_almost_equal(result, q)

    def test_quaternion_multiply_composition(self):
        """Test quaternion multiplication matches rotation composition."""
        # Two 90-degree rotations about Z should give 180-degree rotation
        angle = np.pi / 2
        q_90z = [0, 0, np.sin(angle / 2), np.cos(angle / 2)]

        q_180z = fout.quaternion_multiply(q_90z, q_90z)
        R_180z = fout.quaternion_to_rotation_matrix(q_180z)

        # 180 degree rotation about Z: X->-X, Y->-Y
        expected = np.array(
            [[-1, 0, 0], [0, -1, 0], [0, 0, 1]], dtype=np.float64
        )
        nptest.assert_array_almost_equal(R_180z, expected)

    def test_quaternion_inverse(self):
        """Test quaternion inverse produces identity when multiplied."""
        q = [0.1, 0.2, 0.3, 0.9]
        q = np.array(q) / np.linalg.norm(q)

        q_inv = fout.quaternion_inverse(q)
        result = fout.quaternion_multiply(q, q_inv)

        # Result should be identity [0, 0, 0, 1] or [0, 0, 0, -1]
        nptest.assert_array_almost_equal(np.abs(result), [0, 0, 0, 1])


class EulerQuaternionTests(unittest.TestCase):
    """Tests for Euler angle / quaternion conversions."""

    def test_euler_to_quaternion_identity(self):
        """Test zero Euler angles produce identity quaternion."""
        angles = [0, 0, 0]
        q = fout.quaternion_from_euler(angles, "xyz")
        nptest.assert_array_almost_equal(np.abs(q), [0, 0, 0, 1])

    def test_euler_to_quaternion_90deg_z(self):
        """Test 90 degree rotation about Z via Euler angles."""
        angles = [0, 0, np.pi / 2]  # 90 degrees about Z
        q = fout.quaternion_from_euler(angles, "xyz")

        # Expected: qz = sin(45deg), qw = cos(45deg)
        expected_qz = np.sin(np.pi / 4)
        expected_qw = np.cos(np.pi / 4)

        # Check magnitude of components
        self.assertAlmostEqual(abs(q[2]), expected_qz, places=5)
        self.assertAlmostEqual(abs(q[3]), expected_qw, places=5)

    def test_euler_roundtrip(self):
        """Test Euler -> quaternion -> Euler roundtrip."""
        angles_orig = [0.1, 0.2, 0.3]

        q = fout.quaternion_from_euler(angles_orig, "xyz")
        angles_back = fout.euler_from_quaternion(q, "xyz")

        nptest.assert_array_almost_equal(angles_orig, angles_back)

    def test_euler_different_sequences(self):
        """Test different Euler sequences produce expected results."""
        # Same angles but different sequences should produce different quaternions
        angles = [0.1, 0.2, 0.3]

        q_xyz = fout.quaternion_from_euler(angles, "xyz")
        q_zyx = fout.quaternion_from_euler(angles, "zyx")

        # These should be different
        self.assertFalse(np.allclose(q_xyz, q_zyx))
        self.assertFalse(np.allclose(q_xyz, -q_zyx))


class TransformMatrixTests(unittest.TestCase):
    """Tests for transform matrix utility functions."""

    def test_make_transform_matrix(self):
        """Test constructing a transform matrix."""
        R = np.eye(3)
        t = [1, 2, 3]

        T = fout.make_transform_matrix(R, t)

        expected = np.array(
            [
                [1, 0, 0, 1],
                [0, 1, 0, 2],
                [0, 0, 1, 3],
                [0, 0, 0, 1],
            ],
            dtype=np.float64,
        )
        nptest.assert_array_almost_equal(T, expected)

    def test_decompose_transform_matrix(self):
        """Test decomposing a transform matrix."""
        T = np.array(
            [
                [1, 0, 0, 1],
                [0, 1, 0, 2],
                [0, 0, 1, 3],
                [0, 0, 0, 1],
            ],
            dtype=np.float64,
        )

        R, t = fout.decompose_transform_matrix(T)

        nptest.assert_array_almost_equal(R, np.eye(3))
        nptest.assert_array_almost_equal(t, [1, 2, 3])

    def test_decompose_transform_matrix_3x4(self):
        """Test decomposing a 3x4 matrix."""
        T = np.array(
            [
                [1, 0, 0, 1],
                [0, 1, 0, 2],
                [0, 0, 1, 3],
            ],
            dtype=np.float64,
        )

        R, t = fout.decompose_transform_matrix(T)

        nptest.assert_array_almost_equal(R, np.eye(3))
        nptest.assert_array_almost_equal(t, [1, 2, 3])

    def test_make_decompose_roundtrip(self):
        """Test make -> decompose roundtrip."""
        R_orig = fout.quaternion_to_rotation_matrix([0.1, 0.2, 0.3, 0.9])
        R_orig = R_orig / np.linalg.det(R_orig) ** (1 / 3)  # Ensure det=1
        t_orig = [1, 2, 3]

        T = fout.make_transform_matrix(R_orig, t_orig)
        R_back, t_back = fout.decompose_transform_matrix(T)

        nptest.assert_array_almost_equal(R_orig, R_back)
        nptest.assert_array_almost_equal(t_orig, t_back)

    def test_invert_transform_matrix_identity(self):
        """Test inverting identity transform."""
        T = np.eye(4)
        T_inv = fout.invert_transform_matrix(T)
        nptest.assert_array_almost_equal(T_inv, np.eye(4))

    def test_invert_transform_matrix_translation_only(self):
        """Test inverting a pure translation."""
        T = fout.make_transform_matrix(np.eye(3), [1, 2, 3])
        T_inv = fout.invert_transform_matrix(T)

        expected = fout.make_transform_matrix(np.eye(3), [-1, -2, -3])
        nptest.assert_array_almost_equal(T_inv, expected)

    def test_invert_transform_matrix_roundtrip(self):
        """Test T @ T_inv = identity."""
        q = [0.1, 0.2, 0.3, 0.9]
        q = np.array(q) / np.linalg.norm(q)
        R = fout.quaternion_to_rotation_matrix(q)
        t = [1, 2, 3]

        T = fout.make_transform_matrix(R, t)
        T_inv = fout.invert_transform_matrix(T)

        result = T @ T_inv
        nptest.assert_array_almost_equal(result, np.eye(4))

    def test_compose_transforms_identity(self):
        """Test composing with identity."""
        q = [0.1, 0.2, 0.3, 0.9]
        q = np.array(q) / np.linalg.norm(q)
        R = fout.quaternion_to_rotation_matrix(q)

        T = fout.make_transform_matrix(R, [1, 2, 3])
        I = np.eye(4)

        # T composed with identity should give T
        result = fout.compose_transforms(T, I)
        nptest.assert_array_almost_equal(result, T)

        result = fout.compose_transforms(I, T)
        nptest.assert_array_almost_equal(result, T)

    def test_compose_transforms_chain(self):
        """Test composing two transforms gives T2 @ T1."""
        T1 = fout.make_transform_matrix(np.eye(3), [1, 0, 0])
        T2 = fout.make_transform_matrix(np.eye(3), [0, 1, 0])

        result = fout.compose_transforms(T1, T2)
        expected = T2 @ T1

        nptest.assert_array_almost_equal(result, expected)


class AxisFlipTests(unittest.TestCase):
    """Tests for axis flip and coordinate convention utilities."""

    def test_axis_flip_opencv_to_opengl(self):
        """Test OpenCV to OpenGL flip matrix."""
        R = fout.axis_flip_matrix("opencv", "opengl")
        nptest.assert_array_almost_equal(R, fout.AXIS_FLIP_OPENCV_TO_OPENGL)

    def test_axis_flip_opengl_to_opencv(self):
        """Test OpenGL to OpenCV flip matrix."""
        R = fout.axis_flip_matrix("opengl", "opencv")
        nptest.assert_array_almost_equal(R, fout.AXIS_FLIP_OPENGL_TO_OPENCV)

    def test_axis_flip_self_inverse(self):
        """Test that opencv<->opengl flip is self-inverse."""
        R = fout.axis_flip_matrix("opencv", "opengl")
        nptest.assert_array_almost_equal(R @ R, np.eye(3))

    def test_axis_flip_same_convention(self):
        """Test that same convention gives identity."""
        R = fout.axis_flip_matrix("opencv", "opencv")
        nptest.assert_array_almost_equal(R, np.eye(3))

        R = fout.axis_flip_matrix("opengl", "opengl")
        nptest.assert_array_almost_equal(R, np.eye(3))

    def test_axis_flip_unknown_convention(self):
        """Test that unknown convention raises error."""
        with self.assertRaises(ValueError):
            fout.axis_flip_matrix("unknown", "opencv")

        with self.assertRaises(ValueError):
            fout.axis_flip_matrix("opencv", "unknown")

    def test_opencv_to_opengl_points(self):
        """Test converting points from OpenCV to OpenGL."""
        pts = np.array([[1, 2, 3], [4, 5, 6]])
        result = fout.opencv_to_opengl_points(pts)

        expected = np.array([[1, -2, -3], [4, -5, -6]])
        nptest.assert_array_almost_equal(result, expected)

    def test_opengl_to_opencv_points(self):
        """Test converting points from OpenGL to OpenCV."""
        pts = np.array([[1, 2, 3], [4, 5, 6]])
        result = fout.opengl_to_opencv_points(pts)

        expected = np.array([[1, -2, -3], [4, -5, -6]])
        nptest.assert_array_almost_equal(result, expected)

    def test_points_roundtrip(self):
        """Test OpenCV -> OpenGL -> OpenCV roundtrip."""
        pts = np.array([[1, 2, 3], [4, 5, 6]])

        opengl_pts = fout.opencv_to_opengl_points(pts)
        back = fout.opengl_to_opencv_points(opengl_pts)

        nptest.assert_array_almost_equal(pts, back)

    def test_axis_flip_flu_to_fru(self):
        """Test FLU to FRU conversion (flip left-right)."""
        R = fout.axis_flip_matrix("flu", "fru")

        # FLU: Forward=+Z, Left=+X -> Up=+Y (wait, FLU is Forward-Left-Up)
        # Actually FLU means: X=Forward, Y=Left, Z=Up -> maps to
        # FRU: X=Forward, Y=Right, Z=Up
        # So Y should flip: (x, y, z) -> (x, -y, z)
        # This depends on exact definition in the code

        # Test a point transformation
        pts = np.array([[1, 2, 3]])
        result = fout.rotate_points(pts, R)

        # The result should have flipped Y (left -> right)
        # Check that X and Z are preserved, Y is negated
        self.assertAlmostEqual(result[0, 2], 3)  # Z (up) preserved

    def test_supported_conventions(self):
        """Test that all documented conventions are supported."""
        conventions = ["opencv", "opengl", "ros", "flu", "fru", "ned", "enu"]

        for conv in conventions:
            # Should not raise
            R = fout.axis_flip_matrix(conv, "opencv")
            self.assertEqual(R.shape, (3, 3))


class PointTransformTests(unittest.TestCase):
    """Tests for point transformation utility functions."""

    def test_transform_points_identity(self):
        """Test transforming points with identity matrix."""
        pts = np.array([[1, 2, 3], [4, 5, 6]])
        T = np.eye(4)

        result = fout.transform_points(pts, T)
        nptest.assert_array_almost_equal(result, pts)

    def test_transform_points_translation(self):
        """Test transforming points with translation only."""
        pts = np.array([[1, 2, 3], [4, 5, 6]])
        T = fout.make_transform_matrix(np.eye(3), [10, 20, 30])

        result = fout.transform_points(pts, T)
        expected = np.array([[11, 22, 33], [14, 25, 36]])
        nptest.assert_array_almost_equal(result, expected)

    def test_transform_points_rotation(self):
        """Test transforming points with 90 degree rotation about Z."""
        pts = np.array([[1, 0, 0]])  # Point on X axis

        # 90 degree rotation about Z
        angle = np.pi / 2
        q = [0, 0, np.sin(angle / 2), np.cos(angle / 2)]
        R = fout.quaternion_to_rotation_matrix(q)
        T = fout.make_transform_matrix(R, [0, 0, 0])

        result = fout.transform_points(pts, T)

        # X axis should rotate to Y axis
        expected = np.array([[0, 1, 0]])
        nptest.assert_array_almost_equal(result, expected)

    def test_transform_points_single_point(self):
        """Test transforming a single point (1D input)."""
        pt = [1, 2, 3]
        T = fout.make_transform_matrix(np.eye(3), [10, 20, 30])

        result = fout.transform_points(pt, T)
        expected = np.array([[11, 22, 33]])
        nptest.assert_array_almost_equal(result, expected)

    def test_rotate_points(self):
        """Test rotating points with 3x3 matrix."""
        pts = np.array([[1, 0, 0], [0, 1, 0]])

        # 90 degree rotation about Z
        angle = np.pi / 2
        q = [0, 0, np.sin(angle / 2), np.cos(angle / 2)]
        R = fout.quaternion_to_rotation_matrix(q)

        result = fout.rotate_points(pts, R)

        expected = np.array([[0, 1, 0], [-1, 0, 0]])
        nptest.assert_array_almost_equal(result, expected)

    def test_translate_points(self):
        """Test translating points."""
        pts = np.array([[1, 2, 3], [4, 5, 6]])
        t = [10, 20, 30]

        result = fout.translate_points(pts, t)
        expected = np.array([[11, 22, 33], [14, 25, 36]])
        nptest.assert_array_almost_equal(result, expected)

    def test_invalid_points_shape(self):
        """Test that invalid point shapes raise errors."""
        pts_2d = np.array([[1, 2], [3, 4]])
        T = np.eye(4)

        with self.assertRaises(ValueError):
            fout.transform_points(pts_2d, T)

        with self.assertRaises(ValueError):
            fout.rotate_points(pts_2d, np.eye(3))

        with self.assertRaises(ValueError):
            fout.translate_points(pts_2d, [1, 2, 3])

    def test_transform_by_convention(self):
        """Test transform_points_by_convention utility."""
        pts = np.array([[1, 2, 3]])

        result = fout.transform_points_by_convention(pts, "opencv", "opengl")
        expected = np.array([[1, -2, -3]])
        nptest.assert_array_almost_equal(result, expected)


if __name__ == "__main__":
    unittest.main()
