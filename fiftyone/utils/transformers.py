"""
Utilities for working with
`Hugging Face Transformers <https://huggingface.co/docs/transformers>`_.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging

import eta.core.utils as etau
import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
from fiftyone.core.config import Config
from fiftyone.core.models import EmbeddingsMixin, Model, PromptMixin
from fiftyone.zoo.models import HasZooModel

torch = fou.lazy_import("torch")
transformers = fou.lazy_import("transformers")


logger = logging.getLogger(__name__)

DEFAULT_CLASSIFICATION_PATH = "google/vit-base-patch16-224"
DEFAULT_DETECTION_PATH = "hustvl/yolos-tiny"
DEFAULT_SEGMENTATION_PATH = "nvidia/segformer-b0-finetuned-ade-512-512"
DEFAULT_DEPTH_ESTIMATION_PATH = "Intel/dpt-hybrid-midas"
DEFAULT_ZERO_SHOT_CLASSIFICATION_PATH = "openai/clip-vit-large-patch14"
DEFAULT_ZERO_SHOT_DETECTION_PATH = "google/owlvit-base-patch32"


def convert_transformers_model(model, task=None):
    """Converts the given Hugging Face transformers model into a FiftyOne
    model.

    Args:
        model: a ``transformers`` model
        task (None): the task of the model. Supported values are
            ``"image-classification"``, ``"object-detection"``,
            ``"semantic-segmentation"``, and ``"depth-estimation"``.
            If not specified, the task is automatically inferred from the model

    Returns:
         a :class:`fiftyone.core.models.Model`

    Raises:
        ValueError: if the model could not be converted
    """
    model_type = get_model_type(model, task=task)

    if model_type == "zero-shot-image-classification":
        return _convert_zero_shot_transformer_for_image_classification(model)
    elif model_type == "zero-shot-object-detection":
        return _convert_zero_shot_transformer_for_object_detection(model)
    elif model_type == "image-classification":
        return _convert_transformer_for_image_classification(model)
    elif model_type == "object-detection":
        return _convert_transformer_for_object_detection(model)
    elif model_type == "semantic-segmentation":
        return _convert_transformer_for_semantic_segmentation(model)
    elif model_type == "depth-estimation":
        return _convert_transformer_for_depth_estimation(model)
    elif model_type == "base-model":
        return _convert_transformer_base_model(model)
    else:
        raise ValueError(
            "Unsupported model type; cannot convert %s to a FiftyOne model"
            % model
        )


def _convert_transformer_base_model(model):
    config = FiftyOneTransformerConfig({"model": model})
    return FiftyOneTransformer(config)


def _convert_transformer_for_image_classification(model):
    config = FiftyOneTransformerConfig({"model": model})
    return FiftyOneTransformerForImageClassification(config)


def _convert_transformer_for_object_detection(model):
    config = FiftyOneTransformerConfig({"model": model})
    return FiftyOneTransformerForObjectDetection(config)


def _convert_transformer_for_semantic_segmentation(model):
    config = FiftyOneTransformerConfig({"model": model})
    return FiftyOneTransformerForSemanticSegmentation(config)


def _convert_transformer_for_depth_estimation(model):
    config = FiftyOneTransformerConfig({"model": model})
    return FiftyOneTransformerForDepthEstimation(config)


def _convert_zero_shot_transformer_for_image_classification(model):
    config = FiftyOneZeroShotTransformerConfig({"model": model})
    return FiftyOneZeroShotTransformerForImageClassification(config)


def _convert_zero_shot_transformer_for_object_detection(model):
    config = FiftyOneZeroShotTransformerConfig({"model": model})
    return FiftyOneZeroShotTransformerForObjectDetection(config)


def get_model_type(model, task=None):
    """Returns the string model type for the given model.

    If the model is a zero-shot model, the task is appended to the model type.

    Args:
        model: a ``transformers.model`` model
        task (None): an optional task type

    Returns:
        the model type string
    """
    if task and isinstance(task, str):
        if "zero-shot" in task:
            if "detection" in task:
                return "zero-shot-object-detection"
            else:
                return "zero-shot-image-classification"

    supported_tasks = (
        "image-classification",
        "object-detection",
        "semantic-segmentation",
        "depth-estimation",
    )
    if task is not None and task not in supported_tasks:
        raise ValueError(
            f"Unknown task: {task}. Valid tasks are {supported_tasks}"
        )

    zs = _is_zero_shot_model(model)

    if zs and task is None:
        if _has_detection_model(model):
            task = "object-detection"
        else:
            task = "image-classification"
    elif not zs and task is None:
        if _is_transformer_for_image_classification(model):
            task = "image-classification"
        elif _is_transformer_for_object_detection(model):
            task = "object-detection"
        elif _is_transformer_for_semantic_segmentation(model):
            task = "semantic-segmentation"
        elif _is_transformer_for_depth_estimation(model):
            task = "depth-estimation"
        elif _is_transformer_base_model(model):
            task = "base-model"
        else:
            raise ValueError(f"Unknown model type: {model}")

    if zs:
        return "zero-shot-" + task

    return task


def to_classification(results, id2label):
    """Converts the Transformers classification results to FiftyOne format.

    Args:
        results: Transformers classification results
        id2label: Transformers ID to label mapping

    Returns:
        a single or list of :class:`fiftyone.core.labels.Classification`
    """
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

    return [
        fol.Classification(
            label=label_classes[i],
            confidence=confidences[i],
            logits=logits[i],
        )
        for i in range(logits.shape[0])
    ]


def to_segmentation(results):
    """Converts the Transformers semantic segmentation results to FiftyOne
    format.

    Args:
        results: Transformers semantic segmentation results

    Returns:
        a single or list of :class:`fiftyone.core.labels.Segmentation`
    """
    masks = [r.cpu().numpy() for r in results]

    if len(results) == 1:
        return _create_segmentation(masks[0])

    return [_create_segmentation(masks[i]) for i in range(len(masks))]


def _create_segmentation(mask):
    return fol.Segmentation(mask=mask)


def to_heatmap(results):
    """Converts the Transformers depth estimation results to FiftyOne format.

    Args:
        results: Transformers depth estimation results

    Returns:
        a single or list of :class:`fiftyone.core.labels.Heatmap`
    """

    if len(results.shape) == 2:
        return _create_heatmap(results)

    if len(results) == 1:
        return _create_heatmap(results[0])

    return [_create_heatmap(results[i]) for i in range(len(results))]


def _create_heatmap(heatmap):
    ## normalize the heatmap
    heatmap /= np.max(heatmap)
    return fol.Heatmap(map=heatmap)


def to_detections(results, id2label, image_sizes):
    """Converts the Transformers detection results to FiftyOne format.

    Args:
        results: Transformers detection results
        id2label: Transformers ID to label mapping
        image_sizes: the list of image sizes

    Returns:
        a single or list of :class:`fiftyone.core.labels.Detections`
    """
    if isinstance(results, dict):
        return _to_detections(results, id2label, image_sizes[0])

    if len(results) == 1:
        return _to_detections(results[0], id2label, image_sizes[0])

    return [
        _to_detections(result, id2label, image_sizes[i])
        for i, result in enumerate(results)
    ]


def _get_class(label, id2label):
    # if the label is not in the id2label mapping, return the first label
    l = label.item()
    if l not in id2label:
        return id2label[0]
    return id2label[l]


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
                label=_get_class(label, id2label),
                bounding_box=box,
                confidence=score.item(),
            )
        )

    return fol.Detections(detections=detections)


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


class FiftyOneTransformerConfig(Config, HasZooModel):
    """Configuration for a :class:`FiftyOneTransformer`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
    """

    def __init__(self, d):
        self.model = self.parse_raw(d, "model", default=None)
        self.name_or_path = self.parse_string(d, "name_or_path", default=None)
        self.device = self.parse_string(
            d, "device", default="cuda" if torch.cuda.is_available() else "cpu"
        )
        if etau.is_str(self.model):
            self.name_or_path = self.model
            self.model = None


class FiftyOneZeroShotTransformerConfig(FiftyOneTransformerConfig):
    """Configuration for a :class:`FiftyOneZeroShotTransformer`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
        text_prompt: the text prompt to use, e.g., ``"A photo of"``
        classes (None): a list of custom classes for zero-shot prediction
    """

    def __init__(self, d):
        self.text_prompt = self.parse_string(d, "text_prompt", default=None)
        self.classes = self.parse_array(d, "classes", default=None)
        super().__init__(d)


class TransformerEmbeddingsMixin(EmbeddingsMixin):
    """Mixin for Transformers that can generate embeddings."""

    @property
    def has_embeddings(self):
        # If the model family supports classification or detection tasks, its
        # embeddings from last_hidden_layer are meaningful and properly sized
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

    def embed(self, arg):
        return self._embed(arg)[0]

    def embed_all(self, args):
        return self._embed(args)

    def _embed(self, args):
        inputs = self.image_processor(args, return_tensors="pt")
        with torch.no_grad():
            outputs = self.model.base_model(**inputs.to(self.device))

        return outputs.last_hidden_state[:, -1, :].cpu().numpy()


class ZeroShotTransformerEmbeddingsMixin(EmbeddingsMixin):
    """Mixin for Transformers that can generate embeddings."""

    @property
    def has_embeddings(self):
        return _has_text_and_image_features(self.model)

    def embed(self, arg):
        return self._embed(arg)[0]

    def embed_all(self, args):
        return self._embed(args)

    def _embed(self, args):
        inputs = self.processor(images=args, return_tensors="pt")
        with torch.no_grad():
            image_features = self.model.base_model.get_image_features(
                **inputs.to(self.device)
            )

        return image_features.cpu().numpy()


class ZeroShotTransformerPromptMixin(PromptMixin):
    """Mixin for Transformers that can perform zero-shot prediction."""

    @property
    def can_embed_prompts(self):
        return _has_text_and_image_features(self.model)

    def embed_prompt(self, prompt):
        """Generates an embedding for the given text prompt.

        Args:
            prompt: a text string

        Returns:
            a numpy vector
        """
        return self.embed_prompts([prompt])[0]

    def embed_prompts(self, prompts):
        """Generates an embedding for the given text prompts.

        Args:
            prompts: an iterable of text strings

        Returns:
            a ``num_prompts x num_dims`` array of prompt embeddings
        """
        return self._embed_prompts(prompts).detach().cpu().numpy()

    def _embed_prompts(self, prompts):
        inputs = self.processor(text=prompts, return_tensors="pt")
        with torch.no_grad():
            text_features = self.model.base_model.get_text_features(
                **inputs.to(self.device)
            )
        return text_features


class FiftyOneTransformer(TransformerEmbeddingsMixin, Model):
    """FiftyOne wrapper around a ``transformers`` model.

    Args:
        config: a `FiftyOneTransformerConfig`
    """

    def __init__(self, config):
        self.config = config
        self.model = self._load_model(config)
        self.device = torch.device(self.config.device)
        self.model.to(self.device)
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


class FiftyOneZeroShotTransformer(
    ZeroShotTransformerEmbeddingsMixin, ZeroShotTransformerPromptMixin, Model
):
    """FiftyOne wrapper around a ``transformers`` model.

    Args:
        config: a `FiftyOneZeroShotTransformerConfig`
    """

    def __init__(self, config):
        self.config = config
        self.classes = config.classes
        self.model = self._load_model(config)
        self.device = torch.device(self.config.device)
        self.model.to(self.device)
        self.processor = self._load_processor()
        self._text_prompts = None

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

    def _load_processor(self):
        return _get_processor(self.model)

    def _load_model(self, config):
        if config.model is not None:
            return config.model

        return transformers.AutoModel.from_pretrained(config.name_or_path)

    def _get_text_prompts(self):
        if self._text_prompts is not None:
            return self._text_prompts

        if self.classes is None and self.config.classes is None:
            return None

        if self.classes is None:
            self.classes = self.config.classes

        if self.config.text_prompt is None:
            self._text_prompts = self.classes
        else:
            self._text_prompts = [
                "%s %s" % (self.config.text_prompt, c) for c in self.classes
            ]

        return self._text_prompts

    def predict(self, arg):
        raise NotImplementedError("Subclass must implement predict()")


class FiftyOneZeroShotTransformerForImageClassificationConfig(
    FiftyOneZeroShotTransformerConfig
):
    """Configuration for a
    :class:`FiftyOneZeroShotTransformerForImageClassification`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
        text_prompt: the text prompt to use, e.g., ``"A photo of"``
        classes (None): a list of custom classes for zero-shot prediction
    """

    def __init__(self, d):
        super().__init__(d)
        if self.model is None and self.name_or_path is None:
            self.name_or_path = DEFAULT_ZERO_SHOT_CLASSIFICATION_PATH


class FiftyOneZeroShotTransformerForImageClassification(
    FiftyOneZeroShotTransformer
):
    """FiftyOne wrapper around a ``transformers`` model for zero-shot image
    classification.

    Args:
        config: a `FiftyOneZeroShotTransformerConfig`
    """

    def _load_model(self, config):
        if config.model is not None:
            return config.model

        device = torch.device(config.device)
        model = transformers.AutoModel.from_pretrained(config.name_or_path).to(
            device
        )
        if _has_image_text_retrieval(model):
            model = _get_model_for_image_text_retrieval(
                model, config.name_or_path
            )

        return model

    def _predict_all_from_features(self, args):
        text_prompts = self._get_text_prompts()
        inputs = self.processor(
            images=args, text=text_prompts, return_tensors="pt", padding=True
        )

        with torch.no_grad():
            outputs = self.model(**inputs.to(self.device))

        logits_per_image = (
            outputs.logits_per_image.detach().cpu()
        )  # this is the image-text similarity score

        probs = logits_per_image.softmax(
            dim=1
        )  # we can take the softmax to get the label probabilities
        conf = probs.max(
            dim=1
        ).values.numpy()  # the confidence of the most likely label
        logits = (
            logits_per_image.numpy()
        )  # we can also take the logits and train a linear classifier on top
        arg_max = (
            probs.argmax(dim=1).numpy().astype(int)
        )  # the argmax of the label probabilities
        classifs = [
            fol.Classification(
                label=self.classes[arg_max[i]],
                confidence=conf[i],
                logits=logits[i],
            )
            for i in range(logits.shape[0])
        ]

        if len(classifs) == 1:
            classifs = classifs[0]

        return classifs

    def _predict_all_from_retrieval(self, args):
        return [self._predict_from_retrieval(arg) for arg in args]

    def _predict_from_retrieval(self, arg):
        text_prompts = self._get_text_prompts()
        logits = []

        with torch.no_grad():
            for text_prompt in text_prompts:
                inputs = self.processor(arg, text_prompt, return_tensors="pt")
                outputs = self.model(**(inputs.to(self.device)))
                logits.append(outputs.logits[0, :].item())

        logits = np.array(logits)
        probs = np.exp(logits) / np.sum(np.exp(logits))
        conf = probs.max()
        arg_max = int(probs.argmax())
        label = self.classes[arg_max]

        return fol.Classification(
            label=label,
            confidence=conf,
            logits=logits,
        )

    def predict_all(self, args):
        if _has_text_and_image_features(self.model):
            return self._predict_all_from_features(args)
        else:
            return self._predict_all_from_retrieval(args)

    def predict(self, arg):
        return self.predict_all(arg)


class FiftyOneTransformerForImageClassificationConfig(
    FiftyOneTransformerConfig
):
    """Configuration for a :class:`FiftyOneTransformerForImageClassification`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
    """

    def __init__(self, d):
        super().__init__(d)
        if self.model is None and self.name_or_path is None:
            self.name_or_path = DEFAULT_CLASSIFICATION_PATH


class FiftyOneTransformerForImageClassification(FiftyOneTransformer):
    """FiftyOne wrapper around a ``transformers`` model for image
    classification.

    Args:
        config: a `FiftyOneTransformerConfig`
    """

    def _load_model(self, config):
        if config.model is not None:
            return config.model
        device = torch.device(config.device)
        return transformers.AutoModelForImageClassification.from_pretrained(
            config.name_or_path
        ).to(device)

    def _predict(self, inputs):
        with torch.no_grad():
            results = self.model(**(inputs.to(self.device)))
        return to_classification(results, self.model.config.id2label)

    def predict(self, arg):
        inputs = self.image_processor(arg, return_tensors="pt")
        return self._predict(inputs)

    def predict_all(self, args):
        inputs = self.image_processor(args, return_tensors="pt")
        return self._predict(inputs)


class FiftyOneZeroShotTransformerForObjectDetectionConfig(
    FiftyOneZeroShotTransformerConfig
):
    """Configuration for a
    :class:`FiftyOneZeroShotTransformerForObjectDetection`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
        text_prompt: the text prompt to use, e.g., ``"A photo of"``
        classes (None): a list of custom classes for zero-shot prediction
    """

    def __init__(self, d):
        super().__init__(d)
        if self.model is None and self.name_or_path is None:
            self.name_or_path = DEFAULT_ZERO_SHOT_DETECTION_PATH
        elif self.model is not None:
            self.name_or_path = self.model.name_or_path


class FiftyOneZeroShotTransformerForObjectDetection(
    FiftyOneZeroShotTransformer
):
    """FiftyOne wrapper around a ``transformers`` model for zero shot object
    detection.

    Args:
        config: a `FiftyOneZeroShotTransformerConfig`
    """

    def __init__(self, config):
        self.config = config
        self.classes = config.classes
        self.processor = self._load_processor(config)
        self.model = self._load_model(config)
        self.device = torch.device(self.config.device)
        self.model.to(self.device)
        self._text_prompts = None

    def _load_processor(self, config):
        name_or_path = config.name_or_path
        if not name_or_path:
            if config.model is not None:
                name_or_path = config.model.name_or_path

        return transformers.AutoProcessor.from_pretrained(name_or_path)

    def _load_model(self, config):
        name_or_path = config.name_or_path
        if not name_or_path:
            if config.model is not None:
                name_or_path = config.model.name_or_path

        if config.model is not None:
            return config.model
        else:
            return _get_detector_from_processor(
                self.processor, name_or_path
            ).to(config.device)

    def _process_inputs(self, args):
        text_prompts = self._get_text_prompts()
        inputs = self.processor(
            images=args, text=text_prompts, return_tensors="pt", padding=True
        )
        return inputs

    def _predict(self, inputs, target_sizes):
        with torch.no_grad():
            outputs = self.model(**(inputs.to(self.device)))

        results = self.processor.image_processor.post_process_object_detection(
            outputs, target_sizes=target_sizes
        )
        image_shapes = [i[::-1] for i in target_sizes]

        id2label = {i: c for i, c in enumerate(self.classes)}
        return to_detections(results, id2label, image_shapes)

    def predict(self, arg):
        target_sizes = [arg.shape[:-1][::-1]]
        inputs = self._process_inputs(arg)
        return self._predict(inputs, target_sizes)


class FiftyOneTransformerForObjectDetectionConfig(FiftyOneTransformerConfig):
    """Configuration for a :class:`FiftyOneTransformerForObjectDetection`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
    """

    def __init__(self, d):
        super().__init__(d)
        if self.model is None and self.name_or_path is None:
            self.name_or_path = DEFAULT_DETECTION_PATH


class FiftyOneTransformerForObjectDetection(FiftyOneTransformer):
    """FiftyOne wrapper around a ``transformers`` model for object detection.

    Args:
        config: a `FiftyOneTransformerConfig`
    """

    def _load_model(self, config):
        if config.model is not None:
            return config.model
        return transformers.AutoModelForObjectDetection.from_pretrained(
            config.name_or_path
        ).to(config.device)

    def _predict(self, inputs, target_sizes):
        with torch.no_grad():
            outputs = self.model(**inputs.to(self.device))

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


class FiftyOneTransformerForSemanticSegmentationConfig(
    FiftyOneTransformerConfig
):
    """Configuration for a :class:`FiftyOneTransformerForSemanticSegmentation`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
    """

    def __init__(self, d):
        super().__init__(d)
        if self.model is None and self.name_or_path is None:
            self.name_or_path = DEFAULT_SEGMENTATION_PATH


class FiftyOneTransformerForSemanticSegmentation(FiftyOneTransformer):
    """FiftyOne wrapper around a ``transformers`` model for semantic
    segmentation.

    Args:
        config: a `FiftyOneTransformerConfig`
    """

    def _load_model(self, config):
        if config.model is not None:
            model = config.model
        else:
            model = (
                transformers.AutoModelForSemanticSegmentation.from_pretrained(
                    config.name_or_path
                ).to(config.device)
            )

        self.mask_targets = model.config.id2label
        return model

    def _predict(self, inputs, target_sizes):
        with torch.no_grad():
            outputs = self.model(**inputs.to(self.device))

        results = self.image_processor.post_process_semantic_segmentation(
            outputs, target_sizes=target_sizes
        )
        return to_segmentation(results)

    def predict(self, arg):
        target_sizes = [arg.shape[:-1][::-1]]
        inputs = self.image_processor(arg, return_tensors="pt")
        return self._predict(inputs, target_sizes)

    def predict_all(self, args):
        target_sizes = [i.shape[:-1][::-1] for i in args]
        inputs = self.image_processor(args, return_tensors="pt")
        return self._predict(inputs, target_sizes)


class FiftyOneTransformerForDepthEstimationConfig(FiftyOneTransformerConfig):
    """Configuration for a :class:`FiftyOneTransformerForDepthEstimation`.

    Args:
        model (None): a ``transformers`` model
        name_or_path (None): the name or path to a checkpoint file to load
    """

    def __init__(self, d):
        super().__init__(d)
        if self.model is None and self.name_or_path is None:
            self.name_or_path = DEFAULT_DEPTH_ESTIMATION_PATH


class FiftyOneTransformerForDepthEstimation(FiftyOneTransformer):
    """FiftyOne wrapper around a ``transformers`` model for depth estimation.

    Args:
        config: a `FiftyOneTransformerConfig`
    """

    def _load_model(self, config):
        if config.model is not None:
            return config.model
        return transformers.AutoModelForDepthEstimation.from_pretrained(
            config.name_or_path
        ).to(config.device)

    def _predict(self, inputs, target_sizes):
        with torch.no_grad():
            outputs = self.model(**inputs.to(self.device))

        predicted_depth = outputs.predicted_depth
        prediction = torch.nn.functional.interpolate(
            predicted_depth.unsqueeze(1),
            size=target_sizes[0],
            mode="bicubic",
            align_corners=False,
        )
        prediction = prediction.squeeze(1).cpu().numpy()

        return to_heatmap(prediction)

    def predict(self, arg):
        target_sizes = [arg.shape[:2]]
        inputs = self.image_processor(arg, return_tensors="pt")
        return self._predict(inputs, target_sizes)

    def predict_all(self, args):
        target_sizes = [i.shape[:2] for i in args]
        inputs = self.image_processor(args, return_tensors="pt")
        return self._predict(inputs, target_sizes)


def _has_text_and_image_features(model):
    return hasattr(model.base_model, "get_image_features") and hasattr(
        model.base_model, "get_text_features"
    )


def _has_image_text_retrieval(model):
    module_name = "transformers"
    model_name = _get_model_type_string(model)
    itr_class_name = f"{model_name}ForImageAndTextRetrieval"
    return hasattr(
        __import__(module_name, fromlist=[itr_class_name]),
        itr_class_name,
    )


def _has_detection_model(model):
    module_name = "transformers"
    model_name = _get_base_model_name(model)
    detection_class_name = f"{model_name}ForObjectDetection"
    return hasattr(
        __import__(module_name, fromlist=[detection_class_name]),
        detection_class_name,
    )


def _is_zero_shot_model(model):
    if _has_text_and_image_features(model):
        return True

    if _has_image_text_retrieval(model):
        return True

    return False


def _get_model_type_string(model):
    return str(type(model)).split(".")[-1][:-2]


def _is_transformer_for_image_classification(model):
    return "ForImageClassification" in _get_model_type_string(model)


def _is_transformer_for_object_detection(model):
    return "ForObjectDetection" in _get_model_type_string(model)


def _is_transformer_for_semantic_segmentation(model):
    ms = _get_model_type_string(model)
    return "For" in ms and "Segmentation" in ms


def _is_transformer_for_depth_estimation(model):
    return "ForDepthEstimation" in _get_model_type_string(model)


def _is_transformer_base_model(model):
    model_type = _get_model_type_string(model)
    return "Model" in model_type and "For" not in model_type


def _get_base_model_name(model):
    return str(type(model)).split(".")[-1][:-2].split("For")[0]


def _get_model_for_image_text_retrieval(base_model, model_name_or_path):
    model_name = _get_base_model_name(base_model)
    module_name = "transformers"
    itr_class_name = f"{model_name}ForImageAndTextRetrieval"
    itr_class = getattr(
        __import__(module_name, fromlist=[itr_class_name]),
        itr_class_name,
    )

    return itr_class.from_pretrained(model_name_or_path).to(base_model.device)


def _get_image_processor_fallback(model):
    model_name = _get_base_model_name(model)
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


def _get_processor(model):
    try:
        processor = transformers.AutoProcessor.from_pretrained(
            model.config._name_or_path
        )
    except:
        raise ValueError(
            "Could not find a processor for model %s"
            % model.config._name_or_path
        )

    return processor


def _get_detector_from_processor(processor, model_name_or_path):
    module_name = "transformers"
    processor_class_name = f"{processor.__class__.__name__}"
    detector_class_name = (
        f"{processor_class_name.split('Processor')[0]}ForObjectDetection"
    )
    detector_class = getattr(
        __import__(module_name, fromlist=[detector_class_name]),
        detector_class_name,
    )
    return detector_class.from_pretrained(model_name_or_path)
