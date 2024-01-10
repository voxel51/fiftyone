"""
Utilities for working with
`Hugging Face Transformers <hhttps://huggingface.co/docs/transformers>`_.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np

from fiftyone.core.config import Config
import fiftyone.core.labels as fol
from fiftyone.core.models import Model, EmbeddingsMixin
import fiftyone.core.utils as fou

torch = fou.lazy_import("torch")
transformers = fou.lazy_import("transformers")


def convert_transformers_model(model):
    """Converts the given Hugging Face transformers model into a FiftyOne
    model.

    Args:
        model: a ``transformers.models`` model

    Returns:
         a :class:`fiftyone.core.models.Model`

    Raises:
        ValueError: if the model could not be converted
    """
    if _is_transformer_for_image_classification(model):
        return _convert_transformer_for_image_classification(model)
    elif _is_transformer_for_object_detection(model):
        return _convert_transformer_for_object_detection(model)
    elif _is_transformer_base_model(model):
        return _convert_transformer_base_model(model)
    else:
        raise ValueError(
            "Unsupported model type; cannot convert %s to a FiftyOne model"
            % model
        )


def _get_image_processor_fallback(model):
    model_name = str(type(model)).split(".")[-1][:-2].split("For")[0]
    module_name = "transformers"
    processor_class_name = f"{model_name}ImageProcessor"
    processor_class = getattr(
        __import__(module_name, fromlist=[processor_class_name]),
        processor_class_name,
    )
    return processor_class.from_pretrained(model.config.model_name_or_path)


def _get_image_processor(model):
    try:
        image_processor = transformers.AutoImageProcessor.from_pretrained(
            model.config._name_or_path
        )
    except:
        image_processor = _get_image_processor_fallback(model)
    return image_processor


def to_classification(results, id2label):
    logits = results.logits
    predicted_labels = logits.argmax(-1)

    logits = logits.cpu().numpy()
    label_classes = [id2label[int(i)] for i in predicted_labels]

    odds = np.exp(logits)
    confidences = np.max(odds, axis=1) / np.sum(odds, axis=1)

    if logits.shape[0] == 1:
        return fol.Classification(
            label=label_classes[0], confidence=confidences[0], logits=logits[0]
        )
    else:
        return [
            fol.Classification(
                label=label_classes[i],
                confidence=confidences[i],
                logits=logits[i],
            )
            for i in range(logits.shape[0])
        ]


def _convert_bounding_box(box, image_shape):
    top_left_x, top_left_y, bottom_right_x, bottom_right_y = box

    width = bottom_right_x - top_left_x
    height = bottom_right_y - top_left_y

    img_width, img_height = image_shape

    return [
        top_left_x / img_width,
        top_left_y / img_height,
        width / img_width,
        height / img_height,
    ]


def _to_detections(result, id2label, image_size):
    detections = []

    scores = result["scores"].cpu().numpy()
    labels = result["labels"].cpu().numpy()
    boxes = result["boxes"].cpu().numpy()
    for score, label, box in zip(scores, labels, boxes):
        box = [round(i, 2) for i in box.tolist()]
        box = _convert_bounding_box(box, image_size)
        detections.append(
            fol.Detection(
                label=id2label[label.item()],
                bounding_box=box,
                confidence=score.item(),
            )
        )

    return fol.Detections(detections=detections)


def to_detections(results, id2label, image_sizes):
    if isinstance(results, dict):
        return _to_detections(results, id2label, image_sizes[0])
    elif len(results) == 1:
        return _to_detections(results[0], id2label, image_sizes[0])
    else:
        return [
            _to_detections(result, id2label, image_sizes[i])
            for i, result in enumerate(results)
        ]


class FiftyOneTransformerConfig(Config):
    """Configuration for a :class:`FiftyOneTransformer`.

    Args:
        model (None): a ``transformers.model`` model
        name_or_path (None): the name or path to a checkpoint file to load
    """

    def __init__(self, d):
        self.model = self.parse_raw(d, "model", default=None)
        self.name_or_path = self.parse_string(d, "name_or_path", default=None)


class TransformersEmbeddingsMixin(EmbeddingsMixin):
    """Mixin for Torch models that can generate embeddings.

    Args:
        model: the Transformers `transformers:models` model
    """

    @property
    def has_embeddings(self):
        smodel = str(type(self.model)).split(".")
        model_name = smodel[-1][:-2].split("For")[0].replace("Model", "")
        module_name = "transformers"

        classif_model_name = f"{model_name}ForImageClassification"
        detection_model_name = f"{model_name}ForObjectDetection"

        _dynamic_import = __import__(
            module_name, fromlist=[classif_model_name, detection_model_name]
        )

        return hasattr(_dynamic_import, classif_model_name) or hasattr(
            _dynamic_import, detection_model_name
        )

    def _embed(self, args):
        inputs = self.image_processor(args, return_tensors="pt")
        with torch.no_grad():
            outputs = self.model.base_model(**inputs)

        last_hidden_state = outputs.last_hidden_state[:, -1, :].cpu().numpy()
        return last_hidden_state

    def embed(self, arg):
        return self._embed(arg)

    def embed_all(self, args):
        return self._embed(args)


class FiftyOneTransformer(TransformersEmbeddingsMixin, Model):
    """FiftyOne wrapper around a ``transformers.model`` model.

    Args:
        config: a `FiftyOneTransformerConfig`
    """

    def __init__(self, config):
        self.config = config
        self.model = self._load_model(config)
        self.image_processor = self._load_image_processor()

    @property
    def media_type(self):
        return "image"

    @property
    def ragged_batches(self):
        return False

    @property
    def transforms(self):
        return None

    @property
    def preprocess(self):
        return False

    def _load_image_processor(self):
        return _get_image_processor(self.model)

    def _load_model(self, config):
        if config.model is not None:
            return config.model

        return transformers.AutoModel.from_pretrained(config.name_or_path)

    def predict(self, arg):
        raise NotImplementedError("Subclass must implement predict()")


class FiftyOneTransformerForImageClassification(FiftyOneTransformer):
    """FiftyOne wrapper around a ``transformers.model`` for image
    classification.

    Args:
        config: a `FiftyOneTransformerConfig`
    """

    def _load_model(self, config):
        if config.model is not None:
            return config.model

        return transformers.AutoModelForImageClassification.from_pretrained(
            config.name_or_path
        )

    def _predict(self, inputs):
        with torch.no_grad():
            results = self.model(**inputs)
        return to_classification(results, self.model.config.id2label)

    def predict(self, arg):
        inputs = self.image_processor(arg, return_tensors="pt")
        return self._predict(inputs)

    def predict_all(self, args):
        inputs = self.image_processor(args, return_tensors="pt")
        return self._predict(inputs)


class FiftyOneTransformerForObjectDetection(FiftyOneTransformer):
    """FiftyOne wrapper around a ``transformers.model`` for object detection.

    Args:
        config: a `FiftyOneTransformerConfig`
    """

    def _load_model(self, config):
        if config.model is not None:
            return config.model

        return transformers.AutoModelForObjectDetection.from_pretrained(
            config.name_or_path
        )

    def _predict(self, inputs, target_sizes):
        with torch.no_grad():
            outputs = self.model(**inputs)

        results = self.image_processor.post_process_object_detection(
            outputs, target_sizes=target_sizes
        )
        image_shapes = [i[::-1] for i in target_sizes]
        return to_detections(results, self.model.config.id2label, image_shapes)

    def predict(self, arg):
        target_sizes = [arg.shape[:-1][::-1]]
        inputs = self.image_processor(arg, return_tensors="pt")
        return self._predict(inputs, target_sizes)

    def predict_all(self, args):
        target_sizes = [i.shape[:-1][::-1] for i in args]
        inputs = self.image_processor(args, return_tensors="pt")
        return self._predict(inputs, target_sizes)


def _get_model_type_string(model):
    return str(type(model)).split(".")[-1][:-2]


def _is_transformer_for_image_classification(model):
    return "ForImageClassification" in _get_model_type_string(model)


def _is_transformer_for_object_detection(model):
    return "ForObjectDetection" in _get_model_type_string(model)


def _is_transformer_base_model(model):
    model_type = _get_model_type_string(model)
    return "Model" in model_type and "For" not in model_type


def _convert_transformer_base_model(model):
    config = FiftyOneTransformerConfig({"model": model})
    return FiftyOneTransformer(config)


def _convert_transformer_for_image_classification(model):
    config = FiftyOneTransformerConfig({"model": model})
    return FiftyOneTransformerForImageClassification(config)


def _convert_transformer_for_object_detection(model):
    config = FiftyOneTransformerConfig({"model": model})
    return FiftyOneTransformerForObjectDetection(config)
