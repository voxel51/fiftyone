"""
`TwelveLabs <https://twelvelabs.io>`_ video understanding integration.

This module provides a :class:`fiftyone.core.models.Model` that wraps the
`TwelveLabs <https://docs.twelvelabs.io>`_ video foundation models for video
dataset curation:

-   **Marengo** generates 512-dimensional video embeddings (and matching text
    embeddings), enabling :meth:`compute_embeddings`,
    :meth:`compute_visualization`, and text-to-video
    :meth:`compute_similarity` searches.
-   **Pegasus** generates natural-language captions/answers about a video,
    which can be stored as
    :class:`fiftyone.core.labels.Classification` labels.

The models run server-side via the TwelveLabs API, so no local GPU is
required. Set your API key via the ``TWELVELABS_API_KEY`` environment variable
or pass ``api_key=...`` when loading the model.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os

import numpy as np

import eta.core.config as etac
import eta.core.video as etav

import fiftyone.core.labels as fol
import fiftyone.core.models as fom
import fiftyone.core.utils as fou

twelvelabs = fou.lazy_import(
    "twelvelabs", callback=lambda: fou.ensure_package("twelvelabs>=1.2.8")
)

logger = logging.getLogger(__name__)

DEFAULT_EMBEDDING_MODEL = "marengo3.0"
DEFAULT_ANALYSIS_MODEL = "pegasus1.5"
DEFAULT_CAPTION_PROMPT = "Describe what happens in this video."

# Pegasus requires max_tokens in [512, 98304]
MIN_ANALYSIS_MAX_TOKENS = 512


class TwelveLabsModelConfig(etac.Config):
    """Configuration for running a :class:`TwelveLabsModel`.

    Args:
        operation ("embed"): the operation to perform when the model is
            applied. Supported values are ``"embed"`` (Marengo video
            embeddings) and ``"caption"`` (Pegasus video captions)
        api_key (None): the TwelveLabs API key to use. If not provided, the
            ``TWELVELABS_API_KEY`` environment variable is used
        embedding_model ("marengo3.0"): the Marengo model to use for
            embeddings
        analysis_model ("pegasus1.5"): the Pegasus model to use for captioning
        prompt (None): the prompt to use for ``"caption"`` operations. If not
            provided, a default captioning prompt is used
        max_tokens (512): the maximum number of tokens to generate for
            ``"caption"`` operations (must be >= 512)
        temperature (None): an optional sampling temperature for captioning
    """

    def __init__(self, d):
        self.operation = self.parse_string(d, "operation", default="embed")
        if self.operation not in ("embed", "caption"):
            raise ValueError(
                "Unsupported operation '%s'. Supported values are "
                "('embed', 'caption')" % self.operation
            )

        self.api_key = self.parse_string(d, "api_key", default=None)
        self.embedding_model = self.parse_string(
            d, "embedding_model", default=DEFAULT_EMBEDDING_MODEL
        )
        self.analysis_model = self.parse_string(
            d, "analysis_model", default=DEFAULT_ANALYSIS_MODEL
        )
        self.prompt = self.parse_string(d, "prompt", default=None)
        self.max_tokens = self.parse_int(
            d, "max_tokens", default=MIN_ANALYSIS_MAX_TOKENS
        )
        if self.max_tokens < MIN_ANALYSIS_MAX_TOKENS:
            raise ValueError(
                "max_tokens must be >= %d; got %d"
                % (MIN_ANALYSIS_MAX_TOKENS, self.max_tokens)
            )
        self.temperature = self.parse_number(d, "temperature", default=None)


class TwelveLabsModel(fom.Model, fom.EmbeddingsMixin, fom.PromptMixin):
    """Wrapper for running inference with `TwelveLabs <https://twelvelabs.io>`_
    video foundation models.

    Embedding videos with Marengo, e.g. for similarity/visualization::

        import fiftyone as fo
        import fiftyone.zoo as foz
        import fiftyone.brain as fob
        from fiftyone.utils.twelvelabs import (
            TwelveLabsModel,
            TwelveLabsModelConfig,
        )

        dataset = foz.load_zoo_dataset("quickstart-video")

        model = TwelveLabsModel(TwelveLabsModelConfig({"operation": "embed"}))

        dataset.compute_embeddings(model, embeddings_field="twelvelabs")

        # Text-to-video search (Marengo aligns text and video embeddings)
        index = fob.compute_similarity(
            dataset, model=model, embeddings="twelvelabs", brain_key="tl_sim"
        )
        view = dataset.sort_by_similarity("a person riding a bike", k=10)

    Captioning videos with Pegasus, e.g. for curation::

        model = TwelveLabsModel(
            TwelveLabsModelConfig({"operation": "caption"})
        )

        dataset.apply_model(model, label_field="caption")

    Args:
        config: a :class:`TwelveLabsModelConfig`
    """

    def __init__(self, config):
        self.config = config

        api_key = config.api_key or os.environ.get("TWELVELABS_API_KEY")
        if not api_key:
            raise ValueError(
                "No TwelveLabs API key found. Provide one via the `api_key` "
                "config parameter or the `TWELVELABS_API_KEY` environment "
                "variable. You can get a free key at https://twelvelabs.io"
            )

        self._client = twelvelabs.TwelveLabs(api_key=api_key)
        self._last_embedding = None

    @property
    def media_type(self):
        return "video"

    @property
    def has_embeddings(self):
        return True

    @property
    def can_embed_prompts(self):
        return True

    @property
    def ragged_batches(self):
        return False

    @property
    def transforms(self):
        return None

    @property
    def preprocess(self):
        return False

    @preprocess.setter
    def preprocess(self, value):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def predict(self, arg):
        """Generates a caption for the given video.

        Args:
            arg: an active ``eta.core.video.FFmpegVideoReader``

        Returns:
            a :class:`fiftyone.core.labels.Classification`
        """
        caption = self._analyze_video(self._get_path(arg))
        return fol.Classification(label=caption)

    def embed(self, arg):
        """Generates a Marengo embedding for the given video.

        Args:
            arg: an active ``eta.core.video.FFmpegVideoReader``

        Returns:
            a 512-dimensional 1D numpy array
        """
        embedding = self._embed_video(self._get_path(arg))
        self._last_embedding = embedding
        return embedding

    def get_embeddings(self):
        return self._last_embedding[np.newaxis, :]

    def embed_prompt(self, arg):
        """Generates a Marengo text embedding for the given prompt.

        This enables text-to-video similarity searches, since Marengo embeds
        text and video into a shared space.

        Args:
            arg: the text prompt

        Returns:
            a 512-dimensional 1D numpy array
        """
        response = self._client.embed.create(
            model_name=self.config.embedding_model, text=arg
        )
        segment = response.text_embedding.segments[0]
        return np.asarray(segment.float_, dtype=np.float32)

    @staticmethod
    def _get_path(arg):
        if isinstance(arg, etav.FFmpegVideoReader):
            return arg.inpath

        if isinstance(arg, str):
            return arg

        raise ValueError(
            "Unsupported input of type %s; expected a video filepath or an "
            "`eta.core.video.FFmpegVideoReader`" % type(arg)
        )

    @staticmethod
    def _is_url(path):
        return path.startswith("http://") or path.startswith("https://")

    def _embed_video(self, path):
        kwargs = {"model_name": self.config.embedding_model}
        if self._is_url(path):
            kwargs["video_url"] = path
        else:
            kwargs["video_file"] = path

        # The API requires "clip" to be present; we request a single "video"
        # scope embedding that summarizes the entire video
        task = self._client.embed.tasks.create(
            video_embedding_scope=["clip", "video"], **kwargs
        )
        self._client.embed.tasks.wait_for_done(task.id)

        result = self._client.embed.tasks.retrieve(task.id)
        segments = result.video_embedding.segments or []

        # Prefer the whole-video embedding; fall back to the first clip
        video_segments = [s for s in segments if s.embedding_scope == "video"]
        segment = (video_segments or segments)[0]

        return np.asarray(segment.float_, dtype=np.float32)

    def _analyze_video(self, path):
        from twelvelabs.types.video_context import (
            VideoContext_Url,
            VideoContext_AssetId,
        )

        if self._is_url(path):
            video = VideoContext_Url(url=path)
        else:
            with open(path, "rb") as f:
                asset = self._client.assets.create(method="direct", file=f)
            video = VideoContext_AssetId(asset_id=asset.id)

        kwargs = {}
        if self.config.temperature is not None:
            kwargs["temperature"] = self.config.temperature

        response = self._client.analyze(
            model_name=self.config.analysis_model,
            video=video,
            prompt=self.config.prompt or DEFAULT_CAPTION_PROMPT,
            max_tokens=self.config.max_tokens,
            **kwargs,
        )

        return (response.data or "").strip()
