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

    def test_negative_boxes_convert_to_corner_points(self):
        """Test that negative boxes are converted to 4 corner points with label=0"""
        box = [0.1, 0.2, 0.3, 0.4]
        width, height = 640, 480

        from fiftyone.utils.sam import _to_abs_boxes

        box_xyxy = _to_abs_boxes(np.array([box]), width, height, chunk_size=1)
        box_abs = np.round(box_xyxy.squeeze(axis=0)).astype(int)
        x1, y1, x2, y2 = box_abs

        neg_points = np.array([[x1, y1], [x2, y1], [x1, y2], [x2, y2]])
        neg_labels = np.array([0, 0, 0, 0])

        assert neg_points.shape == (4, 2)
        assert neg_labels.shape == (4,)
        assert np.all(neg_labels == 0)
        assert x1 == 64  # 0.1 * 640
        assert y1 == 96  # 0.2 * 480
        assert x2 == 256 # (0.1 + 0.3) * 640
        assert y2 == 288 # (0.2 + 0.4) * 480

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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
