"""
`Qwen3-VL <https://huggingface.co/collections/Qwen/qwen3-vl>`_
wrapper for the FiftyOne Model Zoo.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import logging
import os

import eta.core.video as etav

import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.models as fom
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)


def _ensure_qwen3_vl():
    fou.ensure_package("transformers>=4.57.0")
    fou.ensure_package("accelerate")
    # 0.0.14 double-applies smart_resize on frame-list videos
    # (QwenLM/Qwen3-VL#2045); harmless for embeddings.
    fou.ensure_package("qwen-vl-utils>=0.0.1")


transformers = fou.lazy_import("transformers", callback=_ensure_qwen3_vl)
qwen_vl_utils = fou.lazy_import("qwen_vl_utils", callback=_ensure_qwen3_vl)

from PIL import Image as PILImage


def merge_prepared_inputs(inputs_list, pad_token_id):
    """Merges per-clip processor outputs into ONE batched inputs mapping.

    ``input_ids``/``attention_mask`` are LEFT-padded: the embedding pools the
    hidden state at the LAST position, which right padding would replace with
    a pad token for every shorter row. Visual tensors concatenate along their
    first axis, which is how the model consumes multi-clip batches (one
    ``*_grid_thw`` row per clip indexes its patches).

    Returns ``None`` when a clip carries a key this merge does not
    understand, so the caller can fall back to one forward per clip rather
    than batch something subtly wrong.
    """
    keys = set(inputs_list[0].keys())
    for inputs in inputs_list[1:]:
        if set(inputs.keys()) != keys:
            return None

    pad_keys = {"input_ids", "attention_mask"}
    cat_keys = {
        "pixel_values_videos",
        "video_grid_thw",
        "pixel_values",
        "image_grid_thw",
    }
    if not pad_keys <= keys:
        return None

    max_len = max(int(i["input_ids"].shape[-1]) for i in inputs_list)
    merged = {}
    for key in keys:
        vals = [i[key] for i in inputs_list]
        if not all(isinstance(v, torch.Tensor) for v in vals):
            return None

        if key in pad_keys:
            fill = pad_token_id if key == "input_ids" else 0
            rows = []
            for v in vals:
                if v.ndim != 2 or v.shape[0] != 1:
                    return None

                rows.append(
                    torch.nn.functional.pad(
                        v, (max_len - v.shape[-1], 0), value=fill
                    )
                )

            merged[key] = torch.cat(rows, dim=0)
        elif key in cat_keys:
            merged[key] = torch.cat(vals, dim=0)
        else:
            return None

    return merged


#: Where a checkpoint keeps the language tower's weights, most specific first.
#: DISCOVERED rather than assumed: a wrong guess loads no weights at all, and a
#: freshly initialized tower still answers every prompt — with noise.
_TEXT_WEIGHT_PREFIXES = (
    "model.language_model.",
    "language_model.",
    "model.",
    "",
)

_SAFETENSORS_INDEX = "model.safetensors.index.json"
_SAFETENSORS_FILE = "model.safetensors"


def _checkpoint_index(name_or_path):
    """Returns a checkpoint's ``{weight name: shard file}`` map, or ``None``
    when it is one unsharded file."""
    # pylint: disable=import-error
    if os.path.isdir(name_or_path):
        path = os.path.join(name_or_path, _SAFETENSORS_INDEX)
        if not os.path.isfile(path):
            return None
    else:
        from huggingface_hub import hf_hub_download

        try:
            path = hf_hub_download(name_or_path, _SAFETENSORS_INDEX)
        except Exception as e:  # pylint: disable=broad-except
            # An unsharded repo has no index, which is the common case for the
            # smaller checkpoints; anything else fails on the read below
            logger.debug("no shard index for %s: %s", name_or_path, e)
            return None

    with open(path, "rt") as f:
        return json.load(f)["weight_map"]


def _shard_path(name_or_path, filename):
    """The local path of one checkpoint file, fetching it if needed."""
    if os.path.isdir(name_or_path):
        return os.path.join(name_or_path, filename)

    # pylint: disable=import-error
    from huggingface_hub import hf_hub_download

    return hf_hub_download(name_or_path, filename)


def _text_prefix(keys, wanted):
    """The prefix a checkpoint stores the text tower under.

    Every wanted weight must be present under it, so a prefix that happens to
    match a few names cannot be chosen over the one that holds the tower.
    """
    for prefix in _TEXT_WEIGHT_PREFIXES:
        if all(prefix + name in keys for name in wanted):
            return prefix

    raise ValueError(
        "This checkpoint holds no Qwen3-VL language tower under any known "
        "prefix (%s), so its text encoder cannot be loaded on its own"
        % ", ".join(repr(p) for p in _TEXT_WEIGHT_PREFIXES)
    )


def _materialize_buffers(model):
    """Recomputes the buffers a meta-device skeleton left empty.

    Non-persistent buffers — the rotary frequencies — are computed in their
    module's constructor and stored in no checkpoint, so loading one does not
    restore them; rebuilding the module that owns them does. Raises if anything
    is still empty afterwards, because a meta tensor that reaches the forward
    pass fails there instead, naming a device rather than a weight.
    """
    for name, module in list(model.named_modules()):
        if not any(b.is_meta for b in module.buffers(recurse=False)):
            continue

        # Rebuilding RE-INITIALIZES: a module holding its own weights would
        # come back with random ones, and the emptiness check below cannot
        # tell a fresh tensor from a loaded one
        if any(True for _ in module.parameters(recurse=False)):
            raise ValueError(
                "%s holds parameters as well as unmaterialized buffers, so "
                "rebuilding it would discard its weights"
                % (name or type(module).__name__)
            )

        parent, _, attr = name.rpartition(".")
        owner = model.get_submodule(parent) if parent else model
        setattr(owner, attr, type(module)(config=model.config))

    empty = [
        name
        for name, tensor in (
            *model.named_parameters(),
            *model.named_buffers(),
        )
        if tensor.is_meta
    ]
    if empty:
        raise ValueError(
            "The text tower was loaded with no values for %s" % empty
        )


def load_text_model(name_or_path, dtype=None, device=None):
    """Loads ONLY the language tower of a Qwen3-VL checkpoint.

    Encoding a prompt runs no part of the vision tower, so a process that will
    do nothing else need not hold it: this builds the text model alone and
    reads only its weights out of the checkpoint. On a sharded checkpoint the
    shards holding vision weights are never even fetched.

    The result is the same tower the full model calls for a text-only input —
    :class:`Qwen3VLModel` forwards text through ``language_model`` either way,
    and for input carrying no image the 3D rope positions the full model
    computes are the plain sequence positions the text model defaults to — so
    the vectors match those the full model produces.

    Args:
        name_or_path: a HuggingFace repo id or local checkpoint directory
        dtype (None): the dtype to load the weights in; the checkpoint's own
            if None
        device (None): the device to place the model on

    Returns:
        a ``transformers.Qwen3VLTextModel`` in eval mode
    """
    # pylint: disable=import-error
    from safetensors import safe_open

    config = transformers.AutoConfig.from_pretrained(name_or_path)
    text_config = getattr(config, "text_config", config)

    # Built on the meta device, since every parameter is REPLACED by one read
    # from the checkpoint below — materializing them first would cost the
    # tower's full size in host memory to then throw away
    with torch.device("meta"):
        model = transformers.Qwen3VLTextModel._from_config(text_config)

    wanted = set(model.state_dict())
    weight_map = _checkpoint_index(name_or_path)
    if weight_map is None:
        paths = [_shard_path(name_or_path, _SAFETENSORS_FILE)]
        with safe_open(paths[0], framework="pt") as f:
            prefix = _text_prefix(set(f.keys()), wanted)
    else:
        prefix = _text_prefix(set(weight_map), wanted)
        # Only the shards a wanted weight lives in. This is what a text-only
        # load saves on a cold box: the vision tower is not downloaded either
        shards = sorted(
            {
                shard
                for key, shard in weight_map.items()
                if key.startswith(prefix) and key[len(prefix) :] in wanted
            }
        )
        paths = [_shard_path(name_or_path, shard) for shard in shards]

    state = {}
    for path in paths:
        with safe_open(path, framework="pt") as f:
            for key in f.keys():
                name = key[len(prefix) :]
                if key.startswith(prefix) and name in wanted:
                    tensor = f.get_tensor(key)
                    state[name] = tensor if dtype is None else tensor.to(dtype)

    # ``assign`` makes the tensors just read BECOME the parameters; copying
    # them into the meta ones instead would raise, and is the whole reason the
    # skeleton could be built without allocating
    model.load_state_dict(state, strict=True, assign=True)
    _materialize_buffers(model)
    if device is not None:
        model = model.to(device)

    model.eval()
    logger.info(
        "loaded the text tower of %s from %d shard(s), skipping its vision "
        "tower",
        name_or_path,
        len(paths),
    )
    return model


DEFAULT_QWEN3_VL_MODEL = "Qwen/Qwen3-VL-2B-Instruct"
DEFAULT_QWEN3_VL_EMBEDDING_MODEL = "Qwen/Qwen3-VL-Embedding-2B"
DEFAULT_DETECTION_PROMPT = (
    "Detect all objects in this image. "
    "Report bbox coordinates in JSON format as a list of "
    '{"label": "<class>", "bbox_2d": [x1, y1, x2, y2]} objects.'
)


class Qwen3VLOutputProcessor(fout.OutputProcessor):
    """Output processor for Qwen3-VL detection models.

    Parses JSON bounding box output and converts to
    :class:`fiftyone.core.labels.Detections` instances.
    """

    def __call__(self, output, frame_size, confidence_thresh=None, **kwargs):
        """Processes model output into detections.

        Args:
            output: a list of raw model output strings (JSON with bbox_2d)
            frame_size: a ``(width, height)`` tuple
            confidence_thresh: optional confidence threshold (unused for VLM)
            **kwargs: additional keyword arguments

        Returns:
            a list of :class:`fiftyone.core.labels.Detections` instances
        """
        results = []
        for raw_output in output:
            detections = self._parse_detections(raw_output, frame_size)
            results.append(fol.Detections(detections=detections))
        return results

    def _parse_detections(self, raw_output, frame_size):
        """Parse raw model output into Detection objects."""
        detections = []

        json_str = raw_output.strip()

        if not json_str or json_str.lower() in (
            "there are none.",
            "none",
            "no objects detected",
            "[]",
        ):
            return detections

        try:
            # Model wraps JSON output in markdown code blocks
            if json_str.startswith("```json"):
                json_str = json_str[7:]
            if json_str.startswith("```"):
                json_str = json_str[3:]
            if json_str.endswith("```"):
                json_str = json_str[:-3]
            json_str = json_str.strip()

            if not (json_str.startswith("[") or json_str.startswith("{")):
                return detections

            parsed = json.loads(json_str)
            if not isinstance(parsed, list):
                parsed = [parsed]

        except (json.JSONDecodeError, ValueError) as e:
            logger.debug("Could not parse model output: %s", e)
            return detections

        for obj in parsed:
            if not isinstance(obj, dict):
                continue

            label = obj.get("label", "object")
            bbox = obj.get("bbox_2d")

            if bbox is None or len(bbox) != 4:
                continue

            x1, y1, x2, y2 = bbox
            # Qwen3-VL outputs bbox_2d in 0-1000 normalized scale, convert to 0-1
            x1 = float(np.clip(x1 / 1000.0, 0.0, 1.0))
            y1 = float(np.clip(y1 / 1000.0, 0.0, 1.0))
            x2 = float(np.clip(x2 / 1000.0, 0.0, 1.0))
            y2 = float(np.clip(y2 / 1000.0, 0.0, 1.0))

            w = x2 - x1
            h = y2 - y1

            if w <= 0 or h <= 0:
                continue

            detections.append(
                fol.Detection(
                    label=str(label),
                    bounding_box=[x1, y1, w, h],
                )
            )

        return detections


class Qwen3VLModelConfig(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running a :class:`Qwen3VLModel`.

    Args:
        name_or_path ("Qwen/Qwen3-VL-2B-Instruct"): the HuggingFace model path
        prompt (None): the detection prompt; if None, uses default
        classes (None): list of classes to detect; if provided, added to prompt
        max_new_tokens (4096): maximum tokens to generate
        embedding_dim (None): output embedding dimension for MRL truncation;
            if None, uses full model dimension (2048 for 2B, 3584 for 8B)
        normalize_embeddings (True): whether to L2 normalize embeddings
        video_fps (2.0): frame sampling rate for video inputs; Qwen3-VL's
            default is 2.0 FPS. Lower values = fewer frames = faster
        max_video_frames (128): maximum frames to sample from a video;
            prevents OOM on long videos. Matches qwen-vl-utils MAX_FRAMES.
        mode (None): the media type mode, "image" or "video"; if None,
            defaults to the dataset's media type at inference time
        text_only (False): whether to load ONLY the language tower, for a
            model that will do nothing but :meth:`Qwen3VLModel.embed_prompt`.
            The vision tower's weights are then neither downloaded nor
            resident, and every image/video method raises
    """

    def __init__(self, d):
        d = self.init(d)
        super().__init__(d)

        self.name_or_path = self.parse_string(
            d, "name_or_path", default=DEFAULT_QWEN3_VL_MODEL
        )
        self.prompt = self.parse_string(d, "prompt", default=None)
        self.classes = self.parse_array(d, "classes", default=None)
        self.max_new_tokens = self.parse_int(d, "max_new_tokens", default=4096)
        self.embedding_dim = self.parse_int(d, "embedding_dim", default=None)
        self.normalize_embeddings = self.parse_bool(
            d, "normalize_embeddings", default=True
        )
        self.video_fps = self.parse_number(d, "video_fps", default=2.0)
        if self.video_fps <= 0:
            raise ValueError(
                f"video_fps must be positive, got {self.video_fps}"
            )
        self.max_video_frames = self.parse_int(
            d, "max_video_frames", default=128
        )
        if self.max_video_frames <= 0:
            raise ValueError(
                f"max_video_frames must be positive, got {self.max_video_frames}"
            )
        self.mode = self.parse_string(d, "mode", default=None)
        if self.mode is not None and self.mode not in ("image", "video"):
            raise ValueError(
                "mode must be 'image', 'video', or None; got %r" % self.mode
            )

        self.text_only = self.parse_bool(d, "text_only", default=False)
        # Refused rather than ignored: an output processor means this instance
        # was configured to generate from images, which a model with no vision
        # tower cannot do at all
        if self.text_only and (
            d.get("output_processor") is not None
            or d.get("output_processor_cls") is not None
        ):
            raise ValueError(
                "text_only loads no vision tower, so it cannot be combined "
                "with an output processor. Load an embedding model "
                "(e.g. qwen3-vl-embedding-2b-torch) instead"
            )

        self.raw_inputs = True


class Qwen3VLModel(fout.TorchImageModel, fom.EmbeddingsMixin, fom.PromptMixin):
    """Wrapper for running inference with Qwen3-VL models.

    Qwen3-VL is a vision-language model family that supports:

    -   **Detection mode**: Uses Qwen3-VL-Instruct models to detect objects
        and return bounding box coordinates via 2D grounding.
    -   **Embedding mode**: Uses Qwen3-VL-Embedding models to generate
        multimodal embeddings for similarity search and retrieval.

    Detection example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=5, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("qwen3-vl-2b-instruct-torch")

        dataset.apply_model(model, label_field="qwen_detections")

        session = fo.launch_app(dataset)

    Detect specific classes::

        model = foz.load_zoo_model(
            "qwen3-vl-2b-instruct-torch",
            classes=["person", "car", "dog"],
        )

    Embedding example::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset(
            "quickstart", max_samples=5, shuffle=True, seed=51
        )

        model = foz.load_zoo_model("qwen3-vl-embedding-2b-torch")

        dataset.compute_embeddings(model, embeddings_field="qwen_embeddings")

    Args:
        config: a :class:`Qwen3VLModelConfig`
    """

    def __init__(self, config):
        self._processor = None
        self._mode = config.mode
        self._warned_unmergeable = False
        super().__init__(config)

    @property
    def mode(self):
        return self._mode

    @mode.setter
    def mode(self, value):
        if value not in (None, "image", "video"):
            raise ValueError(
                "mode must be 'image', 'video', or None; got %r" % value
            )
        self._mode = value

    @property
    def has_embeddings(self):
        # A text-only load holds no vision tower, so it embeds no media
        return self._output_processor is None and not self.config.text_only

    @property
    def can_embed_prompts(self):
        return self._output_processor is None

    def _require_vision(self):
        """Refuses the media paths of a model loaded without a vision tower."""
        if self.config.text_only:
            raise ValueError(
                "This model was loaded with text_only=True, so it holds no "
                "vision tower and can only embed prompts. Load it without "
                "text_only to embed images or video"
            )

    def _download_model(self, config):
        pass

    def _load_model(self, config):
        model_cls = transformers.Qwen3VLForConditionalGeneration
        dtype = torch.bfloat16 if self._using_gpu else torch.float32

        if config.text_only:
            # The processor still comes from the same checkpoint: it is the
            # chat template and tokenizer, which are kilobytes
            self._processor = transformers.AutoProcessor.from_pretrained(
                config.name_or_path
            )
            return load_text_model(
                config.name_or_path, dtype=dtype, device=self._device
            )

        # HuggingFace models loaded with `device_map="auto"` may end up on an
        # unexpected GPU in multi-GPU environments. If the user explicitly
        # requested a device via `device=...`, honor it by disabling auto
        # device mapping and moving the model to `self._device`.
        device_map = None
        if self._using_gpu:
            device_map = "auto" if config.device is None else None

        model = model_cls.from_pretrained(
            config.name_or_path,
            torch_dtype=dtype,
            device_map=device_map,
        )

        if device_map is None:
            model = model.to(self._device)
        model.eval()

        self._processor = transformers.AutoProcessor.from_pretrained(
            config.name_or_path
        )

        return model

    @property
    def media_type(self):
        return self._mode or "image"

    def _get_prompt(self):
        if self.config.prompt is not None:
            return self.config.prompt

        if self.config.classes is not None:
            classes_str = ", ".join(self.config.classes)
            return (
                f"Detect all instances of: {classes_str}. "
                "Report bbox coordinates in JSON format as a list of "
                '{"label": "<class>", "bbox_2d": [x1, y1, x2, y2]} objects.'
            )

        return DEFAULT_DETECTION_PROMPT

    def _forward_pass(self, imgs):
        self._require_vision()
        if self._output_processor is None:
            return self._embed_images(imgs)
        else:
            return self._generate_detections(imgs)

    def _generate_detections(self, imgs):
        """Generate detection output via text generation."""
        prompt = self._get_prompt()
        results = []

        for img in imgs:
            img = self._prepare_image(img)

            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": img},
                        {"type": "text", "text": prompt},
                    ],
                }
            ]

            inputs = self._processor.apply_chat_template(
                messages,
                tokenize=True,
                add_generation_prompt=True,
                return_dict=True,
                return_tensors="pt",
            )
            inputs = inputs.to(self._model.device)

            generated_ids = self._model.generate(
                **inputs,
                max_new_tokens=self.config.max_new_tokens,
                do_sample=False,
            )

            generated_ids_trimmed = [
                out_ids[len(in_ids) :]
                for in_ids, out_ids in zip(inputs["input_ids"], generated_ids)
            ]

            text = self._processor.batch_decode(
                generated_ids_trimmed,
                skip_special_tokens=True,
                clean_up_tokenization_spaces=False,
            )[0]

            results.append(text)

        return results

    def _embed_images(self, imgs):
        """Generate embeddings via hidden state extraction."""
        embeddings = []

        for img in imgs:
            img = self._prepare_image(img)

            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": img},
                    ],
                }
            ]

            inputs = self._processor.apply_chat_template(
                messages,
                tokenize=True,
                add_generation_prompt=False,
                return_dict=True,
                return_tensors="pt",
            )
            inputs = inputs.to(self._model.device)

            with torch.no_grad():
                outputs = self._model(
                    **inputs,
                    output_hidden_states=True,
                    return_dict=True,
                )

            embeddings.append(self._postprocess_embedding(outputs))

        return np.vstack(embeddings)

    @staticmethod
    def _final_hidden(outputs):
        """The last layer's hidden states, however the loaded model reports
        them.

        The full model is asked for the whole stack, whose last entry is the
        normed output; a text tower loaded on its own returns that same tensor
        as ``last_hidden_state``.
        """
        hidden = getattr(outputs, "hidden_states", None)
        if hidden:
            return hidden[-1]

        return outputs.last_hidden_state

    def _postprocess_embedding(self, outputs):
        last_hidden = self._final_hidden(outputs)
        embedding = last_hidden[:, -1, :]

        if self.config.embedding_dim is not None:
            embedding = embedding[:, : self.config.embedding_dim]

        if self.config.normalize_embeddings:
            embedding = torch.nn.functional.normalize(embedding, p=2, dim=-1)

        return embedding.float().cpu().numpy()

    def _prepare_image(self, img):
        """Convert image to PIL format for processor."""
        if isinstance(img, torch.Tensor):
            img = img.cpu().numpy()
            # Transpose CHW to HWC if first dim is channels and last dim is not
            if img.shape[0] in (1, 3, 4) and img.shape[2] not in (1, 3, 4):
                img = np.transpose(img, (1, 2, 0))

        if isinstance(img, np.ndarray) and np.issubdtype(
            img.dtype, np.floating
        ):
            if img.max() <= 1.0:
                img = img * 255.0
            img = np.clip(img, 0, 255).astype(np.uint8)

        if isinstance(img, np.ndarray):
            img = PILImage.fromarray(img)

        return img

    def embed(self, arg):
        """Generate embedding for a single image or video.

        Args:
            arg: a PIL image, numpy array, torch tensor, or an active
                (entered) ``eta.core.video.FFmpegVideoReader`` context
                manager

        Returns:
            a 1D numpy array embedding
        """
        if isinstance(arg, etav.FFmpegVideoReader):
            return self._embed_video(arg)

        return self.embed_all([arg])[0]

    def embed_all(self, args):
        """Generate embeddings for multiple images.

        Args:
            args: an iterable of PIL images, numpy arrays, or torch tensors

        Returns:
            a ``num_images x embedding_dim`` numpy array
        """
        return self._predict_all(args)

    def embed_frames(self, frames, fps=None, subsample=True):
        """Generates a single embedding for an ordered list of in-memory
        frames.

        The frames are treated as one clip and embedded together via
        Qwen3-VL's native video input, yielding a single vector that
        captures their full temporal context. This is the in-memory
        counterpart to passing an ``eta.core.video.FFmpegVideoReader`` to
        :meth:`embed`, for callers that already hold decoded frames.

        By default the frames are subsampled toward ``config.video_fps``
        (treating ``fps`` as the source rate) and capped at
        ``config.max_video_frames``, matching how :meth:`embed` handles a
        video file. Pass ``subsample=False`` when the frames are ALREADY the
        intended selection — e.g. every frame in a fixed time window — so
        they are embedded as given.

        Args:
            frames: an ordered iterable of in-memory frames (PIL images,
                numpy arrays, or torch tensors)
            fps (None): the rate the frames were sampled at. When
                ``subsample`` is True this is the source rate that decides
                how aggressively to subsample; when False it is reported to
                the model as the clip's playback rate and nothing else. If
                ``None`` or non-positive, ``config.video_fps`` is reported
                as the playback rate
            subsample (True): whether ``fps`` may be used to thin the frames
                toward ``config.video_fps``. When False every frame is
                embedded, subject only to ``config.max_video_frames``

        Returns:
            a 1D numpy array embedding
        """
        return self.embed_prepared(
            self.prepare_frames(frames, fps=fps, subsample=subsample)
        )

    def prepare_frames(self, frames, fps=None, subsample=True):
        """The CPU half of :meth:`embed_frames`: thins, converts and runs the
        processor over one clip, returning host-side model inputs.

        Split from the forward pass so a pipeline can prepare clip N+1 on
        another thread while clip N is on the device — the processor is the
        expensive, GIL-releasing part of a clip embed.

        Args:
            frames: an ordered iterable of in-memory frames
            fps (None): as :meth:`embed_frames`
            subsample (True): as :meth:`embed_frames`

        Returns:
            an opaque inputs object for :meth:`embed_prepared`
        """
        self._require_vision()
        frames = list(frames)
        if not frames:
            raise ValueError("Cannot embed an empty list of frames")

        sample_fps = self.config.video_fps
        cap = self.config.max_video_frames

        has_fps = fps is not None and fps > 0

        if not subsample:
            # These frames ARE the selection, so only the model's frame cap
            # may thin them — by a uniform stride rather than truncation, so
            # the kept frames still span the whole clip
            step = max(1, -(-len(frames) // cap))
        elif has_fps and sample_fps > 0:
            step = max(1, round(fps / sample_fps))
        else:
            step = 1

        sampled = []
        for i in range(0, len(frames), step):
            sampled.append(self._prepare_image(frames[i]))
            if len(sampled) >= cap:
                break

        effective_fps = fps / step if has_fps else sample_fps

        return self._prepare_frame_list(sampled, effective_fps)

    def embed_prepared(self, inputs):
        """The GPU half of :meth:`embed_frames`: forwards one
        :meth:`prepare_frames` clip and returns a 1D numpy array embedding."""
        self._require_vision()
        inputs = {
            k: v.to(self._model.device) if hasattr(v, "to") else v
            for k, v in inputs.items()
        }

        with torch.no_grad():
            outputs = self._model(
                **inputs,
                output_hidden_states=True,
                return_dict=True,
            )

        return self._postprocess_embedding(outputs).squeeze(0)

    def embed_prepared_all(self, inputs_list):
        """Forwards several :meth:`prepare_frames` clips as ONE batch and
        returns a ``(num_clips, embedding_dim)`` numpy array.

        Per-clip forwards pay a launch train and the Python round-trip per
        window; batching amortizes both, which is what keeps a fast device
        busy on short clips. Clips whose inputs cannot be merged fall back
        to one forward each, so a processor-version drift degrades to the
        serial speed rather than to wrong vectors.
        """
        self._require_vision()
        if len(inputs_list) == 1:
            return self.embed_prepared(inputs_list[0])[None, :]

        pad_id = getattr(self._processor.tokenizer, "pad_token_id", None)
        if pad_id is None:
            pad_id = getattr(self._processor.tokenizer, "eos_token_id", 0)

        merged = merge_prepared_inputs(inputs_list, pad_id)
        if merged is None:
            if not self._warned_unmergeable:
                self._warned_unmergeable = True
                logger.warning(
                    "prepared clip inputs are not batchable with this "
                    "processor version; embedding one clip per forward"
                )

            return np.stack(
                [self.embed_prepared(i) for i in inputs_list], axis=0
            )

        merged = {
            k: v.to(self._model.device) if hasattr(v, "to") else v
            for k, v in merged.items()
        }
        with torch.no_grad():
            outputs = self._model(
                **merged,
                output_hidden_states=True,
                return_dict=True,
            )

        return self._postprocess_embedding(outputs)

    def embed_prompt(self, prompt):
        """Generates an embedding for the given text prompt.

        Args:
            prompt: a text string

        Returns:
            a numpy vector
        """
        return self.embed_prompts([prompt])[0]

    def embed_prompts(self, prompts):
        """Generates embeddings for the given text prompts.

        Args:
            prompts: an iterable of text strings

        Returns:
            a ``num_prompts x num_dims`` array of prompt embeddings
        """
        return self._embed_prompts(prompts)

    def _embed_prompts(self, prompts):
        """Generate embeddings for text prompts.

        Uses the same chat template and hidden-state extraction as
        image embedding so text and image vectors share the same
        embedding space.
        """
        prompts = list(prompts)
        if not prompts:
            raise ValueError("prompts must contain at least one text string")

        embeddings = []

        for text in prompts:
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": text},
                    ],
                }
            ]

            inputs = self._processor.apply_chat_template(
                messages,
                tokenize=True,
                add_generation_prompt=False,
                return_dict=True,
                return_tensors="pt",
            )
            inputs = inputs.to(self._model.device)

            # A text tower returns its final hidden state as a matter of
            # course, so the stack is asked for only where it is the only way
            # to reach it
            extra = (
                {} if self.config.text_only else {"output_hidden_states": True}
            )
            with torch.no_grad():
                outputs = self._model(**inputs, return_dict=True, **extra)

            embeddings.append(self._postprocess_embedding(outputs))

        return np.vstack(embeddings)

    def _embed_video(self, video_reader):
        """Generate a single embedding for a video via native Qwen3-VL video input.

        Samples frames at ``config.video_fps`` and passes them as a video
        message to Qwen3-VL, which processes the full temporal context
        and returns one embedding vector.

        Args:
            video_reader: an ``eta.core.video.FFmpegVideoReader``

        Returns:
            a 1D numpy array embedding
        """
        self._require_vision()
        raw_fps = video_reader.frame_rate
        sample_fps = self.config.video_fps

        if raw_fps > 0 and sample_fps > 0:
            step = max(1, round(raw_fps / sample_fps))
        else:
            step = 1

        frames = []
        for i, frame in enumerate(video_reader):
            if i % step == 0:
                frames.append(self._prepare_image(frame))
                if len(frames) >= self.config.max_video_frames:
                    break

        if not frames:
            raise ValueError(
                "No frames could be sampled from the video; "
                "the file may be empty or unreadable"
            )

        effective_fps = raw_fps / step if raw_fps > 0 else sample_fps

        return self._embed_frame_list(frames, effective_fps)

    def _embed_frame_list(self, frames, fps):
        """Embeds an ordered list of prepared frames as one native Qwen3-VL
        video message and returns a 1D numpy array embedding."""
        return self.embed_prepared(self._prepare_frame_list(frames, fps))

    @staticmethod
    def _video_metadata(num_frames, fps):
        """The clip's metadata, in whichever form this transformers version
        takes it — the processor builds its per-frame timestamps from this,
        and without it assumes 24fps regardless of the clip's real rate.

        ``frames_indices`` names which source frames the clip holds — ALL of
        them, for a frame-list clip. Newer processors read it directly to
        compute timestamps and crash on a metadata object that leaves it
        None; older ``VideoMetadata`` classes reject the field, so it is
        retried without.
        """
        fields = {
            "fps": float(fps),
            "total_num_frames": int(num_frames),
            "duration": float(num_frames) / float(fps),
        }
        try:
            from transformers.video_utils import VideoMetadata
        except ImportError:
            return fields

        try:
            return VideoMetadata(
                frames_indices=list(range(int(num_frames))), **fields
            )
        except TypeError:
            pass

        try:
            return VideoMetadata(**fields)
        except TypeError:
            return fields

    def _prepare_frame_list(self, frames, fps):
        """Runs the processor over one clip, returning host-side inputs.

        Args:
            frames: a list of prepared frames (e.g. PIL images), in order
            fps: the playback frame rate to report to the model

        Returns:
            the processor's inputs dict, on the host
        """
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "video",
                        "video": frames,
                        "fps": fps,
                    },
                ],
            }
        ]

        image_inputs, video_inputs = qwen_vl_utils.process_vision_info(
            messages
        )
        text = self._processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=False,
        )
        # These frames are already the intended selection, so the processor
        # must not resample them toward ITS default rate — and it should
        # build its frame timestamps from the clip's REAL rate rather than
        # the 24fps it assumes when no metadata rides along. Tried richest
        # first: older processors take neither kwarg and never resample.
        attempts = [
            {
                "do_sample_frames": False,
                "video_metadata": [self._video_metadata(len(frames), fps)],
            },
            {"do_sample_frames": False},
        ]
        # The convention is a fact about the processor VERSION, so a failed
        # richer attempt — which can die mid-processor after real work — is
        # skipped for every clip after the first
        start = getattr(self, "_call_convention", 0)
        for i, extra in enumerate(attempts[start:], start):
            try:
                out = self._processor(
                    text=[text],
                    images=image_inputs,
                    videos=video_inputs,
                    return_tensors="pt",
                    padding=True,
                    **extra,
                )
                self._call_convention = i
                return out
            except (TypeError, AttributeError) as e:
                # Only a complaint that NAMES one of these kwargs means this
                # processor version does not take it. Anything else came from
                # inside the processor and belongs to this clip: raise it
                # rather than downgrading every later clip in the process
                if not any(kwarg in str(e) for kwarg in extra):
                    raise
                logger.debug(
                    "Qwen3-VL processor rejected %s (%s); falling back to a "
                    "poorer calling convention",
                    sorted(extra),
                    e,
                )
                continue

        self._call_convention = len(attempts)

        return self._processor(
            text=[text],
            images=image_inputs,
            videos=video_inputs,
            return_tensors="pt",
            padding=True,
        )
