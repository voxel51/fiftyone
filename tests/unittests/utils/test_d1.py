"""
Tests for fiftyone/utils/d1.py config validation, data loading, batching and
output processing.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import pickle
from types import SimpleNamespace

import numpy as np
import pytest
import torch
from PIL import Image as PILImage

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.utils.d1 as fou_d1
from fiftyone.utils.d1 import (
    DEFAULT_CHOICE_INSTRUCTIONS,
    DEFAULT_QUESTION_ID,
    D1GetItem,
    D1Model,
    D1ModelConfig,
    D1OutputProcessor,
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

# The stand-in vocabulary: an image token, the answer tokens, and one token
# per character for all other text
VOCAB = 128
PAD = 0
IMAGE_TOKEN = 1
YES, NO = 10, 11
OPTION_TOKENS = [[20, 21], [22], [23]]
DIGIT_TOKENS = [30, 31, 32]


def _softmax(values):
    values = np.asarray(values, dtype=np.float64)
    odds = np.exp(values - values.max())
    return odds / odds.sum()


def _image(w=24, h=16, shade=80):
    return PILImage.new("RGB", (w, h), color=(shade, shade, shade))


class _FakeTokenizer(object):
    pad_token_id = PAD

    def encode(self, text, add_special_tokens=False):
        return [40 + ord(c) % 80 for c in text]


class _FakeProcessor(object):
    """Encodes the prefix as one token per character and the image as one
    image token, with one patch per image column holding the image's
    brightness and three padding patches"""

    def __init__(self):
        self.tokenizer = _FakeTokenizer()

    def __call__(self, text, images, return_tensors, add_special_tokens):
        img = images[0][0]
        brightness = float(np.asarray(img).mean()) / 255
        patches = img.size[0]
        pixel_values = torch.zeros((1, patches + 3, 2))
        pixel_values[0, :patches] = brightness
        mask = torch.zeros((1, patches + 3), dtype=torch.long)
        mask[0, :patches] = 1
        ids = self.tokenizer.encode(text[0]) + [IMAGE_TOKEN]
        return {
            "input_ids": torch.tensor([ids]),
            "pixel_values": pixel_values,
            "pixel_attention_mask": mask,
            "spatial_shapes": torch.tensor([[1, patches]]),
        }


class _FakeEngine(object):
    bos = "<s>"
    lead = ""
    state_style = "json_only"
    system = "none"
    option_style = "desc"

    def __init__(self, processor):
        self.processor = processor
        self.tokenizer = processor.tokenizer

    def _load_processor(self):
        return self.processor

    def _image_markup(self, n):
        return "<image>" * n


class _FakeLanguageModel(object):
    """Gives every position of a row the brightness its image slot holds"""

    def __call__(self, inputs_embeds):
        brightness = inputs_embeds.amax(dim=1, keepdim=True)
        return SimpleNamespace(
            last_hidden_state=brightness.expand_as(inputs_embeds)
        )


class _FakeBackbone(object):
    def __init__(self):
        self.language_model = _FakeLanguageModel()
        self.tile_batches = []

    def get_image_features(
        self, pixel_values, spatial_shapes, pixel_attention_mask
    ):
        self.tile_batches.append(len(pixel_values))
        features = [
            values[mask.bool()].mean().reshape(1, 1)
            for values, mask in zip(pixel_values, pixel_attention_mask)
        ]
        return SimpleNamespace(pooler_output=features)

    def get_placeholder_mask(self, input_ids, inputs_embeds, image_features):
        return (input_ids == IMAGE_TOKEN).unsqueeze(-1)


class _FakeNetwork(object):
    """Stands in for the release's model: bright images answer yes, the first
    option and the top level; dark ones the opposite"""

    def __init__(self):
        self.engine = _FakeEngine(_FakeProcessor())
        self.model = _FakeBackbone()
        self.rows = []

    def to(self, device):
        return self

    def eval(self):
        return self

    def get_input_embeddings(self):
        return lambda input_ids: torch.zeros((*input_ids.shape, 1))

    def lm_head(self, hidden):
        b = hidden[:, 0]
        self.rows.append(len(b))
        logits = torch.full((len(b), VOCAB), -30.0)
        logits[:, YES] = 10 * b
        logits[:, NO] = 10 * (1 - b)
        logits[:, OPTION_TOKENS[0][0]] = 10 * b
        logits[:, OPTION_TOKENS[0][1]] = 10 * b - 1
        logits[:, OPTION_TOKENS[1][0]] = 10 * (1 - b)
        logits[:, OPTION_TOKENS[2][0]] = 2.0
        for level, token in enumerate(DIGIT_TOKENS):
            logits[:, token] = 10 * b * level
        return logits


def _fake_prompt():
    def prefix_text(tokenizer, state, bos, style, system, images):
        body = "" if state is None else json.dumps(state) + "\nQUESTION:\n"
        return bos + "<user>" + images + body

    def suffix_text(tokenizer, question, lead, option_style):
        return question.instructions + "?" + lead

    def readout_ids(tokenizer, question):
        if question.type == "noul":
            return [[YES], [NO]]
        if question.type == "choice":
            return OPTION_TOKENS[: len(question.criteria)]
        return [[t] for t in DIGIT_TOKENS[: len(question.criteria)]]

    return SimpleNamespace(
        prefix_text=prefix_text,
        suffix_text=suffix_text,
        readout_ids=readout_ids,
        as_question=lambda q: SimpleNamespace(**q),
    )


@pytest.fixture
def network(monkeypatch):
    """A stand-in for the release, loaded in place of the real model"""
    network = _FakeNetwork()
    runner = SimpleNamespace(VISION_MAX_PIXELS=4096)
    monkeypatch.setattr(
        fou_d1,
        "transformers",
        SimpleNamespace(
            AutoModel=SimpleNamespace(
                from_pretrained=lambda *args, **kwargs: network
            )
        ),
    )
    monkeypatch.setattr(
        fou_d1, "_release_modules", lambda model: (runner, _fake_prompt())
    )
    return network


def _model(d):
    return D1Model(D1ModelConfig(dict(d, device="cpu")))


class TestD1ModelConfig:
    """Test config parsing and the question schema it yields"""

    def test_defaults(self):
        config = D1ModelConfig({"classes": ["cat", "dog"]})

        assert config.name_or_path == "LiquidAI/d1-3B"
        assert config.revision is None
        assert config.state is None
        assert config.raw_inputs is True
        assert config.output_processor_cls is D1OutputProcessor

    def test_classes_become_one_choice_question(self):
        config = D1ModelConfig({"classes": ["outdoor", "indoor"]})

        assert config.get_questions() == {
            DEFAULT_QUESTION_ID: {
                "type": "choice",
                "instructions": DEFAULT_CHOICE_INSTRUCTIONS,
                "criteria": {"outdoor": "outdoor", "indoor": "indoor"},
            }
        }

    def test_prompt_is_the_choice_instructions(self):
        config = D1ModelConfig({"classes": ["a", "b"], "prompt": "Pick one."})

        question = config.get_questions()[DEFAULT_QUESTION_ID]
        assert question["instructions"] == "Pick one."

    def test_questions_are_returned_as_given(self):
        questions = {"has_person": NOUL, "animal": CHOICE, "sharp": SCORE}
        config = D1ModelConfig({"questions": questions})

        assert config.get_questions() == questions

    def test_json_state_is_kept(self):
        state = {"task": "Inspect the shelf.", "store": 12}
        config = D1ModelConfig({"classes": ["a", "b"], "state": state})

        assert config.state == state

    def test_neither_questions_nor_classes_is_rejected(self):
        with pytest.raises(ValueError, match="questions"):
            D1ModelConfig({}).get_questions()

    def test_both_questions_and_classes_is_rejected(self):
        config = D1ModelConfig(
            {"questions": {"q": NOUL}, "classes": ["a", "b"]}
        )

        with pytest.raises(ValueError, match="not both"):
            config.get_questions()

    @pytest.mark.parametrize("classes", [["only"], ["a", "a"], []])
    def test_degenerate_classes_are_rejected(self, classes):
        with pytest.raises(ValueError, match="distinct"):
            D1ModelConfig({"classes": classes}).get_questions()

    @pytest.mark.parametrize("question_id", ["has person", "1st", "a-b", ""])
    def test_question_id_must_be_a_field_name(self, question_id):
        config = D1ModelConfig({"questions": {question_id: NOUL}})

        with pytest.raises(ValueError, match="field name"):
            config.get_questions()

    def test_unknown_type_is_rejected(self):
        config = D1ModelConfig(
            {"questions": {"q": {"type": "open", "instructions": "Why?"}}}
        )

        with pytest.raises(ValueError, match="type"):
            config.get_questions()

    @pytest.mark.parametrize("criteria", [None, {}, ["a", "b"]])
    def test_choice_needs_an_option_mapping(self, criteria):
        question = {"type": "choice", "criteria": criteria}
        config = D1ModelConfig({"questions": {"q": question}})

        with pytest.raises(ValueError, match="criteria"):
            config.get_questions()

    @pytest.mark.parametrize(
        "criteria", [None, ["only"], {"a": 1}, [str(i) for i in range(11)]]
    )
    def test_score_needs_two_to_ten_levels(self, criteria):
        question = {"type": "score", "criteria": criteria}
        config = D1ModelConfig({"questions": {"q": question}})

        with pytest.raises(ValueError, match="levels"):
            config.get_questions()

    def test_ten_score_levels_are_accepted(self):
        question = {"type": "score", "criteria": [str(i) for i in range(10)]}
        config = D1ModelConfig({"questions": {"q": question}})

        assert config.get_questions() == {"q": question}

    def test_noul_criteria_with_other_options_is_rejected(self):
        question = {"type": "noul", "criteria": {"maybe": "Unsure"}}
        config = D1ModelConfig({"questions": {"q": question}})

        with pytest.raises(ValueError, match="noul"):
            config.get_questions()

    def test_model_rejects_a_missing_schema_before_loading(self, monkeypatch):
        """The schema is checked before any download is attempted"""

        def fail(*args, **kwargs):
            raise AssertionError("download attempted")

        monkeypatch.setattr(
            fou_d1,
            "transformers",
            SimpleNamespace(AutoModel=SimpleNamespace(from_pretrained=fail)),
        )

        with pytest.raises(ValueError, match="questions"):
            D1Model(D1ModelConfig({}))


class TestD1GetItem:
    """Test loading and encoding one image, as a data loader worker does"""

    def _get_item(self, **kwargs):
        return D1GetItem(_FakeProcessor(), "<s><user><image>", **kwargs)

    def test_requires_the_filepath(self):
        assert self._get_item().required_keys == ["filepath"]

    def test_filepath_can_come_from_another_field(self):
        get_item = self._get_item(field_mapping={"filepath": "frame_path"})

        assert get_item.field_mapping == {"filepath": "frame_path"}

    def test_encodes_the_prefix_and_the_image(self, tmp_path):
        path = str(tmp_path / "image.png")
        _image(24, 16).save(path)

        item = self._get_item()({"filepath": path})

        expected = _FakeTokenizer().encode("<s><user><image>")
        assert item["input_ids"].tolist() == expected + [IMAGE_TOKEN]
        assert item["spatial_shapes"].tolist() == [[1, 24]]

    def test_padding_patches_are_cut(self):
        item = self._get_item().encode(_image(24, 16))

        assert item["pixel_values"].shape[:2] == (1, 24)
        assert item["pixel_attention_mask"].tolist() == [[1] * 24]

    def test_large_images_are_downscaled(self):
        item = self._get_item(max_pixels=100).encode(_image(40, 10))

        # 400 pixels scale by a half on each side to 20 x 5
        assert item["spatial_shapes"].tolist() == [[1, 20]]

    def test_grayscale_files_load_as_rgb(self, tmp_path):
        path = str(tmp_path / "gray.png")
        PILImage.new("L", (8, 6), color=90).save(path)

        item = self._get_item()({"filepath": path})

        assert item["pixel_values"][0, 0, 0] == pytest.approx(90 / 255)

    def test_encodes_arrays_and_tensors(self):
        get_item = self._get_item()

        from_array = get_item.encode(np.zeros((16, 24, 3), dtype=np.uint8))
        from_tensor = get_item.encode(
            torch.zeros(3, 16, 24, dtype=torch.uint8)
        )

        assert from_array["spatial_shapes"].tolist() == [[1, 24]]
        assert from_tensor["spatial_shapes"].tolist() == [[1, 24]]

    def test_survives_pickling(self, tmp_path):
        """Data loaders pickle it into workers they spawn"""
        path = str(tmp_path / "image.png")
        _image().save(path)
        get_item = self._get_item()

        item = pickle.loads(pickle.dumps(get_item))({"filepath": path})

        assert item["spatial_shapes"].tolist() == [[1, 24]]


class TestD1Collate:
    """Test pairing image prefixes with questions and padding the rows"""

    def test_every_image_continues_with_every_question(self, network):
        model = _model({"questions": {"a": NOUL, "b": SCORE}})
        items = [
            model.build_get_item().encode(_image(24, 16)),
            model.build_get_item().encode(_image(30, 16)),
        ]

        batch = model.collate_fn(items)

        suffixes = model.collate_fn.suffixes
        expected = [
            items[i]["input_ids"].tolist() + suffix
            for i in range(2)
            for suffix in suffixes
        ]
        for row, ids, last in zip(
            batch["input_ids"], expected, batch["last_index"]
        ):
            assert row[: len(ids)].tolist() == ids
            assert row[len(ids) :].tolist() == [PAD] * (len(row) - len(ids))
            assert last == len(ids) - 1

    def test_tiles_are_padded_to_the_most_patches(self, network):
        model = _model({"questions": {"a": NOUL}})
        items = [
            model.build_get_item().encode(_image(24, 16)),
            model.build_get_item().encode(_image(30, 16)),
        ]

        batch = model.collate_fn(items)

        assert batch["pixel_values"].shape[:2] == (2, 30)
        assert batch["pixel_attention_mask"].sum(1).tolist() == [24, 30]
        assert batch["spatial_shapes"].tolist() == [[1, 24], [1, 30]]
        assert batch["tiles"] == [1, 1]

    def test_survives_pickling(self, network):
        """Data loaders pickle it into workers they spawn"""
        model = _model({"questions": {"a": NOUL}})
        collate_fn = pickle.loads(pickle.dumps(model.collate_fn))

        batch = collate_fn([model.build_get_item().encode(_image())])

        assert batch["input_ids"].shape[0] == 1


class TestD1Model:
    """Test the model's batching hooks and predictions against a stand-in
    release"""

    def test_batches_are_padded_rather_than_ragged(self, network):
        model = _model({"classes": ["a", "b"]})

        assert model.ragged_batches is False
        assert model.has_collate_fn is True
        assert model.has_logits is True

    def test_prompt_is_built_from_the_config(self, network):
        model = _model(
            {"questions": {"a": NOUL}, "state": {"task": "Inspect."}}
        )

        get_item = model.build_get_item()

        assert get_item.prefix == (
            '<s><user><image>{"task": "Inspect."}\nQUESTION:\n'
        )
        assert get_item.max_pixels == 4096

    def test_missing_instructions_use_the_question_id(self, network):
        model = _model({"questions": {"has_dog": {"type": "noul"}}})

        suffix = model.collate_fn.suffixes[0]

        assert suffix == _FakeTokenizer().encode("has_dog?")

    def test_images_run_as_one_batch(self, network):
        model = _model({"questions": {"a": NOUL, "b": CHOICE}})

        labels = model.predict_all(
            [_image(shade=230), _image(30, 20, shade=20), _image(shade=230)]
        )

        assert network.model.tile_batches == [3]
        assert network.rows == [6]
        assert [label["a"].label for label in labels] == [
            "true",
            "false",
            "true",
        ]
        assert labels[1]["b"].label == "ant"

    def test_a_padded_batch_is_used_as_given(self, network):
        """apply_model turns preprocessing off and passes the batches its data
        loader pads"""
        model = _model({"questions": {"a": NOUL}})
        encode = model.build_get_item().encode
        batch = model.collate_fn([encode(_image(shade=230)), encode(_image())])
        model.preprocess = False

        labels = model.predict_all(batch)

        assert [label.label for label in labels] == ["true", "false"]

    def test_predict_takes_a_tensor(self, network):
        model = _model({"questions": {"a": NOUL}})

        label = model.predict(torch.full((3, 16, 24), 230, dtype=torch.uint8))

        assert label.label == "true"

    def test_image_features_repeat_for_each_question(self, network):
        model = _model({"questions": {"a": NOUL, "b": NOUL, "c": NOUL}})
        encode = model.build_get_item().encode
        batch = model.collate_fn(
            [encode(_image(shade=230)), encode(_image(shade=20))]
        )

        output = model._forward_pass(batch)

        # Each image's three rows read that image's answer
        yes = model._answer_columns["a"][0][0]
        no = model._answer_columns["a"][1][0]
        answers = (output[:, yes] > output[:, no]).tolist()
        assert answers == [True, True, True, False, False, False]

    def test_stored_logits_follow_the_callers_order(self, network):
        model = _model({"questions": {"animal": CHOICE}})
        model.store_logits = True

        label = model.predict(_image(shade=230))

        b = np.asarray(_image(shade=230)).mean() / 255
        # The release's readout takes each option's best token
        expected = _softmax([10 * b, 10 * (1 - b), 2.0])
        assert label.label == "zebra"
        assert np.allclose(_softmax(label.logits), expected, atol=1e-5)


class TestD1ApplyModel:
    """Test that apply_model loads, pads and labels samples in batches"""

    @drop_datasets
    def test_samples_are_labelled_in_batches(self, network, tmp_path):
        model = _model({"classes": ["bright", "dark"]})

        dataset = fo.Dataset()
        shades = [240, 10, 220, 30, 200]
        for i, shade in enumerate(shades):
            # Images of different widths encode to rows of different
            # lengths, which the batches pad
            path = str(tmp_path / ("%d.png" % i))
            _image(8 + i, 8, shade=shade).save(path)
            dataset.add_sample(fo.Sample(filepath=path))

        dataset.apply_model(
            model,
            label_field="tone",
            batch_size=2,
            num_workers=0,
            skip_failures=False,
            store_logits=True,
        )

        assert network.rows == [2, 2, 1]
        assert dataset.values("tone.label") == [
            "bright",
            "dark",
            "bright",
            "dark",
            "bright",
        ]
        assert len(dataset.first().tone.logits) == 2


class TestD1OutputProcessor:
    """Test the mapping from answer-token log-probabilities to labels"""

    def _process(self, questions, rows, columns, processor=None, **kwargs):
        processor = processor or D1OutputProcessor()
        return processor(
            torch.tensor(rows, dtype=torch.float32),
            None,
            questions=questions,
            answer_columns=columns,
            **kwargs,
        )

    def test_choice_becomes_a_classification(self):
        label = self._process(
            {"q": CHOICE}, [[2.0, 0.0, -1.0]], {"q": [[0], [1], [2]]}
        )[0]

        assert isinstance(label, fol.Classification)
        assert label.label == "zebra"
        assert label.confidence == pytest.approx(_softmax([2.0, 0.0, -1.0])[0])
        assert label.logits is None

    def test_an_option_scores_its_best_token(self):
        label = self._process(
            {"q": NOUL},
            [[0.5, 3.0, 1.0]],
            {"q": [[0, 1], [2]]},
            D1OutputProcessor(store_logits=True),
        )[0]

        assert label.label == "true"
        assert np.allclose(label.logits, [3.0, 1.0])

    def test_score_becomes_the_expected_level(self):
        label = self._process(
            {"q": SCORE}, [[0.0, 1.0, 2.0]], {"q": [[0], [1], [2]]}
        )[0]
        probabilities = _softmax([0.0, 1.0, 2.0])

        assert isinstance(label, fol.Regression)
        assert label.value == pytest.approx(
            float(np.dot([0, 1, 2], probabilities))
        )
        assert label.confidence == pytest.approx(probabilities.max())

    def test_each_image_reads_its_own_rows(self):
        questions = {"a": NOUL, "b": NOUL}
        rows = [[2.0, 0.0], [0.0, 2.0], [0.0, 2.0], [2.0, 0.0]]

        labels = self._process(
            questions, rows, {"a": [[0], [1]], "b": [[0], [1]]}
        )

        assert [(l["a"].label, l["b"].label) for l in labels] == [
            ("true", "false"),
            ("false", "true"),
        ]

    def test_confidence_threshold_drops_classifications(self):
        label = self._process(
            {"q": NOUL},
            [[0.1, 0.0]],
            {"q": [[0], [1]]},
            confidence_thresh=0.9,
        )[0]

        assert label is None

    def test_threshold_omits_dropped_answers_from_a_dict(self):
        questions = {"sure": NOUL, "unsure": NOUL, "sharp": SCORE}
        rows = [[5.0, 0.0, 0.0], [0.1, 0.0, 0.0], [0.0, 0.0, 0.0]]
        columns = {
            "sure": [[0], [1]],
            "unsure": [[0], [1]],
            "sharp": [[0], [1], [2]],
        }

        labels = self._process(
            questions, rows, columns, confidence_thresh=0.9
        )[0]

        assert set(labels) == {"sure", "sharp"}

    def test_threshold_dict_saves_to_new_fields(self):
        questions = {"sure": NOUL, "unsure": NOUL}
        labels = self._process(
            questions,
            [[5.0, 0.0], [0.1, 0.0]],
            {"sure": [[0], [1]], "unsure": [[0], [1]]},
            confidence_thresh=0.9,
        )[0]
        sample = fo.Sample(filepath="image.jpg")

        sample.add_labels(labels, label_field="d1")

        assert sample.d1_sure.label == "true"
        assert not sample.has_field("d1_unsure")

    def test_bfloat16_output_is_read(self):
        processor = D1OutputProcessor()

        label = processor(
            torch.tensor([[2.0, 0.0]], dtype=torch.bfloat16),
            None,
            questions={"q": NOUL},
            answer_columns={"q": [[0], [1]]},
        )[0]

        assert label.label == "true"


class TestD1PrepareImage:
    """Test image normalization to PIL, which needs no model"""

    def test_channel_first_tensor_is_transposed(self):
        img = torch.zeros(3, 40, 60, dtype=torch.uint8)

        assert fou_d1._prepare_image(img).size == (60, 40)

    def test_unit_float_array_is_scaled(self):
        img = np.full((8, 8, 3), 0.5, dtype=np.float32)
        out = np.asarray(fou_d1._prepare_image(img))

        assert out.max() == 127

    def test_path_is_loaded(self, tmp_path):
        path = str(tmp_path / "image.png")
        _image(12, 9).save(path)

        assert fou_d1._prepare_image(path).size == (12, 9)

    def test_small_images_are_not_resized(self):
        img = _image(12, 9)

        assert fou_d1._cap_pixels(img, 1000) is img
