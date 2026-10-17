"""
Tests for fiftyone/utils/ovis_embedding.py config validation, prompt
rendering, data loading, batching and pooling.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pickle
from types import SimpleNamespace

import numpy as np
import pytest
import torch
from PIL import Image as PILImage

import fiftyone as fo
import fiftyone.utils.ovis_embedding as fou_ovis
from fiftyone.utils.ovis_embedding import (
    DEFAULT_INSTRUCTION,
    DEFAULT_PROMPT_INSTRUCTION,
    OvisEmbeddingGetItem,
    OvisEmbeddingModel,
    OvisEmbeddingModelConfig,
)
from decorators import drop_datasets

# The stand-in vocabulary: padding, the image token, and one token per
# character for all other text
PAD = 0
IMAGE_TOKEN = 1
IMAGE_TEXT = "<|image_pad|>"

# The stand-in image processor's patches and merge, which make each visual
# token cover 8x8 pixels
PATCH = 4
MERGE = 2
FACTOR = PATCH * MERGE


def _image(w=16, h=16, shade=80):
    """A uniform grey RGB image of the given size and shade"""
    return PILImage.new("RGB", (w, h), color=(shade, shade, shade))


class _FakeTokenizer(object):
    """Encodes the image placeholder as the image token and every other
    character as a token of its own"""

    pad_token_id = PAD

    def __init__(self):
        """Records every text it encodes"""
        self.texts = []

    def __call__(self, text, add_special_tokens=False):
        """The image token for each placeholder and one token per other
        character"""
        self.texts.append(text)
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
    """Cuts an image into 4x4 patches, each holding the image's brightness,
    which merge four to a token"""

    patch_size = PATCH
    merge_size = MERGE

    def __init__(self):
        """Records the size of each image it patches"""
        self.sizes = []

    def __call__(self, images, do_resize, return_tensors):
        """The patches of one image and their grid; the image must already
        have been resized"""
        assert do_resize is False
        img = images[0]
        assert img.width % FACTOR == 0 and img.height % FACTOR == 0
        self.sizes.append(img.size)
        brightness = float(np.asarray(img).mean()) / 255
        grid = torch.tensor([[1, img.height // PATCH, img.width // PATCH]])
        pixel_values = torch.full((int(grid.prod()), 3), brightness)
        return {"pixel_values": pixel_values, "image_grid_thw": grid}


class _FakeModel(object):
    """Gives each row's last position its image's brightness, its number of
    tokens and a constant, and checks that rows are padded on the left"""

    def __init__(self):
        """Records the number of rows and whether images came with each
        call"""
        self.calls = []

    def to(self, device):
        """Stays where it is"""
        return self

    def eval(self):
        """Has no training mode"""
        return self

    def __call__(
        self,
        input_ids,
        attention_mask,
        pixel_values=None,
        image_grid_thw=None,
        mm_token_type_ids=None,
    ):
        """The final hidden states of a padded batch"""
        self.calls.append((len(input_ids), pixel_values is not None))
        assert bool(attention_mask[:, -1].all())
        brightness = torch.zeros(len(input_ids))
        if pixel_values is not None:
            assert torch.equal(
                mm_token_type_ids, (input_ids == IMAGE_TOKEN).long()
            )
            start = 0
            for row, grid in enumerate(image_grid_thw):
                patches = int(grid.prod())
                brightness[row] = pixel_values[start : start + patches].mean()
                start += patches

        hidden = torch.zeros((*input_ids.shape, 3))
        hidden[:, -1, 0] = brightness
        hidden[:, -1, 1] = attention_mask.sum(1).float()
        hidden[:, -1, 2] = 1.0
        return SimpleNamespace(last_hidden_state=hidden)


@pytest.fixture
def stand_ins(monkeypatch):
    """Stand-ins for the checkpoint and its processor, loaded in place of the
    real ones"""
    processor = SimpleNamespace(
        tokenizer=_FakeTokenizer(), image_processor=_FakeImageProcessor()
    )
    model = _FakeModel()
    loads = []

    def load_processor(*args, **kwargs):
        """Records the load's arguments and returns the stand-in"""
        loads.append(("processor", args, kwargs))
        return processor

    def load_model(*args, **kwargs):
        """Records the load's arguments and returns the stand-in"""
        loads.append(("model", args, kwargs))
        return model

    monkeypatch.setattr(
        fou_ovis,
        "transformers",
        SimpleNamespace(
            AutoProcessor=SimpleNamespace(from_pretrained=load_processor),
            AutoModel=SimpleNamespace(from_pretrained=load_model),
        ),
    )
    return SimpleNamespace(processor=processor, model=model, loads=loads)


def _model(d=None):
    """An :class:`OvisEmbeddingModel` on the CPU with the config ``d``"""
    return OvisEmbeddingModel(
        OvisEmbeddingModelConfig(dict(d or {}, device="cpu"))
    )


def _expected(brightness, tokens):
    """The normalized embedding the stand-in model gives a row"""
    v = np.array([brightness, tokens, 1.0])
    return v / np.linalg.norm(v)


class TestOvisEmbeddingModelConfig:
    """Test config parsing and validation"""

    def test_defaults(self):
        """The 2B checkpoint loads from its folder with the default image
        and prompt instructions, ms-swift's image token limits and raw
        inputs"""
        config = OvisEmbeddingModelConfig({})

        assert config.name_or_path == "ATH-MaaS/Ovis-VL-Embedding-2B"
        assert config.revision is None
        assert config.subfolder == "model"
        assert config.instruction == DEFAULT_INSTRUCTION
        assert config.prompt_instruction == DEFAULT_PROMPT_INSTRUCTION
        assert config.min_image_tokens == 4
        assert config.max_image_tokens == 1800
        assert config.prompt_batch_size == 32
        assert config.raw_inputs is True

    @pytest.mark.parametrize(
        "d",
        [
            {"instruction": "  "},
            {"prompt_instruction": ""},
            {"min_image_tokens": 0},
            {"min_image_tokens": 10, "max_image_tokens": 5},
            {"prompt_batch_size": 0},
        ],
    )
    def test_invalid_settings_are_rejected(self, d):
        """Empty instructions, token limits below one or inverted, and an
        empty prompt batch are rejected"""
        with pytest.raises(ValueError):
            OvisEmbeddingModelConfig(d)


class TestRender:
    """Test the rendering of inputs as ms-swift's template renders them"""

    def test_an_image_prompt(self):
        """The instruction is the system turn, the image the user turn, and
        an empty non-thinking answer and end-of-text close the prompt"""
        text = fou_ovis._render(DEFAULT_INSTRUCTION, fou_ovis._IMAGE_TEXT)

        assert text == (
            "<|im_start|>system\nRepresent the user's input.<|im_end|>\n"
            "<|im_start|>user\n<|vision_start|><|image_pad|><|vision_end|>"
            "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
            "<|endoftext|>"
        )

    def test_text_is_stripped(self):
        """The instruction and the input are stripped, as ms-swift strips
        system and user turns"""
        text = fou_ovis._render("  Find it. \n", "\n a dog  ")

        assert "system\nFind it.<|im_end|>" in text
        assert "user\na dog<|im_end|>" in text


class TestSmartResize:
    """Test the image sizes, which match qwen_vl_utils'"""

    @pytest.mark.parametrize(
        "size,expected",
        [
            ((480, 640), (480, 640)),
            ((375, 500), (384, 512)),
            ((3000, 4000), (1152, 1536)),
            ((10, 10), (64, 64)),
            ((17, 3000), (32, 3008)),
            ((1080, 1920), (992, 1792)),
            ((2160, 3840), (992, 1792)),
        ],
    )
    def test_sizes_match_qwen_vl_utils(self, size, expected):
        """Sides round to multiples of 32 and areas scale into 4 to 1,800
        tokens"""
        h, w = size
        assert (
            fou_ovis._smart_resize(h, w, 32, 4 * 32**2, 1800 * 32**2)
            == expected
        )

    def test_extreme_aspect_ratios_are_rejected(self):
        """An aspect ratio above 200 is rejected"""
        with pytest.raises(ValueError, match="aspect ratio"):
            fou_ovis._smart_resize(10, 2010, 32, 4096, 1843200)


class TestOvisEmbeddingGetItem:
    """Test the loading and encoding of each image"""

    def _get_item(self, stand_ins, max_tokens=1800):
        """A GetItem with the stand-in processor and a prompt holding one
        image token"""
        return OvisEmbeddingGetItem(
            stand_ins.processor.image_processor,
            [5, 6, IMAGE_TOKEN, 7],
            IMAGE_TOKEN,
            4 * FACTOR**2,
            max_tokens * FACTOR**2,
        )

    def test_the_image_token_is_expanded(self, stand_ins):
        """The prompt holds one image token per merged patch, and the image
        is resized to a multiple of the token size first"""
        get_item = self._get_item(stand_ins)

        item = get_item.encode(_image(30, 18))

        assert stand_ins.processor.image_processor.sizes == [(32, 16)]
        tokens = (32 // FACTOR) * (16 // FACTOR)
        assert item["input_ids"].tolist() == (
            [5, 6] + [IMAGE_TOKEN] * tokens + [7]
        )
        assert item["image_grid_thw"].tolist() == [[1, 4, 8]]
        assert item["pixel_values"].shape == (32, 3)

    def test_large_images_are_resized_to_the_token_limit(self, stand_ins):
        """An image above the token limit is scaled down to it"""
        get_item = self._get_item(stand_ins, max_tokens=4)

        get_item.encode(_image(160, 160))

        assert stand_ins.processor.image_processor.sizes == [(16, 16)]

    @pytest.mark.parametrize(
        "img",
        [
            np.full((16, 24, 3), 80, dtype=np.uint8),
            np.full((16, 24, 3), 80 / 255, dtype=np.float32),
            torch.full((3, 16, 24), 80, dtype=torch.uint8),
        ],
    )
    def test_arrays_and_tensors_are_encoded(self, stand_ins, img):
        """Channel-last arrays, 0-1 floats and channel-first tensors encode
        like the image they hold"""
        get_item = self._get_item(stand_ins)

        item = get_item.encode(img)

        assert stand_ins.processor.image_processor.sizes == [(24, 16)]
        assert float(item["pixel_values"][0, 0]) == pytest.approx(80 / 255)

    def test_files_are_encoded(self, stand_ins, tmp_path):
        """Calling the GetItem on a sample's filepath encodes that file"""
        path = str(tmp_path / "img.png")
        _image(32, 16).save(path)
        get_item = self._get_item(stand_ins)

        item = get_item({"filepath": path})

        assert get_item.required_keys == ["filepath"]
        assert item["image_grid_thw"].tolist() == [[1, 4, 8]]

    def test_small_images_are_resized_to_the_token_minimum(self, stand_ins):
        """An image below the token minimum is scaled up to it"""
        get_item = self._get_item(stand_ins)

        get_item.encode(_image(16, 8))

        assert stand_ins.processor.image_processor.sizes == [(24, 16)]

    def test_survives_pickling(self, stand_ins):
        """The GetItem pickles for data loader workers"""
        get_item = pickle.loads(pickle.dumps(self._get_item(stand_ins)))

        item = get_item.encode(_image())

        assert item["input_ids"].tolist().count(IMAGE_TOKEN) == 4


class TestOvisEmbeddingCollate:
    """Test the padding of encoded images into batches"""

    def test_prompts_are_padded_on_the_left(self):
        """Shorter prompts are padded on the left, image tokens are marked
        and patches are concatenated"""
        collate = fou_ovis._OvisEmbeddingCollate(PAD, IMAGE_TOKEN)
        items = [
            {
                "input_ids": torch.tensor([5, IMAGE_TOKEN, 7]),
                "pixel_values": torch.zeros((4, 3)),
                "image_grid_thw": torch.tensor([[1, 2, 2]]),
            },
            {
                "input_ids": torch.tensor([5, IMAGE_TOKEN, IMAGE_TOKEN, 7]),
                "pixel_values": torch.ones((8, 3)),
                "image_grid_thw": torch.tensor([[1, 2, 4]]),
            },
        ]

        batch = pickle.loads(pickle.dumps(collate))(items)

        assert batch["input_ids"].tolist() == [
            [PAD, 5, IMAGE_TOKEN, 7],
            [5, IMAGE_TOKEN, IMAGE_TOKEN, 7],
        ]
        assert batch["attention_mask"].tolist() == [[0, 1, 1, 1], [1, 1, 1, 1]]
        assert batch["mm_token_type_ids"].tolist() == [
            [0, 0, 1, 0],
            [0, 1, 1, 0],
        ]
        assert batch["pixel_values"].shape == (12, 3)
        assert batch["image_grid_thw"].tolist() == [[1, 2, 2], [1, 2, 4]]


class TestOvisEmbeddingModel:
    """Test loading, image and prompt embedding against stand-ins"""

    def test_the_checkpoint_loads_from_its_folder(self, stand_ins):
        """The model and processor load from the repository's folder at the
        configured revision, in float32 on the CPU"""
        _model({"revision": "abc"})

        (_, p_args, p_kwargs), (_, m_args, m_kwargs) = stand_ins.loads
        assert p_args == m_args == ("ATH-MaaS/Ovis-VL-Embedding-2B",)
        assert p_kwargs == {"revision": "abc", "subfolder": "model"}
        assert m_kwargs == {
            "revision": "abc",
            "subfolder": "model",
            "dtype": torch.float32,
        }

    def test_a_local_checkpoint_needs_no_folder(self, stand_ins):
        """An empty subfolder loads the directory itself"""
        _model({"name_or_path": "/models/ovis", "subfolder": ""})

        (_, _, p_kwargs), (_, _, m_kwargs) = stand_ins.loads
        assert "subfolder" not in p_kwargs
        assert "subfolder" not in m_kwargs

    def test_the_image_prompt_carries_the_instruction(self, stand_ins):
        """The image prompt is rendered with the configured instruction"""
        _model({"instruction": "Represent the given image."})

        (text,) = stand_ins.processor.tokenizer.texts
        assert text == fou_ovis._render(
            "Represent the given image.", fou_ovis._IMAGE_TEXT
        )

    def test_images_are_embedded_in_batches(self, stand_ins):
        """A batch of images of different sizes embeds in one pass, each
        image's row normalized and in order"""
        model = _model()

        embeddings = model.embed_all([_image(16, 16, 200), _image(32, 16, 40)])

        assert stand_ins.model.calls == [(2, True)]
        # The prompt's text tokens, then 4 and 8 image tokens
        prompt = len(stand_ins.processor.tokenizer.texts[0]) - len(IMAGE_TEXT)
        np.testing.assert_allclose(
            embeddings,
            [
                _expected(200 / 255, prompt + 4),
                _expected(40 / 255, prompt + 8),
            ],
            rtol=1e-5,
        )
        np.testing.assert_allclose(model.get_embeddings(), embeddings)

    def test_one_image_embeds_as_a_vector(self, stand_ins):
        """``embed`` returns one image's embedding"""
        model = _model()

        embedding = model.embed(_image(16, 16, 200))

        assert embedding.shape == (3,)
        assert np.linalg.norm(embedding) == pytest.approx(1.0)

    def test_embeddings_are_needed_before_they_are_read(self, stand_ins):
        """``get_embeddings`` before any image was embedded is an error"""
        with pytest.raises(ValueError):
            _model().get_embeddings()

    def test_prompts_are_embedded_in_batches(self, stand_ins):
        """Prompts embed ``prompt_batch_size`` at a time as queries for
        images"""
        model = _model({"prompt_batch_size": 2})
        stand_ins.processor.tokenizer.texts.clear()

        embeddings = model.embed_prompts(["a cat", "a dog", "two birds"])

        assert stand_ins.model.calls == [(2, False), (1, False)]
        assert stand_ins.processor.tokenizer.texts == [
            fou_ovis._render(DEFAULT_PROMPT_INSTRUCTION, p)
            for p in ["a cat", "a dog", "two birds"]
        ]
        assert embeddings.shape == (3, 3)
        np.testing.assert_allclose(
            np.linalg.norm(embeddings, axis=1), 1.0, rtol=1e-6
        )
        lengths = [len(t) for t in stand_ins.processor.tokenizer.texts]
        np.testing.assert_allclose(
            embeddings, [_expected(0, n) for n in lengths], rtol=1e-5
        )

    def test_prompts_use_the_prompt_instruction(self, stand_ins):
        """A prompt instruction set in the config is given with text"""
        model = _model({"prompt_instruction": "Find the image."})
        stand_ins.processor.tokenizer.texts.clear()

        model.embed_prompt("a dog")

        assert stand_ins.processor.tokenizer.texts == [
            fou_ovis._render("Find the image.", "a dog")
        ]

    def test_capabilities(self, stand_ins):
        """The model embeds images and prompts and pads its own batches"""
        model = _model()

        assert model.has_embeddings is True
        assert model.can_embed_prompts is True
        assert model.has_collate_fn is True
        assert model.ragged_batches is False


class TestOvisEmbeddingComputeEmbeddings:
    """Test that compute_embeddings loads and pads images in batches"""

    @drop_datasets
    def test_samples_are_embedded_in_batches(self, stand_ins, tmp_path):
        """``compute_embeddings`` embeds every sample, in order, in padded
        batches of ``batch_size``"""
        model = _model()

        dataset = fo.Dataset()
        shades = [240, 10, 220, 30, 200]
        for i, shade in enumerate(shades):
            # Images of different widths encode to prompts of different
            # lengths, which the batches pad
            path = str(tmp_path / ("%d.png" % i))
            _image(8 * (i + 1), 8, shade=shade).save(path)
            dataset.add_sample(fo.Sample(filepath=path))

        dataset.compute_embeddings(
            model,
            embeddings_field="ovis",
            batch_size=2,
            num_workers=0,
            skip_failures=False,
        )

        assert stand_ins.model.calls == [(2, True), (2, True), (1, True)]
        embeddings = np.stack(dataset.values("ovis"))
        expected = [
            model.embed(_image(8 * (i + 1), 8, s))
            for i, s in enumerate(shades)
        ]
        np.testing.assert_allclose(embeddings, expected, rtol=1e-5)
