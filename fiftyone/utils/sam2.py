"""
`Segment Anything 2 <https://github.com/facebookresearch/segment-anything-2>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import cv2
import eta.core.utils as etau
import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.models as fom
import fiftyone.core.utils as fou
import fiftyone.utils.sam as fosam
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

sam2 = fou.lazy_import("sam2", callback=lambda: fou.ensure_import("sam2"))
samg = fou.lazy_import("sam2.automatic_mask_generator")
smip = fou.lazy_import("sam2.sam2_image_predictor")
smutil = fou.lazy_import("sam2.utils.misc")


logger = logging.getLogger(__name__)


def _subtract_negative_box_regions(mask, neg_detections, width, height):
    """Subtract negative bounding box regions from a segmentation mask.

    Args:
        mask: numpy array representing segmentation mask(s). Supports:
            - 2D (H, W) for video model
            - 3D (N, H, W) for image model
            - 4D (N, 1, H, W) for image model
        neg_detections: a :class:`fiftyone.core.labels.Detections` containing
            negative prompt boxes, or None
        width: image/frame width in pixels
        height: image/frame height in pixels

    Returns:
        the modified mask with negative regions zeroed out
    """
    if not neg_detections or not isinstance(neg_detections, fol.Detections):
        return mask

    if len(neg_detections.detections) == 0:
        return mask

    for neg_det in neg_detections.detections:
        box_xyxy = fosam._to_abs_boxes(
            np.array([neg_det.bounding_box]), width, height, chunk_size=1
        )
        box_abs = np.round(box_xyxy.squeeze()).astype(int)
        nx1, ny1, nx2, ny2 = (
            max(0, box_abs[0]),
            max(0, box_abs[1]),
            min(width, box_abs[2]),
            min(height, box_abs[3]),
        )
        if nx2 > nx1 and ny2 > ny1:
            if mask.ndim == 2:
                mask[ny1:ny2, nx1:nx2] = 0
            elif mask.ndim == 3:
                mask[:, ny1:ny2, nx1:nx2] = 0
            else:
                mask[:, 0, ny1:ny2, nx1:nx2] = 0

    return mask


class SegmentAnything2ImageModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`SegmentAnything2ImageModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.

    Args:
        auto_kwargs (None): a dictionary of keyword arguments to pass to
            ``segment_anything.SamAutomaticMaskGenerator(model, **auto_kwargs)``
        points_mask_index (None): an optional mask index to use for each
            keypoint output
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.auto_kwargs = self.parse_dict(d, "auto_kwargs", default=None)
        self.points_mask_index = self.parse_int(
            d, "points_mask_index", default=None
        )
        if self.points_mask_index and not 0 <= self.points_mask_index <= 2:
            raise ValueError("mask_index must be 0, 1, or 2")


class SegmentAnything2VideoModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`SegmentAnything2VideoModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)


class SegmentAnything2ImageModel(fosam.SegmentAnythingModel):
    """Wrapper for running `Segment Anything 2 <https://ai.meta.com/sam2/>`_
    inference on images.

    Box prompt example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=25, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("segment-anything-2-hiera-tiny-image-torch")

        # Prompt with boxes
        dataset.apply_model(
            model,
            label_field="segmentations",
            prompt_field="ground_truth",
        )

        session = fo.launch_app(dataset)

    Keypoint prompt example::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart")
        dataset = dataset.filter_labels("ground_truth", F("label") == "person")

        # Generate some keypoints
        model = foz.load_zoo_model("keypoint-rcnn-resnet50-fpn-coco-torch")
        dataset.default_skeleton = model.skeleton
        dataset.apply_model(model, label_field="gt")

        model = foz.load_zoo_model("segment-anything-2-hiera-tiny-image-torch")

        # Prompt with keypoints
        dataset.apply_model(
            model,
            label_field="segmentations",
            prompt_field="gt_keypoints",
        )

        session = fo.launch_app(dataset)

    Negative prompt example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

        model = foz.load_zoo_model("segment-anything-2-hiera-tiny-image-torch")

        # Use positive and negative prompts to refine segmentation
        dataset.apply_model(
            model,
            label_field="refined_segmentations",
            prompt_field="positive_detections",
            negative_prompt_field="negative_detections",
        )

        session = fo.launch_app(dataset)

    Automatic segmentation example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=5, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("segment-anything-2-hiera-tiny-image-torch")

        # Automatic segmentation
        dataset.apply_model(model, label_field="auto")

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`SegmentAnything2ImageModelConfig`
    """

    def __init__(self, config):
        dir(sam2)  # ensure package is installed
        super().__init__(config=config)

        self._curr_negative_prompts = None

    def _load_model(self, config):
        entrypoint = etau.get_function(config.entrypoint_fcn)
        model = entrypoint(
            config.entrypoint_args["model_cfg"],
            ckpt_path=config.model_path,
            device=self._device,
        )

        model = model.to(self._device)
        if self.using_half_precision:
            model = model.half()

        model.eval()

        return model

    def _load_predictor(self):
        return smip.SAM2ImagePredictor(self._model)

    def predict_all(self, imgs, samples=None):
        field_name = self._get_field()
        if field_name is not None and samples is not None:
            prompt_type, prompts, classes = self._parse_samples(
                samples, field_name
            )
        else:
            prompt_type, prompts, classes = None, None, None

        self._curr_prompt_type = prompt_type
        self._curr_prompts = prompts
        self._curr_classes = classes

        negative_field = None
        if "negative_prompt_field" in self.needs_fields:
            negative_field = self.needs_fields["negative_prompt_field"]
            if negative_field.startswith("frames."):
                negative_field = negative_field[len("frames."):]

        if negative_field and samples is not None:
            negative_prompts = []
            for sample in samples:
                try:
                    value = sample.get_field(negative_field)
                except AttributeError:
                    logger.warning(
                        "Sample %s has no field '%s'", sample.id, negative_field
                    )
                    value = None
                negative_prompts.append(value)
            self._curr_negative_prompts = negative_prompts
        else:
            self._curr_negative_prompts = None

        return self._predict_all(imgs)

    def _forward_pass_boxes(self, imgs):
        sam2_predictor = self._load_predictor()
        self._output_processor = fout.InstanceSegmenterOutputProcessor(
            self._curr_classes
        )
        outputs = []
        for idx, (img, detections) in enumerate(zip(imgs, self._curr_prompts)):
            ## If no detections, return empty tensors instead of running SAM
            if detections is None or len(detections.detections) == 0:
                h, w = img.shape[1], img.shape[2]
                outputs.append(
                    {
                        "boxes": torch.tensor([[]]),
                        "labels": torch.empty([0, 4]),
                        "masks": torch.empty([0, 1, h, w]),
                    }
                )
                continue
            inp = fosam._to_sam_input(img)
            sam2_predictor.set_image(inp)
            h, w = img.size(1), img.size(2)

            boxes = np.array([d.bounding_box for d in detections.detections])
            boxes_xyxy = fosam._to_abs_boxes(boxes, w, h)
            sam_boxes = np.round(boxes_xyxy).astype(int)

            labels = torch.tensor(
                [
                    self._curr_classes.index(d.label)
                    for d in detections.detections
                ],
                device=sam2_predictor.device,
            )

            masks, scores, _ = sam2_predictor.predict(
                point_coords=None,
                point_labels=None,
                box=sam_boxes[None, :],
                multimask_output=False,
            )

            if self._curr_negative_prompts and idx < len(self._curr_negative_prompts):
                masks = _subtract_negative_box_regions(
                    masks, self._curr_negative_prompts[idx], w, h
                )

            if masks.ndim == 3:
                masks = np.expand_dims(masks, axis=1)
            outputs.append(
                {
                    "boxes": torch.tensor(boxes_xyxy),
                    "labels": labels,
                    "masks": torch.tensor(masks, device=sam2_predictor.device),
                    "scores": torch.tensor(
                        scores, device=sam2_predictor.device
                    ),
                }
            )

        return outputs

    def _load_auto_generator(self):
        kwargs = self.config.auto_kwargs or {}
        return samg.SAM2AutomaticMaskGenerator(self._model, **kwargs)


class SegmentAnything2VideoModel(fom.SamplesMixin, fom.Model):
    """Wrapper for running `Segment Anything 2 <https://ai.meta.com/sam2>`_
    inference on videos.

    Video prompt example::

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("quickstart-video", max_samples=2)

        # Only retain detections in the first frame
        (
            dataset
            .match_frames(F("frame_number") > 1)
            .set_field("frames.detections", None)
            .save()
        )

        model = foz.load_zoo_model("segment-anything-2-hiera-tiny-video-torch")

        # Segment inside boxes and propagate to all frames
        dataset.apply_model(
            model,
            label_field="segmentations",
            prompt_field="frames.detections", # can contain Detections or Keypoints
        )

        session = fo.launch_app(dataset)

    Negative prompt example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-video", max_samples=1)

        model = foz.load_zoo_model("segment-anything-2-hiera-tiny-video-torch")

        # Use positive and negative prompts to refine segmentation
        dataset.apply_model(
            model,
            label_field="refined_segmentations",
            prompt_field="frames.positive_detections",
            negative_prompt_field="frames.negative_detections",
        )

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`SegmentAnything2VideoModelConfig`
    """

    def __init__(self, config):
        dir(sam2)  # ensure package is installed
        self._fields = {}

        self.config = config
        device = self.config.device
        if device is None:
            device = "cuda:0" if torch.cuda.is_available() else "cpu"
        self._device = torch.device(device)

        self._download_model(config)

        try:
            self.ctx = _load_video_frames_monkey_patch()
        except Exception as e:
            logger.warning(
                "Failed to monkey patch sam2.utils.misc.load_vide_frames: %s",
                e,
            )

        self.model = self._load_model(config)

        self._curr_prompt_type = None
        self._curr_prompts = None
        self._curr_negative_prompts = None
        self._curr_classes = None
        self._curr_frame_width = None
        self._curr_frame_height = None

    @property
    def media_type(self):
        return "video"

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _load_model(self, config):
        entrypoint = etau.get_function(config.entrypoint_fcn)
        with self.ctx:
            model = entrypoint(
                config.entrypoint_args["model_cfg"],
                ckpt_path=config.model_path,
                device=self._device,
            )
        return model

    def predict(self, video_reader, sample):
        field_name, negative_field_name = self._get_field()
        (
            self._curr_frame_width,
            self._curr_frame_height,
        ) = video_reader.frame_size
        self._curr_prompts = self._get_prompts(sample, field_name)
        self._curr_prompt_type = self._get_prompt_type(sample, field_name)
        if negative_field_name:
            self._curr_negative_prompts = self._get_prompts(sample, negative_field_name)
        else:
            self._curr_negative_prompts = None

        return self._forward_pass(video_reader, sample)

    def _get_field(self):
        if "prompt_field" in self.needs_fields:
            prompt_field = self.needs_fields["prompt_field"]
        else:
            prompt_field = next(iter(self.needs_fields.values()), None)

        if not prompt_field.startswith("frames."):
            raise ValueError(
                "'prompt_field' should be a frame field for segment anything 2 video model"
            )

        if prompt_field is None:
            raise AttributeError(
                "Missing required argument 'prompt_field' for segment anything 2 video model"
            )

        prompt_field = prompt_field[len("frames.") :]

        # Get negative_prompt_field if provided
        negative_prompt_field = None
        if "negative_prompt_field" in self.needs_fields:
            negative_prompt_field = self.needs_fields["negative_prompt_field"]
            if not negative_prompt_field.startswith("frames."):
                raise ValueError(
                    "'negative_prompt_field' should be a frame field for segment anything 2 video model"
                )
            negative_prompt_field = negative_prompt_field[len("frames.") :]

        return prompt_field, negative_prompt_field

    def _get_prompt_type(self, sample, field_name):
        for _, frame in sample.frames.items():
            value = frame.get_field(field_name)
            if value is None:
                continue

            if isinstance(value, fol.Detections):
                return "boxes"

            if isinstance(value, fol.Keypoints):
                return "points"

            raise ValueError(
                f"Unsupported prompt type {type(value)}. The supported field types are {(fol.Detections, fol.Keypoints)}"
            )

        raise ValueError(
            f"Frame field {field_name} is empty for all frames, please provide at least one value"
        )

    def _get_prompts(self, sample, field_name):
        prompts = []
        for _, frame in sample.frames.items():
            value = frame.get_field(field_name)
            if value is not None:
                prompts.append(value)
            else:
                prompts.append([])

        return prompts

    def _forward_pass(self, video_reader, sample):
        if self._curr_prompt_type == "boxes":
            return self._forward_pass_boxes(video_reader, sample)
        elif self._curr_prompt_type == "points":
            return self._forward_pass_points(video_reader, sample)

    def _forward_pass_boxes(self, video_reader, sample):
        video_path = (sample, video_reader)
        inference_state = self.model.init_state(video_path)

        classes_obj_id_map = {}
        kp_idx_obj_id_map = {}
        current_obj_idx = 0
        for frame_idx, frame_detections in enumerate(self._curr_prompts):
            if (
                len(frame_detections) == 0
                or len(frame_detections.detections) == 0
            ):
                continue
            for detection in frame_detections.detections:
                if detection.index is not None:
                    if detection.index in kp_idx_obj_id_map:
                        ann_obj_id = kp_idx_obj_id_map[detection.index]
                    else:
                        ann_obj_id = current_obj_idx
                        kp_idx_obj_id_map[detection.index] = ann_obj_id
                        current_obj_idx += 1
                else:
                    ann_obj_id = current_obj_idx
                    current_obj_idx += 1
                classes_obj_id_map[ann_obj_id] = detection.label
                box_xyxy = fosam._to_abs_boxes(
                    np.array([detection.bounding_box]),
                    self._curr_frame_width,
                    self._curr_frame_height,
                    chunk_size=1,
                )
                box = np.round(box_xyxy.squeeze(axis=0)).astype(int)
                _, _, _ = self.model.add_new_points_or_box(
                    inference_state=inference_state,
                    frame_idx=frame_idx,
                    obj_id=ann_obj_id,
                    box=box,
                )

        sample_detections = {}
        for (
            out_frame_idx,
            out_obj_ids,
            out_mask_logits,
        ) in self.model.propagate_in_video(inference_state):
            detections = []
            for i, out_obj_id in enumerate(out_obj_ids):
                mask = np.squeeze(
                    (out_mask_logits[i] > 0.0).cpu().numpy(), axis=0
                )

                if self._curr_negative_prompts and out_frame_idx < len(self._curr_negative_prompts):
                    mask = _subtract_negative_box_regions(
                        mask,
                        self._curr_negative_prompts[out_frame_idx],
                        self._curr_frame_width,
                        self._curr_frame_height,
                    )

                box = fosam._mask_to_box(mask)
                if box is None:
                    continue
                label = classes_obj_id_map[out_obj_id]
                x1, y1, x2, y2 = box
                bounding_box = [
                    x1 / self._curr_frame_width,
                    y1 / self._curr_frame_height,
                    (x2 - x1) / self._curr_frame_width,
                    (y2 - y1) / self._curr_frame_height,
                ]
                mask = mask[
                    int(round(y1)) : int(round(y2)),
                    int(round(x1)) : int(round(x2)),
                ]
                detections.append(
                    fol.Detection(
                        label=label,
                        bounding_box=bounding_box,
                        mask=mask,
                        index=out_obj_id,
                    )
                )
            sample_detections[int(out_frame_idx) + 1] = fol.Detections(
                detections=detections
            )
        return sample_detections

    def _forward_pass_points(self, video_reader, sample):
        video_path = (sample, video_reader)
        inference_state = self.model.init_state(video_path)

        classes_obj_id_map = {}
        kp_idx_obj_id_map = {}
        current_obj_idx = 0
        for frame_idx, frame_keypoints in enumerate(self._curr_prompts):
            if (
                len(frame_keypoints) == 0
                or len(frame_keypoints.keypoints) == 0
            ):
                continue
            for keypoint in frame_keypoints.keypoints:
                if keypoint.index is not None:
                    if keypoint.index in kp_idx_obj_id_map:
                        ann_obj_id = kp_idx_obj_id_map[keypoint.index]
                    else:
                        ann_obj_id = current_obj_idx
                        kp_idx_obj_id_map[keypoint.index] = ann_obj_id
                        current_obj_idx += 1
                else:
                    ann_obj_id = current_obj_idx
                    current_obj_idx += 1
                classes_obj_id_map[ann_obj_id] = keypoint.label
                points, labels = fosam._to_sam_points(
                    keypoint.points,
                    self._curr_frame_width,
                    self._curr_frame_height,
                    keypoint,
                )

                if self._curr_negative_prompts and frame_idx < len(self._curr_negative_prompts):
                    neg_frame_keypoints = self._curr_negative_prompts[frame_idx]
                    if neg_frame_keypoints and isinstance(neg_frame_keypoints, fol.Keypoints) and len(neg_frame_keypoints.keypoints) > 0:
                        for neg_keypoint in neg_frame_keypoints.keypoints:
                            neg_points, _ = fosam._to_sam_points(
                                neg_keypoint.points,
                                self._curr_frame_width,
                                self._curr_frame_height,
                                neg_keypoint,
                            )
                            neg_labels = np.zeros(len(neg_points), dtype=int)
                            points = np.vstack([points, neg_points])
                            labels = np.concatenate([labels, neg_labels])

                _, _, _ = self.model.add_new_points_or_box(
                    inference_state=inference_state,
                    frame_idx=frame_idx,
                    obj_id=ann_obj_id,
                    points=points,
                    labels=labels,
                )

        sample_detections = {}
        for (
            out_frame_idx,
            out_obj_ids,
            out_mask_logits,
        ) in self.model.propagate_in_video(inference_state):
            detections = []
            for i, out_obj_id in enumerate(out_obj_ids):
                mask = np.squeeze(
                    (out_mask_logits[i] > 0.0).cpu().numpy(), axis=0
                )
                box = fosam._mask_to_box(mask)
                if box is None:
                    continue
                label = classes_obj_id_map[out_obj_id]
                x1, y1, x2, y2 = box
                bounding_box = [
                    x1 / self._curr_frame_width,
                    y1 / self._curr_frame_height,
                    (x2 - x1) / self._curr_frame_width,
                    (y2 - y1) / self._curr_frame_height,
                ]
                mask = mask[
                    int(round(y1)) : int(round(y2)),
                    int(round(x1)) : int(round(x2)),
                ]
                detections.append(
                    fol.Detection(
                        label=label,
                        bounding_box=bounding_box,
                        mask=mask,
                        index=out_obj_id,
                    )
                )
            sample_detections[int(out_frame_idx) + 1] = fol.Detections(
                detections=detections
            )
        return sample_detections


def load_fiftyone_video_frames(
    video_path,
    image_size,
    offload_video_to_cpu,
    img_mean=(0.485, 0.456, 0.406),
    img_std=(0.229, 0.224, 0.225),
    async_loading_frames=False,
    compute_device=torch.device("cuda"),
):
    sample, video_reader = video_path
    img_mean = torch.tensor(img_mean, dtype=torch.float32)[:, None, None]
    img_std = torch.tensor(img_std, dtype=torch.float32)[:, None, None]

    num_frames = len(sample.frames)
    try:
        images = torch.zeros(
            num_frames, 3, image_size, image_size, dtype=torch.float32
        )
    except Exception as e:
        raise (e)
    for frame_number in range(num_frames):
        current_frame = video_reader.read()
        resized_frame = (
            cv2.resize(current_frame, (image_size, image_size)) / 255.0
        )
        img = torch.from_numpy(resized_frame).permute(2, 0, 1)
        images[frame_number] = img

    video_width, video_height = (
        current_frame.shape[1],
        current_frame.shape[0],
    )
    if not offload_video_to_cpu:
        images = images.to(compute_device)
        img_mean = img_mean.to(compute_device)
        img_std = img_std.to(compute_device)

    images -= img_mean
    images /= img_std
    return images, video_height, video_width


def _load_video_frames_monkey_patch():
    entrypoint_module = smutil.load_video_frames

    return fou.MonkeyPatchFunction(
        entrypoint_module,
        load_fiftyone_video_frames,
    )
