"""
FiftyOne ETA utilities unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import functools
import types
import unittest
from unittest.mock import MagicMock, patch


def _requires_tensorflow(test_func):
    @functools.wraps(test_func)
    def wrapper(self, *args, **kwargs):
        try:
            import tensorflow as tf
            tf.constant(0)
        except (ImportError, AttributeError, OSError, RuntimeError):
            self.skipTest("TensorFlow not installed")
        return test_func(self, *args, **kwargs)
    return wrapper


class PatchTF2DetectionModelTests(unittest.TestCase):
    def setUp(self):
        import fiftyone.utils.eta as eta_module
        eta_module._tf2_patched = False

    @_requires_tensorflow
    def test_patch_applied_when_model_not_callable(self):
        import fiftyone.utils.eta as eta_module
        from fiftyone.utils.eta import _patch_tf2_detection_model

        _patch_tf2_detection_model()

        self.assertTrue(eta_module._tf2_patched)

        import eta.detectors.tfmodels_detectors as tfmodels
        self.assertEqual(
            tfmodels._load_tf2_detection_model.__name__,
            "_load_tf2_detection_model_fixed"
        )

    @_requires_tensorflow
    def test_patch_not_reapplied(self):
        import fiftyone.utils.eta as eta_module
        from fiftyone.utils.eta import _patch_tf2_detection_model

        _patch_tf2_detection_model()
        first_fn = None

        import eta.detectors.tfmodels_detectors as tfmodels
        first_fn = tfmodels._load_tf2_detection_model

        _patch_tf2_detection_model()
        second_fn = tfmodels._load_tf2_detection_model

        self.assertIs(first_fn, second_fn)

    def test_patch_skipped_when_tensorflow_unavailable(self):
        import fiftyone.utils.eta as eta_module

        with patch.dict("sys.modules", {"tensorflow": None}):
            eta_module._tf2_patched = False
            from fiftyone.utils.eta import _patch_tf2_detection_model
            _patch_tf2_detection_model()
            self.assertFalse(eta_module._tf2_patched)

    @_requires_tensorflow
    def test_patched_function_handles_callable_model(self):
        from fiftyone.utils.eta import _patch_tf2_detection_model
        _patch_tf2_detection_model()

        import eta.detectors.tfmodels_detectors as tfmodels
        import tensorflow as tf

        mock_detections = {
            "detection_boxes": tf.constant([[0.1, 0.1, 0.9, 0.9]]),
            "detection_scores": tf.constant([0.95]),
            "detection_classes": tf.constant([1]),
        }

        with patch("tensorflow.saved_model.load") as mock_load:
            mock_model = MagicMock()
            mock_model.return_value = mock_detections
            mock_load.return_value = mock_model

            predict_fn = tfmodels._load_tf2_detection_model("/fake/path")
            result = predict_fn(tf.zeros((1, 512, 512, 3)))

            self.assertEqual(len(result), 3)
            mock_load.assert_called_once()
            mock_model.assert_called_once()
            self.assertEqual(mock_model.call_args.kwargs, {})

    @_requires_tensorflow
    def test_patched_function_handles_signature_model(self):
        from fiftyone.utils.eta import _patch_tf2_detection_model
        _patch_tf2_detection_model()

        import eta.detectors.tfmodels_detectors as tfmodels
        import tensorflow as tf

        mock_detections = {
            "detection_boxes": tf.constant([[0.1, 0.1, 0.9, 0.9]]),
            "detection_scores": tf.constant([0.95]),
            "detection_classes": tf.constant([1]),
        }

        with patch("tensorflow.saved_model.load") as mock_load:
            mock_signature = MagicMock(return_value=mock_detections)
            mock_model = types.SimpleNamespace(
                signatures={"serving_default": mock_signature}
            )
            mock_load.return_value = mock_model

            predict_fn = tfmodels._load_tf2_detection_model("/fake/path")
            result = predict_fn(tf.zeros((1, 512, 512, 3)))

            self.assertEqual(len(result), 3)
            mock_load.assert_called_once()
            mock_signature.assert_called_once()
            self.assertIn("input", mock_signature.call_args.kwargs)


if __name__ == "__main__":
    unittest.main()
