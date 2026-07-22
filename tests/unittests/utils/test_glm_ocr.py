"""
GLM-OCR wrapper unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest import mock

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.utils.glm_ocr as foug


class ToPilTests(unittest.TestCase):
    def test_numpy_hwc_uint8(self):
        arr = np.zeros((8, 12, 3), dtype=np.uint8)
        pil = foug._to_pil(arr)
        self.assertEqual(pil.mode, "RGB")
        self.assertEqual(pil.size, (12, 8))

    def test_grayscale(self):
        arr = np.zeros((8, 12), dtype=np.uint8)
        self.assertEqual(foug._to_pil(arr).mode, "RGB")

    def test_rgba_dropped_to_rgb(self):
        arr = np.zeros((8, 12, 4), dtype=np.uint8)
        self.assertEqual(foug._to_pil(arr).mode, "RGB")

    def test_float_scaled(self):
        arr = np.ones((4, 4, 3), dtype=np.float32)
        self.assertEqual(np.asarray(foug._to_pil(arr)).max(), 255)

    def test_torch_chw(self):
        import torch

        t = torch.zeros(3, 8, 12, dtype=torch.uint8)
        self.assertEqual(foug._to_pil(t).size, (12, 8))


class ConfigTests(unittest.TestCase):
    def test_defaults(self):
        config = foug.GLMOCRModelConfig({})
        self.assertEqual(config.name_or_path, "zai-org/GLM-OCR")
        self.assertEqual(config.task, "text")
        self.assertIsNone(config.prompt)
        self.assertEqual(config.max_new_tokens, 8192)
        self.assertTrue(config.raw_inputs)

    def test_invalid_task_raises(self):
        with self.assertRaises(ValueError):
            foug.GLMOCRModelConfig({"task": "nonsense"})

    def test_recognition_tasks_accepted(self):
        for task in ("text", "formula", "table"):
            self.assertEqual(foug.GLMOCRModelConfig({"task": task}).task, task)

    def test_custom_prompt(self):
        config = foug.GLMOCRModelConfig({"prompt": '{"id": ""}'})
        self.assertEqual(config.prompt, '{"id": ""}')


class PredictTests(unittest.TestCase):
    def _model(self, decoded, prompt=None):
        d = {"prompt": prompt} if prompt is not None else {}
        config = foug.GLMOCRModelConfig(d)
        model = foug.GLMOCRModel.__new__(foug.GLMOCRModel)
        model.config = config
        model._device = "cpu"
        model._model = mock.MagicMock()
        model._processor = mock.MagicMock()
        chat = model._processor.apply_chat_template.return_value
        chat.to.return_value = {"input_ids": mock.MagicMock()}
        chat.to.return_value["input_ids"].shape = [1, 0]
        model._processor.decode.return_value = decoded
        return model

    def test_text_maps_to_classification(self):
        model = self._model("Invoice Total: 42.50")
        with mock.patch("torch.inference_mode"):
            out = model._predict_all([np.zeros((16, 16, 3), dtype=np.uint8)])
        self.assertEqual(len(out), 1)
        self.assertIsInstance(out[0], fol.Classification)
        self.assertEqual(out[0].label, "Invoice Total: 42.50")

    def test_empty_output_is_none(self):
        model = self._model("   ")
        with mock.patch("torch.inference_mode"):
            out = model._predict_all([np.zeros((16, 16, 3), dtype=np.uint8)])
        self.assertIsNone(out[0])

    def test_custom_prompt_used(self):
        model = self._model("{}", prompt='{"id": ""}')
        with mock.patch("torch.inference_mode"):
            model._predict_all([np.zeros((16, 16, 3), dtype=np.uint8)])
        messages = model._processor.apply_chat_template.call_args[0][0]
        text_part = messages[0]["content"][1]["text"]
        self.assertEqual(text_part, '{"id": ""}')

    def test_failure_yields_none(self):
        model = self._model("")
        model._processor.apply_chat_template.side_effect = RuntimeError("x")
        out = model._predict_all([np.zeros((16, 16, 3), dtype=np.uint8)])
        self.assertIsNone(out[0])


if __name__ == "__main__":
    unittest.main()
