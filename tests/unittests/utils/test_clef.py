"""
Tests for fiftyone/utils/clef.py config validation, data loading, batching
and output processing.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import dataclasses
import pickle
import sys
from types import SimpleNamespace

import numpy as np
import pytest
import torch
from PIL import Image as PILImage

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.utils.clef as fouc
from fiftyone.utils.clef import (
    DEFAULT_CHOICE_INSTRUCTIONS,
    DEFAULT_QUESTION_ID,
    DEFAULT_STATE,
    ClefGetItem,
    ClefModel,
    ClefModelConfig,
    ClefOutputProcessor,
)
from decorators import drop_datasets

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


def _option_ids(question):
    """The option IDs of a question in the order the release encodes them"""
    if question["type"] == "noul":
        return ("true", "false")
    if question["type"] == "choice":
        return tuple(sorted(str(o) for o in question["criteria"]))
    return tuple(str(i) for i in range(len(question["criteria"])))


@dataclasses.dataclass(frozen=True)
class _Record(object):
    """An encoded record, a frozen dataclass like the release's"""

    input_ids: tuple
    questions: tuple
    brightness: float = 0.0
    media: dict = None


def _record(questions, input_ids=(1,), brightness=0.0, media=None):
    return _Record(
        input_ids=tuple(input_ids),
        questions=tuple(
            SimpleNamespace(question_id=qid, option_ids=_option_ids(q))
            for qid, q in questions.items()
        ),
        brightness=brightness,
        media=media,
    )


def _table(logits_by_option):
    """A score that gives each option a fixed logit, whatever the image"""
    return lambda question_id, option_id, _: logits_by_option[question_id][
        option_id
    ]


class _FakeNetwork(object):
    """Scores each option with ``score(question_id, option_id, brightness)``,
    where ``brightness`` is the mean pixel value of the record's image"""

    def __init__(self, score):
        self.score = score
        self.batches = []

    def eval(self):
        return self

    def __call__(self, batch):
        self.batches.append(batch)
        return [
            [
                torch.tensor(
                    [
                        self.score(q.question_id, o, record.brightness)
                        for o in q.option_ids
                    ]
                )
                for q in record.questions
            ]
            for record in batch["records"]
        ]


class _FakeRelease(object):
    """Stands in for the release module: a record has one token per image
    column, and a batch is padded as the release pads it"""

    def __init__(self):
        self.network = _FakeNetwork(lambda *args: 0.0)
        self.processor = SimpleNamespace(
            tokenizer=SimpleNamespace(pad_token_id=7)
        )
        self.records = []
        self.encode_kwargs = []
        self.collations = []

    def load_release_model(self, path, device=None, dtype=None):
        return self.network, self.processor

    def encode_record(
        self, tokenizer, record, max_length=16384, processor=None
    ):
        self.records.append(record)
        self.encode_kwargs.append(
            {
                "tokenizer": tokenizer,
                "max_length": max_length,
                "processor": processor,
            }
        )
        image = record["images"][0]
        brightness = float(np.asarray(image).mean())
        return _record(
            record["questions"],
            input_ids=range(1, image.width + 1),
            brightness=brightness,
            media={
                "pixel_values": torch.full((1, 4), brightness),
                "token_offset": 0,
            },
        )

    def collate_records(self, records, pad_token_id, device):
        self.collations.append((len(records), pad_token_id, device))
        length = max(len(r.input_ids) for r in records)
        input_ids = torch.full((len(records), length), pad_token_id)
        attention_mask = torch.zeros((len(records), length), dtype=torch.long)
        for i, r in enumerate(records):
            input_ids[i, : len(r.input_ids)] = torch.tensor(r.input_ids)
            attention_mask[i, : len(r.input_ids)] = 1

        pixels = [r.media["pixel_values"] for r in records if r.media]
        return {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "records": records,
            "media": {"pixel_values": torch.cat(pixels)} if pixels else {},
        }


@pytest.fixture
def release(monkeypatch):
    """A stand-in release that the wrapper downloads and imports in place of
    a real snapshot"""
    release = _FakeRelease()
    monkeypatch.setattr(fouc, "_ensure_clef", lambda: None)
    monkeypatch.setattr(
        fouc,
        "hfh",
        SimpleNamespace(
            snapshot_download=lambda repo_id, revision=None: "release"
        ),
    )
    monkeypatch.setattr(fouc, "_import_release", lambda path: release)
    return release


def _model(d):
    return ClefModel(ClefModelConfig(dict(d, device="cpu")))


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


class TestClefGetItem:
    """Test loading and encoding one image, as a data loader worker does"""

    def _get_item(self, release, **kwargs):
        return ClefGetItem("release", release.processor, {"q": NOUL}, **kwargs)

    def test_requires_the_filepath(self, release):
        assert self._get_item(release).required_keys == ["filepath"]

    def test_filepath_can_come_from_another_field(self, release):
        get_item = self._get_item(
            release, field_mapping={"filepath": "frame_path"}
        )

        assert get_item.field_mapping == {"filepath": "frame_path"}

    def test_loads_the_image_into_one_record(self, release, tmp_path):
        path = str(tmp_path / "image.png")
        _image(24, 16).save(path)

        encoded = self._get_item(release)({"filepath": path})
        record = release.records[0]

        assert [q.question_id for q in encoded.questions] == ["q"]
        assert record["state"] == DEFAULT_STATE
        assert record["questions"] == {"q": NOUL}
        assert len(record["images"]) == 1
        assert record["images"][0].mode == "RGB"
        assert record["images"][0].size == (24, 16)
        assert "media_kwargs" not in record

    def test_grayscale_files_load_as_rgb(self, release, tmp_path):
        path = str(tmp_path / "gray.png")
        PILImage.new("L", (8, 6), color=90).save(path)

        self._get_item(release)({"filepath": path})

        assert release.records[0]["images"][0].mode == "RGB"

    def test_settings_reach_the_release(self, release):
        media_kwargs = {"max_pixels": 200704}
        get_item = self._get_item(
            release,
            state={"task": "Inspect the shelf."},
            max_length=512,
            media_kwargs=media_kwargs,
        )

        get_item.encode(_image())

        assert release.records[0]["state"] == {"task": "Inspect the shelf."}
        assert release.records[0]["media_kwargs"] == media_kwargs
        assert release.encode_kwargs[0] == {
            "tokenizer": release.processor.tokenizer,
            "max_length": 512,
            "processor": release.processor,
        }

    def test_encodes_arrays_and_tensors(self, release):
        get_item = self._get_item(release)

        get_item.encode(np.zeros((16, 24, 3), dtype=np.uint8))
        get_item.encode(torch.zeros(3, 16, 24, dtype=torch.uint8))

        sizes = [record["images"][0].size for record in release.records]
        assert sizes == [(24, 16), (24, 16)]

    def test_survives_pickling(self, release, tmp_path):
        """Data loaders pickle it into workers they spawn"""
        path = str(tmp_path / "image.png")
        _image().save(path)
        get_item = self._get_item(release, state="Look closely.")

        pickle.loads(pickle.dumps(get_item))({"filepath": path})

        assert release.records[0]["state"] == "Look closely."


class TestClefCollate:
    """Test padding encoded records into a batch"""

    def test_pads_on_the_cpu_with_the_release_collation(self, release):
        model = _model({"questions": {"q": NOUL}})
        records = [
            _record({"q": NOUL}, input_ids=(1, 2, 3)),
            _record({"q": NOUL}, input_ids=(4,)),
        ]

        batch = model.collate_fn(records)

        assert release.collations == [(2, 7, torch.device("cpu"))]
        assert batch["input_ids"].tolist() == [[1, 2, 3], [4, 7, 7]]
        assert batch["records"] == records

    def test_records_leave_their_image_tensors_to_the_batch(self, release):
        """The batch holds the image tensors, so the records drop their own
        copies rather than carry them back from the workers too"""
        model = _model({"questions": {"q": NOUL}})
        pixels = torch.ones((1, 4))
        record = _record(
            {"q": NOUL}, media={"pixel_values": pixels, "token_offset": 0}
        )

        batch = model.collate_fn([record])

        assert batch["records"][0].media is None
        assert batch["records"][0].questions == record.questions
        assert batch["records"][0].input_ids == record.input_ids
        assert torch.equal(batch["media"]["pixel_values"], pixels)

    def test_survives_pickling(self, release):
        """Data loaders pickle it into workers they spawn"""
        model = _model({"questions": {"q": NOUL}})
        collate_fn = pickle.loads(pickle.dumps(model.collate_fn))

        batch = collate_fn([_record({"q": NOUL}, input_ids=(5, 6))])

        assert batch["input_ids"].tolist() == [[5, 6]]


class TestClefModel:
    """Test the model's batching hooks and predictions against a stand-in
    release"""

    def test_batches_are_padded_rather_than_ragged(self, release):
        model = _model({"classes": ["a", "b"]})

        assert model.ragged_batches is False
        assert model.has_collate_fn is True

    def test_model_reports_logits(self, release):
        model = _model({"classes": ["a", "b"]})

        assert model.has_logits is True

    def test_get_item_carries_the_config(self, release):
        media_kwargs = {"max_pixels": 200704}
        model = _model(
            {
                "classes": ["a", "b"],
                "state": {"task": "Inspect the shelf."},
                "max_length": 512,
                "media_kwargs": media_kwargs,
            }
        )

        get_item = model.build_get_item()

        assert get_item.release_path == "release"
        assert get_item.processor is release.processor
        assert get_item.questions == model.questions
        assert get_item.state == {"task": "Inspect the shelf."}
        assert get_item.max_length == 512
        assert get_item.media_kwargs == media_kwargs

    def test_images_run_as_one_batch(self, release):
        release.network.score = _table({"label": {"a": 1.0, "b": 0.0}})
        model = _model({"classes": ["a", "b"]})

        labels = model.predict_all(
            [_image(), _image(30, 20), np.zeros((8, 8, 3), dtype=np.uint8)]
        )

        assert [label.label for label in labels] == ["a", "a", "a"]
        assert release.collations == [(3, 7, torch.device("cpu"))]
        assert len(release.network.batches) == 1

    def test_predict_takes_a_tensor(self, release):
        model = _model({"classes": ["a", "b"]})

        label = model.predict(torch.zeros(3, 16, 24, dtype=torch.uint8))

        assert isinstance(label, fol.Classification)
        assert release.records[0]["images"][0].size == (24, 16)

    def test_a_padded_batch_is_used_as_given(self, release):
        """apply_model turns preprocessing off and passes the batches its data
        loader pads"""
        release.network.score = _table({"label": {"a": 0.0, "b": 2.0}})
        model = _model({"classes": ["a", "b"]})
        encode = model.build_get_item().encode
        batch = model.collate_fn([encode(_image()), encode(_image(30, 20))])
        model.preprocess = False

        labels = model.predict_all(batch)

        assert [label.label for label in labels] == ["b", "b"]
        assert len(release.records) == 2
        assert len(release.collations) == 1

    def test_the_batch_moves_to_the_models_device(self, release):
        model = _model({"classes": ["a", "b"]})
        model._device = torch.device("meta")

        model.predict(_image())
        batch = release.network.batches[0]

        assert batch["input_ids"].device.type == "meta"
        assert batch["attention_mask"].device.type == "meta"
        assert batch["media"]["pixel_values"].device.type == "meta"

    def test_stored_logits_follow_the_callers_order(self, release):
        """The release orders choice options by ID; the wrapper restores the
        order the caller gave"""
        release.network.score = _table(
            {"label": {"zebra": 2.0, "ant": -1.0, "moose": 0.5}}
        )
        model = _model({"classes": ["zebra", "ant", "moose"]})
        model.store_logits = True

        label = model.predict(_image())

        assert label.label == "zebra"
        assert np.allclose(label.logits, [2.0, -1.0, 0.5])


class TestClefApplyModel:
    """Test that apply_model loads, pads and labels samples in batches"""

    @drop_datasets
    def test_samples_are_labelled_in_batches(self, release, tmp_path):
        # Bright images answer "bright" and dark images "dark"
        release.network.score = (
            lambda question_id, option_id, brightness: (
                brightness if option_id == "bright" else 255.0 - brightness
            )
            / 25.5
        )
        model = _model({"classes": ["dark", "bright"]})

        dataset = fo.Dataset()
        shades = [10, 240, 30, 220, 200]
        for i, shade in enumerate(shades):
            # Images of different widths encode to records of different
            # lengths, which the batches pad
            path = str(tmp_path / ("%d.png" % i))
            PILImage.new("RGB", (8 + i, 8), color=(shade,) * 3).save(path)
            dataset.add_sample(fo.Sample(filepath=path))

        dataset.apply_model(
            model,
            label_field="tone",
            batch_size=2,
            num_workers=0,
            skip_failures=False,
            store_logits=True,
        )

        batch_sizes = [len(b["records"]) for b in release.network.batches]
        assert batch_sizes == [2, 2, 1]
        assert dataset.values("tone.label") == [
            "dark",
            "bright",
            "dark",
            "bright",
            "bright",
        ]
        assert np.allclose(
            dataset.first().tone.logits, [245.0 / 25.5, 10.0 / 25.5]
        )


class TestClefOutputProcessor:
    """Test the mapping from per-option logits to labels"""

    def _process(self, questions, logits_by_option, processor=None, **kwargs):
        """Processes one record whose logits come in the release's option
        order"""
        record = _record(questions)
        output = [
            [
                torch.tensor(
                    [logits_by_option[q.question_id][o] for o in q.option_ids]
                )
                for q in record.questions
            ]
        ]
        processor = processor or ClefOutputProcessor()
        return processor(
            output, None, records=[record], questions=questions, **kwargs
        )[0]

    def test_choice_becomes_a_classification(self):
        logits = {"q": {"zebra": 2.0, "ant": 0.0, "moose": -1.0}}

        label = self._process({"q": CHOICE}, logits)

        assert isinstance(label, fol.Classification)
        assert label.label == "zebra"
        assert label.confidence == pytest.approx(_softmax([2.0, 0.0, -1.0])[0])
        assert label.logits is None

    def test_noul_becomes_a_true_or_false_classification(self):
        label = self._process({"q": NOUL}, {"q": {"true": -1.0, "false": 1.5}})

        assert label.label == "false"
        assert label.confidence == pytest.approx(_softmax([-1.0, 1.5])[1])

    def test_score_becomes_the_expected_level(self):
        logits = {"q": {"0": 0.0, "1": 1.0, "2": 2.0}}

        label = self._process({"q": SCORE}, logits)
        probabilities = _softmax([0.0, 1.0, 2.0])

        assert isinstance(label, fol.Regression)
        assert label.value == pytest.approx(
            float(np.dot([0, 1, 2], probabilities))
        )
        assert label.confidence == pytest.approx(probabilities.max())

    def test_several_questions_give_a_dict(self):
        logits = {
            "has_person": {"true": 2.0, "false": 0.0},
            "sharp": {"0": 0.0, "1": 0.0, "2": 0.0},
        }

        labels = self._process({"has_person": NOUL, "sharp": SCORE}, logits)

        assert set(labels) == {"has_person", "sharp"}
        assert labels["has_person"].label == "true"
        assert labels["sharp"].value == pytest.approx(1.0)

    def test_one_result_per_image(self):
        questions = {"q": NOUL}
        records = [_record(questions), _record(questions)]
        output = [[torch.tensor([1.0, 0.0])], [torch.tensor([0.0, 1.0])]]

        labels = ClefOutputProcessor()(
            output, None, records=records, questions=questions
        )

        assert [label.label for label in labels] == ["true", "false"]

    def test_logits_are_stored_in_the_callers_order(self):
        logits = {"q": {"zebra": 0.5, "ant": -0.5, "moose": 3.0}}

        label = self._process(
            {"q": CHOICE}, logits, ClefOutputProcessor(store_logits=True)
        )

        assert label.label == "moose"
        assert np.allclose(label.logits, [0.5, -0.5, 3.0])

    def test_bfloat16_logits_are_read(self):
        """The model computes in bfloat16, which numpy cannot hold"""
        questions = {"q": NOUL}
        output = [[torch.tensor([2.0, 0.0], dtype=torch.bfloat16)]]

        label = ClefOutputProcessor()(
            output, None, records=[_record(questions)], questions=questions
        )[0]

        assert label.label == "true"
        assert label.confidence == pytest.approx(_softmax([2.0, 0.0])[0])

    def test_confidence_threshold_drops_classifications(self):
        label = self._process(
            {"q": NOUL},
            {"q": {"true": 0.1, "false": 0.0}},
            confidence_thresh=0.9,
        )

        assert label is None

    def test_threshold_omits_dropped_answers_from_a_dict(self):
        """A new field cannot take its type from None, so a dropped answer
        is left out rather than kept as None"""
        logits = {
            "sure": {"true": 5.0, "false": 0.0},
            "unsure": {"true": 0.1, "false": 0.0},
            "sharp": {"0": 0.0, "1": 0.0, "2": 0.0},
        }

        labels = self._process(
            {"sure": NOUL, "unsure": NOUL, "sharp": SCORE},
            logits,
            confidence_thresh=0.9,
        )

        assert set(labels) == {"sure", "sharp"}
        assert labels["sure"].label == "true"

    def test_threshold_dict_saves_to_new_fields(self):
        logits = {
            "sure": {"true": 5.0, "false": 0.0},
            "unsure": {"true": 0.1, "false": 0.0},
        }
        labels = self._process(
            {"sure": NOUL, "unsure": NOUL}, logits, confidence_thresh=0.9
        )
        sample = fo.Sample(filepath="image.jpg")

        sample.add_labels(labels, label_field="clef")

        assert sample.clef_sure.label == "true"
        assert not sample.has_field("clef_unsure")

    def test_confidence_threshold_keeps_regressions(self):
        label = self._process(
            {"q": SCORE},
            {"q": {"0": 0.0, "1": 0.0, "2": 0.0}},
            confidence_thresh=0.9,
        )

        assert isinstance(label, fol.Regression)

    def test_large_logits_stay_finite(self):
        label = self._process(
            {"q": NOUL}, {"q": {"true": 1000.0, "false": 999.0}}
        )

        assert label.label == "true"
        assert np.isfinite(label.confidence)
        assert label.confidence == pytest.approx(_softmax([1.0, 0.0])[0])


class TestClefReleaseImport:
    """Test loading the release module from a snapshot directory"""

    def test_missing_release_module_is_rejected(self, tmp_path):
        with pytest.raises(ValueError, match="not a Clef release"):
            fouc._import_release(str(tmp_path))

    def test_release_module_is_imported(self, tmp_path):
        (tmp_path / "joint_schema_model.py").write_text("VALUE = 3\n")

        module = fouc._import_release(str(tmp_path))

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

        module = fouc._import_release(str(tmp_path))

        assert module.Encoded(ids=(1, 2)).ids == (1, 2)

    def test_encoded_records_pickle_by_reference(self, tmp_path):
        """Records encoded in data loader workers return to the main process
        by pickling"""
        (tmp_path / "joint_schema_model.py").write_text(
            "from __future__ import annotations\n"
            "from dataclasses import dataclass\n"
            "\n"
            "@dataclass(frozen=True)\n"
            "class Encoded:\n"
            "    ids: tuple[int, ...]\n"
        )
        module = fouc._import_release(str(tmp_path))

        record = pickle.loads(pickle.dumps(module.Encoded(ids=(1, 2))))

        assert type(record) is module.Encoded
        assert record.ids == (1, 2)

    def test_a_snapshot_is_imported_once(self, tmp_path):
        (tmp_path / "joint_schema_model.py").write_text("VALUE = []\n")

        first = fouc._import_release(str(tmp_path))
        second = fouc._import_release(str(tmp_path))

        assert first is second

    def test_a_failed_import_is_not_registered(self, tmp_path):
        (tmp_path / "joint_schema_model.py").write_text(
            "raise RuntimeError('broken release')\n"
        )
        before = set(sys.modules)

        with pytest.raises(RuntimeError, match="broken release"):
            fouc._import_release(str(tmp_path))

        assert set(sys.modules) == before


class TestClefPrepareImage:
    """Test image normalization to PIL, which needs no model"""

    def test_channel_first_tensor_is_transposed(self):
        img = torch.zeros(3, 40, 60, dtype=torch.uint8)

        assert fouc._prepare_image(img).size == (60, 40)

    def test_channel_last_array_is_left_alone(self):
        img = np.zeros((40, 60, 3), dtype=np.uint8)

        assert fouc._prepare_image(img).size == (60, 40)

    def test_unit_float_array_is_scaled(self):
        img = np.full((8, 8, 3), 0.5, dtype=np.float32)
        out = np.asarray(fouc._prepare_image(img))

        assert out.dtype == np.uint8
        assert out.max() == 127

    def test_wide_float_array_is_clipped(self):
        img = np.full((8, 8, 3), 300.0, dtype=np.float32)
        out = np.asarray(fouc._prepare_image(img))

        assert out.max() == 255

    def test_pil_image_is_preserved(self):
        img = PILImage.new("RGB", (12, 9), color=(10, 20, 30))
        out = fouc._prepare_image(img)

        assert out.size == (12, 9)
        assert np.array_equal(np.asarray(out), np.asarray(img))

    def test_path_is_loaded(self, tmp_path):
        path = str(tmp_path / "image.png")
        PILImage.new("RGB", (12, 9), color=(10, 20, 30)).save(path)

        assert fouc._prepare_image(path).size == (12, 9)
