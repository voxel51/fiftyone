"""
`Clef <https://huggingface.co/Cloudflare/clef-flash>`_ decision model wrapper
for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import hashlib
import importlib.util
import logging
import os
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


def _ensure_clef():
    # The release code loads its Qwen3.5 backbone as
    # Qwen3_5ForConditionalGeneration with a device map
    fou.ensure_package("transformers>=5.10.2")
    fou.ensure_package("accelerate")


hfh = fou.lazy_import("huggingface_hub")

DEFAULT_CLEF_MODEL = "Cloudflare/clef-flash"
DEFAULT_STATE = "Answer each question about the attached image."
DEFAULT_CHOICE_INSTRUCTIONS = "Which option best describes the image?"
DEFAULT_QUESTION_ID = "label"

# The release ships its model code beside the weights rather than as a
# transformers architecture, so the wrapper imports it from the snapshot
_RELEASE_MODULE = "joint_schema_model.py"

QUESTION_TYPES = ("noul", "choice", "score")
_NOUL_OPTIONS = ("true", "false")
_QUESTION_ID = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


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
            if not isinstance(criteria, (list, tuple)) or len(criteria) < 2:
                raise ValueError(
                    "score question %r needs criteria listing at least two "
                    "levels, lowest first" % question_id
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


class ClefOutputProcessor(fout.OutputProcessor):
    """Output processor for Clef decision models.

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
        **kwargs,
    ):
        """Processes model output into labels.

        Args:
            output: a list with, for each image, a dict mapping question ID
                to a dict with the question's ``type``, its ``options`` in
                the order the caller gave them and the matching ``logits``
            frame_size: unused
            confidence_thresh (None): an optional confidence below which a
                classification is omitted
            classes (None): unused
            **kwargs: unused

        Returns:
            a list of :class:`fiftyone.core.labels.Label` instances, or of
            dicts of them when the schema has several questions
        """
        results = []
        for answers in output:
            labels = {
                question_id: self._to_label(answer, confidence_thresh)
                for question_id, answer in answers.items()
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

    def _to_label(self, answer, confidence_thresh):
        logits = np.asarray(answer["logits"], dtype=np.float64)
        probabilities = np.exp(logits - logits.max())
        probabilities /= probabilities.sum()

        best = int(np.argmax(probabilities))
        confidence = float(probabilities[best])

        if answer["type"] == "score":
            value = float(np.dot(np.arange(len(probabilities)), probabilities))
            return fol.Regression(value=value, confidence=confidence)

        if confidence_thresh is not None and confidence < confidence_thresh:
            return None

        label = fol.Classification(
            label=answer["options"][best], confidence=confidence
        )
        if self.store_logits:
            label.logits = logits

        return label


class ClefModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`ClefModel`.

    Exactly one of ``questions`` and ``classes`` must be provided.

    Args:
        name_or_path ("Cloudflare/clef-flash"): the HuggingFace repository of
            a Clef release
        revision (None): the commit hash, branch or tag of the release to
            load
        questions (None): the questions to answer about each image, a dict
            mapping a question ID, which must be a valid field name, to a
            dict with:

            -   ``type``: ``"noul"`` (yes or no), ``"choice"`` (one of named
                options) or ``"score"`` (one of ordered levels)
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
        state ("Answer each question about the attached image."): the text
            or JSON value describing the situation, given with every image
        max_length (16384): the maximum number of tokens per image, including
            the image tokens and the question schema
        media_kwargs (None): optional keyword arguments for the image
            processor
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_CLEF_MODEL
        )
        self.revision = self.parse_string(d, "revision", default=None)
        self.questions = self.parse_dict(d, "questions", default=None)
        self.classes = self.parse_array(d, "classes", default=None)
        self.prompt = self.parse_string(d, "prompt", default=None)
        self.state = self.parse_raw(d, "state", default=DEFAULT_STATE)
        self.max_length = self.parse_int(d, "max_length", default=16384)
        if self.max_length <= 0:
            raise ValueError(
                "max_length must be positive; got %s" % self.max_length
            )
        self.media_kwargs = self.parse_dict(d, "media_kwargs", default=None)

        if self.output_processor is None and self.output_processor_cls is None:
            self.output_processor_cls = ClefOutputProcessor

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
                "A Clef model needs questions to answer; provide `questions` "
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


class ClefModel(fout.TorchImageModel):
    """Wrapper for running inference with Clef decision models.

    A Clef model answers typed questions about each image in one forward
    pass, returning a probability for every allowed option rather than
    generated text.

    Zero-shot classification example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("quickstart", max_samples=25)

        model = foz.load_zoo_model(
            "clef-flash-torch",
            classes=["indoor", "outdoor"],
            prompt="Was this photo taken indoors or outdoors?",
        )

        dataset.apply_model(model, label_field="setting")

        session = fo.launch_app(dataset)

    Several questions at once, one field per question::

        model = foz.load_zoo_model(
            "clef-flash-torch",
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

        # Populates `clef_has_person` and `clef_quality`
        dataset.apply_model(model, label_field="clef")

    Args:
        config: a :class:`ClefModelConfig`
    """

    def __init__(self, config):
        self._questions = config.get_questions()
        self._release = None
        self._processor = None
        super().__init__(config)

    @property
    def has_logits(self):
        return True

    @property
    def questions(self):
        """The question schema answered for each image."""
        return self._questions

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        _ensure_clef()

        path = hfh.snapshot_download(
            config.name_or_path, revision=config.revision
        )
        self._release = self._import_release(path)

        model, self._processor = self._release.load_release_model(
            path, device=self._device, dtype=torch.bfloat16
        )
        return model.eval()

    @staticmethod
    def _import_release(path):
        module_path = os.path.join(path, _RELEASE_MODULE)
        if not os.path.isfile(module_path):
            raise ValueError(
                "%s holds no %s; it is not a Clef release"
                % (path, _RELEASE_MODULE)
            )

        # One module per snapshot, registered before it runs, since the
        # release's dataclasses resolve their annotations through sys.modules
        digest = hashlib.sha1(os.path.abspath(module_path).encode("utf-8"))
        name = "fiftyone_clef_release_%s" % digest.hexdigest()[:16]
        if name in sys.modules:
            return sys.modules[name]

        spec = importlib.util.spec_from_file_location(name, module_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        try:
            spec.loader.exec_module(module)
        except BaseException:
            del sys.modules[name]
            raise

        return module

    def _build_record(self, img):
        record = {
            "state": self.config.state,
            "images": [self._prepare_image(img)],
            "questions": self._questions,
        }
        if self.config.media_kwargs:
            record["media_kwargs"] = self.config.media_kwargs

        return record

    def _forward_pass(self, imgs):
        tokenizer = self._processor.tokenizer
        encoded = [
            self._release.encode_record(
                tokenizer,
                self._build_record(img),
                max_length=self.config.max_length,
                processor=self._processor,
            )
            for img in imgs
        ]
        batch = self._release.collate_records(
            encoded, tokenizer.pad_token_id, self._device
        )

        with torch.inference_mode():
            logits = self._model(batch)

        results = []
        for record, record_logits in zip(encoded, logits):
            answers = {}
            for question, question_logits in zip(
                record.questions, record_logits
            ):
                question_id = question.question_id
                options = _option_order(self._questions[question_id])

                # The release orders choice options by ID; report them in the
                # caller's order
                position = {o: i for i, o in enumerate(question.option_ids)}
                values = question_logits.float().cpu().numpy()
                answers[question_id] = {
                    "type": self._questions[question_id]["type"],
                    "options": options,
                    "logits": np.array([values[position[o]] for o in options]),
                }

            results.append(answers)

        return results

    def _prepare_image(self, img):
        """Converts image-like input to an RGB PIL image for the processor.

        ``fout.to_rgb_pil`` expects channel-last layout and reads float
        arrays as 0-1, wrapping anything above it, so tensors are converted
        and channel-first or 0-255 float input is normalized first.
        """
        if isinstance(img, torch.Tensor):
            img = img.detach().cpu().numpy()

        if isinstance(img, np.ndarray):
            # Transpose CHW to HWC when the first dim is channels and the
            # last cannot be
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
