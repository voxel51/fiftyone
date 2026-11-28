"""
Tests for fiftyone/utils/lightonocr.py config validation, output parsing,
data loading, batching and generation settings.

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
import fiftyone.core.labels as fol
import fiftyone.utils.lightonocr as fou_lo
from fiftyone.utils.lightonocr import (
    LightOnOCRGetItem,
    LightOnOCRModel,
    LightOnOCRModelConfig,
    LightOnOCROutputProcessor,
)
from decorators import drop_datasets

# The stand-in vocabulary: padding, the image token, and one token per
# character for all other text
PAD = 0
IMAGE_TOKEN = 1
IMAGE_TEXT = "<|image_pad|>"

# The stand-in image processor's patches and merge
PATCH = 4
MERGE = 2

# What the stand-in model reads on bright and dark pages
BRIGHT_PAGE = (
    "![title](100,50,900,120)\n# Report\n\n"
    "![text](100,150,900,400)\nRevenue rose 20%."
)
DARK_PAGE = (
    "![table](0,0,1000,500)\n<table><tr><td>1</td></tr></table>\n\n"
    "![table+](0,500,1000,1000)\n<table><tr><td>2</td></tr></table>"
)


def _image(w=16, h=16, shade=80):
    """A uniform grey RGB image of the given size and shade"""
    return PILImage.new("RGB", (w, h), color=(shade, shade, shade))


class _FakeTokenizer(object):
    """Encodes the image placeholder as the image token and every other
    character as a token of its own, and decodes those tokens back"""

    pad_token_id = PAD

    def __call__(self, text, add_special_tokens=False):
        """The image token for each placeholder and one token per other
        character"""
        ids = []
        for i, part in enumerate(text.split(IMAGE_TEXT)):
            if i:
                ids.append(IMAGE_TOKEN)

            ids.extend(10 + ord(c) for c in part)

        return {"input_ids": ids}

    def convert_tokens_to_ids(self, token):
        """The image token's ID for the image placeholder"""
        return IMAGE_TOKEN if token == IMAGE_TEXT else None

    def batch_decode(self, rows, skip_special_tokens=False):
        """Decodes each row's character tokens, skipping padding"""
        assert skip_special_tokens is True
        return [
            "".join(chr(int(i) - 10) for i in row if int(i) >= 10)
            for row in rows
        ]


class _FakeImageProcessor(object):
    """Cuts an image into 4x4 patches, each holding the image's brightness,
    which merge four to a token"""

    merge_size = MERGE

    def __init__(self):
        """Records the size of each image it patches"""
        self.sizes = []

    def __call__(self, images, return_tensors):
        """The patches of one image and their grid"""
        img = images[0]
        self.sizes.append(img.size)
        rows = MERGE * max(1, -(-img.height // (PATCH * MERGE)))
        cols = MERGE * max(1, -(-img.width // (PATCH * MERGE)))
        brightness = float(np.asarray(img).mean()) / 255
        grid = torch.tensor([[1, rows, cols]])
        pixel_values = torch.full((rows * cols, 3), brightness)
        return {"pixel_values": pixel_values, "image_grid_thw": grid}


class _FakeProcessor(object):
    """Renders a conversation as the user's image and text between role
    markers"""

    def __init__(self, image_tokens=1):
        """Builds the stand-in tokenizer and image processor"""
        self.tokenizer = _FakeTokenizer()
        self.image_processor = _FakeImageProcessor()
        self.image_tokens = image_tokens
        self.calls = []

    def apply_chat_template(self, conversation, **kwargs):
        """The image placeholder and the prompt text, if any"""
        self.calls.append((conversation, kwargs))
        (message,) = conversation
        text = "".join(item.get("text", "") for item in message["content"])
        return "<u>" + IMAGE_TEXT * self.image_tokens + text + "<a>"


class _FakeModel(object):
    """Reads bright pages as a title and text and dark ones as a table that
    continues, and checks that rows are padded on the left"""

    def __init__(self):
        """Records the number of rows and the settings of each call"""
        self.calls = []

    def to(self, device):
        """Stays where it is"""
        return self

    def eval(self):
        """Has no training mode"""
        return self

    def generate(
        self,
        input_ids,
        attention_mask,
        pixel_values,
        image_grid_thw,
        mm_token_type_ids,
        **kwargs,
    ):
        """The prompts followed by each page's output, padded to the
        longest"""
        self.calls.append((len(input_ids), kwargs))
        assert bool(attention_mask[:, -1].all())
        assert torch.equal(
            mm_token_type_ids, (input_ids == IMAGE_TOKEN).long()
        )
        outputs = []
        start = 0
        for grid in image_grid_thw:
            patches = int(grid.prod())
            bright = float(pixel_values[start : start + patches].mean()) > 0.5
            start += patches
            text = BRIGHT_PAGE if bright else DARK_PAGE
            outputs.append([10 + ord(c) for c in text])

        width = max(len(ids) for ids in outputs)
        generated = torch.full((len(outputs), width), PAD, dtype=torch.long)
        for i, ids in enumerate(outputs):
            generated[i, : len(ids)] = torch.tensor(ids)

        return torch.cat([input_ids, generated], dim=1)


@pytest.fixture
def stand_ins(monkeypatch):
    """Stand-ins for the checkpoint and its processor, loaded in place of the
    real ones"""
    processor = _FakeProcessor()
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
        fou_lo,
        "transformers",
        SimpleNamespace(
            AutoProcessor=SimpleNamespace(from_pretrained=load_processor),
            AutoModelForImageTextToText=SimpleNamespace(
                from_pretrained=load_model
            ),
        ),
    )
    return SimpleNamespace(processor=processor, model=model, loads=loads)


def _model(d=None):
    """A :class:`LightOnOCRModel` on the CPU with the config ``d``"""
    return LightOnOCRModel(LightOnOCRModelConfig(dict(d or {}, device="cpu")))


class TestLightOnOCRModelConfig:
    """Test config parsing and validation"""

    def test_defaults(self):
        """The 4B checkpoint reads pages in grounding mode, greedily, with
        the model card's image size"""
        config = LightOnOCRModelConfig({})

        assert config.name_or_path == "lightonai/LightOnOCR-3-4B"
        assert config.revision is None
        assert config.mode == "grounding"
        assert config.max_image_size == 2048
        assert config.max_new_tokens == 4096
        assert config.temperature == 0.0
        assert config.top_p == 0.9
        assert config.output_processor_cls is LightOnOCROutputProcessor
        assert config.raw_inputs is True

    @pytest.mark.parametrize(
        "d",
        [
            {"mode": "layout"},
            {"max_image_size": 0},
            {"max_new_tokens": 0},
            {"temperature": -0.1},
            {"top_p": 0},
            {"top_p": 1.5},
        ],
    )
    def test_invalid_settings_are_rejected(self, d):
        """An unknown mode, limits below one, a negative temperature and a
        top_p outside (0, 1] are rejected"""
        with pytest.raises(ValueError):
            LightOnOCRModelConfig(d)


class TestParseBlocks:
    """Test the parsing of grounding output"""

    def test_blocks_carry_label_box_and_text(self):
        """Each block's label, box relative to the image and content up to
        the next block are read in order"""
        blocks = fou_lo._parse_blocks(BRIGHT_PAGE)

        assert [b["label"] for b in blocks] == ["title", "text"]
        assert blocks[0]["box"] == pytest.approx([0.1, 0.05, 0.8, 0.07])
        assert blocks[0]["text"] == "# Report"
        assert blocks[1]["text"] == "Revenue rose 20%."
        assert not any(b["continuation"] for b in blocks)

    def test_content_may_follow_on_the_same_line(self):
        """Content on the line of its block's placeholder is read as the
        block's text, as the models emit it"""
        text = (
            '![header_image](116,26,230,52) logo "Ovis"\n\n'
            "![title](131,80,866,120) # Ovis-Embedding\n\n"
            "![chart](167,524,482,796) <table>\n<tr><td>1</td></tr>\n</table>"
        )

        blocks = fou_lo._parse_blocks(text)

        assert [b["label"] for b in blocks] == [
            "header_image",
            "title",
            "chart",
        ]
        assert [b["text"] for b in blocks] == [
            'logo "Ovis"',
            "# Ovis-Embedding",
            "<table>\n<tr><td>1</td></tr>\n</table>",
        ]

    def test_continuations_are_marked(self):
        """A label ending in ``+`` keeps its class and is marked as a
        continuation"""
        blocks = fou_lo._parse_blocks(DARK_PAGE)

        assert [b["label"] for b in blocks] == ["table", "table"]
        assert [b["continuation"] for b in blocks] == [False, True]

    def test_boxes_are_ordered_and_clipped(self):
        """Swapped corners are ordered and coordinates beyond the page are
        clipped to it"""
        (block,) = fou_lo._parse_blocks(
            "![image]( 900 , 200, -50,1200)\nA dog."
        )

        assert block["box"] == pytest.approx([0.0, 0.2, 0.9, 0.8])
        assert block["text"] == "A dog."

    def test_empty_boxes_and_stray_text_are_skipped(self):
        """Text before the first block and blocks with no area are
        dropped"""
        text = "stray\n![text](10,10,10,90)\nflat\n![text](0,0,500,500)\nok"

        blocks = fou_lo._parse_blocks(text)

        assert [b["text"] for b in blocks] == ["ok"]
        assert fou_lo._parse_blocks("") == []


class TestLightOnOCROutputProcessor:
    """Test the conversion of outputs to labels"""

    def test_grounding_outputs_become_detections(self):
        """Each block becomes a detection with its text and continuation
        flag"""
        (labels,) = LightOnOCROutputProcessor()([DARK_PAGE], None)

        assert isinstance(labels, fol.Detections)
        first, second = labels.detections
        assert first.label == "table"
        assert first.bounding_box == pytest.approx([0, 0, 1, 0.5])
        assert first.text == "<table><tr><td>1</td></tr></table>"
        assert first.continuation is False
        assert second.continuation is True

    def test_transcriptions_become_classifications(self):
        """A transcription becomes a classification, and an empty one
        none"""
        labels = LightOnOCROutputProcessor()(
            ["# Report", ""], None, mode="transcription"
        )

        assert labels[0].label == "# Report"
        assert labels[1] is None


class TestLightOnOCRGetItem:
    """Test the loading and encoding of each image"""

    def _get_item(self, stand_ins, max_image_size=2048):
        """A GetItem with the stand-in processor and a prompt holding one
        image token"""
        return LightOnOCRGetItem(
            stand_ins.processor.image_processor,
            [5, 6, IMAGE_TOKEN, 7],
            IMAGE_TOKEN,
            max_image_size=max_image_size,
        )

    def test_the_image_token_is_expanded(self, stand_ins):
        """The prompt holds one image token per merged patch"""
        item = self._get_item(stand_ins).encode(_image(16, 8))

        assert item["image_grid_thw"].tolist() == [[1, 2, 4]]
        assert item["input_ids"].tolist() == [5, 6, 1, 1, 7]
        assert item["pixel_values"].shape == (8, 3)

    def test_large_images_are_scaled_down(self, stand_ins):
        """An image whose longest side exceeds the limit is scaled down to
        it, keeping its aspect ratio, and smaller ones are kept"""
        get_item = self._get_item(stand_ins, max_image_size=64)

        get_item.encode(_image(256, 64))
        get_item.encode(_image(48, 32))

        assert stand_ins.processor.image_processor.sizes == [
            (64, 16),
            (48, 32),
        ]

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
        item = self._get_item(stand_ins).encode(img)

        assert stand_ins.processor.image_processor.sizes == [(24, 16)]
        assert float(item["pixel_values"][0, 0]) == pytest.approx(80 / 255)

    def test_files_are_encoded(self, stand_ins, tmp_path):
        """Calling the GetItem on a sample's filepath encodes that file"""
        path = str(tmp_path / "page.png")
        _image(32, 16).save(path)
        get_item = self._get_item(stand_ins)

        item = get_item({"filepath": path})

        assert get_item.required_keys == ["filepath"]
        assert item["image_grid_thw"].tolist() == [[1, 4, 8]]

    def test_survives_pickling(self, stand_ins):
        """The GetItem pickles for data loader workers"""
        get_item = pickle.loads(pickle.dumps(self._get_item(stand_ins)))

        item = get_item.encode(_image())

        assert item["input_ids"].tolist().count(IMAGE_TOKEN) == 4


class TestLightOnOCRCollate:
    """Test the padding of encoded images into batches"""

    def test_prompts_are_padded_on_the_left(self):
        """Shorter prompts are padded on the left, image tokens are marked
        and patches are concatenated"""
        collate = fou_lo._LightOnOCRCollate(PAD, IMAGE_TOKEN)
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


class TestLightOnOCRModel:
    """Test loading, prompting and generation against stand-ins"""

    def test_the_checkpoint_loads_in_its_own_precision_on_the_cpu(
        self, stand_ins
    ):
        """The processor and model load at the configured revision, in
        float32 on the CPU"""
        _model({"revision": "abc"})

        (_, p_args, p_kwargs), (_, m_args, m_kwargs) = stand_ins.loads
        assert p_args == m_args == ("lightonai/LightOnOCR-3-4B",)
        assert p_kwargs == {"revision": "abc"}
        assert m_kwargs == {"revision": "abc", "dtype": torch.float32}

    @pytest.mark.parametrize(
        "mode,content",
        [
            (
                "grounding",
                [{"type": "image"}, {"type": "text", "text": "grounding"}],
            ),
            ("transcription", [{"type": "image"}]),
        ],
    )
    def test_prompts_render_with_thinking_off(self, stand_ins, mode, content):
        """Each mode's prompt is rendered by the chat template with thinking
        off, the empty prompt as the image alone"""
        model = _model({"mode": mode})

        ((conversation, kwargs),) = stand_ins.processor.calls
        assert conversation == [{"role": "user", "content": content}]
        assert kwargs == {
            "add_generation_prompt": True,
            "tokenize": False,
            "enable_thinking": False,
        }
        assert model._prompt_ids.count(IMAGE_TOKEN) == 1

    def test_a_template_without_one_image_is_rejected(self, stand_ins):
        """A chat template that places no image, or several, is rejected"""
        stand_ins.processor.image_tokens = 2

        with pytest.raises(ValueError, match="one image"):
            _model()

    def test_pages_are_read_in_one_batch(self, stand_ins):
        """A batch of pages of different sizes is generated together, and
        each page's blocks come back in order"""
        model = _model()

        labels = model.predict_all([_image(16, 16, 240), _image(32, 8, 10)])

        assert [n for n, _ in stand_ins.model.calls] == [2]
        assert [d.label for d in labels[0].detections] == ["title", "text"]
        assert [d.label for d in labels[1].detections] == ["table", "table"]
        assert labels[0].detections[1].text == "Revenue rose 20%."

    def test_decoding_is_greedy_by_default(self, stand_ins):
        """Pages are decoded greedily with the KV cache on"""
        model = _model({"max_new_tokens": 64})

        model.predict(_image())

        ((_, kwargs),) = stand_ins.model.calls
        assert kwargs == {
            "max_new_tokens": 64,
            "use_cache": True,
            "pad_token_id": PAD,
            "do_sample": False,
        }

    def test_a_temperature_samples(self, stand_ins):
        """A positive temperature samples with it and top_p"""
        model = _model({"temperature": 0.2, "top_p": 0.8})

        model.predict(_image())

        ((_, kwargs),) = stand_ins.model.calls
        assert kwargs["do_sample"] is True
        assert kwargs["temperature"] == 0.2
        assert kwargs["top_p"] == 0.8

    def test_transcription_returns_classifications(self, stand_ins):
        """Transcription mode returns each page's output as a
        classification"""
        model = _model({"mode": "transcription"})

        label = model.predict(_image(shade=240))

        assert isinstance(label, fol.Classification)
        assert label.label == BRIGHT_PAGE


class TestLightOnOCRApplyModel:
    """Test that apply_model reads samples in padded batches"""

    @drop_datasets
    def test_samples_are_read_in_batches(self, stand_ins, tmp_path):
        """``apply_model`` labels every sample, in order, in batches of
        ``batch_size``"""
        model = _model()

        dataset = fo.Dataset()
        shades = [240, 10, 220]
        for i, shade in enumerate(shades):
            # Pages of different widths encode to prompts of different
            # lengths, which the batches pad
            path = str(tmp_path / ("%d.png" % i))
            _image(8 * (i + 1), 8, shade=shade).save(path)
            dataset.add_sample(fo.Sample(filepath=path))

        dataset.apply_model(
            model,
            label_field="ocr",
            batch_size=2,
            num_workers=0,
            skip_failures=False,
        )

        assert [n for n, _ in stand_ins.model.calls] == [2, 1]
        assert [s.ocr.detections[0].label for s in dataset] == [
            "title",
            "table",
            "title",
        ]
