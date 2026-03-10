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


class SegmentAnything2ImageModelConfig(fosam.SegmentAnythingModelConfig):
    """Configuration for running a :class:`SegmentAnything2ImageModel`.

    See :class:`fiftyone.utils.torch.TorchImageModelConfig` for additional
    arguments.
    """

    pass


class _SAM2Predictor(fosam._SAMPredictor):
    def __init__(self, model):
        self.processor = smip.SAM2ImagePredictor(model)
        self._image_id = None
        # Create an alias since SAM2ImagePredictor doesn't have predict_torch.
        if not hasattr(self.processor, "predict_torch"):
            self.processor.predict_torch = self.processor.predict

    def image_transform(self, img):
        # SAM2 does image pre-processing when it calls SAM2ImagePredictor.set_image.
        # No straight-forward way to decouple them other than extracting the functionality.
        return img, img.shape[:2]

    def box_transform(self, boxes_xyxy, img_hw):
        return self.processor._transforms.transform_boxes(
            torch.tensor(boxes_xyxy, dtype=torch.float),
            normalize=True,
            orig_hw=img_hw,
        )

    def point_transform(self, points, img_hw, point_labels=None):
        norm_points, labels = fosam._to_sam_points(
            points,
            height=1,
            width=1,
            point_labels=point_labels,
        )
        unnorm_points = self.processor._transforms.transform_coords(
            norm_points
        )
        return torch.tensor(unnorm_points), torch.tensor(labels)


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

        if config.entrypoint_args is None:
            config.entrypoint_args = {}
        if "ckpt_path" not in config.entrypoint_args:
            config.entrypoint_args["ckpt_path"] = config.model_path
        super().__init__(config=config)

    def _load_predictor(self):
        return _SAM2Predictor(self._model)

    def _load_auto_generator(self):
        kwargs = self.config.auto_kwargs or {}
        return samg.SAM2AutomaticMaskGenerator(self._model, **kwargs)

    def _forward_pass(self, imgs):
        multimask_output = imgs.pop("multimask_output", False)
        images = imgs.pop("image")

        self._sam_predictor.processor.set_image_batch(images)

        point_coords = imgs.get("point_coords")
        point_labels = imgs.get("point_labels")
        boxes = imgs.get("boxes")
        mask_inputs = imgs.get("mask_inputs")  # Not used currently

        outputs = []
        for img_idx in range(len(images)):
            out_masks, iou_pred, _ = self._sam_predictor.processor._predict(
                point_coords=point_coords[img_idx]
                if point_coords is not None
                else None,
                point_labels=point_labels[img_idx]
                if point_labels is not None
                else None,
                boxes=boxes[img_idx] if boxes is not None else None,
                mask_input=mask_inputs[img_idx] if mask_inputs else None,
                multimask_output=multimask_output,
            )
            outputs.append({"masks": out_masks, "iou_predictions": iou_pred})
        return outputs

    def _forward_pass_auto(self, args):
        images = args.pop("image")
        for img in images:
            detections = []
            # TODO: Move this to post-processing op.
            for data in self._sam_auto_generator.generate(img):
                detection = fol.Detection.from_mask(
                    mask=data["segmentation"],
                    score=data["predicted_iou"],
                    stability=data["stability_score"],
                )
                detections.append(detection)
        return fol.Detections(detections=detections)


# TODO: Refactor SAM2 Video Model to use GetItem
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
                    width=self._curr_frame_width,
                    height=self._curr_frame_height,
                    point_labels=fosam._get_sam_point_labels(keypoint),
                )

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
