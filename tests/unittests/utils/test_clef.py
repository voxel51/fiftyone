"""
Tests for fiftyone/utils/clef.py config validation, record building and
output processing.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import sys
from types import SimpleNamespace

import numpy as np
import pytest
import torch
from PIL import Image as PILImage

import fiftyone.core.labels as fol
import fiftyone.utils.clef as fouc
from fiftyone.utils.clef import (
    DEFAULT_CHOICE_INSTRUCTIONS,
    DEFAULT_QUESTION_ID,
    DEFAULT_STATE,
    ClefModel,
    ClefModelConfig,
    ClefOutputProcessor,
)

NOUL = {"type": "noul", "instructions": "Is there a person in the image?"}
CHOICE = {
    "type": "choice",
    "instructions": "Which animal is shown?",
    "criteria": {"zebra": "A zebra", "ant": "An ant", "moose": "A moose"},
}
SCORE = {
    "type": "score",
    "instructions": "How sharp is the image?",
    "criteria": ["blurry", "acceptable", "sharp"],
}


def _softmax(values):
    values = np.asarray(values, dtype=np.float64)
    odds = np.exp(values - values.max())
    return odds / odds.sum()


class _FakeRelease:
    """Stands in for the release module: orders each question's options as
    the release does and records the records it is given"""

    def __init__(self, logits_by_option):
        self.logits_by_option = logits_by_option
        self.records = []

    @staticmethod
    def option_ids(question):
        if question["type"] == "noul":
            return ("true", "false")
        if question["type"] == "choice":
            return tuple(sorted(str(o) for o in question["criteria"]))
        return tuple(str(i) for i in range(len(question["criteria"])))

    def encode_record(
        self, tokenizer, record, max_length=16384, processor=None
    ):
        self.records.append(record)
        questions = tuple(
            SimpleNamespace(question_id=qid, option_ids=self.option_ids(q))
            for qid, q in record["questions"].items()
        )
        return SimpleNamespace(questions=questions)

    def collate_records(self, records, pad_token_id, device):
        return {"records": records}

    def forward(self, batch):
        return [
            [
                torch.tensor(
                    [
                        self.logits_by_option[q.question_id][o]
                        for o in q.option_ids
                    ]
                )
                for q in record.questions
            ]
            for record in batch["records"]
        ]


def _model(d, logits_by_option):
    model = ClefModel.__new__(ClefModel)
    model.config = ClefModelConfig(d)
    model._questions = model.config.get_questions()
    model._release = _FakeRelease(logits_by_option)
    model._processor = SimpleNamespace(
        tokenizer=SimpleNamespace(pad_token_id=0)
    )
    model._device = torch.device("cpu")
    model._model = model._release.forward
    return model


def _image(w=24, h=16):
    return PILImage.new("RGB", (w, h), color=(40, 80, 120))


class TestClefModelConfig:
    """Test config parsing and the question schema it yields"""

    def test_defaults(self):
        config = ClefModelConfig({"classes": ["cat", "dog"]})

        assert config.name_or_path == "Cloudflare/clef-flash"
        assert config.revision is None
        assert config.state == DEFAULT_STATE
        assert config.max_length == 16384
        assert config.media_kwargs is None
        assert config.raw_inputs is True
        assert config.output_processor_cls is ClefOutputProcessor

    def test_classes_become_one_choice_question(self):
        config = ClefModelConfig({"classes": ["outdoor", "indoor"]})

        assert config.get_questions() == {
            DEFAULT_QUESTION_ID: {
                "type": "choice",
                "instructions": DEFAULT_CHOICE_INSTRUCTIONS,
                "criteria": {"outdoor": "outdoor", "indoor": "indoor"},
            }
        }

    def test_prompt_is_the_choice_instructions(self):
        config = ClefModelConfig(
            {"classes": ["a", "b"], "prompt": "Pick one."}
        )

        question = config.get_questions()[DEFAULT_QUESTION_ID]
        assert question["instructions"] == "Pick one."

    def test_classes_keep_the_given_order(self):
        config = ClefModelConfig({"classes": ["zebra", "ant", "moose"]})

        criteria = config.get_questions()[DEFAULT_QUESTION_ID]["criteria"]
        assert list(criteria) == ["zebra", "ant", "moose"]

    def test_questions_are_returned_as_given(self):
        questions = {"has_person": NOUL, "animal": CHOICE, "sharp": SCORE}
        config = ClefModelConfig({"questions": questions})

        assert config.get_questions() == questions

    def test_json_state_is_kept(self):
        state = {"task": "Inspect the shelf.", "store": 12}
        config = ClefModelConfig({"classes": ["a", "b"], "state": state})

        assert config.state == state

    def test_neither_questions_nor_classes_is_rejected(self):
        with pytest.raises(ValueError, match="questions"):
            ClefModelConfig({}).get_questions()

    def test_both_questions_and_classes_is_rejected(self):
        config = ClefModelConfig(
            {"questions": {"q": NOUL}, "classes": ["a", "b"]}
        )

        with pytest.raises(ValueError, match="not both"):
            config.get_questions()

    @pytest.mark.parametrize("classes", [["only"], ["a", "a"], []])
    def test_degenerate_classes_are_rejected(self, classes):
        with pytest.raises(ValueError, match="distinct"):
            ClefModelConfig({"classes": classes}).get_questions()

    @pytest.mark.parametrize(
        "question_id", ["has person", "1st", "a-b", "", "x.y"]
    )
    def test_question_id_must_be_a_field_name(self, question_id):
        config = ClefModelConfig({"questions": {question_id: NOUL}})

        with pytest.raises(ValueError, match="field name"):
            config.get_questions()

    def test_unknown_type_is_rejected(self):
        config = ClefModelConfig(
            {"questions": {"q": {"type": "open", "instructions": "Why?"}}}
        )

        with pytest.raises(ValueError, match="type"):
            config.get_questions()

    @pytest.mark.parametrize("criteria", [None, {}, ["a", "b"]])
    def test_choice_needs_an_option_mapping(self, criteria):
        question = {"type": "choice", "criteria": criteria}
        config = ClefModelConfig({"questions": {"q": question}})

        with pytest.raises(ValueError, match="criteria"):
            config.get_questions()

    @pytest.mark.parametrize("criteria", [None, ["only"], {"a": 1}])
    def test_score_needs_two_levels(self, criteria):
        question = {"type": "score", "criteria": criteria}
        config = ClefModelConfig({"questions": {"q": question}})

        with pytest.raises(ValueError, match="levels"):
            config.get_questions()

    def test_noul_criteria_may_describe_true_and_false(self):
        question = {
            "type": "noul",
            "criteria": {"true": "Visible", "false": "Not visible"},
        }
        config = ClefModelConfig({"questions": {"q": question}})

        assert config.get_questions() == {"q": question}

    def test_noul_criteria_with_other_options_is_rejected(self):
        question = {"type": "noul", "criteria": {"maybe": "Unsure"}}
        config = ClefModelConfig({"questions": {"q": question}})

        with pytest.raises(ValueError, match="noul"):
            config.get_questions()

    @pytest.mark.parametrize("value", [0, -1])
    def test_non_positive_max_length_is_rejected(self, value):
        with pytest.raises(ValueError, match="max_length"):
            ClefModelConfig({"classes": ["a", "b"], "max_length": value})

    def test_model_rejects_a_missing_schema_before_loading(self, monkeypatch):
        """The schema is checked before any download is attempted"""

        def fail(*args, **kwargs):
            raise AssertionError("download attempted")

        monkeypatch.setattr(
            fouc, "hfh", SimpleNamespace(snapshot_download=fail)
        )

        with pytest.raises(ValueError, match="questions"):
            ClefModel(ClefModelConfig({}))


class TestClefOutputProcessor:
    """Test the mapping from per-option logits to labels"""

    def _answer(self, question_type, options, logits):
        return {"type": question_type, "options": options, "logits": logits}

    def test_choice_becomes_a_classification(self):
        logits = [2.0, 0.0, -1.0]
        output = [
            {"q": self._answer("choice", ["cat", "dog", "bird"], logits)}
        ]

        label = ClefOutputProcessor()(output, (10, 10))[0]

        assert isinstance(label, fol.Classification)
        assert label.label == "cat"
        assert label.confidence == pytest.approx(_softmax(logits)[0])
        assert label.logits is None

    def test_noul_becomes_a_true_or_false_classification(self):
        output = [{"q": self._answer("noul", ["true", "false"], [-1.0, 1.5])}]

        label = ClefOutputProcessor()(output, (10, 10))[0]

        assert label.label == "false"
        assert label.confidence == pytest.approx(_softmax([-1.0, 1.5])[1])

    def test_score_becomes_the_expected_level(self):
        logits = [0.0, 1.0, 2.0]
        output = [{"q": self._answer("score", ["0", "1", "2"], logits)}]

        label = ClefOutputProcessor()(output, (10, 10))[0]
        probabilities = _softmax(logits)

        assert isinstance(label, fol.Regression)
        assert label.value == pytest.approx(
            float(np.dot([0, 1, 2], probabilities))
        )
        assert label.confidence == pytest.approx(probabilities.max())

    def test_several_questions_give_a_dict(self):
        output = [
            {
                "has_person": self._answer("noul", ["true", "false"], [2, 0]),
                "sharp": self._answer("score", ["0", "1"], [0, 0]),
            }
        ]

        labels = ClefOutputProcessor()(output, (10, 10))[0]

        assert set(labels) == {"has_person", "sharp"}
        assert labels["has_person"].label == "true"
        assert labels["sharp"].value == pytest.approx(0.5)

    def test_one_result_per_image(self):
        output = [
            {"q": self._answer("choice", ["a", "b"], [1.0, 0.0])},
            {"q": self._answer("choice", ["a", "b"], [0.0, 1.0])},
        ]

        labels = ClefOutputProcessor()(output, (10, 10))

        assert [label.label for label in labels] == ["a", "b"]

    def test_logits_are_stored_on_request(self):
        logits = [0.5, -0.5, 3.0]
        output = [{"q": self._answer("choice", ["a", "b", "c"], logits)}]

        label = ClefOutputProcessor(store_logits=True)(output, (10, 10))[0]

        assert np.allclose(label.logits, logits)

    def test_confidence_threshold_drops_classifications(self):
        output = [{"q": self._answer("choice", ["a", "b"], [0.1, 0.0])}]

        label = ClefOutputProcessor()(output, (10, 10), confidence_thresh=0.9)[
            0
        ]

        assert label is None

    def test_confidence_threshold_keeps_regressions(self):
        output = [{"q": self._answer("score", ["0", "1", "2"], [0, 0, 0])}]

        label = ClefOutputProcessor()(output, (10, 10), confidence_thresh=0.9)[
            0
        ]

        assert isinstance(label, fol.Regression)

    def test_large_logits_stay_finite(self):
        output = [{"q": self._answer("choice", ["a", "b"], [1000.0, 999.0])}]

        label = ClefOutputProcessor()(output, (10, 10))[0]

        assert label.label == "a"
        assert np.isfinite(label.confidence)
        assert label.confidence == pytest.approx(_softmax([1.0, 0.0])[0])


class TestClefForwardPass:
    """Test record building and option ordering against a stand-in release"""

    def test_choice_logits_follow_the_callers_order(self):
        """The release orders choice options by ID; the wrapper restores the
        order the caller gave"""
        logits = {"animal": {"zebra": 2.0, "ant": -1.0, "moose": 0.5}}
        model = _model({"questions": {"animal": CHOICE}}, logits)

        answer = model._forward_pass([_image()])[0]["animal"]

        assert answer["type"] == "choice"
        assert answer["options"] == ["zebra", "ant", "moose"]
        assert np.allclose(answer["logits"], [2.0, -1.0, 0.5])

    def test_noul_and_score_options(self):
        logits = {
            "has_person": {"true": 1.0, "false": -1.0},
            "sharp": {"0": 0.1, "1": 0.2, "2": 0.3},
        }
        model = _model(
            {"questions": {"has_person": NOUL, "sharp": SCORE}}, logits
        )

        answers = model._forward_pass([_image()])[0]

        assert answers["has_person"]["options"] == ["true", "false"]
        assert np.allclose(answers["has_person"]["logits"], [1.0, -1.0])
        assert answers["sharp"]["options"] == ["0", "1", "2"]
        assert np.allclose(answers["sharp"]["logits"], [0.1, 0.2, 0.3])

    def test_one_record_per_image(self):
        logits = {"label": {"a": 1.0, "b": 0.0}}
        model = _model({"classes": ["a", "b"]}, logits)

        results = model._forward_pass([_image(), _image(30, 20), _image()])

        assert len(results) == 3
        assert len(model._release.records) == 3

    def test_record_carries_state_image_and_questions(self):
        state = {"task": "Inspect the shelf."}
        logits = {"label": {"a": 1.0, "b": 0.0}}
        model = _model({"classes": ["a", "b"], "state": state}, logits)

        model._forward_pass([np.zeros((16, 24, 3), dtype=np.uint8)])
        record = model._release.records[0]

        assert record["state"] == state
        assert record["questions"] == model.questions
        assert len(record["images"]) == 1
        assert record["images"][0].mode == "RGB"
        assert record["images"][0].size == (24, 16)
        assert "media_kwargs" not in record

    def test_media_kwargs_reach_the_record(self):
        media_kwargs = {"max_pixels": 200704}
        logits = {"label": {"a": 1.0, "b": 0.0}}
        model = _model(
            {"classes": ["a", "b"], "media_kwargs": media_kwargs}, logits
        )

        model._forward_pass([_image()])

        assert model._release.records[0]["media_kwargs"] == media_kwargs

    def test_labels_end_to_end(self):
        logits = {"label": {"indoor": -0.5, "outdoor": 1.5}}
        model = _model({"classes": ["outdoor", "indoor"]}, logits)

        label = ClefOutputProcessor()(model._forward_pass([_image()]), None)[0]

        assert label.label == "outdoor"
        assert label.confidence == pytest.approx(_softmax([1.5, -0.5])[0])

    def test_model_reports_logits(self):
        model = _model({"classes": ["a", "b"]}, {"label": {"a": 0, "b": 0}})

        assert model.has_logits is True


class TestClefReleaseImport:
    """Test loading the release module from a snapshot directory"""

    def test_missing_release_module_is_rejected(self, tmp_path):
        with pytest.raises(ValueError, match="not a Clef release"):
            ClefModel._import_release(str(tmp_path))

    def test_release_module_is_imported(self, tmp_path):
        (tmp_path / "joint_schema_model.py").write_text("VALUE = 3\n")

        module = ClefModel._import_release(str(tmp_path))

        assert module.VALUE == 3

    def test_dataclasses_with_postponed_annotations_import(self, tmp_path):
        """The release declares frozen dataclasses under postponed
        annotations, which resolve through sys.modules while the module
        runs"""
        (tmp_path / "joint_schema_model.py").write_text(
            "from __future__ import annotations\n"
            "from dataclasses import dataclass\n"
            "\n"
            "@dataclass(frozen=True)\n"
            "class Encoded:\n"
            "    ids: tuple[int, ...]\n"
        )

        module = ClefModel._import_release(str(tmp_path))

        assert module.Encoded(ids=(1, 2)).ids == (1, 2)

    def test_a_snapshot_is_imported_once(self, tmp_path):
        (tmp_path / "joint_schema_model.py").write_text("VALUE = []\n")

        first = ClefModel._import_release(str(tmp_path))
        second = ClefModel._import_release(str(tmp_path))

        assert first is second

    def test_a_failed_import_is_not_registered(self, tmp_path):
        (tmp_path / "joint_schema_model.py").write_text(
            "raise RuntimeError('broken release')\n"
        )
        before = set(sys.modules)

        with pytest.raises(RuntimeError, match="broken release"):
            ClefModel._import_release(str(tmp_path))

        assert set(sys.modules) == before


class TestClefPrepareImage:
    """Test image normalization to PIL, which needs no model"""

    def _prepare(self, img):
        return ClefModel._prepare_image(None, img)

    def test_channel_first_tensor_is_transposed(self):
        img = torch.zeros(3, 40, 60, dtype=torch.uint8)

        assert self._prepare(img).size == (60, 40)

    def test_channel_last_array_is_left_alone(self):
        img = np.zeros((40, 60, 3), dtype=np.uint8)

        assert self._prepare(img).size == (60, 40)

    def test_unit_float_array_is_scaled(self):
        img = np.full((8, 8, 3), 0.5, dtype=np.float32)
        out = np.asarray(self._prepare(img))

        assert out.dtype == np.uint8
        assert out.max() == 127

    def test_wide_float_array_is_clipped(self):
        img = np.full((8, 8, 3), 300.0, dtype=np.float32)
        out = np.asarray(self._prepare(img))

        assert out.max() == 255

    def test_pil_image_is_preserved(self):
        img = PILImage.new("RGB", (12, 9), color=(10, 20, 30))
        out = self._prepare(img)

        assert out.size == (12, 9)
        assert np.array_equal(np.asarray(out), np.asarray(img))
