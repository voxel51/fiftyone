"""
Tests for fiftyone/utils/d3.py config validation, data loading, batching and
output processing.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import contextlib
import json
import pickle
from types import SimpleNamespace

import numpy as np
import pytest
import torch
from PIL import Image as PILImage

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.utils.d3 as fou_d3
from fiftyone.utils.d3 import (
    DEFAULT_CHOICE_INSTRUCTIONS,
    DEFAULT_QUESTION_ID,
    DEFAULT_STATE,
    PINNED_REVISIONS,
    D3GetItem,
    D3Model,
    D3ModelConfig,
    D3OutputProcessor,
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

# The stand-in vocabulary: padding, the image token, and one token per
# character for all other text
PAD = 0
IMAGE_TOKEN = 1
IMAGE_TEXT = "<|image_pad|>"
VIDEO_TEXT = "<|video_pad|>"


def _softmax(values):
    """The softmax of ``values`` in float64"""
    values = np.asarray(values, dtype=np.float64)
    odds = np.exp(values - values.max())
    return odds / odds.sum()


def _image(w=24, h=16, shade=80):
    """A uniform grey RGB image of the given size and shade"""
    return PILImage.new("RGB", (w, h), color=(shade, shade, shade))


class _FakeTokenizer(object):
    """Encodes the image placeholder as the image token and every other
    character as a token of its own"""

    def __call__(self, text, add_special_tokens=False):
        """The image token for each placeholder and one token per other
        character"""
        ids = []
        for i, part in enumerate(text.split(IMAGE_TEXT)):
            if i:
                ids.append(IMAGE_TOKEN)

            ids.extend(10 + ord(c) % 80 for c in part)

        return {"input_ids": ids}

    def convert_tokens_to_ids(self, token):
        """The image token's ID for the image placeholder"""
        return IMAGE_TOKEN if token == IMAGE_TEXT else None


class _FakeImageProcessor(object):
    """Cuts an image into two rows of patches, two per 8 columns, each
    holding the image's brightness, which merge four to a token"""

    merge_size = 2

    def __call__(self, images, return_tensors):
        """The patches of one image and their grid"""
        img = images[0]
        brightness = float(np.asarray(img).mean()) / 255
        grid = torch.tensor([[1, 2, 2 * max(1, img.size[0] // 8)]])
        pixel_values = torch.full((int(grid.prod()), 2), brightness)
        return {"pixel_values": pixel_values, "image_grid_thw": grid}


class _FakeBackbone(object):
    """Fills each image token with its image's brightness"""

    def __init__(self):
        """Records the images of each vision call and the grids of each
        position call"""
        self.image_batches = []
        self.position_grids = []

    def get_input_embeddings(self):
        """Embeds every token as zero, which the image features overwrite"""
        return lambda input_ids: torch.zeros((*input_ids.shape, 1))

    def get_image_features(self, pixel_values, image_grid_thw, return_dict):
        """One feature per image token, holding its image's brightness"""
        self.image_batches.append(len(image_grid_thw))
        features = []
        start = 0
        for grid in image_grid_thw:
            patches = int(grid.prod())
            brightness = pixel_values[start : start + patches].mean()
            features.append(brightness.repeat(patches // 4, 1))
            start += patches

        return SimpleNamespace(pooler_output=tuple(features))

    def get_placeholder_mask(self, input_ids, inputs_embeds, image_features):
        """The positions of the image token, and no video positions"""
        mask = (input_ids == IMAGE_TOKEN).unsqueeze(-1)
        return mask.expand_as(inputs_embeds), None

    def compute_3d_position_ids(self, input_ids, image_grid_thw, **kwargs):
        """Plain positions on all three axes"""
        self.position_grids.append(image_grid_thw.tolist())
        b, width = input_ids.shape
        return torch.arange(width).expand(3, b, width)


class _FakeEncoder(object):
    """Gives every position of a row its image's brightness less a half"""

    def __init__(self):
        """Records the shape of each group it encodes"""
        self.calls = []

    def __call__(self, embeds, present, mrope):
        """Spreads each row's largest embedding, less a half, over the
        row"""
        self.calls.append(tuple(present.shape))
        assert present.shape == embeds.shape[:2] == mrope.shape[1:]
        brightness = embeds.amax(dim=1, keepdim=True) - 0.5
        return brightness.expand_as(embeds)


class _FakeRuntime(object):
    """Stands in for the release's runtime: bright images answer yes, the
    second option and the middle level; dark ones the first option"""

    def __init__(self):
        """Builds the stand-in processor, backbone and encoder, and a
        readout that favours the second answer code as the encoder's output
        rises"""
        self.processor = SimpleNamespace(
            tokenizer=_FakeTokenizer(), image_processor=_FakeImageProcessor()
        )
        self.backbone = _FakeBackbone()
        self.encoder = _FakeEncoder()
        readout = torch.zeros((255, 1))
        readout[0, 0] = -10.0
        readout[1, 0] = 10.0
        self.readout = readout
        self.temperature = 1.0
        self.pad_id = PAD
        self.max_length = None
        self.image_unavailable = None
        self.rendered = []

    def image_text(self, state, question, n_images):
        """The image placeholders, then the state and the instructions as
        JSON"""
        self.rendered.append((state, question))
        return (
            "<s>"
            + IMAGE_TEXT * n_images
            + json.dumps(state)
            + "|"
            + json.dumps(question["instructions"])
            + "?"
        )


def _normalize_question(question):
    """The question with its options in the release's order, false before
    true"""
    if question["type"] == "noul":
        keys = ["false", "true"]
    elif question["type"] == "choice":
        keys = list(question["criteria"])
    else:
        keys = [str(i) for i in range(len(question["criteria"]))]

    return SimpleNamespace(keys=keys, rendered=question)


RELEASE = SimpleNamespace(
    IMAGE_TOKEN=IMAGE_TEXT,
    VIDEO_TOKEN=VIDEO_TEXT,
    normalize_question=_normalize_question,
    sdpa_backends=lambda device: contextlib.nullcontext(),
)


@pytest.fixture
def runtime(monkeypatch):
    """A stand-in for the release, loaded in place of the real model"""
    runtime = _FakeRuntime()
    runtime.loads = []

    def from_pretrained(*args, **kwargs):
        """Records the load's arguments and returns the stand-in"""
        runtime.loads.append((args, kwargs))
        return SimpleNamespace(runtime=runtime)

    monkeypatch.setattr(
        fou_d3,
        "transformers",
        SimpleNamespace(
            AutoModel=SimpleNamespace(from_pretrained=from_pretrained)
        ),
    )
    monkeypatch.setattr(fou_d3, "_release_module", lambda runtime: RELEASE)
    return runtime


def _model(d):
    """A :class:`D3Model` on the CPU with the config ``d``"""
    return D3Model(D3ModelConfig(dict(d, device="cpu")))


class TestD3ModelConfig:
    """Test config parsing and the question schema it yields"""

    def test_defaults(self):
        """d3-flash loads at its pinned revision, with the default state,
        raw inputs and the d3 output processor"""
        config = D3ModelConfig({"classes": ["cat", "dog"]})

        assert config.name_or_path == "vllm-sr/d3-flash"
        assert config.revision == PINNED_REVISIONS["vllm-sr/d3-flash"]
        assert config.state == DEFAULT_STATE
        assert config.raw_inputs is True
        assert config.output_processor_cls is D3OutputProcessor

    @pytest.mark.parametrize("name", ["vllm-sr/d3", "vllm-sr/d3-mini"])
    def test_releases_load_their_pinned_revisions(self, name):
        """Each release loads at its own pinned revision"""
        config = D3ModelConfig({"classes": ["a", "b"], "name_or_path": name})

        assert config.revision == PINNED_REVISIONS[name]

    def test_other_repositories_have_no_default_revision(self):
        """Another repository or a local path gets no pinned revision"""
        config = D3ModelConfig(
            {"classes": ["cat", "dog"], "name_or_path": "/models/d3-local"}
        )

        assert config.revision is None

    def test_an_explicit_revision_is_kept(self):
        """A revision that is set replaces the pinned one"""
        config = D3ModelConfig({"classes": ["cat", "dog"], "revision": "main"})

        assert config.revision == "main"

    def test_classes_become_one_choice_question(self):
        """``classes`` become the options of one choice question asked with
        the default instructions"""
        config = D3ModelConfig({"classes": ["outdoor", "indoor"]})

        assert config.get_questions() == {
            DEFAULT_QUESTION_ID: {
                "type": "choice",
                "instructions": DEFAULT_CHOICE_INSTRUCTIONS,
                "criteria": {"outdoor": "outdoor", "indoor": "indoor"},
            }
        }

    def test_prompt_is_the_choice_instructions(self):
        """``prompt`` becomes the instructions of the question built from
        ``classes``"""
        config = D3ModelConfig({"classes": ["a", "b"], "prompt": "Pick one."})

        question = config.get_questions()[DEFAULT_QUESTION_ID]
        assert question["instructions"] == "Pick one."

    def test_questions_are_returned_as_given(self):
        """A valid schema is returned unchanged"""
        questions = {"has_person": NOUL, "animal": CHOICE, "sharp": SCORE}
        config = D3ModelConfig({"questions": questions})

        assert config.get_questions() == questions

    def test_json_state_is_kept(self):
        """A JSON state is kept as given"""
        state = {"task": "Inspect the shelf.", "store": 12}
        config = D3ModelConfig({"classes": ["a", "b"], "state": state})

        assert config.state == state

    def test_no_state_is_accepted(self):
        """A state of None is kept"""
        config = D3ModelConfig({"classes": ["a", "b"], "state": None})

        assert config.state is None

    @pytest.mark.parametrize("state", [float("nan"), {"x": {1, 2}}])
    def test_state_must_be_json(self, state):
        """A state that strict JSON cannot carry is rejected"""
        with pytest.raises(ValueError, match="state"):
            D3ModelConfig({"classes": ["a", "b"], "state": state})

    def test_neither_questions_nor_classes_is_rejected(self):
        """A config without questions or classes has nothing to ask"""
        with pytest.raises(ValueError, match="questions"):
            D3ModelConfig({}).get_questions()

    def test_both_questions_and_classes_is_rejected(self):
        """Questions and classes together are rejected"""
        config = D3ModelConfig(
            {"questions": {"q": NOUL}, "classes": ["a", "b"]}
        )

        with pytest.raises(ValueError, match="not both"):
            config.get_questions()

    @pytest.mark.parametrize(
        "classes",
        [["only"], ["a", "a"], [], [str(i) for i in range(256)], ["a", ""]],
    )
    def test_degenerate_classes_are_rejected(self, classes):
        """Classes must be 2 to 255 distinct, non-empty options"""
        with pytest.raises(ValueError, match="options"):
            D3ModelConfig({"classes": classes}).get_questions()

    def test_255_classes_are_accepted(self):
        """255 classes, one per answer code, are accepted"""
        classes = [str(i) for i in range(255)]
        config = D3ModelConfig({"classes": classes})

        question = config.get_questions()[DEFAULT_QUESTION_ID]
        assert list(question["criteria"]) == classes

    @pytest.mark.parametrize("question_id", ["has person", "1st", "a-b", ""])
    def test_question_id_must_be_a_field_name(self, question_id):
        """A question ID names a field, so it must be a valid field name"""
        config = D3ModelConfig({"questions": {question_id: NOUL}})

        with pytest.raises(ValueError, match="field name"):
            config.get_questions()

    def test_unknown_type_is_rejected(self):
        """Only noul, choice and score questions are answered"""
        config = D3ModelConfig(
            {"questions": {"q": {"type": "open", "instructions": "Why?"}}}
        )

        with pytest.raises(ValueError, match="type"):
            config.get_questions()

    @pytest.mark.parametrize(
        "criteria",
        [None, {}, ["a", "b"], {"": "Blank"}, {str(i): i for i in range(256)}],
    )
    def test_choice_needs_an_option_mapping(self, criteria):
        """A choice question needs a dict of 1 to 255 non-empty options"""
        question = {"type": "choice", "criteria": criteria}
        config = D3ModelConfig({"questions": {"q": question}})

        with pytest.raises(ValueError, match="criteria"):
            config.get_questions()

    def test_one_choice_option_is_accepted(self):
        """A choice question may have a single option"""
        question = {"type": "choice", "criteria": {"yes": "Approve"}}
        config = D3ModelConfig({"questions": {"q": question}})

        assert config.get_questions() == {"q": question}

    @pytest.mark.parametrize(
        "criteria", [None, ["only"], {"a": 1}, [str(i) for i in range(11)]]
    )
    def test_score_needs_two_to_ten_levels(self, criteria):
        """A score question needs a list of 2 to 10 levels"""
        question = {"type": "score", "criteria": criteria}
        config = D3ModelConfig({"questions": {"q": question}})

        with pytest.raises(ValueError, match="levels"):
            config.get_questions()

    def test_ten_score_levels_are_accepted(self):
        """Ten levels are accepted"""
        question = {"type": "score", "criteria": [str(i) for i in range(10)]}
        config = D3ModelConfig({"questions": {"q": question}})

        assert config.get_questions() == {"q": question}

    @pytest.mark.parametrize("criteria", [["low", "low"], ["", "high"]])
    def test_score_levels_must_be_distinct_and_non_empty(self, criteria):
        """Repeated or empty score levels are rejected"""
        question = {"type": "score", "criteria": criteria}
        config = D3ModelConfig({"questions": {"q": question}})

        with pytest.raises(ValueError, match="distinct"):
            config.get_questions()

    def test_noul_criteria_with_other_options_is_rejected(self):
        """A noul question's criteria may describe only true and false"""
        question = {"type": "noul", "criteria": {"maybe": "Unsure"}}
        config = D3ModelConfig({"questions": {"q": question}})

        with pytest.raises(ValueError, match="noul"):
            config.get_questions()

    def test_instructions_must_be_json(self):
        """Instructions that strict JSON cannot carry are rejected"""
        question = {"type": "noul", "instructions": {"limit": float("inf")}}
        config = D3ModelConfig({"questions": {"q": question}})

        with pytest.raises(ValueError, match="JSON"):
            config.get_questions()

    def test_model_rejects_a_missing_schema_before_loading(self, monkeypatch):
        """The schema is checked before any download is attempted"""

        def fail(*args, **kwargs):
            """Fails the test when a download is attempted"""
            raise AssertionError("download attempted")

        monkeypatch.setattr(
            fou_d3,
            "transformers",
            SimpleNamespace(AutoModel=SimpleNamespace(from_pretrained=fail)),
        )

        with pytest.raises(ValueError, match="questions"):
            D3Model(D3ModelConfig({}))


class TestD3GetItem:
    """Test loading and encoding one image, as a data loader worker does"""

    PROMPTS = [[5, IMAGE_TOKEN, 6, 7], [8, IMAGE_TOKEN, 9]]

    def _get_item(self, **kwargs):
        """A get item with the stand-in image processor and two prompts"""
        return D3GetItem(
            _FakeImageProcessor(), self.PROMPTS, IMAGE_TOKEN, **kwargs
        )

    def test_requires_the_filepath(self):
        """The image is located by the sample's filepath"""
        assert self._get_item().required_keys == ["filepath"]

    def test_filepath_can_come_from_another_field(self):
        """The filepath can be read from another field"""
        get_item = self._get_item(field_mapping={"filepath": "frame_path"})

        assert get_item.field_mapping == {"filepath": "frame_path"}

    def test_each_prompt_holds_the_images_tokens(self, tmp_path):
        """Each prompt's image placeholder expands to the image's tokens"""
        path = str(tmp_path / "image.png")
        _image(24, 16).save(path)

        item = self._get_item()({"filepath": path})

        # 2 x 6 patches merge to 3 tokens
        assert [ids.tolist() for ids in item["input_ids"]] == [
            [5] + [IMAGE_TOKEN] * 3 + [6, 7],
            [8] + [IMAGE_TOKEN] * 3 + [9],
        ]
        assert item["image_grid_thw"].tolist() == [[1, 2, 6]]
        assert item["pixel_values"].shape == (12, 2)

    def test_image_is_processed_once(self):
        """The image is processed once for all of its prompts"""
        item = self._get_item().encode(_image(40, 16))

        assert len(item["image_grid_thw"]) == 1
        assert item["pixel_values"].shape[0] == 20

    def test_a_prompt_over_the_limit_is_rejected(self):
        """A prompt longer than the model's limit is rejected rather than
        truncated"""
        get_item = self._get_item(max_length=7)

        with pytest.raises(ValueError, match="limit"):
            get_item.encode(_image(40, 16))

    def test_grayscale_files_load_as_rgb(self, tmp_path):
        """A grayscale file is read as RGB"""
        path = str(tmp_path / "gray.png")
        PILImage.new("L", (8, 6), color=90).save(path)

        item = self._get_item()({"filepath": path})

        assert item["pixel_values"][0, 0] == pytest.approx(90 / 255)

    def test_encodes_arrays_and_tensors(self):
        """Channel-last arrays and channel-first tensors are encoded"""
        get_item = self._get_item()

        from_array = get_item.encode(np.zeros((16, 24, 3), dtype=np.uint8))
        from_tensor = get_item.encode(
            torch.zeros(3, 16, 24, dtype=torch.uint8)
        )

        assert from_array["image_grid_thw"].tolist() == [[1, 2, 6]]
        assert from_tensor["image_grid_thw"].tolist() == [[1, 2, 6]]

    def test_survives_pickling(self, tmp_path):
        """Data loaders pickle it into workers they spawn"""
        path = str(tmp_path / "image.png")
        _image().save(path)
        get_item = self._get_item()

        item = pickle.loads(pickle.dumps(get_item))({"filepath": path})

        assert item["image_grid_thw"].tolist() == [[1, 2, 6]]


class TestD3Collate:
    """Test padding every image's prompts into one batch"""

    def test_prompts_are_padded_on_the_left(self, runtime):
        """Every prompt is padded on the left, and its attention mask covers
        the prompt alone"""
        model = _model({"questions": {"a": NOUL, "b": SCORE}})
        encode = model.build_get_item().encode
        items = [encode(_image(24, 16)), encode(_image(40, 16))]

        batch = model.collate_fn(items)

        rows = [ids.tolist() for item in items for ids in item["input_ids"]]
        width = max(len(ids) for ids in rows)
        assert batch["input_ids"].shape == (4, width)
        for row, mask, ids in zip(
            batch["input_ids"], batch["attention_mask"], rows
        ):
            pad = width - len(ids)
            assert row.tolist() == [PAD] * pad + ids
            assert mask.tolist() == [0] * pad + [1] * len(ids)

    def test_image_tokens_are_marked(self, runtime):
        """``mm_token_type_ids`` marks the image tokens"""
        model = _model({"questions": {"a": NOUL}})
        encode = model.build_get_item().encode

        batch = model.collate_fn([encode(_image(24, 16))])

        marked = batch["mm_token_type_ids"][0]
        assert (
            marked.tolist()
            == (batch["input_ids"][0] == IMAGE_TOKEN).long().tolist()
        )
        assert int(marked.sum()) == 3

    def test_each_image_keeps_one_copy_of_its_patches(self, runtime):
        """Each image's patches and grid appear once, however many prompts
        it has"""
        model = _model({"questions": {"a": NOUL, "b": NOUL}})
        encode = model.build_get_item().encode

        batch = model.collate_fn([encode(_image(24, 16)), encode(_image(40))])

        assert batch["image_grid_thw"].tolist() == [[1, 2, 6], [1, 2, 10]]
        assert batch["pixel_values"].shape == (32, 2)

    def test_survives_pickling(self, runtime):
        """Data loaders pickle it into workers they spawn"""
        model = _model({"questions": {"a": NOUL}})
        collate_fn = pickle.loads(pickle.dumps(model.collate_fn))

        batch = collate_fn([model.build_get_item().encode(_image())])

        assert batch["input_ids"].shape[0] == 1


class TestD3Model:
    """Test the model's prompts, batching hooks and predictions against a
    stand-in release"""

    def test_release_loads_with_its_own_code(self, runtime):
        """The release loads with its own code at the pinned revision on the
        configured device"""
        _model({"classes": ["a", "b"]})

        ((args, kwargs),) = runtime.loads
        assert args == ("vllm-sr/d3-flash",)
        assert kwargs == {
            "revision": PINNED_REVISIONS["vllm-sr/d3-flash"],
            "trust_remote_code": True,
            "device": "cpu",
        }

    def test_batches_are_padded_rather_than_ragged(self, runtime):
        """The model pads its own batches and can store logits"""
        model = _model({"classes": ["a", "b"]})

        assert model.ragged_batches is False
        assert model.has_collate_fn is True
        assert model.has_logits is True

    def test_prompts_are_rendered_with_the_state(self, runtime):
        """The release renders each prompt with the configured state"""
        _model({"questions": {"a": NOUL}, "state": {"task": "Inspect."}})

        ((state, question),) = runtime.rendered
        assert state == {"task": "Inspect."}
        assert question["instructions"] == NOUL["instructions"]

    def test_missing_instructions_use_the_question_id(self, runtime):
        """A question without instructions is asked by its ID"""
        _model({"questions": {"has_dog": {"type": "noul"}}})

        ((_, question),) = runtime.rendered
        assert question["instructions"] == "has_dog"

    def test_a_placeholder_in_the_state_is_rejected(self, runtime):
        """A state holding an image placeholder is rejected"""
        with pytest.raises(ValueError, match="placeholder"):
            _model({"classes": ["a", "b"], "state": "see " + IMAGE_TEXT})

    def test_a_release_without_vision_is_rejected(self, runtime):
        """A release that cannot read images is rejected"""
        runtime.image_unavailable = "no vision tower"

        with pytest.raises(ValueError, match="cannot read images"):
            _model({"classes": ["a", "b"]})

    def test_a_causal_release_is_rejected(self, runtime):
        """A release without a full-attention encoder is rejected"""
        runtime.encoder = None

        with pytest.raises(ValueError, match="causal"):
            _model({"classes": ["a", "b"]})

    def test_options_in_another_order_are_rejected(self, runtime, monkeypatch):
        """A release that lists the options in an unexpected order is
        rejected"""

        def reorder(question):
            """The release's question with its options reversed"""
            normalized = _normalize_question(question)
            normalized.keys = normalized.keys[::-1]
            return normalized

        monkeypatch.setattr(RELEASE, "normalize_question", reorder)

        with pytest.raises(ValueError, match="order"):
            _model({"questions": {"q": CHOICE}})

    def test_the_schema_is_copied(self, runtime):
        """Changing the given schema or the returned one leaves the model's
        schema unchanged"""
        questions = {"q": dict(NOUL)}
        model = _model({"questions": questions})

        questions["q"]["type"] = "score"
        model.questions["q"]["type"] = "choice"

        assert model.questions == {"q": NOUL}

    def test_images_run_as_one_batch(self, runtime):
        """A list of images runs as one vision call, with one encoder row
        per image and question"""
        model = _model({"questions": {"a": NOUL, "b": CHOICE}})

        labels = model.predict_all(
            [_image(shade=230), _image(40, 20, shade=20), _image(shade=230)]
        )

        # Each image is encoded once for both of its prompts
        assert runtime.backbone.image_batches == [3]
        assert sum(rows for rows, _ in runtime.encoder.calls) == 6
        assert [label["a"].label for label in labels] == [
            "true",
            "false",
            "true",
        ]
        assert [label["b"].label for label in labels] == [
            "ant",
            "zebra",
            "ant",
        ]

    def test_every_prompt_gets_its_images_positions(self, runtime):
        """Each prompt's positions are computed from its image's grid"""
        model = _model({"questions": {"a": NOUL, "b": NOUL}})

        model.predict_all([_image(24, 16), _image(40, 16)])

        assert runtime.backbone.position_grids == [
            [[1, 2, 6], [1, 2, 6], [1, 2, 10], [1, 2, 10]]
        ]

    def test_prompts_run_in_groups_of_similar_length(
        self, runtime, monkeypatch
    ):
        """Prompts run in groups of similar length within the token budget,
        each trimmed to its longest prompt, with unchanged answers"""
        model = _model({"questions": {"a": NOUL}})
        encode = model.build_get_item().encode
        short = len(encode(_image(24))["input_ids"][0])
        long = len(encode(_image(120))["input_ids"][0])
        images = [_image(24, shade=230), _image(120, shade=20)] * 2
        expected = [label.label for label in model.predict_all(images)]
        runtime.encoder.calls.clear()

        # Room for the two short prompts together, but not the two long ones
        monkeypatch.setattr(fou_d3, "_ENCODER_TOKENS", 2 * short + 1)
        labels = model.predict_all(images)

        # Each group is trimmed to its own longest prompt
        assert sorted(runtime.encoder.calls) == [
            (1, long),
            (1, long),
            (2, short),
        ]
        assert expected == ["true", "false", "true", "false"]
        assert [label.label for label in labels] == expected

    def test_a_padded_batch_is_used_as_given(self, runtime):
        """apply_model turns preprocessing off and passes the batches its data
        loader pads"""
        model = _model({"questions": {"a": NOUL}})
        encode = model.build_get_item().encode
        batch = model.collate_fn([encode(_image(shade=230)), encode(_image())])
        model.preprocess = False

        labels = model.predict_all(batch)

        assert [label.label for label in labels] == ["true", "false"]

    def test_predict_takes_a_tensor(self, runtime):
        """``predict`` takes a channel-first tensor"""
        model = _model({"questions": {"a": NOUL}})

        label = model.predict(torch.full((3, 16, 24), 230, dtype=torch.uint8))

        assert label.label == "true"

    def test_stored_logits_follow_the_callers_order(self, runtime):
        """Stored logits list the options in the order they were given"""
        model = _model({"questions": {"present": NOUL}})
        model.store_logits = True

        label = model.predict(_image(shade=230))

        # The release lists "false" first; the logits are stored as the
        # options are given, "true" first
        h = np.asarray(_image(shade=230)).mean() / 255 - 0.5
        assert label.label == "true"
        assert np.allclose(label.logits, [10 * h, -10 * h], atol=1e-5)

    def test_temperature_scales_the_logits(self, runtime):
        """The logits are divided by the release's temperature"""
        model = _model({"questions": {"present": NOUL}})
        model.store_logits = True
        runtime.temperature = 4.0

        label = model.predict(_image(shade=230))

        h = np.asarray(_image(shade=230)).mean() / 255 - 0.5
        expected = _softmax([2.5 * h, -2.5 * h])
        assert label.confidence == pytest.approx(expected[0], abs=1e-5)

    def test_filter_classes_keep_only_their_labels(self, runtime):
        """``filter_classes`` keeps only the labels it names"""
        model = _model({"questions": {"a": NOUL}, "filter_classes": ["true"]})

        labels = model.predict_all([_image(shade=230), _image(shade=20)])

        assert labels[0].label == "true"
        assert labels[1] is None


class TestD3ApplyModel:
    """Test that apply_model loads, pads and labels samples in batches"""

    @drop_datasets
    def test_samples_are_labelled_in_batches(self, runtime, tmp_path):
        """``apply_model`` labels every sample, with its logits, in padded
        batches"""
        model = _model({"classes": ["dark", "bright"]})

        dataset = fo.Dataset()
        shades = [240, 10, 220, 30, 200]
        for i, shade in enumerate(shades):
            # Images of different widths encode to prompts of different
            # lengths, which the batches pad
            path = str(tmp_path / ("%d.png" % i))
            _image(8 * (i + 1), 8, shade=shade).save(path)
            dataset.add_sample(fo.Sample(filepath=path))

        dataset.apply_model(
            model,
            label_field="tone",
            batch_size=2,
            num_workers=0,
            skip_failures=False,
            store_logits=True,
        )

        assert runtime.backbone.image_batches == [2, 2, 1]
        assert dataset.values("tone.label") == [
            "bright",
            "dark",
            "bright",
            "dark",
            "bright",
        ]
        assert len(dataset.first().tone.logits) == 2


class TestD3OutputProcessor:
    """Test the mapping from answer-code logits to labels"""

    def _process(self, questions, rows, processor=None, **kwargs):
        """Runs an output processor over the given rows"""
        processor = processor or D3OutputProcessor()
        return processor(
            torch.tensor(rows, dtype=torch.float32),
            None,
            questions=questions,
            **kwargs,
        )

    def test_choice_becomes_a_classification(self):
        """A choice answer becomes a classification of its most probable
        option, and codes past the options are ignored"""
        label = self._process({"q": CHOICE}, [[2.0, 0.0, -1.0, 9.0]])[0]

        assert isinstance(label, fol.Classification)
        assert label.label == "zebra"
        assert label.confidence == pytest.approx(_softmax([2.0, 0.0, -1.0])[0])
        assert label.logits is None

    def test_noul_reads_false_then_true(self):
        """A noul answer reads false from the first code and true from the
        second, and stores its logits true first"""
        label = self._process(
            {"q": NOUL},
            [[0.5, 3.0, 9.0]],
            D3OutputProcessor(store_logits=True),
        )[0]

        assert label.label == "true"
        assert label.confidence == pytest.approx(_softmax([3.0, 0.5])[0])
        assert np.allclose(label.logits, [3.0, 0.5])

    def test_score_becomes_the_expected_level(self):
        """A score answer becomes a regression on the expected level"""
        label = self._process({"q": SCORE}, [[0.0, 1.0, 2.0, 9.0]])[0]
        probabilities = _softmax([0.0, 1.0, 2.0])

        assert isinstance(label, fol.Regression)
        assert label.value == pytest.approx(
            float(np.dot([0, 1, 2], probabilities))
        )
        assert label.confidence == pytest.approx(probabilities.max())

    def test_each_image_reads_its_own_rows(self):
        """Each image's labels come from its own rows"""
        questions = {"a": NOUL, "b": NOUL}
        rows = [[0.0, 2.0], [2.0, 0.0], [2.0, 0.0], [0.0, 2.0]]

        labels = self._process(questions, rows)

        assert [(l["a"].label, l["b"].label) for l in labels] == [
            ("true", "false"),
            ("false", "true"),
        ]

    def test_confidence_threshold_drops_classifications(self):
        """A classification below the threshold is dropped"""
        label = self._process(
            {"q": NOUL}, [[0.0, 0.1]], confidence_thresh=0.9
        )[0]

        assert label is None

    def test_threshold_omits_dropped_answers_from_a_dict(self):
        """A dropped answer is left out of a dict of labels, and a score is
        kept"""
        questions = {"sure": NOUL, "unsure": NOUL, "sharp": SCORE}
        rows = [[0.0, 5.0, 0.0], [0.0, 0.1, 0.0], [0.0, 0.0, 0.0]]

        labels = self._process(questions, rows, confidence_thresh=0.9)[0]

        assert set(labels) == {"sure", "sharp"}

    def test_threshold_dict_saves_to_new_fields(self):
        """A dict without a dropped answer saves to new fields"""
        questions = {"sure": NOUL, "unsure": NOUL}
        labels = self._process(
            questions, [[0.0, 5.0], [0.0, 0.1]], confidence_thresh=0.9
        )[0]
        sample = fo.Sample(filepath="image.jpg")

        sample.add_labels(labels, label_field="d3")

        assert sample.d3_sure.label == "true"
        assert not sample.has_field("d3_unsure")

    def test_classes_drop_other_labels(self):
        """A classification outside ``classes`` is dropped"""
        label = self._process({"q": NOUL}, [[0.0, 2.0]], classes=["false"])[0]

        assert label is None

    def test_classes_omit_dropped_answers_from_a_dict(self):
        """An answer that ``classes`` drops is left out of a dict of labels,
        and a score is kept"""
        questions = {"yes": NOUL, "no": NOUL, "sharp": SCORE}
        rows = [[0.0, 2.0, 0.0], [2.0, 0.0, 0.0], [0.0, 0.0, 0.0]]

        labels = self._process(questions, rows, classes=["true"])[0]

        assert set(labels) == {"yes", "sharp"}

    def test_bfloat16_output_is_read(self):
        """bfloat16 output is read"""
        processor = D3OutputProcessor()

        label = processor(
            torch.tensor([[0.0, 2.0]], dtype=torch.bfloat16),
            None,
            questions={"q": NOUL},
        )[0]

        assert label.label == "true"


class TestD3Helpers:
    """Test image normalization and length grouping, which need no model"""

    def test_channel_first_tensor_is_transposed(self):
        """A channel-first tensor is transposed to channel-last"""
        img = torch.zeros(3, 40, 60, dtype=torch.uint8)

        assert fou_d3._prepare_image(img).size == (60, 40)

    def test_unit_float_array_is_scaled(self):
        """A float array in 0-1 is scaled to 0-255"""
        img = np.full((8, 8, 3), 0.5, dtype=np.float32)
        out = np.asarray(fou_d3._prepare_image(img))

        assert out.max() == 127

    def test_path_is_loaded(self, tmp_path):
        """An image path is loaded"""
        path = str(tmp_path / "image.png")
        _image(12, 9).save(path)

        assert fou_d3._prepare_image(path).size == (12, 9)

    def test_groups_hold_similar_lengths_within_the_budget(self):
        """Rows are grouped in ascending length while each group's padded
        size fits the budget"""
        groups = fou_d3._length_groups([30, 10, 25, 12, 11], 40)

        assert groups == [[1, 4, 3], [2], [0]]

    def test_a_row_over_the_budget_runs_alone(self):
        """A row longer than the budget forms a group of its own"""
        assert fou_d3._length_groups([50, 5], 40) == [[1], [0]]

    def test_every_row_is_grouped_once(self):
        """Every row lands in one group, and every group of several rows
        fits the budget"""
        lengths = [7, 3, 9, 3, 12, 1, 8, 8]

        groups = fou_d3._length_groups(lengths, 20)

        assert sorted(i for group in groups for i in group) == list(range(8))
        for group in groups:
            assert len(group) * max(lengths[i] for i in group) <= 20 or (
                len(group) == 1
            )
