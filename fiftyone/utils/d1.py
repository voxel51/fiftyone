"""
`d1 <https://huggingface.co/LiquidAI/d1-3B>`_ decision model wrapper for the
FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import importlib
import logging
import math
import re
import sys

import numpy as np
from PIL import Image

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch
import torch.nn.functional as F

logger = logging.getLogger(__name__)


def _ensure_d1():
    # The release's code builds on transformers' LFM2-VL classes
    fou.ensure_package("transformers>=5.14")


transformers = fou.lazy_import("transformers", callback=_ensure_d1)

DEFAULT_D1_MODEL = "LiquidAI/d1-3B"
DEFAULT_D1_REVISION = "051bcc464b01b9f92942b364d9586b0ef5912432"
DEFAULT_CHOICE_INSTRUCTIONS = "Which option best describes the image?"
DEFAULT_QUESTION_ID = "label"

QUESTION_TYPES = ("noul", "choice", "score")
_NOUL_OPTIONS = ("true", "false")
_QUESTION_ID = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

# The release answers a score with one of the digits 0-9
_MAX_SCORE_LEVELS = 10


def _validate_questions(questions):
    """Raise ``ValueError`` for a question schema the model cannot answer."""
    if not isinstance(questions, dict) or not questions:
        raise ValueError("questions must be a non-empty dict")

    for question_id, question in questions.items():
        if not isinstance(question_id, str) or not _QUESTION_ID.match(
            question_id
        ):
            raise ValueError(
                "question ID %r must be a valid field name: letters, digits "
                "and underscores, not starting with a digit" % (question_id,)
            )

        if not isinstance(question, dict):
            raise ValueError("question %r must be a dict" % question_id)

        question_type = question.get("type")
        if question_type not in QUESTION_TYPES:
            raise ValueError(
                "question %r has type %r; must be one of %s"
                % (question_id, question_type, ", ".join(QUESTION_TYPES))
            )

        criteria = question.get("criteria")
        if question_type == "choice":
            if not isinstance(criteria, dict) or not criteria:
                raise ValueError(
                    "choice question %r needs criteria mapping each option "
                    "to its description" % question_id
                )
        elif question_type == "score":
            if not isinstance(criteria, (list, tuple)) or not (
                2 <= len(criteria) <= _MAX_SCORE_LEVELS
            ):
                raise ValueError(
                    "score question %r needs criteria listing 2 to %d "
                    "levels, lowest first" % (question_id, _MAX_SCORE_LEVELS)
                )
        elif criteria is not None:
            if not isinstance(criteria, dict) or not set(criteria) <= set(
                _NOUL_OPTIONS
            ):
                raise ValueError(
                    "noul question %r criteria may only describe 'true' and "
                    "'false'" % question_id
                )


def _option_order(question):
    """The options of a question in the order the caller gave them."""
    question_type = question["type"]
    if question_type == "noul":
        return list(_NOUL_OPTIONS)

    if question_type == "choice":
        return [str(option) for option in question["criteria"]]

    return [str(level) for level in range(len(question["criteria"]))]


def _prepare_image(img):
    """Converts image-like input to an RGB PIL image for the processor.

    ``fout.to_rgb_pil`` expects channel-last layout and reads float arrays as
    0-1, wrapping anything above it, so tensors are converted and
    channel-first or 0-255 float input is normalized first.
    """
    if isinstance(img, torch.Tensor):
        img = img.detach().cpu().numpy()

    if isinstance(img, np.ndarray):
        # Transpose CHW to HWC when the first dim is channels and the last
        # cannot be
        if (
            img.ndim == 3
            and img.shape[0] in (1, 3, 4)
            and img.shape[2] not in (1, 3, 4)
        ):
            img = np.transpose(img, (1, 2, 0))

        if np.issubdtype(img.dtype, np.floating):
            scale = 255.0 if img.max() <= 1.0 else 1.0
            img = np.clip(img * scale, 0, 255).astype(np.uint8)

    return fout.to_rgb_pil(img)


def _release_modules(model):
    """The ``runner`` and ``prompt`` modules of the release's code."""
    runner = sys.modules[type(model.engine).__module__]
    prompt = importlib.import_module(
        ".prompt", runner.__name__.rsplit(".", 1)[0]
    )
    return runner, prompt


def _cap_pixels(img, max_pixels):
    """Downscales an image to at most ``max_pixels`` pixels, as the release
    does before its processor."""
    w, h = img.size
    if w * h <= max_pixels:
        return img

    scale = math.sqrt(max_pixels / (w * h))
    size = (max(1, int(w * scale)), max(1, int(h * scale)))
    return img.resize(size, Image.Resampling.BICUBIC)


class D1GetItem(fout.GetItem):
    """A :class:`fiftyone.utils.torch.GetItem` that loads an image and encodes
    it into the prompt prefix that every question continues.

    Data loader workers call it, so image decoding, tiling and tokenization
    run in parallel with inference.

    Args:
        processor: the release's processor
        prefix: the prompt text before the question, holding the image
            placeholder and the state
        max_pixels (1048576): the pixel count to which larger images are
            downscaled before the processor
        field_mapping (None): the user-supplied dict mapping keys in
            :attr:`required_keys` to field names of their dataset that
            contain the required values
    """

    def __init__(
        self,
        processor,
        prefix,
        max_pixels=1024 * 1024,
        field_mapping=None,
        **kwargs,
    ):
        self.processor = processor
        self.prefix = prefix
        self.max_pixels = max_pixels
        super().__init__(field_mapping=field_mapping, **kwargs)

    @property
    def required_keys(self):
        return ["filepath"]

    def __call__(self, d):
        return self.encode(d["filepath"])

    def encode(self, img):
        """Encodes an image into the prompt prefix.

        Args:
            img: an image path, PIL image, numpy array or Torch tensor

        Returns:
            a dict with the prefix's ``input_ids`` and the image tiles'
            ``pixel_values``, ``pixel_attention_mask`` and
            ``spatial_shapes``
        """
        img = _cap_pixels(_prepare_image(img), self.max_pixels)
        inputs = self.processor(
            text=[self.prefix],
            images=[[img]],
            return_tensors="pt",
            add_special_tokens=False,
        )

        # The processor pads every tile to its maximum patch count, which the
        # vision tower masks out; the padding is cut, as in the release
        mask = inputs["pixel_attention_mask"]
        patches = int(mask.sum(1).max())
        return {
            "input_ids": inputs["input_ids"][0],
            "pixel_values": inputs["pixel_values"][:, :patches],
            "pixel_attention_mask": mask[:, :patches],
            "spatial_shapes": inputs["spatial_shapes"],
        }


class _D1Collate(object):
    """Continues every image's prompt prefix with every question and pads the
    rows on the right, which the release's causal stack needs no mask for.

    Args:
        suffixes: the token IDs of each question's prompt suffix
        pad_token_id: the ID of the tokenizer's padding token
    """

    def __init__(self, suffixes, pad_token_id):
        self.suffixes = suffixes
        self.pad_token_id = pad_token_id

    def __call__(self, items):
        rows = [
            item["input_ids"].tolist() + suffix
            for item in items
            for suffix in self.suffixes
        ]
        input_ids = torch.full(
            (len(rows), max(len(row) for row in rows)),
            self.pad_token_id,
            dtype=torch.long,
        )
        for i, row in enumerate(rows):
            input_ids[i, : len(row)] = torch.tensor(row)

        patches = max(item["pixel_values"].shape[1] for item in items)
        pixel_values = []
        pixel_attention_mask = []
        for item in items:
            pad = patches - item["pixel_values"].shape[1]
            pixel_values.append(F.pad(item["pixel_values"], (0, 0, 0, pad)))
            pixel_attention_mask.append(
                F.pad(item["pixel_attention_mask"], (0, pad))
            )

        return {
            "input_ids": input_ids,
            "last_index": torch.tensor([len(row) - 1 for row in rows]),
            "pixel_values": torch.cat(pixel_values),
            "pixel_attention_mask": torch.cat(pixel_attention_mask),
            "spatial_shapes": torch.cat(
                [item["spatial_shapes"] for item in items]
            ),
            "tiles": [len(item["pixel_values"]) for item in items],
        }


class D1OutputProcessor(fout.OutputProcessor):
    """Output processor for d1 decision models.

    A ``choice`` or ``noul`` answer becomes a
    :class:`fiftyone.core.labels.Classification` whose label is the most
    probable option and whose confidence is that option's probability. A
    ``score`` answer becomes a :class:`fiftyone.core.labels.Regression` whose
    value is the expected level and whose confidence is the probability of
    the most probable level. A schema of one question yields that label; a
    schema of several yields a dict keyed by question ID.

    Args:
        classes (None): unused; every answer carries its own options
        store_logits (False): whether to store each classification's
            per-option logits, in the order the options were given
    """

    def __init__(self, classes=None, store_logits=False, **kwargs):
        self.store_logits = store_logits

    def __call__(
        self,
        output,
        frame_size,
        confidence_thresh=None,
        classes=None,
        questions=None,
        answer_columns=None,
        **kwargs,
    ):
        """Processes model output into labels.

        Args:
            output: the log-probabilities at the answer slot over the tokens
                that answer the questions, one row per image and question,
                each image's rows in the schema's order
            frame_size: unused
            confidence_thresh (None): an optional confidence below which a
                classification is omitted
            classes (None): unused
            questions (None): the question schema, a dict mapping question
                ID to question
            answer_columns (None): a dict mapping each question ID to, for
                each of its options in the order they were given, the
                columns of ``output`` holding that option's tokens
            **kwargs: unused

        Returns:
            a list of :class:`fiftyone.core.labels.Label` instances, or of
            dicts of them when the schema has several questions
        """
        values = output.float().cpu().numpy()
        results = []
        for start in range(0, len(values), len(questions)):
            rows = values[start : start + len(questions)]
            labels = {}
            for row, (question_id, question) in zip(rows, questions.items()):
                # An option scores its best-scoring token, as in the release
                logits = np.array(
                    [row[cols].max() for cols in answer_columns[question_id]],
                    dtype=np.float64,
                )
                labels[question_id] = self._to_label(
                    question, logits, confidence_thresh
                )

            if len(labels) == 1:
                results.append(next(iter(labels.values())))
            else:
                # An answer the threshold dropped is left out, since a new
                # field cannot take its type from None
                results.append(
                    {k: v for k, v in labels.items() if v is not None}
                )

        return results

    def _to_label(self, question, logits, confidence_thresh):
        probabilities = np.exp(logits - logits.max())
        probabilities /= probabilities.sum()

        best = int(np.argmax(probabilities))
        confidence = float(probabilities[best])

        if question["type"] == "score":
            value = float(np.dot(np.arange(len(probabilities)), probabilities))
            return fol.Regression(value=value, confidence=confidence)

        if confidence_thresh is not None and confidence < confidence_thresh:
            return None

        options = _option_order(question)
        label = fol.Classification(label=options[best], confidence=confidence)
        if self.store_logits:
            label.logits = logits

        return label


class D1ModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`D1Model`.

    Exactly one of ``questions`` and ``classes`` must be provided.

    Args:
        name_or_path ("LiquidAI/d1-3B"): the HuggingFace repository of a d1
            release
        revision (None): the commit hash, branch or tag of the release to
            load. The release runs its own code, so the default release
            loads its pinned revision when this is omitted
        questions (None): the questions to answer about each image, a dict
            mapping a question ID, which must be a valid field name, to a
            dict with:

            -   ``type``: ``"noul"`` (yes or no), ``"choice"`` (one of named
                options) or ``"score"`` (one of 2 to 10 ordered levels)
            -   ``instructions``: what to decide; the question ID is used
                when omitted
            -   ``criteria``: for ``choice``, a dict mapping each option to
                its description; for ``score``, a list of level
                descriptions, lowest first; for ``noul``, optional
                descriptions of ``"true"`` and ``"false"``

        classes (None): the options of a single ``choice`` question, for
            zero-shot classification
        prompt (None): the instructions of the question built from
            ``classes``; if None, asks which option best describes the image
        state (None): an optional text or JSON value describing the
            situation, given with every image; by default the image alone is
            the state
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_D1_MODEL
        )
        default_revision = (
            DEFAULT_D1_REVISION
            if self.name_or_path == DEFAULT_D1_MODEL
            else None
        )
        self.revision = self.parse_string(
            d, "revision", default=default_revision
        )
        self.questions = self.parse_dict(d, "questions", default=None)
        self.classes = self.parse_array(d, "classes", default=None)
        self.prompt = self.parse_string(d, "prompt", default=None)
        self.state = self.parse_raw(d, "state", default=None)

        if self.output_processor is None and self.output_processor_cls is None:
            self.output_processor_cls = D1OutputProcessor

        self.raw_inputs = True

    def get_questions(self):
        """Returns the question schema the model answers for each image.

        Returns:
            a dict mapping question ID to question
        """
        if self.questions is not None and self.classes is not None:
            raise ValueError("Provide either questions or classes, not both")

        if self.questions is not None:
            _validate_questions(self.questions)
            return self.questions

        if self.classes is None:
            raise ValueError(
                "A d1 model needs questions to answer; provide `questions` "
                "or `classes`"
            )

        classes = [str(c) for c in self.classes]
        if len(classes) < 2 or len(set(classes)) != len(classes):
            raise ValueError("classes must hold at least two distinct options")

        prompt = self.prompt or DEFAULT_CHOICE_INSTRUCTIONS
        return {
            DEFAULT_QUESTION_ID: {
                "type": "choice",
                "instructions": prompt,
                "criteria": {c: c for c in classes},
            }
        }


class D1Model(fout.TorchImageModel):
    """Wrapper for running inference with d1 decision models.

    A d1 model answers typed questions about each image in one forward pass,
    reading each answer from the logits of its options' tokens rather than
    generating text.

    Zero-shot classification example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=25)

        model = foz.load_zoo_model(
            "d1-3b-torch",
            classes=["indoor", "outdoor"],
            prompt="Was this photo taken indoors or outdoors?",
        )

        dataset.apply_model(model, label_field="setting", batch_size=16)

        session = fo.launch_app(dataset)

    Several questions at once, one field per question::

        model = foz.load_zoo_model(
            "d1-3b-torch",
            questions={
                "has_person": {
                    "type": "noul",
                    "instructions": "Is there a person in the image?",
                },
                "quality": {
                    "type": "score",
                    "instructions": "How sharp is the image?",
                    "criteria": ["blurry", "acceptable", "sharp"],
                },
            },
        )

        # Populates `d1_has_person` and `d1_quality`
        dataset.apply_model(model, label_field="d1", batch_size=16)

    Args:
        config: a :class:`D1ModelConfig`
    """

    def __init__(self, config):
        self._questions = config.get_questions()
        self._processor = None
        self._prefix = None
        self._suffixes = None
        self._max_pixels = None
        self._answer_token_ids = None
        self._answer_columns = None
        super().__init__(config)

    @property
    def has_logits(self):
        return True

    @property
    def questions(self):
        """The question schema answered for each image."""
        return self._questions

    @property
    def ragged_batches(self):
        # Rows of different lengths are padded together by collate_fn
        return False

    @property
    def has_collate_fn(self):
        return True

    @property
    def collate_fn(self):
        return _D1Collate(
            self._suffixes, self._processor.tokenizer.pad_token_id
        )

    def build_get_item(self, field_mapping=None):
        return D1GetItem(
            self._processor,
            self._prefix,
            max_pixels=self._max_pixels,
            field_mapping=field_mapping,
        )

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        dtype = torch.float32 if self._device.type == "cpu" else torch.bfloat16
        model = transformers.AutoModel.from_pretrained(
            config.name_or_path,
            revision=config.revision,
            trust_remote_code=True,
            dtype=dtype,
        )
        model = model.to(self._device).eval()

        self._build_prompt(model, config)
        return model

    def _build_prompt(self, model, config):
        """Renders the prompt pieces and finds the answer tokens with the
        release's own code."""
        engine = model.engine
        runner, prompt = _release_modules(model)
        tokenizer = engine.tokenizer

        self._processor = engine._load_processor()
        self._max_pixels = runner.VISION_MAX_PIXELS
        self._prefix = prompt.prefix_text(
            tokenizer,
            config.state,
            engine.bos,
            engine.state_style,
            engine.system,
            engine._image_markup(1),
        )

        suffixes = []
        groups = {}
        for question_id, question in self._questions.items():
            question = prompt.as_question(
                dict(
                    question,
                    instructions=question.get("instructions") or question_id,
                )
            )
            suffix = prompt.suffix_text(
                tokenizer, question, engine.lead, engine.option_style
            )
            suffixes.append(tokenizer.encode(suffix, add_special_tokens=False))
            groups[question_id] = prompt.readout_ids(tokenizer, question)

        token_ids = sorted({t for g in groups.values() for o in g for t in o})
        column = {t: i for i, t in enumerate(token_ids)}

        self._suffixes = suffixes
        self._answer_token_ids = torch.tensor(token_ids, device=self._device)
        self._answer_columns = {
            question_id: [[column[t] for t in option] for option in group]
            for question_id, group in groups.items()
        }

    def _predict_all(self, imgs):
        if self._preprocess:
            # Images given directly rather than through a data loader are
            # encoded and padded here
            encode = self.build_get_item().encode
            imgs = self.collate_fn([encode(img) for img in imgs])

        batch = {
            k: v.to(self._device) if torch.is_tensor(v) else v
            for k, v in imgs.items()
        }

        output = self._forward_pass(batch)

        self._output_processor.store_logits = self.store_logits
        return self._output_processor(
            output,
            None,
            confidence_thresh=self.config.confidence_thresh,
            classes=self.config.filter_classes,
            questions=self._questions,
            answer_columns=self._answer_columns,
        )

    def _forward_pass(self, batch):
        model = self._model
        with torch.inference_mode():
            tiles = model.model.get_image_features(
                pixel_values=batch["pixel_values"],
                spatial_shapes=batch["spatial_shapes"],
                pixel_attention_mask=batch["pixel_attention_mask"],
            ).pooler_output

            # Each image's tiles are encoded once and fill the image slots of
            # all of that image's rows
            features = []
            start = 0
            for count in batch["tiles"]:
                image = tiles[start : start + count]
                features.extend(image * len(self._suffixes))
                start += count

            input_ids = batch["input_ids"]
            embeds = model.get_input_embeddings()(input_ids)
            features = torch.cat(features).to(embeds.dtype)
            slots = model.model.get_placeholder_mask(
                input_ids, inputs_embeds=embeds, image_features=features
            )
            embeds = embeds.masked_scatter(slots, features)
            hidden = model.model.language_model(
                inputs_embeds=embeds
            ).last_hidden_state

            rows = torch.arange(len(hidden), device=hidden.device)
            logits = model.lm_head(hidden[rows, batch["last_index"]]).float()
            logits = torch.log_softmax(logits, dim=-1)

        return logits[:, self._answer_token_ids]
