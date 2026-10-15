"""
`d3 <https://huggingface.co/vllm-sr/d3-flash>`_ decision model wrapper for the
FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import copy
import json
import logging
import re
import sys

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)


def _ensure_d3():
    """Ensures the packages that load the release are installed."""
    # The release's runtime builds on transformers' Qwen3.5 classes and
    # loads its backbone with a device map
    fou.ensure_package("transformers>=5.17")
    fou.ensure_package("accelerate")


transformers = fou.lazy_import("transformers", callback=_ensure_d3)

DEFAULT_D3_MODEL = "vllm-sr/d3-flash"
DEFAULT_STATE = "The attached image."
DEFAULT_CHOICE_INSTRUCTIONS = "Which option best describes the image?"
DEFAULT_QUESTION_ID = "label"

# The releases run their own code, so each loads a pinned revision when no
# revision is given
PINNED_REVISIONS = {
    "vllm-sr/d3": "cc2ed4abbef9e8563e957a6fd3e806fc0322f71f",
    "vllm-sr/d3-flash": "3d8f2001503490fcbb8a88321fa5c6cec8f8c17c",
    "vllm-sr/d3-mini": "1c0afac684bc7b951266368110aff83ef72bae43",
}

QUESTION_TYPES = ("noul", "choice", "score")
_NOUL_OPTIONS = ("true", "false")
_QUESTION_ID = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

# The release reads every answer from one readout over 255 answer codes, and
# answers a score with one of 2 to 10 ordered levels
_MAX_OPTIONS = 255
_MIN_SCORE_LEVELS = 2
_MAX_SCORE_LEVELS = 10

# The most padded tokens the encoder reads in one pass
_ENCODER_TOKENS = 2048


def _is_json(value):
    """Whether strict JSON can carry a value, as the release requires."""
    try:
        json.dumps(value, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError, RecursionError):
        return False

    return True


def _describe(value):
    """Text as given, and any other value as JSON, as the release renders
    it."""
    if isinstance(value, str):
        return value

    return json.dumps(value, ensure_ascii=False)


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
            if (
                not isinstance(criteria, dict)
                or not 1 <= len(criteria) <= _MAX_OPTIONS
                or not all(isinstance(k, str) and k for k in criteria)
            ):
                raise ValueError(
                    "choice question %r needs criteria mapping 1 to %d "
                    "options, each a non-empty string, to their "
                    "descriptions" % (question_id, _MAX_OPTIONS)
                )
        elif question_type == "score":
            if not isinstance(criteria, (list, tuple)) or not (
                _MIN_SCORE_LEVELS <= len(criteria) <= _MAX_SCORE_LEVELS
            ):
                raise ValueError(
                    "score question %r needs criteria listing %d to %d "
                    "levels, lowest first"
                    % (question_id, _MIN_SCORE_LEVELS, _MAX_SCORE_LEVELS)
                )
        elif criteria is not None:
            if not isinstance(criteria, dict) or not set(criteria) <= set(
                _NOUL_OPTIONS
            ):
                raise ValueError(
                    "noul question %r criteria may only describe 'true' and "
                    "'false'" % question_id
                )

        # The prompt renders these as JSON, so a value strict JSON cannot
        # carry is rejected here, before any download
        if not _is_json([question.get("instructions"), criteria]):
            raise ValueError(
                "question %r has instructions or criteria that are not text "
                "or a JSON value" % question_id
            )

        if question_type == "score":
            levels = [_describe(level) for level in criteria]
            if not all(levels) or len(set(levels)) != len(levels):
                raise ValueError(
                    "score question %r needs distinct, non-empty levels"
                    % question_id
                )


def _option_order(question):
    """The options of a question in the order the caller gave them."""
    question_type = question["type"]
    if question_type == "noul":
        return list(_NOUL_OPTIONS)

    if question_type == "choice":
        return [str(option) for option in question["criteria"]]

    return [str(level) for level in range(len(question["criteria"]))]


def _prompt_order(question):
    """The options of a question in the order the release lists them under
    its answer codes."""
    if question["type"] == "noul":
        return ["false", "true"]

    return _option_order(question)


def _release_module(runtime):
    """The module of the release's runtime."""
    return sys.modules[type(runtime).__module__]


def _length_groups(lengths, budget):
    """Splits rows into groups of similar length whose padded size, rows
    times the longest length, stays within a token budget.

    Args:
        lengths: the length of each row
        budget: the most padded tokens per group; a longer row forms a group
            of its own

    Returns:
        a list of groups, each a list of row indices in ascending length
    """
    groups = []
    group = []
    for row in sorted(range(len(lengths)), key=lengths.__getitem__):
        if group and (len(group) + 1) * lengths[row] > budget:
            groups.append(group)
            group = []

        group.append(row)

    if group:
        groups.append(group)

    return groups


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


class D3GetItem(fout.GetItem):
    """A :class:`fiftyone.utils.torch.GetItem` that loads an image and
    encodes it with every question's prompt.

    Data loader workers call it, so image decoding, resizing and patching run
    in parallel with inference. The image is processed once, and each
    question's prompt holds as many image tokens as the image has patches
    after merging.

    Args:
        image_processor: the release's image processor
        prompt_ids: the token IDs of each question's prompt, each holding one
            image token
        image_token_id: the ID of the image token
        max_length (None): an optional maximum number of tokens per prompt,
            beyond which an image is rejected rather than truncated
        field_mapping (None): the user-supplied dict mapping keys in
            :attr:`required_keys` to field names of their dataset that
            contain the required values
    """

    def __init__(
        self,
        image_processor,
        prompt_ids,
        image_token_id,
        max_length=None,
        field_mapping=None,
        **kwargs,
    ):
        """Stores the processor and prompts that encode each image."""
        self.image_processor = image_processor
        self.prompt_ids = prompt_ids
        self.image_token_id = image_token_id
        self.max_length = max_length
        super().__init__(field_mapping=field_mapping, **kwargs)

    @property
    def required_keys(self):
        """The sample fields each item needs: ``["filepath"]``."""
        return ["filepath"]

    def __call__(self, d):
        """Encodes the image at the sample's filepath.

        Args:
            d: a dict mapping :attr:`required_keys` to sample values

        Returns:
            the encoded image, as returned by :meth:`encode`
        """
        return self.encode(d["filepath"])

    def encode(self, img):
        """Encodes an image with every question's prompt.

        Args:
            img: an image path, PIL image, numpy array or Torch tensor

        Returns:
            a dict with each question's ``input_ids``, and the image's
            ``pixel_values`` and ``image_grid_thw``
        """
        inputs = self.image_processor(
            images=[_prepare_image(img)], return_tensors="pt"
        )
        grid = inputs["image_grid_thw"]
        tokens = int(grid.prod()) // self.image_processor.merge_size**2

        input_ids = []
        for ids in self.prompt_ids:
            slot = ids.index(self.image_token_id)
            row = ids[:slot] + [self.image_token_id] * tokens + ids[slot + 1 :]
            if self.max_length is not None and len(row) > self.max_length:
                raise ValueError(
                    "A prompt with this image has %d tokens, more than the "
                    "model's limit of %d; nothing is truncated"
                    % (len(row), self.max_length)
                )

            input_ids.append(torch.tensor(row, dtype=torch.long))

        return {
            "input_ids": input_ids,
            "pixel_values": inputs["pixel_values"],
            "image_grid_thw": grid,
        }


class _D3Collate(object):
    """Pads every image's prompts on the left into one batch, as the release
    does, and keeps one copy of each image's patches.

    Args:
        pad_token_id: the ID of the tokenizer's padding token
        image_token_id: the ID of the image token
    """

    def __init__(self, pad_token_id, image_token_id):
        """Stores the token IDs that padding and the image tokens use."""
        self.pad_token_id = pad_token_id
        self.image_token_id = image_token_id

    def __call__(self, items):
        """Pads the encoded images' prompts into one batch.

        Args:
            items: a list of encoded images, as returned by
                :meth:`D3GetItem.encode`

        Returns:
            a dict with the left-padded ``input_ids``, ``attention_mask`` and
            ``mm_token_type_ids`` of every image's prompts, image by image,
            and the images' ``pixel_values`` and ``image_grid_thw``
        """
        rows = [ids for item in items for ids in item["input_ids"]]
        width = max(len(ids) for ids in rows)
        input_ids = torch.full(
            (len(rows), width), self.pad_token_id, dtype=torch.long
        )
        attention_mask = torch.zeros((len(rows), width), dtype=torch.long)
        for i, ids in enumerate(rows):
            input_ids[i, width - len(ids) :] = ids
            attention_mask[i, width - len(ids) :] = 1

        return {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "mm_token_type_ids": (input_ids == self.image_token_id).long(),
            "pixel_values": torch.cat(
                [item["pixel_values"] for item in items]
            ),
            "image_grid_thw": torch.cat(
                [item["image_grid_thw"] for item in items]
            ),
        }


class D3OutputProcessor(fout.OutputProcessor):
    """Output processor for d3 decision models.

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
        """Stores whether classifications keep their logits."""
        self.store_logits = store_logits

    def __call__(
        self,
        output,
        frame_size,
        confidence_thresh=None,
        classes=None,
        questions=None,
        **kwargs,
    ):
        """Processes model output into labels.

        Args:
            output: the logits of the release's answer codes, one row per
                image and question, each image's rows in the schema's order
            frame_size: unused
            confidence_thresh (None): an optional confidence below which a
                classification is omitted
            classes (None): unused
            questions (None): the question schema, a dict mapping question
                ID to question
            **kwargs: unused

        Returns:
            a list of :class:`fiftyone.core.labels.Label` instances, or of
            dicts of them when the schema has several questions
        """
        values = output.float().cpu().numpy()
        results = []
        for start in range(0, len(values), len(questions)):
            rows = values[start : start + len(questions)]
            labels = {
                question_id: self._to_label(question, row, confidence_thresh)
                for row, (question_id, question) in zip(
                    rows, questions.items()
                )
            }

            if len(labels) == 1:
                results.append(next(iter(labels.values())))
            else:
                # An answer the threshold dropped is left out, since a new
                # field cannot take its type from None
                results.append(
                    {k: v for k, v in labels.items() if v is not None}
                )

        return results

    def _to_label(self, question, row, confidence_thresh):
        """The label of one answer from its row of answer-code logits."""
        # The question's options take the first codes, in the release's
        # order; report them in the caller's
        prompt = _prompt_order(question)
        options = _option_order(question)
        logits = np.array(
            [row[prompt.index(option)] for option in options], dtype=np.float64
        )

        probabilities = np.exp(logits - logits.max())
        probabilities /= probabilities.sum()

        best = int(np.argmax(probabilities))
        confidence = float(probabilities[best])

        if question["type"] == "score":
            value = float(np.dot(np.arange(len(probabilities)), probabilities))
            return fol.Regression(value=value, confidence=confidence)

        if confidence_thresh is not None and confidence < confidence_thresh:
            return None

        label = fol.Classification(label=options[best], confidence=confidence)
        if self.store_logits:
            label.logits = logits

        return label


class D3ModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`D3Model`.

    Exactly one of ``questions`` and ``classes`` must be provided.

    Args:
        name_or_path ("vllm-sr/d3-flash"): the HuggingFace repository of a d3
            release
        revision (None): the commit hash, branch or tag of the release to
            load. The releases run their own code, so the d3, d3-flash and
            d3-mini releases load their pinned revisions when this is omitted
        questions (None): the questions to answer about each image, a dict
            mapping a question ID, which must be a valid field name, to a
            dict with:

            -   ``type``: ``"noul"`` (yes or no), ``"choice"`` (one of 1 to
                255 named options) or ``"score"`` (one of 2 to 10 ordered
                levels)
            -   ``instructions``: what to decide; the question ID is used
                when omitted
            -   ``criteria``: for ``choice``, a dict mapping each option to
                its description; for ``score``, a list of distinct level
                descriptions, lowest first; for ``noul``, optional
                descriptions of ``"true"`` and ``"false"``

        classes (None): the options of a single ``choice`` question, for
            zero-shot classification
        prompt (None): the instructions of the question built from
            ``classes``; if None, asks which option best describes the image
        state ("The attached image."): the text or JSON value describing the
            situation, given with every image
    """

    def __init__(self, d):
        """Parses the config, rejecting a state that is not text or a JSON
        value."""
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_D3_MODEL
        )
        self.revision = self.parse_string(
            d, "revision", default=PINNED_REVISIONS.get(self.name_or_path)
        )
        self.questions = self.parse_dict(d, "questions", default=None)
        self.classes = self.parse_array(d, "classes", default=None)
        self.prompt = self.parse_string(d, "prompt", default=None)
        self.state = self.parse_raw(d, "state", default=DEFAULT_STATE)
        if not _is_json(self.state):
            raise ValueError("The state must be text or a JSON value")

        if self.output_processor is None and self.output_processor_cls is None:
            self.output_processor_cls = D3OutputProcessor

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
                "A d3 model needs questions to answer; provide `questions` "
                "or `classes`"
            )

        classes = [str(c) for c in self.classes]
        if not (2 <= len(classes) <= _MAX_OPTIONS) or len(set(classes)) != len(
            classes
        ):
            raise ValueError(
                "classes must hold 2 to %d distinct options" % _MAX_OPTIONS
            )

        prompt = self.prompt or DEFAULT_CHOICE_INSTRUCTIONS
        questions = {
            DEFAULT_QUESTION_ID: {
                "type": "choice",
                "instructions": prompt,
                "criteria": {c: c for c in classes},
            }
        }
        _validate_questions(questions)
        return questions


class D3Model(fout.TorchImageModel):
    """Wrapper for running inference with d3 decision models.

    A d3 model answers typed questions about each image, one forward pass
    per question, reading each answer from a readout over the codes its
    prompt lists the options under rather than generating text. This
    wrapper loads the release with its own runtime and builds each prompt
    with it, encodes each image once for all of its questions, and runs the
    release's encoder, whose full-attention layers read the whole prompt.

    Zero-shot classification example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=25)

        model = foz.load_zoo_model(
            "d3-flash-torch",
            classes=["indoor", "outdoor"],
            prompt="Was this photo taken indoors or outdoors?",
        )

        dataset.apply_model(model, label_field="setting", batch_size=8)

        session = fo.launch_app(dataset)

    Several questions at once, one field per question::

        model = foz.load_zoo_model(
            "d3-flash-torch",
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

        # Populates `d3_has_person` and `d3_quality`
        dataset.apply_model(model, label_field="d3", batch_size=8)

    Args:
        config: a :class:`D3ModelConfig`
    """

    def __init__(self, config):
        """Validates the question schema, then loads the release.

        The model keeps its own copy of the schema, which both the prompts
        and the decoding of its answers read.
        """
        self._questions = copy.deepcopy(config.get_questions())
        self._runtime = None
        self._prompt_ids = None
        self._image_token_id = None
        super().__init__(config)

    @property
    def has_logits(self):
        """True; classifications can store their per-option logits."""
        return True

    @property
    def questions(self):
        """A copy of the question schema answered for each image."""
        return copy.deepcopy(self._questions)

    @property
    def ragged_batches(self):
        """False; :attr:`collate_fn` pads prompts of different lengths."""
        return False

    @property
    def has_collate_fn(self):
        """True; the model pads its own batches."""
        return True

    @property
    def collate_fn(self):
        """The function that pads every image's prompts into one batch."""
        return _D3Collate(self._runtime.pad_id, self._image_token_id)

    def build_get_item(self, field_mapping=None):
        """Builds the :class:`D3GetItem` that encodes each image with this
        model's prompts.

        Args:
            field_mapping (None): a dict mapping the GetItem's required keys
                to field names of the dataset

        Returns:
            a :class:`D3GetItem`
        """
        return D3GetItem(
            self._runtime.processor.image_processor,
            self._prompt_ids,
            self._image_token_id,
            max_length=self._runtime.max_length,
            field_mapping=field_mapping,
        )

    def _download_model(self, config):
        """Leaves the download to the release's loader in
        :meth:`_load_model`."""
        pass

    def _load_model(self, config):
        """Loads the release with its own code and builds the prompts.

        Args:
            config: a :class:`D3ModelConfig`

        Returns:
            the release's model
        """
        # The release's runtime selects its GPU by index
        device = self._device
        if device.type == "cuda" and device.index is None:
            device = torch.device("cuda", torch.cuda.current_device())

        model = transformers.AutoModel.from_pretrained(
            config.name_or_path,
            revision=config.revision,
            trust_remote_code=True,
            device=str(device),
        )

        runtime = model.runtime
        if runtime.image_unavailable is not None:
            raise ValueError(
                "%s cannot read images: %s"
                % (config.name_or_path, runtime.image_unavailable)
            )

        if runtime.encoder is None:
            raise ValueError(
                "%s runs causal attention; this wrapper supports d3 releases "
                "whose full-attention layers read the whole prompt"
                % config.name_or_path
            )

        self._runtime = runtime
        self._build_prompts(runtime, config)
        return model

    def _build_prompts(self, runtime, config):
        """Renders each question's prompt with the release's own code.

        Args:
            runtime: the release's runtime
            config: a :class:`D3ModelConfig`
        """
        release = _release_module(runtime)
        tokenizer = runtime.processor.tokenizer
        self._image_token_id = tokenizer.convert_tokens_to_ids(
            release.IMAGE_TOKEN
        )

        prompt_ids = []
        for question_id, question in self._questions.items():
            question = dict(
                question,
                instructions=question.get("instructions") or question_id,
            )
            normalized = release.normalize_question(question)
            if normalized.keys != _prompt_order(question):
                raise ValueError(
                    "The release lists the options of question %r in an "
                    "unexpected order" % question_id
                )

            text = runtime.image_text(config.state, normalized.rendered, 1)
            if (
                text.count(release.IMAGE_TOKEN) != 1
                or release.VIDEO_TOKEN in text
            ):
                raise ValueError(
                    "The state or question %r contains a literal image or "
                    "video placeholder" % question_id
                )

            prompt_ids.append(
                tokenizer(text, add_special_tokens=False)["input_ids"]
            )

        self._prompt_ids = prompt_ids

    def _predict_all(self, imgs):
        """Answers the questions about a batch of images.

        Args:
            imgs: a list of images, or a batch that :attr:`collate_fn`
                padded when preprocessing is off

        Returns:
            a list of labels, or of dicts of them when the schema has
            several questions
        """
        if self._preprocess:
            # Images given directly rather than through a data loader are
            # encoded and padded here
            encode = self.build_get_item().encode
            imgs = self.collate_fn([encode(img) for img in imgs])

        batch = {k: v.to(self._device) for k, v in imgs.items()}

        output = self._forward_pass(batch)

        self._output_processor.store_logits = self.store_logits
        return self._output_processor(
            output,
            None,
            confidence_thresh=self.config.confidence_thresh,
            classes=self.config.filter_classes,
            questions=self._questions,
        )

    def _forward_pass(self, batch):
        """Runs the release's encoder over a padded batch.

        Args:
            batch: a batch that :attr:`collate_fn` padded, on the model's
                device

        Returns:
            the temperature-scaled logits of the answer codes, one row per
            image and question
        """
        runtime = self._runtime
        backbone = runtime.backbone
        questions = len(self._questions)
        input_ids = batch["input_ids"]
        attention_mask = batch["attention_mask"]

        with torch.inference_mode(), _release_module(runtime).sdpa_backends(
            self._device
        ):
            embeds = backbone.get_input_embeddings()(input_ids)

            # Each image is encoded once and fills the image tokens of all
            # of its prompts
            pooled = backbone.get_image_features(
                batch["pixel_values"],
                batch["image_grid_thw"],
                return_dict=True,
            ).pooler_output
            features = torch.cat(
                [image for image in pooled for _ in range(questions)]
            ).to(embeds.device, embeds.dtype)
            slots, _ = backbone.get_placeholder_mask(
                input_ids, inputs_embeds=embeds, image_features=features
            )
            embeds = embeds.masked_scatter(slots, features)

            positions = backbone.compute_3d_position_ids(
                input_ids=input_ids,
                image_grid_thw=batch["image_grid_thw"].repeat_interleave(
                    questions, dim=0
                ),
                video_grid_thw=None,
                inputs_embeds=embeds,
                attention_mask=attention_mask,
                past_key_values=None,
                mm_token_type_ids=batch["mm_token_type_ids"],
            )
            # The prompts run in groups of similar length, each trimmed to its
            # longest prompt, rather than all padded to the batch's longest
            lengths = attention_mask.sum(1).tolist()
            hidden = embeds.new_empty((len(lengths), embeds.shape[-1]))
            for group in _length_groups(lengths, _ENCODER_TOKENS):
                width = lengths[group[-1]]
                rows = torch.tensor(group, device=input_ids.device)
                hidden[rows] = runtime.encoder(
                    embeds[rows, -width:],
                    attention_mask[rows, -width:],
                    positions[:, rows, -width:],
                )[:, -1]

            # The readout runs in its own dtype, float32 unless the release
            # says otherwise
            readout = runtime.readout
            logits = (hidden.to(readout.dtype) @ readout.T).float()

        return logits / runtime.temperature
