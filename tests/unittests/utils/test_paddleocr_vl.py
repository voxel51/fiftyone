"""
PaddleOCR-VL wrapper unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest import mock

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.utils.paddleocr_vl as foup


class ParseSpottingTests(unittest.TestCase):
    def test_parses_text_and_quads(self):
        text = (
            "Invoice Total: 42.50"
            "<|LOC_48|><|LOC_210|><|LOC_732|><|LOC_210|>"
            "<|LOC_732|><|LOC_383|><|LOC_48|><|LOC_383|>\n"
            "Date 2026-07-21"
            "<|LOC_50|><|LOC_571|><|LOC_632|><|LOC_571|>"
            "<|LOC_632|><|LOC_747|><|LOC_50|><|LOC_747|></s>"
        )
        regions = foup._parse_spotting(text)
        self.assertEqual(len(regions), 2)

        content, box = regions[0]
        self.assertEqual(content, "Invoice Total: 42.50")
        self.assertEqual(len(box), 4)
        # quad (48, 210) .. (732, 383) normalized by 1000
        self.assertAlmostEqual(box[0], 0.048)
        self.assertAlmostEqual(box[1], 0.210)
        self.assertAlmostEqual(box[2], 0.684)
        self.assertAlmostEqual(box[3], 0.173)

        self.assertEqual(regions[1][0], "Date 2026-07-21")

    def test_skips_empty_content(self):
        text = "<|LOC_10|><|LOC_10|><|LOC_20|><|LOC_10|><|LOC_20|><|LOC_20|><|LOC_10|><|LOC_20|>"
        self.assertEqual(foup._parse_spotting(text), [])

    def test_skips_degenerate_box(self):
        # zero-width quad
        text = "x<|LOC_10|><|LOC_10|><|LOC_10|><|LOC_10|><|LOC_10|><|LOC_20|><|LOC_10|><|LOC_20|>"
        self.assertEqual(foup._parse_spotting(text), [])

    def test_no_locations_returns_empty(self):
        self.assertEqual(foup._parse_spotting("plain text</s>"), [])

    def test_clamps_out_of_range_coords(self):
        text = "x<|LOC_0|><|LOC_0|><|LOC_1200|><|LOC_0|><|LOC_1200|><|LOC_1200|><|LOC_0|><|LOC_1200|>"
        ((_, box),) = foup._parse_spotting(text)
        self.assertGreaterEqual(box[0], 0.0)
        self.assertLessEqual(box[0] + box[2], 1.0)
        self.assertLessEqual(box[1] + box[3], 1.0)


class ToPilTests(unittest.TestCase):
    def test_numpy_hwc_uint8(self):
        arr = np.zeros((8, 12, 3), dtype=np.uint8)
        pil = foup._to_pil(arr)
        self.assertEqual(pil.mode, "RGB")
        self.assertEqual(pil.size, (12, 8))

    def test_grayscale(self):
        arr = np.zeros((8, 12), dtype=np.uint8)
        self.assertEqual(foup._to_pil(arr).mode, "RGB")

    def test_single_channel_hwc(self):
        arr = np.zeros((8, 12, 1), dtype=np.uint8)
        pil = foup._to_pil(arr)
        self.assertEqual(pil.mode, "RGB")
        self.assertEqual(pil.size, (12, 8))

    def test_rgba_dropped_to_rgb(self):
        arr = np.zeros((8, 12, 4), dtype=np.uint8)
        pil = foup._to_pil(arr)
        self.assertEqual(pil.mode, "RGB")

    def test_float_scaled(self):
        arr = np.ones((4, 4, 3), dtype=np.float32)
        pil = foup._to_pil(arr)
        self.assertEqual(np.asarray(pil).max(), 255)

    def test_torch_chw(self):
        import torch

        t = torch.zeros(3, 8, 12, dtype=torch.uint8)
        pil = foup._to_pil(t)
        self.assertEqual(pil.size, (12, 8))


class ConfigTests(unittest.TestCase):
    def test_defaults(self):
        config = foup.PaddleOCRVLModelConfig({})
        self.assertEqual(config.name_or_path, "PaddlePaddle/PaddleOCR-VL-1.6")
        self.assertEqual(config.task, "spotting")
        self.assertEqual(config.max_new_tokens, 1024)
        self.assertTrue(config.raw_inputs)

    def test_invalid_task_raises(self):
        with self.assertRaises(ValueError):
            foup.PaddleOCRVLModelConfig({"task": "nonsense"})

    def test_recognition_task_accepted(self):
        config = foup.PaddleOCRVLModelConfig({"task": "table"})
        self.assertEqual(config.task, "table")


class SelectDtypeTests(unittest.TestCase):
    def test_cuda_uses_bfloat16(self):
        import torch

        self.assertEqual(foup._select_dtype("cuda:0"), torch.bfloat16)
        self.assertEqual(
            foup._select_dtype(torch.device("cuda:0")), torch.bfloat16
        )

    def test_cpu_uses_float32(self):
        import torch

        self.assertEqual(foup._select_dtype("cpu"), torch.float32)
        self.assertEqual(
            foup._select_dtype(torch.device("cpu")), torch.float32
        )


class PredictTests(unittest.TestCase):
    def _model(self, decoded, task="spotting"):
        config = foup.PaddleOCRVLModelConfig({"task": task})
        model = foup.PaddleOCRVLModel.__new__(foup.PaddleOCRVLModel)
        model.config = config
        model._device = "cpu"
        model._model = mock.MagicMock()
        model._processor = mock.MagicMock()
        model._processor.apply_chat_template.return_value = mock.MagicMock()
        model._processor.decode.return_value = decoded
        # inputs["input_ids"].shape[-1] and .to(device) chains
        inputs = model._processor.apply_chat_template.return_value
        inputs.to.return_value = {"input_ids": mock.MagicMock()}
        inputs.to.return_value["input_ids"].shape = [1, 0]
        return model

    def test_spotting_maps_to_detections(self):
        decoded = (
            "hello<|LOC_100|><|LOC_100|><|LOC_500|><|LOC_100|>"
            "<|LOC_500|><|LOC_300|><|LOC_100|><|LOC_300|></s>"
        )
        model = self._model(decoded)
        with mock.patch("torch.inference_mode"):
            out = model._predict_all([np.zeros((16, 16, 3), dtype=np.uint8)])
        self.assertEqual(len(out), 1)
        self.assertIsInstance(out[0], fol.Detections)
        self.assertEqual(len(out[0].detections), 1)
        self.assertEqual(out[0].detections[0].label, "hello")

    def test_failure_yields_empty_detections(self):
        model = self._model("")
        model._processor.apply_chat_template.side_effect = RuntimeError("boom")
        out = model._predict_all([np.zeros((16, 16, 3), dtype=np.uint8)])
        self.assertIsInstance(out[0], fol.Detections)
        self.assertEqual(len(out[0].detections), 0)

    def test_non_spotting_task_ignores_locations(self):
        # location-like tokens in a non-spotting task must not be parsed
        decoded = (
            "hello<|LOC_100|><|LOC_100|><|LOC_500|><|LOC_100|>"
            "<|LOC_500|><|LOC_300|><|LOC_100|><|LOC_300|></s>"
        )
        model = self._model(decoded, task="table")
        with mock.patch("torch.inference_mode"):
            out = model._predict_all([np.zeros((16, 16, 3), dtype=np.uint8)])
        self.assertIsInstance(out[0], fol.Detections)
        self.assertEqual(len(out[0].detections), 0)


if __name__ == "__main__":
    unittest.main()
