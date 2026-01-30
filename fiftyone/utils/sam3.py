"""
`Segment Anything 3 <https://github.com/facebookresearch/sam3>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

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
        confidence_threshold (0.5): minimum confidence threshold for detections
        mask_threshold (0.5): threshold for converting soft masks to binary
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.text_prompt = self.parse_string(d, "text_prompt", default=None)
        self.confidence_threshold = self.parse_number(
            d, "confidence_threshold", default=0.5
        )
        self.mask_threshold = self.parse_number(
            d, "mask_threshold", default=0.5
        )


class SegmentAnything3VideoModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`SegmentAnything3VideoModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        text_prompt (None): the default text prompt to use for segmentation
        confidence_threshold (0.5): minimum confidence threshold for detections
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.text_prompt = self.parse_string(d, "text_prompt", default=None)
        self.confidence_threshold = self.parse_number(
            d, "confidence_threshold", default=0.5
        )


class SegmentAnything3ImageModel(fom.PromptMixin, fout.TorchImageModel):
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

    def __init__(self, config):
        self._text_prompt = config.text_prompt
        self._confidence_threshold = config.confidence_threshold
        self._mask_threshold = config.mask_threshold
        self._processor = None
        if not hasattr(self, 'needs_fields'):
            self.needs_fields = {}
        super().__init__(config)

    @property
    def media_type(self):
        return "image"

    @property
    def prompts(self):
        return self._text_prompt

    @prompts.setter
    def prompts(self, prompts):
        self._text_prompt = prompts

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        device = config.device
        if device is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
        elif device.startswith("cuda:"):
            device = "cuda"

        model = sam3_builder.build_sam3_image_model(
            device=device,
            load_from_HF=True,
        )
        self._processor = sam3_processor_module.Sam3Processor(
            model,
            confidence_threshold=self._confidence_threshold,
        )
        return model

    def _get_text_prompt(self, sample=None):
        """Get text prompt from config, prompt field, or sample."""
        if self._text_prompt is not None:
            return self._text_prompt

        if "text_prompt" in self.needs_fields:
            field_name = self.needs_fields["text_prompt"]
            if sample is not None:
                return sample.get_field(field_name)

        return None

    def _get_box_prompts(self, sample, field_name):
        """Extract box prompts from a Detections field."""
        if sample is None or field_name is None:
            return None, None

        value = sample.get_field(field_name)
        if value is None or not isinstance(value, fol.Detections):
            return None, None

        if len(value.detections) == 0:
            return None, None

        return value, [d.label for d in value.detections]

    def predict(self, img, sample=None):
        """Run SAM3 inference on a single image.

        Args:
            img: the image tensor
            sample: the optional :class:`fiftyone.core.sample.Sample`

        Returns:
            a :class:`fiftyone.core.labels.Detections` instance
        """
        return self.predict_all([img], [sample] if sample else None)[0]

    def predict_all(self, imgs, samples=None):
        """Run SAM3 inference on a batch of images.

        Args:
            imgs: a list of image tensors
            samples: an optional list of :class:`fiftyone.core.sample.Sample`

        Returns:
            a list of :class:`fiftyone.core.labels.Detections` instances
        """
        if samples is None:
            samples = [None] * len(imgs)

        prompt_field = None
        if "prompt_field" in self.needs_fields:
            prompt_field = self.needs_fields["prompt_field"]

        results = []
        for img, sample in zip(imgs, samples):
            detections = self._predict_single(img, sample, prompt_field)
            results.append(detections)

        return results

    def _predict_single(self, img, sample, prompt_field):
        """Run inference on a single image."""
        img_pil = self._to_pil(img)
        width, height = img_pil.size

        state = self._processor.set_image(img_pil)

        text_prompt = self._get_text_prompt(sample)
        box_prompts, box_labels = None, None

        if prompt_field is not None and sample is not None:
            box_prompts, box_labels = self._get_box_prompts(sample, prompt_field)

        if text_prompt is not None:
            output = self._processor.set_text_prompt(text_prompt, state)
            return self._parse_output(output, width, height, text_prompt)

        elif box_prompts is not None:
            return self._predict_with_boxes(
                state, box_prompts, box_labels, width, height
            )

        else:
            logger.warning(
                "No text_prompt or prompt_field provided. "
                "Returning empty detections."
            )
            return fol.Detections(detections=[])

    def _predict_with_boxes(
        self, state, box_prompts, box_labels, width, height
    ):
        """Run inference using box prompts."""
        all_detections = []

        for detection, label in zip(box_prompts.detections, box_labels):
            x, y, w, h = detection.bounding_box
            cx = x + w / 2
            cy = y + h / 2
            box_cxcywh = [cx, cy, w, h]

            output = self._processor.add_geometric_prompt(
                box=box_cxcywh,
                label=True,
                state=state,
            )

            detections = self._parse_output(output, width, height, label)
            all_detections.extend(detections.detections)

        return fol.Detections(detections=all_detections)

    def _parse_output(self, output, width, height, label):
        """Convert SAM3 output to FiftyOne Detections."""
        masks = output.get("masks", [])
        boxes = output.get("boxes", [])
        scores = output.get("scores", [])

        detections = []
        for mask, box, score in zip(masks, boxes, scores):
            if hasattr(score, "item"):
                score = score.item()

            if score < self._confidence_threshold:
                continue

            if hasattr(mask, "cpu"):
                mask = mask.cpu().numpy()
            if hasattr(box, "cpu"):
                box = box.cpu().numpy()

            if mask.ndim == 3:
                mask = np.squeeze(mask, axis=0)

            x1, y1, x2, y2 = box
            bounding_box = [
                x1 / width,
                y1 / height,
                (x2 - x1) / width,
                (y2 - y1) / height,
            ]

            y1_int, y2_int = int(round(y1)), int(round(y2))
            x1_int, x2_int = int(round(x1)), int(round(x2))

            if y2_int <= y1_int or x2_int <= x1_int:
                continue

            mask_crop = mask[y1_int:y2_int, x1_int:x2_int]

            if mask_crop.size == 0:
                continue

            if mask_crop.dtype != bool:
                mask_crop = mask_crop > self._mask_threshold

            detections.append(
                fol.Detection(
                    label=label,
                    bounding_box=bounding_box,
                    mask=mask_crop,
                    confidence=score,
                )
            )

        return fol.Detections(detections=detections)

    def _to_pil(self, img):
        """Convert image tensor to PIL Image."""
        from PIL import Image

        if isinstance(img, Image.Image):
            return img

        if isinstance(img, torch.Tensor):
            img = img.cpu().numpy()
            if img.ndim == 3 and img.shape[0] in (1, 3):
                img = np.transpose(img, (1, 2, 0))
            if img.max() <= 1.0:
                img = (img * 255).astype(np.uint8)

        return Image.fromarray(img)


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

    def __init__(self, config):
        self._fields = {}
        self.config = config
        if not hasattr(self, 'needs_fields'):
            self.needs_fields = {}

        device = config.device
        if device is None:
            device = "cuda:0" if torch.cuda.is_available() else "cpu"
        self._device = torch.device(device)

        self._text_prompt = config.text_prompt
        self._confidence_threshold = config.confidence_threshold

        self._download_model(config)
        self._predictor = self._load_model(config)

    @property
    def media_type(self):
        return "video"

    @property
    def prompts(self):
        return self._text_prompt

    @prompts.setter
    def prompts(self, prompts):
        self._text_prompt = prompts

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        return sam3_builder.build_sam3_video_predictor()

    def _get_text_prompt(self, sample=None):
        """Get text prompt from config or needs_fields."""
        if self._text_prompt is not None:
            return self._text_prompt

        if "text_prompt" in self.needs_fields:
            field_name = self.needs_fields["text_prompt"]
            if sample is not None:
                return sample.get_field(field_name)

        return None

    def predict(self, video_reader, sample):
        """Run SAM3 inference on a video.

        Args:
            video_reader: the video reader
            sample: the :class:`fiftyone.core.sample.Sample`

        Returns:
            a dict mapping frame numbers to
            :class:`fiftyone.core.labels.Detections` instances
        """
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
            response = self._predictor.handle_request(
                request={
                    "type": "add_prompt",
                    "session_id": session_id,
                    "frame_index": 0,
                    "text": text_prompt,
                }
            )

            sample_detections = {}
            outputs = response.get("outputs", {})

            for frame_idx_str, frame_output in outputs.items():
                frame_number = int(frame_idx_str) + 1

                masks = frame_output.get("masks", [])
                boxes = frame_output.get("boxes", [])
                scores = frame_output.get("scores", [])
                obj_ids = frame_output.get("obj_ids", list(range(len(masks))))

                detections = []
                for i, (mask, box, score) in enumerate(zip(masks, boxes, scores)):
                    obj_id = obj_ids[i] if i < len(obj_ids) else i

                    if hasattr(score, "item"):
                        score = score.item()

                    if score < self._confidence_threshold:
                        continue

                    if hasattr(mask, "cpu"):
                        mask = mask.cpu().numpy()
                    if hasattr(box, "cpu"):
                        box = box.cpu().numpy()

                    x1, y1, x2, y2 = box
                    bounding_box = [
                        x1 / frame_width,
                        y1 / frame_height,
                        (x2 - x1) / frame_width,
                        (y2 - y1) / frame_height,
                    ]

                    y1_int, y2_int = int(round(y1)), int(round(y2))
                    x1_int, x2_int = int(round(x1)), int(round(x2))

                    if y2_int <= y1_int or x2_int <= x1_int:
                        continue

                    mask_crop = mask[y1_int:y2_int, x1_int:x2_int]

                    if mask_crop.size == 0:
                        continue

                    if mask_crop.dtype != bool:
                        mask_crop = mask_crop > 0.5

                    detections.append(
                        fol.Detection(
                            label=text_prompt,
                            bounding_box=bounding_box,
                            mask=mask_crop,
                            confidence=score,
                            index=obj_id,
                        )
                    )

                sample_detections[frame_number] = fol.Detections(
                    detections=detections
                )

        finally:
            self._predictor.handle_request(
                request={
                    "type": "close_session",
                    "session_id": session_id,
                }
            )

        return sample_detections
