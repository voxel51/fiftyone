"""
`Segment Anything 3 <https://github.com/facebookresearch/sam3>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.models as fom
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

sam3_builder = fou.lazy_import(
    "sam3.model_builder",
    callback=lambda: fou.ensure_package("sam3"),
)
sam3_processor_module = fou.lazy_import(
    "sam3.model.sam3_image_processor",
    callback=lambda: fou.ensure_package("sam3"),
)

logger = logging.getLogger(__name__)


class SegmentAnything3ImageModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`SegmentAnything3ImageModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        text_prompt (None): the default text prompt to use for segmentation
        confidence_threshold (None): confidence threshold passed to
            Sam3Processor; defers to Sam3Processor default if None
        mask_threshold (None): mask binarization threshold for the output
            processor; defers to default 0.5 if None
    """

    def __init__(self, d):
        d = self.init(d)
        d["raw_inputs"] = True
        super().__init__(d)

        self.text_prompt = self.parse_string(d, "text_prompt", default=None)
        self.confidence_threshold = self.parse_number(
            d, "confidence_threshold", default=None
        )
        self.mask_threshold = self.parse_number(
            d, "mask_threshold", default=None
        )


class SegmentAnything3VideoModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`SegmentAnything3VideoModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        text_prompt (None): the default text prompt to use for segmentation
        confidence_threshold (None): confidence threshold; defers to
            Sam3Processor default if None
        mask_threshold (None): mask binarization threshold; defers to default
            0.5 if None
        propagation_direction ("forward"): direction to propagate in video;
            supported values are ``"forward"``, ``"backward"``, and ``"both"``
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.text_prompt = self.parse_string(d, "text_prompt", default=None)
        self.confidence_threshold = self.parse_number(
            d, "confidence_threshold", default=None
        )
        self.mask_threshold = self.parse_number(
            d, "mask_threshold", default=None
        )
        self.propagation_direction = self.parse_string(
            d, "propagation_direction", default="forward"
        )


class SegmentAnything3ImageModel(fout.TorchSamplesMixin, fout.TorchImageModel):
    """Wrapper for running `Segment Anything 3 <https://ai.meta.com/sam3/>`_
    inference on images.

    SAM3 performs Promptable Concept Segmentation (PCS) - given a text prompt,
    it finds and segments ALL instances of the concept in the image.

    Text prompt example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=25, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("segment-anything-3-image-torch")

        # Segment all "person" instances
        dataset.apply_model(
            model,
            label_field="sam3_persons",
            text_prompt="person",
        )

        session = fo.launch_app(dataset)

    Box prompt example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=25, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("segment-anything-3-image-torch")

        # Use existing detections as box prompts to define concepts
        dataset.apply_model(
            model,
            label_field="segmentations",
            prompt_field="ground_truth",
        )

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`SegmentAnything3ImageModelConfig`
    """

    def __init__(self, config: SegmentAnything3ImageModelConfig) -> None:
        self._processor = None
        self._curr_prompt_type = None
        self._curr_prompts = None
        self._curr_classes = None
        fout.TorchSamplesMixin.__init__(self)
        fout.TorchImageModel.__init__(self, config)

    @property
    def media_type(self) -> str:
        return "image"

    @property
    def needs_fields(self) -> Dict[str, str]:
        return self._fields

    @needs_fields.setter
    def needs_fields(self, fields: Dict[str, str]) -> None:
        if "text_prompt" in fields:
            self.config.text_prompt = fields.pop("text_prompt")
        self._fields = fields

    @property
    def prompts(self) -> Optional[str]:
        return self.config.text_prompt

    @prompts.setter
    def prompts(self, prompts: Optional[str]) -> None:
        self.config.text_prompt = prompts

    def _download_model(self, config: SegmentAnything3ImageModelConfig) -> None:
        pass

    def _load_model(
        self, config: SegmentAnything3ImageModelConfig
    ) -> Any:
        device = config.device
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"

        model = sam3_builder.build_sam3_image_model(
            device=device,
            load_from_HF=True,
        )
        kwargs = {}
        if config.confidence_threshold is not None:
            kwargs["confidence_threshold"] = config.confidence_threshold
        self._processor = sam3_processor_module.Sam3Processor(model, **kwargs)
        return model

    def build_get_item(
        self, field_mapping: Optional[Dict[str, str]] = None
    ) -> fout.ImageGetItem:
        return fout.ImageGetItem(
            raw_inputs=True,
            field_mapping=field_mapping,
        )

    def _get_field(self) -> Optional[str]:
        if "prompt_field" in self.needs_fields:
            return self.needs_fields["prompt_field"]
        return None

    def predict_all(
        self, imgs: List, samples: Optional[List] = None
    ) -> List[fol.Detections]:
        field_name = self._get_field()
        if field_name is not None and samples is not None:
            prompt_type, prompts, classes = self._parse_samples(
                samples, field_name
            )
        else:
            if self.config.text_prompt is not None:
                prompt_type = "text"
                prompts = None
                classes = [self.config.text_prompt]
            else:
                prompt_type, prompts, classes = None, None, None

        self._curr_prompt_type = prompt_type
        self._curr_prompts = prompts
        self._curr_classes = classes

        if classes is not None:
            op_kwargs = {}
            if self.config.mask_threshold is not None:
                op_kwargs["mask_thresh"] = self.config.mask_threshold
            self._output_processor = fout.InstanceSegmenterOutputProcessor(
                classes, **op_kwargs
            )
        else:
            self._output_processor = None

        return self._predict_all(imgs)

    def _parse_samples(
        self, samples: List, field_name: str
    ) -> Tuple[str, List, List[str]]:
        prompts = []
        classes = set()
        for sample in samples:
            value = sample.get_field(field_name)
            if value is None:
                prompts.append(None)
                continue

            if not isinstance(value, fol.Detections):
                raise ValueError(
                    "Unsupported prompt type %s. Supported types: %s"
                    % (type(value), (fol.Detections,))
                )

            prompts.append(value)
            classes.update(d.label for d in value.detections)

        return "boxes", prompts, sorted(classes)

    def _forward_pass(self, imgs: List) -> List:
        forward_methods = {
            "text": self._forward_pass_text,
            "boxes": self._forward_pass_boxes,
        }
        method = forward_methods.get(self._curr_prompt_type)
        if method is None:
            logger.warning(
                "No text_prompt or prompt_field provided. "
                "Returning empty detections."
            )
            self._output_processor = None
            return [fol.Detections(detections=[]) for _ in imgs]

        return method(imgs)

    def _forward_pass_text(
        self, imgs: List
    ) -> List[Dict[str, Any]]:
        outputs = []
        for img in imgs:
            state = self._processor.set_image(img)
            output = self._processor.set_text_prompt(
                self.config.text_prompt, state
            )

            masks = output.get("masks")
            boxes = output.get("boxes")
            scores = output.get("scores")

            if masks is None or len(masks) == 0:
                outputs.append(_empty_output(img))
                continue

            if masks.ndim == 3:
                masks = masks.unsqueeze(1)

            labels = torch.zeros(len(masks), dtype=torch.int64)

            outputs.append({
                "boxes": boxes,
                "labels": labels,
                "masks": masks,
                "scores": scores,
            })

        return outputs

    def _forward_pass_boxes(
        self, imgs: List
    ) -> List[Dict[str, Any]]:
        outputs = []
        for img, detections in zip(imgs, self._curr_prompts):
            if detections is None or len(detections.detections) == 0:
                outputs.append(_empty_output(img))
                continue

            state = self._processor.set_image(img)

            all_boxes = []
            all_labels = []
            all_masks = []
            all_scores = []

            for det in detections.detections:
                self._processor.reset_all_prompts(state)
                x_norm, y_norm, w_norm, h_norm = det.bounding_box
                cx_norm = x_norm + w_norm / 2
                cy_norm = y_norm + h_norm / 2

                output = self._processor.add_geometric_prompt(
                    box=[cx_norm, cy_norm, w_norm, h_norm],
                    label=True,
                    state=state,
                )

                masks = output.get("masks")
                boxes = output.get("boxes")
                scores = output.get("scores")

                if masks is None or len(masks) == 0:
                    continue

                label_idx = self._curr_classes.index(det.label)

                for m, b, s in zip(masks, boxes, scores):
                    if m.ndim == 2:
                        m = m.unsqueeze(0)
                    all_masks.append(m)
                    all_boxes.append(b)
                    all_labels.append(label_idx)
                    all_scores.append(s)

            if not all_masks:
                outputs.append(_empty_output(img))
                continue

            outputs.append({
                "boxes": torch.stack(all_boxes),
                "labels": torch.tensor(all_labels, dtype=torch.int64),
                "masks": torch.stack(all_masks),
                "scores": torch.stack(all_scores),
            })

        return outputs


class SegmentAnything3VideoModel(fom.SamplesMixin, fom.Model):
    """Wrapper for running `Segment Anything 3 <https://ai.meta.com/sam3>`_
    inference on videos.

    SAM3 Video performs Promptable Concept Segmentation (PCS) on videos -
    given a text prompt, it finds, segments, and tracks ALL instances of the
    concept across video frames.

    Video prompt example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-video", max_samples=2)

        model = foz.load_zoo_model("segment-anything-3-video-torch")

        # Segment and track all "person" instances across frames
        dataset.apply_model(
            model,
            label_field="sam3_tracking",
            text_prompt="person",
        )

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`SegmentAnything3VideoModelConfig`
    """

    def __init__(self, config: SegmentAnything3VideoModelConfig) -> None:
        self._fields = {}
        self.config = config
        self.needs_fields = {}

        device = config.device
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self._device = torch.device(device)

        self._propagation_direction = config.propagation_direction

        self._download_model(config)
        self._predictor = self._load_model(config)

    @property
    def media_type(self) -> str:
        return "video"

    @property
    def needs_fields(self) -> Dict[str, str]:
        return self._fields

    @needs_fields.setter
    def needs_fields(self, fields: Dict[str, str]) -> None:
        if "text_prompt" in fields:
            self.config.text_prompt = fields.pop("text_prompt")
        self._fields = fields

    @property
    def prompts(self) -> Optional[str]:
        return self.config.text_prompt

    @prompts.setter
    def prompts(self, prompts: Optional[str]) -> None:
        self.config.text_prompt = prompts

    def _download_model(
        self, config: SegmentAnything3VideoModelConfig
    ) -> None:
        pass

    def _load_model(
        self, config: SegmentAnything3VideoModelConfig
    ) -> Any:
        return sam3_builder.build_sam3_video_predictor(device=self._device)

    def _get_text_prompt(
        self, sample: Optional[Any] = None
    ) -> Optional[str]:
        if self.config.text_prompt is not None:
            return self.config.text_prompt

        if "text_prompt" in self.needs_fields:
            field_name = self.needs_fields["text_prompt"]
            if sample is not None:
                return sample.get_field(field_name)

        return None

    def predict(
        self, video_reader: Any, sample: Any
    ) -> Dict[int, fol.Detections]:
        text_prompt = self._get_text_prompt(sample)

        if text_prompt is None:
            logger.warning(
                "No text_prompt provided. Returning empty detections."
            )
            return {}

        video_path = sample.filepath
        frame_width, frame_height = video_reader.frame_size

        response = self._predictor.handle_request(
            request={
                "type": "start_session",
                "resource_path": video_path,
            }
        )
        session_id = response["session_id"]

        try:
            self._predictor.handle_request(
                request={
                    "type": "add_prompt",
                    "session_id": session_id,
                    "frame_index": 0,
                    "text": text_prompt,
                }
            )

            sample_detections = {}

            for frame_result in self._predictor.handle_stream_request(
                request={
                    "type": "propagate_in_video",
                    "session_id": session_id,
                    "propagation_direction": self._propagation_direction,
                }
            ):
                frame_index = frame_result.get("frame_index", 0)
                outputs = frame_result.get("outputs", {})

                detections = self._parse_frame_outputs(
                    outputs, frame_width, frame_height, text_prompt
                )

                if detections:
                    frame_number = frame_index + 1
                    sample_detections[frame_number] = fol.Detections(
                        detections=detections
                    )

        except Exception:
            logger.exception("SAM3 video prediction failed")
            raise

        finally:
            self._predictor.handle_request(
                request={
                    "type": "close_session",
                    "session_id": session_id,
                }
            )

        return sample_detections

    def _parse_frame_outputs(
        self,
        outputs: Dict[str, Any],
        frame_width: int,
        frame_height: int,
        label: str,
    ) -> List[fol.Detection]:
        masks = outputs.get("out_binary_masks")
        boxes_xywh = outputs.get("out_boxes_xywh")
        scores = outputs.get("out_probs")
        obj_ids = outputs.get("out_obj_ids")

        if masks is None or len(masks) == 0:
            return []

        if boxes_xywh is None or scores is None or obj_ids is None:
            logger.warning("Missing output arrays, skipping frame")
            return []

        if hasattr(masks, "cpu"):
            masks = masks.cpu().numpy()
        if hasattr(boxes_xywh, "cpu"):
            boxes_xywh = boxes_xywh.cpu().numpy()
        if hasattr(scores, "cpu"):
            scores = scores.cpu().numpy()
        if hasattr(obj_ids, "cpu"):
            obj_ids = obj_ids.cpu().numpy()

        if len(masks) != len(boxes_xywh) or len(masks) != len(scores):
            logger.warning(
                "Mismatched output lengths (masks=%d, boxes=%d, scores=%d), "
                "skipping frame",
                len(masks), len(boxes_xywh), len(scores)
            )
            return []

        detections = []

        for i, (mask, box_xywh, score) in enumerate(
            zip(masks, boxes_xywh, scores)
        ):
            obj_id = obj_ids[i] if i < len(obj_ids) else i

            if hasattr(score, "item"):
                score = score.item()

            if (
                self.config.confidence_threshold is not None
                and score < self.config.confidence_threshold
            ):
                continue

            x_norm, y_norm, w_norm, h_norm = box_xywh
            bounding_box = [
                max(0.0, float(x_norm)),
                max(0.0, float(y_norm)),
                min(1.0 - x_norm, float(w_norm)),
                min(1.0 - y_norm, float(h_norm)),
            ]

            x1_int = max(0, round(x_norm * frame_width))
            y1_int = max(0, round(y_norm * frame_height))
            x2_int = min(frame_width, round((x_norm + w_norm) * frame_width))
            y2_int = min(
                frame_height, round((y_norm + h_norm) * frame_height)
            )

            if y2_int <= y1_int or x2_int <= x1_int:
                continue

            mask_crop = mask[y1_int:y2_int, x1_int:x2_int]

            if mask_crop.size == 0:
                continue

            if (
                mask_crop.dtype != bool
                and self.config.mask_threshold is not None
            ):
                mask_crop = mask_crop > self.config.mask_threshold

            detections.append(
                fol.Detection(
                    label=label,
                    bounding_box=bounding_box,
                    mask=mask_crop,
                    confidence=float(score),
                    index=int(obj_id),
                )
            )

        return detections


def _get_image_size(img: Any) -> Tuple[int, int]:
    """Get (width, height) from an image tensor, ndarray, or PIL Image."""
    if isinstance(img, torch.Tensor):
        return img.shape[-1], img.shape[-2]

    if hasattr(img, "size") and callable(getattr(img, "size", None)):
        # PIL Image — .size is a property returning (w, h)
        return img.size

    if hasattr(img, "size"):
        # PIL Image fallback
        return img.size

    return img.shape[1], img.shape[0]


def _empty_output(img: Any) -> Dict[str, Any]:
    """Build an empty output dict for InstanceSegmenterOutputProcessor."""
    w, h = _get_image_size(img)
    return {
        "boxes": torch.empty([0, 4]),
        "labels": torch.empty([0], dtype=torch.int64),
        "masks": torch.empty([0, 1, h, w]),
    }
