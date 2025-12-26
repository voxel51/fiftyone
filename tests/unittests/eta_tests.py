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


class TF2DetectionModelLoaderTests(unittest.TestCase):
    @_requires_tensorflow
    def test_loader_returns_function_when_tf_available(self):
        from fiftyone.utils.eta import _make_tf2_detection_model_loader

        loader = _make_tf2_detection_model_loader()

        self.assertIsNotNone(loader)
        self.assertEqual(loader.__name__, "_load_tf2_detection_model_fixed")

    def test_loader_returns_none_when_tf_unavailable(self):
        with patch.dict("sys.modules", {"tensorflow": None}):
            import importlib
            import fiftyone.utils.eta as eta_module
            importlib.reload(eta_module)

            loader = eta_module._make_tf2_detection_model_loader()

            self.assertIsNone(loader)

    @_requires_tensorflow
    def test_loader_handles_callable_model(self):
        from fiftyone.utils.eta import _make_tf2_detection_model_loader
        import tensorflow as tf

        loader = _make_tf2_detection_model_loader()

        mock_detections = {
            "detection_boxes": tf.constant([[0.1, 0.1, 0.9, 0.9]]),
            "detection_scores": tf.constant([0.95]),
            "detection_classes": tf.constant([1]),
        }

        with patch("tensorflow.saved_model.load") as mock_load:
            mock_model = MagicMock()
            mock_model.return_value = mock_detections
            mock_load.return_value = mock_model

            predict_fn = loader("/fake/path")
            result = predict_fn(tf.zeros((1, 512, 512, 3)))

            self.assertEqual(len(result), 3)
            mock_load.assert_called_once()
            mock_model.assert_called_once()
            self.assertEqual(mock_model.call_args.kwargs, {})

    @_requires_tensorflow
    def test_loader_handles_signature_model(self):
        from fiftyone.utils.eta import _make_tf2_detection_model_loader
        import tensorflow as tf

        loader = _make_tf2_detection_model_loader()

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

            predict_fn = loader("/fake/path")
            result = predict_fn(tf.zeros((1, 512, 512, 3)))

            self.assertEqual(len(result), 3)
            mock_load.assert_called_once()
            mock_signature.assert_called_once()
            self.assertIn("input", mock_signature.call_args.kwargs)

    @_requires_tensorflow
    def test_loader_handles_generic_output_names(self):
        from fiftyone.utils.eta import _make_tf2_detection_model_loader
        import tensorflow as tf

        loader = _make_tf2_detection_model_loader()

        mock_detections = {
            "output_0": tf.constant([10.0]),
            "output_1": tf.constant([0.95]),
            "output_2": tf.constant([1.0]),
            "output_3": tf.constant([[0.1, 0.1, 0.9, 0.9]]),
        }

        with patch("tensorflow.saved_model.load") as mock_load:
            mock_signature = MagicMock(return_value=mock_detections)
            mock_model = types.SimpleNamespace(
                signatures={"serving_default": mock_signature}
            )
            mock_load.return_value = mock_model

            predict_fn = loader("/fake/path")
            result = predict_fn(tf.zeros((1, 512, 512, 3)))

            self.assertEqual(len(result), 3)


if __name__ == "__main__":
    unittest.main()
