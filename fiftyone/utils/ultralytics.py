"""
Utilities for working with
`Ultralytics <https://github.com/ultralytics/ultralytics>`_.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import itertools

import numpy as np
from PIL import Image

import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.utils.torch as fout
import fiftyone.core.utils as fou
import fiftyone.zoo.models as fozm


ultralytics = fou.lazy_import("ultralytics")
torch = fou.lazy_import("torch")
torchvision = fou.lazy_import("torchvision")


def convert_ultralytics_model(model):
    """Converts the given Ultralytics model into a FiftyOne model.

    Args:
        model: an ``ultralytics.YOLO`` model

    Returns:
         a :class:`fiftyone.core.models.Model`

    Raises:
        ValueError: if the model could not be converted
    """
    if isinstance(model.model, ultralytics.nn.tasks.SegmentationModel):
        return _convert_yolo_segmentation_model(model)
    elif isinstance(model.model, ultralytics.nn.tasks.PoseModel):
        return _convert_yolo_pose_model(model)
    elif isinstance(model.model, ultralytics.nn.tasks.DetectionModel):
        if isinstance(model.model, ultralytics.nn.tasks.OBBModel):
            return _convert_yolo_obb_model(model)
        else:
            return _convert_yolo_detection_model(model)
    elif isinstance(model.model, ultralytics.nn.tasks.ClassificationModel):
        return _convert_yolo_classification_model(model)
    else:
        raise ValueError(
            "Unsupported model type; cannot convert %s to a FiftyOne model"
            % model
        )


def _extract_track_ids(result):
    """Get ultralytics track ids if present, else use Nones"""
    return (
        result.boxes.id.detach().cpu().numpy().astype(int)
        if result.boxes.is_track
        else [None] * result.boxes.conf.size(0)
    )


def to_detections(results, confidence_thresh=None):
    """Converts ``ultralytics.YOLO`` boxes to FiftyOne format.

    Args:
        results: a single or list of ``ultralytics.engine.results.Results``
        confidence_thresh (None): a confidence threshold to filter boxes

    Returns:
        a single or list of :class:`fiftyone.core.labels.Detections`
    """
    single = not isinstance(results, list)
    if single:
        results = [results]

    batch = [
        _to_detections(r, confidence_thresh=confidence_thresh) for r in results
    ]

    if single:
        return batch[0]

    return batch


def _to_detections(result, confidence_thresh=None):
    if result.boxes is None:
        return fol.Detections()

    classes = np.rint(result.boxes.cls.detach().cpu().numpy()).astype(int)
    boxes = result.boxes.xywhn.detach().cpu().numpy().astype(float)
    confs = result.boxes.conf.detach().cpu().numpy().astype(float)
    track_ids = _extract_track_ids(result)

    detections = []
    for cls, box, conf, idx in zip(classes, boxes, confs, track_ids):
        if confidence_thresh is not None and conf < confidence_thresh:
            continue

        label = result.names[cls]
        xc, yc, w, h = box

        detection = fol.Detection(
            label=label,
            bounding_box=[xc - 0.5 * w, yc - 0.5 * h, w, h],
            confidence=conf,
            index=idx,
        )
        detections.append(detection)

    return fol.Detections(detections=detections)


def to_instances(results, confidence_thresh=None):
    """Converts ``ultralytics.YOLO`` instance segmentations to FiftyOne format.

    Args:
        results: a single or list of ``ultralytics.engine.results.Results``
        confidence_thresh (None): a confidence threshold to filter boxes

    Returns:
        a single or list of :class:`fiftyone.core.labels.Detections`
    """
    single = not isinstance(results, list)
    if single:
        results = [results]

    batch = [
        _to_instances(r, confidence_thresh=confidence_thresh) for r in results
    ]

    if single:
        return batch[0]

    return batch


def _to_instances(result, confidence_thresh=None):
    if result.masks is None:
        return fol.Detections()

    classes = np.rint(result.boxes.cls.detach().cpu().numpy()).astype(int)
    boxes = result.boxes.xywhn.detach().cpu().numpy().astype(float)
    masks = result.masks.data.detach().cpu().numpy() > 0.5
    confs = result.boxes.conf.detach().cpu().numpy().astype(float)
    track_ids = _extract_track_ids(result)

    # convert from center coords to corner coords
    boxes[:, 0] -= boxes[:, 2] / 2.0
    boxes[:, 1] -= boxes[:, 3] / 2.0

    detections = []
    for cls, box, mask, conf, idx in zip(
        classes, boxes, masks, confs, track_ids
    ):
        if confidence_thresh is not None and conf < confidence_thresh:
            continue

        label = result.names[cls]
        w, h = mask.shape
        tmp = np.copy(box)
        tmp[2] += tmp[0]
        tmp[3] += tmp[1]
        tmp[0] *= h
        tmp[2] *= h
        tmp[1] *= w
        tmp[3] *= w
        tmp = [int(b) for b in tmp]
        y0, x0, y1, x1 = tmp
        sub_mask = mask[x0:x1, y0:y1]

        detection = fol.Detection(
            label=label,
            bounding_box=list(box),
            mask=sub_mask.astype(bool),
            confidence=conf,
            index=idx,
        )
        detections.append(detection)

    return fol.Detections(detections=detections)


def to_classifications(results, confidence_thresh=None, store_logits=False):
    """Converts ``ultralytics.YOLO`` classifications to FiftyOne format.

    Args:
        results: a single or list of ``ultralytics.engine.results.Results``
        confidence_thresh (None): a confidence threshold to filter clasifications

    Returns:
        a single or list of :class:`fiftyone.core.labels.Classification`
    """
    single = not isinstance(results, list)
    if single:
        results = [results]

    batch = [
        _to_classifications(
            r, confidence_thresh=confidence_thresh, store_logits=store_logits
        )
        for r in results
    ]

    if single:
        return batch[0]

    return batch


def _to_classifications(result, confidence_thresh=None, store_logits=False):
    logits = result.probs.data.detach().cpu().numpy()
    score = result.probs.top1conf.detach().cpu().numpy()
    label = result.names[result.probs.top1]

    if confidence_thresh is not None and score < confidence_thresh:
        classification = None
    else:
        classification = fol.Classification(
            label=label,
            confidence=score,
        )
        if store_logits:
            classification.logits = logits

    return classification


def obb_to_polylines(results, confidence_thresh=None, filled=False):
    """Converts ``ultralytics.YOLO`` instance segmentations to FiftyOne format.

    Args:
        results: a single or list of ``ultralytics.engine.results.Results``
        confidence_thresh (None): a confidence threshold to filter boxes
        filled (False): whether the polyline should be filled

    Returns:
        a single or list of :class:`fiftyone.core.labels.PolyLines`
    """

    single = not isinstance(results, list)
    if single:
        results = [results]

    batch = [
        _obb_to_polylines(r, filled, confidence_thresh=confidence_thresh)
        for r in results
    ]

    if single:
        return batch[0]

    return batch


def _obb_to_polylines(result, filled, confidence_thresh=None):
    if result.obb is None:
        return fol.Polylines()

    classes = np.rint(result.obb.cls.detach().cpu().numpy()).astype(int)
    confs = result.obb.conf.detach().cpu().numpy().astype(float)
    points = result.obb.xyxyxyxyn.detach().cpu().numpy()
    polylines = []
    for cls, _points, conf in zip(classes, points, confs):
        if confidence_thresh is not None and conf < confidence_thresh:
            continue

        _points = [_points.astype(float)]

        label = result.names[cls]

        polyline = fol.Polyline(
            label=label,
            points=_points,
            confidence=conf,
            closed=True,
            filled=filled,
        )
        polylines.append(polyline)

    return fol.Polylines(polylines=polylines)


def to_polylines(results, confidence_thresh=None, tolerance=2, filled=True):
    """Converts ``ultralytics.YOLO`` instance segmentations to FiftyOne format.

    Args:
        results: a single or list of ``ultralytics.engine.results.Results``
        confidence_thresh (None): a confidence threshold to filter boxes
        tolerance (2): a tolerance, in pixels, when generating approximate
            polylines for instance masks. Typical values are 1-3 pixels
        filled (True): whether the polyline should be filled

    Returns:
        a single or list of :class:`fiftyone.core.labels.Polylines`
    """
    single = not isinstance(results, list)
    if single:
        results = [results]

    batch = [
        _to_polylines(
            r, tolerance, filled, confidence_thresh=confidence_thresh
        )
        for r in results
    ]

    if single:
        return batch[0]

    return batch


def _to_polylines(result, tolerance, filled, confidence_thresh=None):
    if result.masks is None:
        return fol.Polylines()

    classes = np.rint(result.boxes.cls.detach().cpu().numpy()).astype(int)
    confs = result.boxes.conf.detach().cpu().numpy().astype(float)
    track_ids = _extract_track_ids(result)

    if tolerance > 1:
        masks = result.masks.data.detach().cpu().numpy() > 0.5
        points = itertools.repeat(None)
    else:
        masks = itertools.repeat(None)
        points = result.masks.xyn

    polylines = []
    for cls, mask, _points, conf, idx in zip(
        classes, masks, points, confs, track_ids
    ):
        if confidence_thresh is not None and conf < confidence_thresh:
            continue

        if _points is None:
            _points = fol._get_polygons(mask, tolerance)
        else:
            _points = [_points.astype(float)]

        label = result.names[cls]

        polyline = fol.Polyline(
            label=label,
            points=_points,
            confidence=conf,
            closed=True,
            filled=filled,
            index=idx,
        )
        polylines.append(polyline)

    return fol.Polylines(polylines=polylines)


def to_keypoints(results, confidence_thresh=None):
    """Converts ``ultralytics.YOLO`` keypoints to FiftyOne format.

    Args:
        results: a single or list of ``ultralytics.engine.results.Results``
        confidence_thresh (None): a confidence threshold to filter keypoints

    Returns:
        a single or list of :class:`fiftyone.core.labels.Keypoints`
    """
    single = not isinstance(results, list)
    if single:
        results = [results]

    batch = [
        _to_keypoints(r, confidence_thresh=confidence_thresh) for r in results
    ]

    if single:
        return batch[0]

    return batch


def _to_keypoints(result, confidence_thresh=None):
    if result.keypoints is None:
        return fol.Keypoints()

    classes = np.rint(result.boxes.cls.detach().cpu().numpy()).astype(int)
    points = result.keypoints.xyn.detach().cpu().numpy().astype(float)
    if result.keypoints.conf is not None:
        confs = result.keypoints.conf.detach().cpu().numpy().astype(float)
    else:
        confs = itertools.repeat(None)
    track_ids = _extract_track_ids(result)

    keypoints = []
    for cls, _points, _confs, idx in zip(classes, points, confs, track_ids):
        if confidence_thresh is not None:
            _points[_confs < confidence_thresh] = np.nan

        label = result.names[cls]
        _confidence = _confs.tolist() if _confs is not None else None

        keypoint = fol.Keypoint(
            label=label,
            points=_points.tolist(),
            confidence=_confidence,
            index=idx,
        )
        keypoints.append(keypoint)

    return fol.Keypoints(keypoints=keypoints)


class FiftyOneYOLOModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for a :class:`FiftyOneYOLOModel`.

    Args:
        overrides (None): a dictionary of overrides for Ultralytics model.
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)
        self.overrides = self.parse_dict(d, "overrides", default=None)


class FiftyOneYOLOModel(fout.TorchImageModel):
    """FiftyOne wrapper around an ``ultralytics.YOLO`` model.

    Args:
        config: a `FiftyOneYOLOModelConfig`
    """

    def __init__(self, config):
        super().__init__(config)

    @property
    def has_collate_fn(self):
        return True

    @staticmethod
    def collate_fn(batch):
        orig_images = [img.get("orig_img") for img in batch]
        orig_shapes = [_get_image_dims(img)[::-1] for img in orig_images]
        images = [img.get("img") for img in batch]
        images = torch.stack(images)
        return {
            "orig_imgs": orig_images,
            "images": images,
            "orig_shapes": orig_shapes,
        }

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _set_predictor(self, config, model):
        if config.overrides:
            for k, v in config.overrides.items():
                model.overrides[k] = v

        custom = {
            "conf": config.confidence_thresh,
            "save": False,
            "mode": "predict",
            "rect": False,
            "verbose": False,
            "retina_masks": True,
            "device": self._device,
        }
        args = {**custom, **model.overrides}
        model.predictor = model.task_map[model.task]["predictor"](
            overrides=args,
            _callbacks=model.callbacks,
        )

        model.predictor.setup_model(model=model.model, verbose=False)
        model.predictor.setup_source([np.zeros((10, 10))])
        model.predictor.batch = next(iter(model.predictor.dataset))
        # Remove thread lock to avoid issues with pickle in multiprocessing.
        model.predictor._lock = None

        return model

    def _load_model(self, config):
        if config.model_path:
            if not config.entrypoint_args:
                config.entrypoint_args = {}
            config.entrypoint_args["model"] = config.model_path

        if config.model is not None:
            model = config.model
        else:
            entrypoint_fcn = config.entrypoint_fcn

            if etau.is_str(entrypoint_fcn):
                entrypoint_fcn = etau.get_function(entrypoint_fcn)

            kwargs = config.entrypoint_args or {}
            model = entrypoint_fcn(**kwargs)

        model = model.to(self._device)
        if self.using_half_precision:
            model = model.half()

        if config.classes:
            if hasattr(ultralytics, "YOLOE") and isinstance(
                model, ultralytics.YOLOE
            ):
                model.set_classes(
                    config.classes, model.get_text_pe(config.classes)
                )
            else:
                model.set_classes(config.classes)

        if not model.predictor:
            model = self._set_predictor(config, model)

        return model

    def _parse_classes(self, config):
        if config.classes is not None:
            return config.classes
        if isinstance(self._model.names, dict):
            return list(self._model.names.values())
        return None

    def _forward_pass(self, imgs):
        preds = self._model.predictor.inference(imgs)
        return {"preds": preds}

    def _build_transforms(self, config):
        if config.ragged_batches is not None:
            ragged_batches = config.ragged_batches
        else:
            ragged_batches = False

        transforms = [self._preprocess_img]
        transforms = torchvision.transforms.Compose(transforms)

        return transforms, ragged_batches

    def _preprocess_img(self, img):
        if not isinstance(img, torch.Tensor):
            if isinstance(img, Image.Image):
                img = img.convert("RGB")
            orig_img = np.asarray(img)
            return {
                "img": self._ultralytics_preprocess([orig_img]),
                "orig_img": orig_img,
            }
        return {"img": img, "orig_img": img}

    def _ultralytics_preprocess(self, img):
        # Taken from ultralytics.engine.predictor.preprocess.
        img = np.stack(self._pre_transform(img))
        img = img.transpose((0, 3, 1, 2))
        img = np.ascontiguousarray(img)
        img = torch.from_numpy(img)
        img = img.half() if self._model.predictor.model.fp16 else img.float()
        img /= 255
        return torch.squeeze(img, axis=0)

    def _pre_transform(self, im):
        # Taken from ultralytics.engine.predictor.pre_transform.
        # TODO: Look into why self._model.predictor.pre_transform
        # doesn't resize the image to (imgsz, imgsz) with rect=False.
        same_shapes = len({x.shape for x in im}) == 1
        letterbox = ultralytics.data.augment.LetterBox(
            self._model.predictor.args.imgsz,
            auto=same_shapes and self._model.predictor.args.rect,
            stride=self._model.predictor.model.stride,
        )
        return [letterbox(image=x) for x in im]

    def _build_output_processor(self, config):
        if not config.output_processor_args:
            config.output_processor_args = {}
        config.output_processor_args[
            "post_processor"
        ] = self._model.predictor.postprocess
        output_processor = super()._build_output_processor(config)
        # Set post-processor to None for config JSON serialization.
        config.output_processor_args["post_processor"] = None
        return output_processor

    def _predict_all(self, imgs):
        if self._preprocess and self._transforms is not None:
            imgs = [self._transforms(img) for img in imgs]
            if self.has_collate_fn:
                imgs = self.collate_fn(imgs)

        orig_images = imgs["orig_imgs"]
        images = imgs["images"]
        width_height = imgs["orig_shapes"]

        # Dummy value to ensure predictor batches have same length as images.
        self._model.predictor.batch = [[""] * images.size()[0]]

        images = images.to(self._device)
        if self._using_half_precision:
            images = images.half()

        if self.config.confidence_thresh is not None:
            self._model.predictor.args.conf = self.config.confidence_thresh

        output = self._forward_pass(images)

        # This is required for Ultralytics post-processing.
        output["orig_imgs"] = orig_images
        output["imgs"] = images

        if self.has_logits:
            self._output_processor.store_logits = self.has_logits

        return self._output_processor(
            output,
            width_height,
            confidence_thresh=self.config.confidence_thresh,
        )


def _get_image_dims(img):
    if isinstance(img, torch.Tensor):
        height, width = img.size()[-2:]
    elif isinstance(img, Image.Image):
        width, height = img.size
    elif isinstance(img, np.ndarray):
        height, width = img.shape[:2]
    else:
        height, width = None, None

    return height, width


class FiftyOneRTDETRModelConfig(FiftyOneYOLOModelConfig):
    """Configuration for a :class:`FiftyOneRTDETRModel`."""

    pass


class FiftyOneRTDETRModel(FiftyOneYOLOModel):
    """FiftyOne wrapper around an ``ultralytics.RTDETR`` model.

    Args:
        config: a :class:`FiftyOneRTDETRModelConfig`
    """

    def _pre_transform(self, im):
        return self._model.predictor.pre_transform(im)


class FiftyOneYOLOClassificationModelConfig(FiftyOneYOLOModelConfig):
    """Configuration for a :class:`FiftyOneYOLOClassificationModel`."""

    pass


class FiftyOneYOLOClassificationModel(FiftyOneYOLOModel):
    """FiftyOne wrapper around Ultralytics YOLO Classification model.

    Args:
        config: a :class:`FiftyOneYOLOClassificationModelConfig`
    """

    def _ultralytics_preprocess(self, img):
        # Taken from ultralytics.models.yolo.classify.predict.
        is_legacy_transform = any(
            self._model.predictor._legacy_transform_name in str(transform)
            for transform in self.transforms.transforms
        )
        if is_legacy_transform:
            img = torch.stack(
                [self._model.predictor.transforms(im) for im in img], dim=0
            )
        else:
            img = torch.stack(
                [
                    self._model.predictor.transforms(Image.fromarray(im))
                    for im in img
                ],
                dim=0,
            )
        img = img if isinstance(img, torch.Tensor) else torch.from_numpy(img)
        img = img.half() if self._model.predictor.model.fp16 else img.float()
        return torch.squeeze(img, axis=0)


def _convert_yolo_classification_model(model):
    config = FiftyOneYOLOClassificationModelConfig(
        {
            "model": model,
            "output_processor_cls": UltralyticsClassificationOutputProcessor,
            "model_path": model.model_name,
        }
    )
    return FiftyOneYOLOClassificationModel(config)


def _convert_yolo_detection_model(model):
    config = FiftyOneYOLOModelConfig(
        {
            "model": model,
            "output_processor_cls": UltralyticsDetectionOutputProcessor,
            "model_path": model.model_name,
        }
    )
    return FiftyOneYOLOModel(config)


def _convert_yolo_obb_model(model):
    config = FiftyOneYOLOModelConfig(
        {
            "model": model,
            "output_processor_cls": UltralyticsOBBOutputProcessor,
            "model_path": model.model_name,
        }
    )
    return FiftyOneYOLOModel(config)


def _convert_yolo_segmentation_model(model):
    config = FiftyOneYOLOModelConfig(
        {
            "model": model,
            "output_processor_cls": UltralyticsSegmentationOutputProcessor,
            "model_path": model.model_name,
        }
    )
    return FiftyOneYOLOModel(config)


def _convert_yolo_pose_model(model):
    config = FiftyOneYOLOModelConfig(
        {
            "model": model,
            "output_processor_cls": UltralyticsPoseOutputProcessor,
            "model_path": model.model_name,
        }
    )
    return FiftyOneYOLOModel(config)


class UltralyticsOutputProcessor(fout.OutputProcessor):
    """Converts Ultralytics PyTorch Hub model outputs to FiftyOne format."""

    def __call__(self, result, frame_size, confidence_thresh=None):
        batch = []
        for df in result.pandas().xywhn:
            if confidence_thresh is not None:
                df = df[df["confidence"] >= confidence_thresh]

            batch.append(self._to_detections(df))

        return batch

    def _to_detections(self, df):
        return fol.Detections(
            detections=[
                fol.Detection(
                    label=row.name,
                    bounding_box=[
                        row.xcenter - 0.5 * row.width,
                        row.ycenter - 0.5 * row.height,
                        row.width,
                        row.height,
                    ],
                    confidence=row.confidence,
                )
                for row in df.itertuples()
            ]
        )


class UltralyticsPostProcessor(object):
    # pylint: disable=not-callable
    post_processor = None

    def post_process(self, output):
        imgs = output.get("imgs", None)
        orig_imgs = output.get("orig_imgs", None)
        if isinstance(orig_imgs, torch.Tensor):
            orig_imgs = [i.permute(1, 2, 0).numpy() for i in orig_imgs]
        elif isinstance(orig_imgs, list) and len(orig_imgs):
            if isinstance(orig_imgs[0], torch.Tensor):
                orig_imgs = [i.permute(1, 2, 0).numpy() for i in orig_imgs]
            elif isinstance(orig_imgs[0], Image.Image):
                orig_imgs = [np.asarray(i.convert("RGB")) for i in orig_imgs]

        preds = output["preds"]
        if self.post_processor is None:
            raise ValueError("Ultralytics post processor is set to None")

        if imgs is None or orig_imgs is None:
            raise ValueError(
                "Ultralytics post processor needs transformed and original images."
            )
        out = self.post_processor(preds, imgs, orig_imgs)
        return out


class UltralyticsClassificationOutputProcessor(
    fout.ClassifierOutputProcessor, UltralyticsPostProcessor
):
    """Converts Ultralytics Classification model outputs to FiftyOne format."""

    def __init__(self, classes=None, store_logits=False, post_processor=None):
        super().__init__(classes=classes, store_logits=store_logits)
        self.post_processor = post_processor

    def __call__(self, output, _, confidence_thresh=None):
        results = self.post_process(output)
        return to_classifications(
            results, confidence_thresh, self.store_logits
        )


class UltralyticsDetectionOutputProcessor(
    fout.DetectorOutputProcessor, UltralyticsPostProcessor
):
    """Converts Ultralytics Detection model outputs to FiftyOne format."""

    def __init__(
        self,
        classes=None,
        post_processor=None,
    ):
        super().__init__(classes)
        self.post_processor = post_processor

    def __call__(self, output, frame_size, confidence_thresh=None):
        results = self.post_process(output)
        preds = self._to_dict(results)
        return [
            self._parse_output(o, wh, confidence_thresh)
            for o, wh in zip(preds, frame_size)
        ]

    def _to_dict(self, results):
        batch = []
        for result in results:
            if not result.boxes:
                batch.append(None)
            else:
                pred = {
                    "boxes": result.boxes.xyxy,
                    "labels": result.boxes.cls.int(),
                    "scores": result.boxes.conf,
                    "track_ids": _extract_track_ids(result),
                }
                batch.append(pred)
        return batch

    def _parse_output(self, output, frame_size, confidence_thresh):
        if not output:
            return fol.Detections()

        detections = super()._parse_output(
            output, frame_size, confidence_thresh
        )
        track_ids = output["track_ids"]
        for det, track_id in zip(detections["detections"], track_ids):
            det.index = track_id

        return detections


class UltralyticsSegmentationOutputProcessor(
    fout.InstanceSegmenterOutputProcessor, UltralyticsPostProcessor
):
    """Converts Ultralytics Segmentation model outputs to FiftyOne format."""

    def __init__(
        self,
        classes=None,
        post_processor=None,
    ):
        super().__init__(classes)
        self.post_processor = post_processor

    def __call__(self, output, frame_size, confidence_thresh=None):
        results = self.post_process(output)
        return super().__call__(results, frame_size, confidence_thresh)

    def _parse_output(self, results, _, confidence_thresh):
        return to_instances(results, confidence_thresh)


class UltralyticsPoseOutputProcessor(
    fout.OutputProcessor, UltralyticsPostProcessor
):
    """Converts Ultralytics Pose model outputs to FiftyOne format."""

    def __init__(
        self,
        classes=None,
        post_processor=None,
    ):
        super().__init__(classes)
        self.post_processor = post_processor

    def __call__(self, output, _, confidence_thresh=None):
        preds = self.post_process(output)
        return to_keypoints(preds, confidence_thresh=confidence_thresh)


class UltralyticsOBBOutputProcessor(
    fout.OutputProcessor, UltralyticsPostProcessor
):
    """Converts Ultralytics Oriented Bounding Box model outputs to FiftyOne format."""

    def __init__(
        self,
        classes=None,
        post_processor=None,
    ):
        super().__init__(classes)
        self.post_processor = post_processor

    def __call__(self, output, _, confidence_thresh=None):
        preds = self.post_process(output)
        return obb_to_polylines(preds, confidence_thresh=confidence_thresh)
