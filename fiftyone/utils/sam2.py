"""
`Segment Anything <https://github.com/facebookresearch/segment-anything-2>`_ wrapper for the FiftyOne
Model Zoo.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import numpy as np
import cv2

import eta.core.utils as etau
import logging

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm
import fiftyone.core.models as fom

fou.ensure_torch()
import torch

sam2 = fou.lazy_import("sam2")
smvid = fou.lazy_import("sam2.sam2_video_predictor")
smutil = fou.lazy_import("sam2.utils.misc")
smip = fou.lazy_import("sam2.sam2_image_predictor")
samg = fou.lazy_import("sam2.automatic_mask_generator")

logger = logging.getLogger(__name__)

class SegmentAnything2ImageModelConfig(
    fout.TorchImageModelConfig, fozm.HasZooModel
):
    """Configuration for running a :class:`SegmentAnything2Model`.

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

class SegmentAnything2ImageModel(fout.TorchSamplesMixin, fout.TorchImageModel):
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
        fout.TorchSamplesMixin.__init__(self)
        fout.TorchImageModel.__init__(self, config)

        self._curr_prompt_type = None
        self._curr_prompts = None
        self._curr_classes = None

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _load_model(self, config):
        entrypoint = etau.get_function(config.entrypoint_fcn)
        model = entrypoint(
            config.entrypoint_args["model_cfg"], ckpt_path=config.model_path
        )

        model = model.to(self._device)
        if self.using_half_precision:
            model = model.half()

        model.eval()

        return model

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
        
        return self._predict_all(imgs)

    def _get_field(self):
        if "prompt_field" in self.needs_fields:
            prompt_field = self.needs_fields["prompt_field"]
        else:
            prompt_field = next(iter(self.needs_fields.values()), None)

        if prompt_field is not None and prompt_field.startswith("frames."):
            prompt_field = prompt_field[len("frames.") :]

        return prompt_field

    def _parse_samples(self, samples, field_name):
        prompt_type = self._get_prompt_type(samples, field_name)
        prompts = self._get_prompts(samples, field_name)
        classes = self._get_classes(samples, field_name)
        return prompt_type, prompts, classes

    def _get_prompt_type(self, samples, field_name):
        for sample in samples:
            value = sample.get_field(field_name)
            if value is None:
                continue

            if isinstance(value, fol.Detections):
                return "boxes"

            if isinstance(value, fol.Keypoints):
                return "points"

            raise ValueError(
                "Unsupported prompt type %s. The supported field types are %s"
                % (type(value), (fol.Detections, fol.Keypoints))
            )

        return None

    def _get_prompts(self, samples, field_name):
        prompts = []
        for sample in samples:
            value = sample.get_field(field_name)
            if value is not None:
                prompts.append(value)
            else:
                raise ValueError(
                    "Sample %s is missing a prompt in field '%s'"
                    % (sample.id, field_name)
                )

        return prompts

    def _get_classes(self, samples, field_name):
        classes = set()
        for sample in samples:
            value = sample.get_field(field_name)
            if isinstance(value, fol.Detections):
                classes.update(det.label for det in value.detections)

            if isinstance(value, fol.Keypoints):
                classes.update(kp.label for kp in value.keypoints)

        return sorted(classes)

    def _forward_pass(self, imgs):
        forward_methods = {
            "boxes": self._forward_pass_boxes,
            "points": self._forward_pass_points,
            None: self._forward_pass_auto,
        }
        return forward_methods.get(self._curr_prompt_type, self._forward_pass_auto)(imgs)

    def _forward_pass_boxes(self, imgs):
        sam2_predictor = smip.SAM2ImagePredictor(self._model)
        self._output_processor = fout.InstanceSegmenterOutputProcessor(
            self._curr_classes
        )
        outputs = []
        for img, detections in zip(imgs, self._curr_prompts):
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
            inp = _to_sam_input(img)
            sam2_predictor.set_image(inp)
            h, w = img.size(1), img.size(2)

            boxes = [d.bounding_box for d in detections.detections]
            sam_boxes = np.array([_to_sam_box(box, w, h) for box in boxes])
            input_boxes = torch.tensor(sam_boxes, device=sam2_predictor.device)

            labels = torch.tensor(
                [
                    self._curr_classes.index(d.label)
                    for d in detections.detections
                ],
                device=sam2_predictor.device,
            )

            masks, _, _ = sam2_predictor.predict(
                point_coords=None,
                point_labels=None,
                box=sam_boxes[None, :],
                multimask_output=False,
            )
            outputs.append(
                {"boxes": input_boxes, "labels": labels, "masks": torch.tensor(masks, device=sam2_predictor.device)}
            )

        return outputs

    def _forward_pass_points(self, imgs):
        sam2_predictor = smip.SAM2ImagePredictor(self._model)
        self._output_processor = fout.InstanceSegmenterOutputProcessor(
            self._curr_classes
        )

        outputs = []
        for img, keypoints in zip(imgs, self._curr_prompts):
            inp = _to_sam_input(img)
            sam2_predictor.set_image(inp)
            h, w = img.size(1), img.size(2)

            boxes, labels, scores, masks = [], [], [], []

            ## If no keypoints, return empty tensors instead of running SAM
            if keypoints is None or len(keypoints.keypoints) == 0:
                outputs.append(
                    {
                        "boxes": torch.tensor([[]]),
                        "labels": torch.empty([0, 4]),
                        "masks": torch.empty([0, 1, h, w]),
                    }
                )
                continue

            for kp in keypoints.keypoints:
                sam_points, sam_labels = _to_sam_points(kp.points, w, h, kp)

                multi_mask, mask_scores, _ = sam2_predictor.predict(
                    point_coords=sam_points,
                    point_labels=sam_labels,
                    multimask_output=True,
                )

                mask_index = self.config.points_mask_index
                if mask_index is None:
                    mask_index = np.argmax(mask_scores)

                mask = multi_mask[mask_index].astype(int)
                if mask.any():
                    boxes.append(_mask_to_box(mask))
                    labels.append(self._curr_classes.index(kp.label))
                    scores.append(min(1.0, np.max(mask_scores)))
                    masks.append(mask)

            outputs.append(
                {
                    "boxes": torch.tensor(boxes, device=sam2_predictor.device),
                    "labels": torch.tensor(
                        labels, device=sam2_predictor.device
                    ),
                    "scores": torch.tensor(
                        scores, device=sam2_predictor.device
                    ),
                    "masks": torch.tensor(
                        np.array(masks), device=sam2_predictor.device
                    ).unsqueeze(1),
                }
            )

        return outputs

    def _forward_pass_auto(self, imgs):
        kwargs = self.config.auto_kwargs or {}
        mask_generator = samg.SAM2AutomaticMaskGenerator(self._model, **kwargs)
        self._output_processor = None

        outputs = []
        for img in imgs:
            inp = _to_sam_input(img)
            detections = []
            for data in mask_generator.generate(inp):
                detection = fol.Detection.from_mask(
                    mask=data["segmentation"],
                    score=data["predicted_iou"],
                    stability=data["stability_score"],
                )
                detections.append(detection)
            detections = fol.Detections(detections=detections)
            outputs.append(detections)

        return outputs

class SegmentAnything2VideoModel(fom.SamplesMixin, fom.Model):
    """Wrapper for running `Segment Anything 2 <https://ai.meta.com/sam2/>`_
    inference on videos.

    Example for running SAM2 model on a video with prompt:
        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart-video", max_samples=2)

        # Only retain detections on the first frame of each video
        for sample in dataset:
            for frame_idx in sample.frames:
                frame = sample.frames[frame_idx]
                if frame_idx >= 2:
                    frame.detections = None
                sample.save()

        model = foz.load_zoo_model("segment-anything-2-hiera-tiny-video-torch")

        # Prompt with boxes
        dataset.apply_model(
            model,
            label_field="segmentations",
            prompt_field="frames.detections", # You can also pass in a keypoint field here
        )

        session = fo.launch_app(dataset)

    Args:
        config: a :class:`SegmentAnything2VideoModelConfig`
    """

    def __init__(self, config):
        self._fields = {}
        self.config = config

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
                config.entrypoint_args["model_cfg"], ckpt_path=config.model_path
            )
        return model

    def predict(self, video_reader, sample):
        field_name = self._get_field()
        self._curr_frame_width, self._curr_frame_height = (
            video_reader.frame_size
        )
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

        return prompt_field

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
                box = _to_sam_box(
                    detection.bounding_box,
                    self._curr_frame_width,
                    self._curr_frame_height
                )
                _, _, _ = self.model.add_new_points_or_box(
                    inference_state=inference_state,
                    frame_idx=frame_idx,
                    obj_id=ann_obj_id,
                    box=box
                )

        sample_detections = {}
        for (
            out_frame_idx,
            out_obj_ids,
            out_mask_logits,
        ) in self.model.propagate_in_video(inference_state):
            detections = []
            for i, out_obj_id in enumerate(out_obj_ids):
                mask = np.squeeze((out_mask_logits[i] > 0.0).cpu().numpy(), axis=0)
                box = _mask_to_box(mask)
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
                        index=out_obj_id
                    )
                )
            sample_detections[int(out_frame_idx) + 1] = fol.Detections(detections=detections)
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
                points, labels = _to_sam_points(
                    keypoint.points,
                    self._curr_frame_width,
                    self._curr_frame_height,
                    keypoint
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
                mask = np.squeeze((out_mask_logits[i] > 0.0).cpu().numpy(), axis=0)
                box = _mask_to_box(mask)
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
                        index=out_obj_id
                    )
                )
            sample_detections[int(out_frame_idx) + 1] = fol.Detections(detections=detections)
        return sample_detections

def _to_sam_input(tensor):
    return (255 * tensor.cpu().numpy()).astype("uint8").transpose(1, 2, 0)

def _to_sam_points(points, w, h, keypoint):
    points = np.array(points)
    valid_rows = ~np.isnan(points).any(axis=1)
    scaled_points = np.array(points[valid_rows]) * np.array([w, h])
    labels = (
        np.array(keypoint.sam2_labels)[valid_rows]
        if "sam2_labels" in keypoint
        else np.ones(len(scaled_points))
    )
    return scaled_points.astype(np.float32), labels.astype(np.uint32)


def _to_sam_box(box, w, h):
    new_box = np.copy(np.array(box))
    new_box[0] *= w
    new_box[2] *= w
    new_box[1] *= h
    new_box[3] *= h
    new_box[2] += new_box[0]
    new_box[3] += new_box[1]
    return np.round(new_box).astype(int)


def _mask_to_box(mask):
    pos_indices = np.where(mask)
    if all(arr.size == 0 for arr in pos_indices):
        return None
    x1 = np.min(pos_indices[1])
    x2 = np.max(pos_indices[1])
    y1 = np.min(pos_indices[0])
    y2 = np.max(pos_indices[0])
    return [x1, y1, x2, y2]

def load_fiftyone_video_frames(
        video_path,
        image_size,
        offload_video_to_cpu,
        img_mean=(0.485, 0.456, 0.406),
        img_std=(0.229, 0.224, 0.225),
        async_loading_frames=False,
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
            raise(e)
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
            images = images.cuda()
            img_mean = img_mean.cuda()
            img_std = img_std.cuda()

        images -= img_mean
        images /= img_std
        return images, video_height, video_width

def _load_video_frames_monkey_patch():
    entrypoint_module = smutil.load_video_frames

    return fou.MonkeyPatchFunction(
        entrypoint_module,
        load_fiftyone_video_frames,
    )
