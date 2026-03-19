"""
Tests for fiftyone/utils/sam2.py negative prompt functionality.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pytest
import numpy as np
import unittest.mock as mock

import fiftyone as fo
import fiftyone.core.labels as fol


class TestSAM2NegativePromptFieldExtraction:
    """Test negative_prompt_field parameter extraction"""

    def test_negative_field_extraction_with_frames_prefix(self):
        """Test that negative_prompt_field with 'frames.' prefix is extracted correctly"""
        model_cls = mock.MagicMock()
        model_cls.needs_fields = {
            "prompt_field": "frames.positive",
            "negative_prompt_field": "frames.negative"
        }

        from fiftyone.utils.sam2 import SegmentAnything2VideoModel
        model = SegmentAnything2VideoModel.__new__(SegmentAnything2VideoModel)
        model.needs_fields = model_cls.needs_fields

        field_name, neg_field_name = model._get_field()

        assert field_name == "positive"
        assert neg_field_name == "negative"

    def test_negative_field_optional(self):
        """Test backward compatibility when negative_prompt_field not provided"""
        model_cls = mock.MagicMock()
        model_cls.needs_fields = {
            "prompt_field": "frames.detections"
        }

        from fiftyone.utils.sam2 import SegmentAnything2VideoModel
        model = SegmentAnything2VideoModel.__new__(SegmentAnything2VideoModel)
        model.needs_fields = model_cls.needs_fields

        field_name, neg_field_name = model._get_field()

        assert field_name == "detections"
        assert neg_field_name is None

    def test_negative_field_requires_frames_prefix(self):
        """Test that negative_prompt_field without 'frames.' prefix raises error"""
        model_cls = mock.MagicMock()
        model_cls.needs_fields = {
            "prompt_field": "frames.positive",
            "negative_prompt_field": "negative"
        }

        from fiftyone.utils.sam2 import SegmentAnything2VideoModel
        model = SegmentAnything2VideoModel.__new__(SegmentAnything2VideoModel)
        model.needs_fields = model_cls.needs_fields

        with pytest.raises(ValueError, match="should be a frame field"):
            model._get_field()


class TestSAM2NegativePromptLogic:
    """Test negative prompt conversion logic"""

    def test_negative_box_region_subtraction(self):
        """Test that negative box regions are correctly mapped to mask coordinates"""
        box = [0.1, 0.2, 0.3, 0.4]
        width, height = 640, 480

        from fiftyone.utils.sam import _to_abs_boxes

        box_xyxy = _to_abs_boxes(np.array([box]), width, height, chunk_size=1)
        box_abs = np.round(box_xyxy.squeeze(axis=0)).astype(int)
        x1, y1, x2, y2 = box_abs

        assert x1 == 64   # 0.1 * 640
        assert y1 == 96   # 0.2 * 480
        assert x2 == 256  # (0.1 + 0.3) * 640
        assert y2 == 288  # (0.2 + 0.4) * 480

        # Test mask region subtraction
        mask = np.ones((480, 640), dtype=np.uint8)
        mask[y1:y2, x1:x2] = 0
        assert np.sum(mask) == (480 * 640) - ((y2 - y1) * (x2 - x1))

    def test_negative_keypoints_have_label_zero(self):
        """Test that negative keypoints are assigned label=0"""
        num_points = 5
        neg_points = np.random.rand(num_points, 2) * 100
        neg_labels = np.zeros(num_points, dtype=int)

        assert neg_labels.shape == (num_points,)
        assert np.all(neg_labels == 0)


class TestSAM2BackwardCompatibility:
    """Test backward compatibility with existing code"""

    def test_video_model_without_negative_prompts(self):
        """Test that video model works without negative_prompt_field"""
        pytest.importorskip("sam2")

        config = mock.MagicMock()
        config.device = "cpu"

        from fiftyone.utils.sam2 import SegmentAnything2VideoModel

        with mock.patch.object(SegmentAnything2VideoModel, '_download_model'):
            with mock.patch.object(SegmentAnything2VideoModel, '_load_model'):
                with mock.patch('fiftyone.utils.sam2._load_video_frames_monkey_patch'):
                    model = SegmentAnything2VideoModel(config)

        assert hasattr(model, '_curr_negative_prompts')
        assert model._curr_negative_prompts is None


class TestSAM2DetectionTypes:
    """Test support for different detection types"""

    def test_supports_detections_as_negative_prompts(self):
        """Test that Detections can be used as negative prompts"""
        det1 = fol.Detection(label="background", bounding_box=[0.1, 0.1, 0.2, 0.2])
        det2 = fol.Detection(label="unwanted", bounding_box=[0.5, 0.5, 0.1, 0.1])

        negative_detections = fol.Detections(detections=[det1, det2])

        assert len(negative_detections.detections) == 2
        assert negative_detections.detections[0].label == "background"
        assert negative_detections.detections[1].label == "unwanted"

    def test_supports_keypoints_as_negative_prompts(self):
        """Test that Keypoints can be used as negative prompts"""
        kp1 = fol.Keypoint(label="exclude_point", points=[[0.3, 0.3], [0.4, 0.4]])
        kp2 = fol.Keypoint(label="avoid_region", points=[[0.6, 0.6]])

        negative_keypoints = fol.Keypoints(keypoints=[kp1, kp2])

        assert len(negative_keypoints.keypoints) == 2
        assert negative_keypoints.keypoints[0].label == "exclude_point"
        assert len(negative_keypoints.keypoints[0].points) == 2


class TestSubtractNegativeBoxRegions:
    """Test _subtract_negative_box_regions helper function directly"""

    def test_2d_mask_single_box(self):
        """Test subtraction on 2D mask (video model format)"""
        from fiftyone.utils.sam2 import _subtract_negative_box_regions

        mask = np.ones((100, 100), dtype=np.float32)
        neg = fol.Detections(detections=[
            fol.Detection(bounding_box=[0.1, 0.1, 0.2, 0.2])
        ])

        result = _subtract_negative_box_regions(mask, neg, 100, 100)

        assert result[15, 15] == 0
        assert result[5, 5] == 1
        assert result[50, 50] == 1

    def test_3d_mask_single_box(self):
        """Test subtraction on 3D mask (N, H, W)"""
        from fiftyone.utils.sam2 import _subtract_negative_box_regions

        mask = np.ones((3, 100, 100), dtype=np.float32)
        neg = fol.Detections(detections=[
            fol.Detection(bounding_box=[0.2, 0.2, 0.3, 0.3])
        ])

        result = _subtract_negative_box_regions(mask, neg, 100, 100)

        for i in range(3):
            assert result[i, 35, 35] == 0
            assert result[i, 10, 10] == 1

    def test_4d_mask_single_box(self):
        """Test subtraction on 4D mask (N, 1, H, W)"""
        from fiftyone.utils.sam2 import _subtract_negative_box_regions

        mask = np.ones((2, 1, 100, 100), dtype=np.float32)
        neg = fol.Detections(detections=[
            fol.Detection(bounding_box=[0.5, 0.5, 0.2, 0.2])
        ])

        result = _subtract_negative_box_regions(mask, neg, 100, 100)

        for i in range(2):
            assert result[i, 0, 60, 60] == 0
            assert result[i, 0, 10, 10] == 1

    def test_multiple_boxes(self):
        """Test subtraction with multiple negative boxes"""
        from fiftyone.utils.sam2 import _subtract_negative_box_regions

        mask = np.ones((100, 100), dtype=np.float32)
        neg = fol.Detections(detections=[
            fol.Detection(bounding_box=[0.0, 0.0, 0.2, 0.2]),
            fol.Detection(bounding_box=[0.8, 0.8, 0.2, 0.2]),
        ])

        result = _subtract_negative_box_regions(mask, neg, 100, 100)

        assert result[10, 10] == 0
        assert result[90, 90] == 0
        assert result[50, 50] == 1

    def test_returns_unmodified_for_none(self):
        """Test that None detections returns mask unmodified"""
        from fiftyone.utils.sam2 import _subtract_negative_box_regions

        mask = np.ones((100, 100), dtype=np.float32)
        result = _subtract_negative_box_regions(mask, None, 100, 100)

        assert np.all(result == 1)

    def test_returns_unmodified_for_empty_detections(self):
        """Test that empty detections list returns mask unmodified"""
        from fiftyone.utils.sam2 import _subtract_negative_box_regions

        mask = np.ones((100, 100), dtype=np.float32)
        neg = fol.Detections(detections=[])

        result = _subtract_negative_box_regions(mask, neg, 100, 100)

        assert np.all(result == 1)

    def test_returns_unmodified_for_non_detections_type(self):
        """Test that non-Detections type returns mask unmodified"""
        from fiftyone.utils.sam2 import _subtract_negative_box_regions

        mask = np.ones((100, 100), dtype=np.float32)
        keypoints = fol.Keypoints(keypoints=[
            fol.Keypoint(points=[[0.5, 0.5]])
        ])

        result = _subtract_negative_box_regions(mask, keypoints, 100, 100)

        assert np.all(result == 1)


class TestSubtractNegativeBoxRegionsEdgeCases:
    """Test edge cases for _subtract_negative_box_regions"""

    def test_box_at_boundary(self):
        """Test box that extends to image boundary"""
        from fiftyone.utils.sam2 import _subtract_negative_box_regions

        mask = np.ones((100, 100), dtype=np.float32)
        neg = fol.Detections(detections=[
            fol.Detection(bounding_box=[0.9, 0.9, 0.2, 0.2])
        ])

        result = _subtract_negative_box_regions(mask, neg, 100, 100)

        assert result[95, 95] == 0
        assert result[99, 99] == 0
        assert result[85, 85] == 1

    def test_box_completely_outside(self):
        """Test box completely outside image bounds"""
        from fiftyone.utils.sam2 import _subtract_negative_box_regions

        mask = np.ones((100, 100), dtype=np.float32)
        neg = fol.Detections(detections=[
            fol.Detection(bounding_box=[1.5, 1.5, 0.2, 0.2])
        ])

        result = _subtract_negative_box_regions(mask, neg, 100, 100)

        assert np.all(result == 1)

    def test_zero_size_box(self):
        """Test zero-size box does not modify mask"""
        from fiftyone.utils.sam2 import _subtract_negative_box_regions

        mask = np.ones((100, 100), dtype=np.float32)
        neg = fol.Detections(detections=[
            fol.Detection(bounding_box=[0.5, 0.5, 0.0, 0.0])
        ])

        result = _subtract_negative_box_regions(mask, neg, 100, 100)

        assert np.all(result == 1)

    def test_overlapping_boxes(self):
        """Test overlapping boxes don't cause issues"""
        from fiftyone.utils.sam2 import _subtract_negative_box_regions

        mask = np.ones((100, 100), dtype=np.float32)
        neg = fol.Detections(detections=[
            fol.Detection(bounding_box=[0.2, 0.2, 0.4, 0.4]),
            fol.Detection(bounding_box=[0.3, 0.3, 0.4, 0.4]),
        ])

        result = _subtract_negative_box_regions(mask, neg, 100, 100)

        assert result[40, 40] == 0
        assert result[50, 50] == 0
        assert result[10, 10] == 1

    def test_full_image_box(self):
        """Test box covering entire image"""
        from fiftyone.utils.sam2 import _subtract_negative_box_regions

        mask = np.ones((100, 100), dtype=np.float32)
        neg = fol.Detections(detections=[
            fol.Detection(bounding_box=[0.0, 0.0, 1.0, 1.0])
        ])

        result = _subtract_negative_box_regions(mask, neg, 100, 100)

        assert np.all(result == 0)


class TestImageModelForwardPassIntegration:
    """Integration tests for image model forward pass with negative prompts"""

    def test_forward_pass_applies_negative_subtraction(self):
        """Test _forward_pass_boxes applies negative region subtraction"""
        import torch
        from fiftyone.utils.sam2 import SegmentAnything2ImageModel

        model = SegmentAnything2ImageModel.__new__(SegmentAnything2ImageModel)

        h, w = 100, 100
        model._curr_prompts = [
            fol.Detections(detections=[
                fol.Detection(label="obj", bounding_box=[0.0, 0.0, 1.0, 1.0])
            ])
        ]
        model._curr_classes = ["obj"]
        model._curr_negative_prompts = [
            fol.Detections(detections=[
                fol.Detection(bounding_box=[0.4, 0.4, 0.2, 0.2])
            ])
        ]

        mock_predictor = mock.MagicMock()
        mock_predictor.device = torch.device("cpu")
        mock_predictor.predict.return_value = (
            np.ones((1, h, w), dtype=np.float32),
            np.array([0.95]),
            None
        )

        model._load_predictor = mock.MagicMock(return_value=mock_predictor)

        img = torch.ones((3, h, w))

        def mock_to_abs_boxes(boxes, width, height, chunk_size=None):
            box = boxes[0]
            x1 = int(box[0] * width)
            y1 = int(box[1] * height)
            x2 = int((box[0] + box[2]) * width)
            y2 = int((box[1] + box[3]) * height)
            return np.array([[x1, y1, x2, y2]])

        with mock.patch('fiftyone.utils.sam._to_sam_input', return_value=np.ones((h, w, 3))):
            with mock.patch('fiftyone.utils.sam._to_abs_boxes', side_effect=mock_to_abs_boxes):
                outputs = model._forward_pass_boxes([img])

        result_mask = outputs[0]["masks"].numpy()
        assert result_mask[0, 0, 50, 50] == 0
        assert result_mask[0, 0, 10, 10] == 1

    def test_forward_pass_without_negative_prompts(self):
        """Test _forward_pass_boxes works without negative prompts"""
        import torch
        from fiftyone.utils.sam2 import SegmentAnything2ImageModel

        model = SegmentAnything2ImageModel.__new__(SegmentAnything2ImageModel)

        h, w = 100, 100
        model._curr_prompts = [
            fol.Detections(detections=[
                fol.Detection(label="obj", bounding_box=[0.0, 0.0, 0.5, 0.5])
            ])
        ]
        model._curr_classes = ["obj"]
        model._curr_negative_prompts = None

        mock_predictor = mock.MagicMock()
        mock_predictor.device = torch.device("cpu")
        mock_predictor.predict.return_value = (
            np.ones((1, h, w), dtype=np.float32),
            np.array([0.95]),
            None
        )

        model._load_predictor = mock.MagicMock(return_value=mock_predictor)

        img = torch.ones((3, h, w))

        with mock.patch('fiftyone.utils.sam._to_sam_input', return_value=np.ones((h, w, 3))):
            with mock.patch('fiftyone.utils.sam._to_abs_boxes', return_value=np.array([[0, 0, 50, 50]])):
                outputs = model._forward_pass_boxes([img])

        result_mask = outputs[0]["masks"].numpy()
        assert np.all(result_mask == 1)

    def test_forward_pass_multiple_images_different_negatives(self):
        """Test forward pass with multiple images having different negative prompts"""
        import torch
        from fiftyone.utils.sam2 import SegmentAnything2ImageModel

        model = SegmentAnything2ImageModel.__new__(SegmentAnything2ImageModel)

        h, w = 100, 100
        model._curr_prompts = [
            fol.Detections(detections=[fol.Detection(label="a", bounding_box=[0, 0, 1, 1])]),
            fol.Detections(detections=[fol.Detection(label="b", bounding_box=[0, 0, 1, 1])]),
        ]
        model._curr_classes = ["a", "b"]
        model._curr_negative_prompts = [
            fol.Detections(detections=[fol.Detection(bounding_box=[0.0, 0.0, 0.3, 0.3])]),
            fol.Detections(detections=[fol.Detection(bounding_box=[0.7, 0.7, 0.3, 0.3])]),
        ]

        mock_predictor = mock.MagicMock()
        mock_predictor.device = torch.device("cpu")
        mock_predictor.predict.side_effect = lambda **kwargs: (
            np.ones((1, h, w), dtype=np.float32),
            np.array([0.95]),
            None
        )

        model._load_predictor = mock.MagicMock(return_value=mock_predictor)

        imgs = [torch.ones((3, h, w)), torch.ones((3, h, w))]

        def mock_to_abs_boxes(boxes, width, height, chunk_size=None):
            box = boxes[0]
            x1 = int(box[0] * width)
            y1 = int(box[1] * height)
            x2 = int((box[0] + box[2]) * width)
            y2 = int((box[1] + box[3]) * height)
            return np.array([[x1, y1, x2, y2]])

        with mock.patch('fiftyone.utils.sam._to_sam_input', return_value=np.ones((h, w, 3))):
            with mock.patch('fiftyone.utils.sam._to_abs_boxes', side_effect=mock_to_abs_boxes):
                outputs = model._forward_pass_boxes(imgs)

        assert outputs[0]["masks"].numpy()[0, 0, 15, 15] == 0
        assert outputs[0]["masks"].numpy()[0, 0, 85, 85] == 1
        assert outputs[1]["masks"].numpy()[0, 0, 15, 15] == 1
        assert outputs[1]["masks"].numpy()[0, 0, 85, 85] == 0


class TestPredictAllNegativeFieldExtraction:
    """Test predict_all extracts negative_prompt_field correctly"""

    def test_extracts_negative_field_from_samples(self):
        """Test predict_all extracts negative prompts from samples"""
        from fiftyone.utils.sam2 import SegmentAnything2ImageModel

        model = SegmentAnything2ImageModel.__new__(SegmentAnything2ImageModel)
        model._curr_negative_prompts = None
        model.needs_fields = {
            "prompt_field": "detections",
            "negative_prompt_field": "neg_detections"
        }

        neg_det = fol.Detections(detections=[
            fol.Detection(bounding_box=[0.1, 0.1, 0.2, 0.2])
        ])

        sample1 = mock.MagicMock()
        sample1.get_field.return_value = neg_det
        sample2 = mock.MagicMock()
        sample2.get_field.return_value = None

        model._get_field = mock.MagicMock(return_value="detections")
        model._parse_samples = mock.MagicMock(return_value=(None, None, None))
        model._predict_all = mock.MagicMock(return_value=[])

        model.predict_all([], samples=[sample1, sample2])

        assert model._curr_negative_prompts is not None
        assert len(model._curr_negative_prompts) == 2
        assert model._curr_negative_prompts[0] == neg_det
        assert model._curr_negative_prompts[1] is None

    def test_handles_missing_field_gracefully(self):
        """Test predict_all handles samples missing the negative field"""
        from fiftyone.utils.sam2 import SegmentAnything2ImageModel

        model = SegmentAnything2ImageModel.__new__(SegmentAnything2ImageModel)
        model._curr_negative_prompts = None
        model.needs_fields = {
            "prompt_field": "detections",
            "negative_prompt_field": "neg_detections"
        }

        sample = mock.MagicMock()
        sample.id = "test123"
        sample.get_field.side_effect = AttributeError("no field")

        model._get_field = mock.MagicMock(return_value="detections")
        model._parse_samples = mock.MagicMock(return_value=(None, None, None))
        model._predict_all = mock.MagicMock(return_value=[])

        model.predict_all([], samples=[sample])

        assert model._curr_negative_prompts[0] is None

    def test_strips_frames_prefix(self):
        """Test predict_all strips frames. prefix from negative field"""
        from fiftyone.utils.sam2 import SegmentAnything2ImageModel

        model = SegmentAnything2ImageModel.__new__(SegmentAnything2ImageModel)
        model._curr_negative_prompts = None
        model.needs_fields = {
            "prompt_field": "detections",
            "negative_prompt_field": "frames.neg_detections"
        }

        sample = mock.MagicMock()
        model._get_field = mock.MagicMock(return_value="detections")
        model._parse_samples = mock.MagicMock(return_value=(None, None, None))
        model._predict_all = mock.MagicMock(return_value=[])

        model.predict_all([], samples=[sample])

        sample.get_field.assert_called_with("neg_detections")


class TestVideoModelForwardPassIntegration:
    """Integration tests for video model forward pass with negative prompts"""

    def test_forward_pass_boxes_applies_negative_subtraction(self):
        """Test video model _forward_pass_boxes applies negative region subtraction"""
        import torch
        pytest.importorskip("sam2")

        from fiftyone.utils.sam2 import SegmentAnything2VideoModel

        model = SegmentAnything2VideoModel.__new__(SegmentAnything2VideoModel)

        h, w = 100, 100
        model._curr_frame_width = w
        model._curr_frame_height = h
        model._curr_prompts = [
            fol.Detections(detections=[
                fol.Detection(label="obj", bounding_box=[0.0, 0.0, 1.0, 1.0], index=0)
            ])
        ]
        model._curr_negative_prompts = [
            fol.Detections(detections=[
                fol.Detection(bounding_box=[0.4, 0.4, 0.2, 0.2])
            ])
        ]

        mock_mask = torch.ones((1, 1, h, w), dtype=torch.float32)

        model.model = mock.MagicMock()
        model.model.init_state.return_value = "mock_state"
        model.model.add_new_points_or_box.return_value = (None, None, None)
        model.model.propagate_in_video.return_value = [
            (0, [0], mock_mask)
        ]

        mock_video_reader = mock.MagicMock()
        mock_sample = mock.MagicMock()

        with mock.patch('fiftyone.utils.sam._to_abs_boxes') as mock_abs:
            mock_abs.side_effect = lambda boxes, width, height, chunk_size=None: np.array([[
                int(boxes[0][0] * width),
                int(boxes[0][1] * height),
                int((boxes[0][0] + boxes[0][2]) * width),
                int((boxes[0][1] + boxes[0][3]) * height)
            ]])
            with mock.patch('fiftyone.utils.sam._mask_to_box', return_value=(0, 0, 100, 100)):
                result = model._forward_pass_boxes(mock_video_reader, mock_sample)

        assert 1 in result
        det = result[1].detections[0]
        assert det.mask[10, 10] == 1
        assert det.mask[50, 50] == 0

    def test_forward_pass_boxes_without_negative_prompts(self):
        """Test video model _forward_pass_boxes works without negative prompts"""
        import torch
        pytest.importorskip("sam2")

        from fiftyone.utils.sam2 import SegmentAnything2VideoModel

        model = SegmentAnything2VideoModel.__new__(SegmentAnything2VideoModel)

        h, w = 100, 100
        model._curr_frame_width = w
        model._curr_frame_height = h
        model._curr_prompts = [
            fol.Detections(detections=[
                fol.Detection(label="obj", bounding_box=[0.0, 0.0, 1.0, 1.0], index=0)
            ])
        ]
        model._curr_negative_prompts = None

        mock_mask = torch.ones((1, 1, h, w), dtype=torch.float32)

        model.model = mock.MagicMock()
        model.model.init_state.return_value = "mock_state"
        model.model.add_new_points_or_box.return_value = (None, None, None)
        model.model.propagate_in_video.return_value = [
            (0, [0], mock_mask)
        ]

        mock_video_reader = mock.MagicMock()
        mock_sample = mock.MagicMock()

        with mock.patch('fiftyone.utils.sam._to_abs_boxes') as mock_abs:
            mock_abs.return_value = np.array([[0, 0, 100, 100]])
            with mock.patch('fiftyone.utils.sam._mask_to_box', return_value=(0, 0, 100, 100)):
                result = model._forward_pass_boxes(mock_video_reader, mock_sample)

        assert 1 in result
        det = result[1].detections[0]
        assert np.all(det.mask == 1)


class TestVideoModelNegativeKeypoints:
    """Test video model negative keypoint handling"""

    def test_forward_pass_points_concatenates_negative_keypoints(self):
        """Test that negative keypoints are concatenated with label=0"""
        import torch
        pytest.importorskip("sam2")

        from fiftyone.utils.sam2 import SegmentAnything2VideoModel

        model = SegmentAnything2VideoModel.__new__(SegmentAnything2VideoModel)

        h, w = 100, 100
        model._curr_frame_width = w
        model._curr_frame_height = h
        model._curr_prompts = [
            fol.Keypoints(keypoints=[
                fol.Keypoint(label="obj", points=[[0.5, 0.5]], index=0)
            ])
        ]
        model._curr_negative_prompts = [
            fol.Keypoints(keypoints=[
                fol.Keypoint(points=[[0.2, 0.2], [0.8, 0.8]])
            ])
        ]

        mock_mask = torch.ones((1, 1, h, w), dtype=torch.float32)

        model.model = mock.MagicMock()
        model.model.init_state.return_value = "mock_state"
        model.model.propagate_in_video.return_value = [
            (0, [0], mock_mask)
        ]

        captured_calls = []
        def capture_add_points(inference_state, frame_idx, obj_id, points, labels):
            captured_calls.append({'points': points.copy(), 'labels': labels.copy()})
            return (None, None, None)

        model.model.add_new_points_or_box.side_effect = capture_add_points

        mock_video_reader = mock.MagicMock()
        mock_sample = mock.MagicMock()

        with mock.patch('fiftyone.utils.sam._to_sam_points') as mock_sam_points:
            mock_sam_points.side_effect = lambda pts, w, h, kp: (
                np.array([[int(p[0]*w), int(p[1]*h)] for p in pts]),
                np.ones(len(pts), dtype=int)
            )
            with mock.patch('fiftyone.utils.sam._mask_to_box', return_value=(0, 0, 100, 100)):
                model._forward_pass_points(mock_video_reader, mock_sample)

        assert len(captured_calls) == 1
        call = captured_calls[0]
        assert len(call['points']) == 3
        assert call['labels'][0] == 1
        assert call['labels'][1] == 0
        assert call['labels'][2] == 0

    def test_forward_pass_points_without_negative_keypoints(self):
        """Test video model _forward_pass_points works without negative keypoints"""
        import torch
        pytest.importorskip("sam2")

        from fiftyone.utils.sam2 import SegmentAnything2VideoModel

        model = SegmentAnything2VideoModel.__new__(SegmentAnything2VideoModel)

        h, w = 100, 100
        model._curr_frame_width = w
        model._curr_frame_height = h
        model._curr_prompts = [
            fol.Keypoints(keypoints=[
                fol.Keypoint(label="obj", points=[[0.5, 0.5]], index=0)
            ])
        ]
        model._curr_negative_prompts = None

        mock_mask = torch.ones((1, 1, h, w), dtype=torch.float32)

        model.model = mock.MagicMock()
        model.model.init_state.return_value = "mock_state"
        model.model.propagate_in_video.return_value = [
            (0, [0], mock_mask)
        ]

        captured_calls = []
        def capture_add_points(inference_state, frame_idx, obj_id, points, labels):
            captured_calls.append({'points': points.copy(), 'labels': labels.copy()})
            return (None, None, None)

        model.model.add_new_points_or_box.side_effect = capture_add_points

        mock_video_reader = mock.MagicMock()
        mock_sample = mock.MagicMock()

        with mock.patch('fiftyone.utils.sam._to_sam_points') as mock_sam_points:
            mock_sam_points.return_value = (np.array([[50, 50]]), np.array([1]))
            with mock.patch('fiftyone.utils.sam._mask_to_box', return_value=(0, 0, 100, 100)):
                model._forward_pass_points(mock_video_reader, mock_sample)

        assert len(captured_calls) == 1
        call = captured_calls[0]
        assert len(call['points']) == 1
        assert call['labels'][0] == 1


class TestToSamPointsLabels:
    """Test _to_sam_points respects point label attributes"""

    def test_sam2_labels_respected(self):
        """Test that sam2_labels on a Keypoint are used as point labels"""
        from fiftyone.utils.sam import _to_sam_points

        kp = fol.Keypoint(
            points=[[0.3, 0.3], [0.5, 0.5], [0.7, 0.7]],
            sam2_labels=[1, 1, 0],
        )
        _, labels = _to_sam_points(kp.points, 640, 480, kp)
        assert list(labels) == [1, 1, 0]

    def test_sam_labels_respected(self):
        """Test that sam_labels on a Keypoint are used as point labels"""
        from fiftyone.utils.sam import _to_sam_points

        kp = fol.Keypoint(
            points=[[0.3, 0.3], [0.5, 0.5]],
            sam_labels=[1, 0],
        )
        _, labels = _to_sam_points(kp.points, 640, 480, kp)
        assert list(labels) == [1, 0]

    def test_no_labels_defaults_to_positive(self):
        """Test that missing label attributes default to all ones"""
        from fiftyone.utils.sam import _to_sam_points

        kp = fol.Keypoint(
            points=[[0.3, 0.3], [0.5, 0.5], [0.7, 0.7]],
        )
        _, labels = _to_sam_points(kp.points, 640, 480, kp)
        assert list(labels) == [1, 1, 1]

    def test_sam2_labels_priority_over_sam_labels(self):
        """Test that sam2_labels takes priority when both are set"""
        from fiftyone.utils.sam import _to_sam_points

        kp = fol.Keypoint(
            points=[[0.3, 0.3], [0.5, 0.5]],
            sam2_labels=[1, 0],
            sam_labels=[0, 1],
        )
        _, labels = _to_sam_points(kp.points, 640, 480, kp)
        assert list(labels) == [1, 0]

    def test_sam2_labels_with_nan_points(self):
        """Test that NaN points are filtered and labels stay aligned"""
        from fiftyone.utils.sam import _to_sam_points

        kp = fol.Keypoint(
            points=[[0.3, 0.3], [float('nan'), float('nan')], [0.7, 0.7]],
            sam2_labels=[1, 0, 0],
        )
        pts, labels = _to_sam_points(kp.points, 640, 480, kp)
        assert len(pts) == 2
        assert list(labels) == [1, 0]

    def test_all_negative_labels(self):
        """Test that all-zero labels are passed through"""
        from fiftyone.utils.sam import _to_sam_points

        kp = fol.Keypoint(
            points=[[0.2, 0.2], [0.5, 0.5], [0.8, 0.8]],
            sam2_labels=[0, 0, 0],
        )
        _, labels = _to_sam_points(kp.points, 640, 480, kp)
        assert list(labels) == [0, 0, 0]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
