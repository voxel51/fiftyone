"""
Utilities for working with
`Ultralytics <https://github.com/ultralytics/ultralytics>`_.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Callable
import numpy as np

import fiftyone.core.labels as fol
import fiftyone.utils.torch as fout
import fiftyone.core.utils as fou
import fiftyone.zoo.models as fozm
import eta.core.utils as etau
import itertools

from PIL import Image

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
        return None
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


class FiftyOneYOLOModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for a :class:`FiftyOneYOLOModel`."""

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)


class FiftyOneYOLOModel(fout.TorchImageModel):
    """FiftyOne wrapper around an ``ultralytics.YOLO`` model.

    Args:
        config: a `FiftyOneYOLOModelConfig`
    """

    def __init__(self, config):
        super().__init__(config)

    def _download_model(self, config):
        config.download_model_if_necessary()

    def _load_model(self, config):
        if config.model is not None:
            return config.model
        else:
            entrypoint_fcn = config.entrypoint_fcn

            if etau.is_str(entrypoint_fcn):
                entrypoint_fcn = etau.get_function(entrypoint_fcn)

            kwargs = config.entrypoint_args
            if kwargs:
                if config.model_path:
                    kwargs["model"] = config.model_path
                model = entrypoint_fcn(**kwargs)
            else:
                model = entrypoint_fcn()

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
            custom = {
                "conf": config.confidence_thresh,
                "batch": 1,
                "save": False,
                "mode": "predict",
                "rect": True,
                "verbose": False,
            }
            args = {**model.overrides, **custom}
            model.predictor = model.task_map[model.task]["predictor"](
                overrides=args,
                _callbacks=model.callbacks,
            )
            model.predictor.imgsz = (
                config.image_size if config.image_size else (640, 640)
            )
            model.predictor.setup_model(model=model.model, verbose=False)
        return model

    def _parse_classes(self, config):
        if config.classes is not None:
            return config.classes
        if isinstance(self._model.names, dict):
            return list(self._model.names.values())
        return None

    def _forward_pass(self, imgs):
        self._model.predictor.setup_source(imgs)
        self._model.predictor.batch = next(iter(self._model.predictor.dataset))
        preds = self._model.predictor.inference(imgs)
        return {"preds": preds}

    def _build_transforms(self, config):
        if config.ragged_batches is not None:
            ragged_batches = config.ragged_batches
        else:
            ragged_batches = True

        transforms = [self._preprocess_im]
        transforms = torchvision.transforms.Compose(transforms)

        return transforms, ragged_batches

    def _preprocess_im(self, img):
        orig_img = img
        if not isinstance(img, torch.Tensor):
            if isinstance(img, Image.Image):
                img = img.convert("RGB")
            img = [np.array(img)]
            img = self._ultralytics_preprocess(img)
        output = {"img": img, "orig_img": orig_img}
        return output

    def _ultralytics_preprocess(self, im):
        im = np.stack(self._model.predictor.pre_transform(im))
        im = im.transpose((0, 3, 1, 2))
        im = np.ascontiguousarray(im)
        im = torch.from_numpy(im)
        im = im.half() if self._model.predictor.model.fp16 else im.float()
        im /= 255
        return torch.squeeze(im, axis=0)

    def _build_output_processor(self, config):
        if config.output_processor is not None:
            return config.output_processor

        output_processor_cls = config.output_processor_cls

        if output_processor_cls is None:
            return None

        if etau.is_str(output_processor_cls):
            output_processor_cls = etau.get_class(output_processor_cls)

        kwargs = config.output_processor_args or {}
        return output_processor_cls(
            classes=self._classes,
            post_processor=self._model.predictor.postprocess,
            **kwargs,
        )

    def _predict_all(self, imgs):
        if self._preprocess and self._transforms is not None:
            imgs = [self._transforms(img) for img in imgs]

        if isinstance(imgs, list) and len(imgs) and isinstance(imgs[0], dict):
            orig_images = [img.get("orig_img") for img in imgs]
            images = [img.get("img") for img in imgs]
        else:
            orig_images = imgs
            images = imgs

        height, width = None, None

        if self.config.raw_inputs:
            # Feed images as list
            if self._output_processor is not None:
                image = imgs[0]
                height, width = _get_image_dims(image)
        else:
            # Feed images as stacked Tensor
            if isinstance(images, (list, tuple)):
                images = torch.stack(images)

            height, width = images.size()[-2:]

            images = images.to(self._device)
            if self._using_half_precision:
                images = images.half()

        output = self._forward_pass(images)

        if isinstance(output, dict):
            # This is required for Ultralytics post-processing.
            output["orig_imgs"] = orig_images
            height, width = _get_image_dims(orig_images[0])
            output["imgs"] = images

        if self._output_processor is None:
            _output = (
                output.get("preds") if isinstance(output, dict) else output
            )
            if isinstance(_output, torch.Tensor):
                _output = _output.detach().cpu().numpy()

            return _output

        if self.has_logits:
            self._output_processor.store_logits = self.store_logits

        return self._output_processor(
            output,
            (width, height),
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

    pass


def _convert_yolo_classification_model(model):
    config = FiftyOneYOLOModelConfig(
        {
            "model": model,
            "output_processor_cls": UltralyticsClassificationOutputProcessor,
            "model_path": model.model_name,
            "image_size": [640, 640],
        }
    )
    return FiftyOneYOLOModel(config)


def _convert_yolo_detection_model(model):
    config = FiftyOneYOLOModelConfig(
        {
            "model": model,
            "output_processor_cls": UltralyticsDetectionOutputProcessor,
            "model_path": model.model_name,
            "image_size": [640, 640],
        }
    )
    return FiftyOneYOLOModel(config)


def _convert_yolo_obb_model(model):
    config = FiftyOneYOLOModelConfig(
        {
            "model": model,
            "output_processor_cls": UltralyticsOBBOutputProcessor,
            "model_path": model.model_name,
            "image_size": [640, 640],
        }
    )
    return FiftyOneYOLOModel(config)


def _convert_yolo_segmentation_model(model):
    config = FiftyOneYOLOModelConfig(
        {
            "model": model,
            "output_processor_cls": UltralyticsSegmentationOutputProcessor,
            "model_path": model.model_name,
            "image_size": [640, 640],
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

    def __init__(
        self,
        classes=None,
        store_logits=False,
        post_processor=None,
    ):
        super().__init__(classes=classes, store_logits=store_logits)
        self.post_processor = post_processor

    def __call__(self, output, frame_size, confidence_thresh=None):
        results = self.post_process(output)
        preds = [{"logits": result.probs} for result in results]
        return super().__call__(preds, frame_size, confidence_thresh)


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
        return super().__call__(preds, frame_size, confidence_thresh)

    def _to_dict(self, results):
        batch = []
        for result in results:
            if not result.boxes:
                continue
            else:
                pred = {
                    "boxes": result.boxes.xyxy,
                    "labels": result.boxes.cls.int(),
                    "scores": result.boxes.conf,
                }
                batch.append(pred)
        return batch


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
        preds = self._to_dict(results)
        return super().__call__(preds, frame_size, confidence_thresh)

    def _to_dict(self, results):
        batch = []
        for result in results:
            if not result.masks:
                continue
            else:
                pred = {
                    "boxes": result.boxes.xyxy,
                    "boxes_xywhn": result.boxes.xywhn,
                    "labels": result.boxes.cls.int(),
                    "scores": result.boxes.conf,
                    "masks": result.masks.data,
                }
                batch.append(pred)
        return batch

    def _parse_output(self, output, frame_size, confidence_thresh):
        boxes = output["boxes_xywhn"].detach().cpu().numpy().astype(float)
        labels = output["labels"].detach().cpu().numpy()
        masks = output["masks"].detach().cpu().numpy() > self.mask_thresh

        boxes[:, 0] -= boxes[:, 2] / 2.0
        boxes[:, 1] -= boxes[:, 3] / 2.0

        if "scores" in output:
            scores = output["scores"].detach().cpu().numpy()
        else:
            scores = itertools.repeat(None)

        detections = []
        for box, label, mask, score in zip(boxes, labels, masks, scores):
            if (
                confidence_thresh is not None
                and score is not None
                and score < confidence_thresh
            ):
                continue

            # Process masks.
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

            detections.append(
                fol.Detection(
                    label=self.classes[label],
                    bounding_box=list(box),
                    mask=sub_mask.astype(bool),
                    confidence=score,
                )
            )

        return fol.Detections(detections=detections)


class UltralyticsPoseOutputProcessor(
    fout.KeypointDetectorOutputProcessor, UltralyticsPostProcessor
):
    """Converts Ultralytics Pose model outputs to FiftyOne format."""

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
        return super().__call__(preds, frame_size, confidence_thresh)

    def _to_dict(self, results):
        batch = []
        for result in results:
            if not result.keypoints:
                continue
            else:
                pred = {
                    "boxes": result.boxes.xyxy,
                    "labels": result.boxes.cls.int(),
                    "scores": result.boxes.conf,
                    "keypoints": result.keypoints.xyn,
                    "keypoints_scores": result.keypoints.conf,
                }
                batch.append(pred)
        return batch


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
