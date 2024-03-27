"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import numpy as np
import pytest

import fiftyone.utils.utils3d as fou3d


@pytest.mark.parametrize(
    ("vec1", "vec2"),
    [
        ((0, 1, 0), (0, 0, 1)),  # normal 90º rotation
        ((0, 0, 1), (0, 0, 1)),  # singular case of 0º rotation
        ((0, 0, -1), (0, 0, 1)),  # singular case of 180º rotation
        ((0.5, 0, 2), (2, 1, 0)),  # random vector
    ],
)
def test_rotation_matrix_from_vectors(vec1, vec2):
    """Validates the returned rotation matrix transforms rotates vec1 to vec2."""
    R = fou3d._rotation_matrix_from_vectors(vec1, vec2)

    vec1_rot = R @ vec1
    vec1_rn = vec1_rot / np.linalg.norm(vec1_rot)
    vec2_n = vec2 / np.linalg.norm(vec2)

    # The returned matrix is a rotation matrix
    np.testing.assert_allclose(np.eye(3), R.T @ R, atol=1e-15)
    np.testing.assert_allclose(1, np.linalg.det(R))

    np.testing.assert_allclose(vec2_n, vec1_rn, atol=1e-15)
