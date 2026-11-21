"""
`TwelveLabs <https://twelvelabs.io>`_ video understanding integration.

This module provides a :class:`fiftyone.core.models.Model` that wraps the
`TwelveLabs <https://docs.twelvelabs.io>`_ video foundation models for video
dataset curation:

-   **Marengo** generates 512-dimensional video embeddings (and matching text
    embeddings), enabling :meth:`compute_embeddings`,
    :meth:`compute_visualization`, and text-to-video
    :meth:`compute_similarity` searches
-   **Pegasus** generates natural-language captions/answers about a video, and
    segments videos into timestamped segments with custom metadata

The model supports two modes:

-   ``"on_the_fly"`` (default): videos are processed directly, without
    indexing. Uses Marengo 3.5 for embeddings and Pegasus 1.6 for analysis
-   ``"index"``: videos are first indexed into a TwelveLabs index, so they are
    also searchable in TwelveLabs. Embeddings are retrieved from the index
    (Marengo 3.0) and Pegasus 1.6 analyzes the indexed videos

The models run server-side via the TwelveLabs API, so no local GPU is
required. Set your API key via the ``TWELVELABS_API_KEY`` environment variable
or pass ``api_key=...`` when loading the model.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import logging
import os
import time

import numpy as np

import eta.core.video as etav

import fiftyone.core.config as foc
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fome
import fiftyone.core.models as fom
import fiftyone.core.utils as fou
import fiftyone.zoo.models as fozm

twelvelabs = fou.lazy_import(
    "twelvelabs", callback=lambda: fou.ensure_package("twelvelabs>=1.3.5")
)

logger = logging.getLogger(__name__)

OPERATIONS = ("embed", "caption", "segment")
MODES = ("on_the_fly", "index")

DEFAULT_EMBEDDING_MODEL = "marengo3.5"
DEFAULT_INDEX_EMBEDDING_MODEL = "marengo3.0"
INDEX_EMBEDDING_MODELS = ("marengo3.0",)
DEFAULT_ANALYSIS_MODEL = "pegasus1.6"
DEFAULT_CAPTION_PROMPT = "Describe what happens in this video."

DEFAULT_SEGMENT_DEFINITIONS = [
    {
        "id": "scene",
        "description": (
            "Segment the video into distinct scenes based on changes in "
            "setting, activity, or visual composition"
        ),
        "fields": [
            {
                "name": "description",
                "type": "string",
                "description": "A brief description of what happens",
            }
        ],
    }
]

# Pegasus max_tokens bounds per analysis mode
MIN_CAPTION_MAX_TOKENS = 512
MIN_SEGMENT_MAX_TOKENS = 2048
MAX_MAX_TOKENS = 98304
UNLIMITED_MAX_TOKENS = "unlimited"

# Marengo 3.5 supports truncated embeddings
EMBEDDING_DIMENSIONS = (128, 256, 512)

# Label fields that segment metadata must not overwrite
_RESERVED_ATTRS = {
    "id",
    "_id",
    "_cls",
    "label",
    "support",
    "confidence",
    "tags",
    "attributes",
}


class TwelveLabsModelConfig(foc.Config, fozm.HasZooModel):
    """Configuration for running a :class:`TwelveLabsModel`.

    Args:
        operation ("embed"): the operation to perform when the model is
            applied. Supported values are ``"embed"`` (Marengo video
            embeddings), ``"caption"`` (Pegasus video captions), and
            ``"segment"`` (Pegasus timestamped video segments, stored as
            :class:`fiftyone.core.labels.TemporalDetections`)
        mode ("on_the_fly"): how videos are processed. Supported values are
            ``"on_the_fly"`` (process videos directly, without indexing) and
            ``"index"`` (index videos into a TwelveLabs index first, then
            retrieve their embeddings from the index and analyze the indexed
            videos)
        api_key (None): the TwelveLabs API key to use. If not provided, the
            ``TWELVELABS_API_KEY`` environment variable is used
        embedding_model (None): the Marengo model to use for embeddings. The
            default is ``"marengo3.5"`` in ``"on_the_fly"`` mode and
            ``"marengo3.0"`` in ``"index"`` mode
        embedding_options (None): an optional list of modalities to embed,
            e.g. ``["visual", "audio"]``. With Marengo 3.5, the modalities are
            fused into a single embedding. Otherwise, the embedding of the
            first modality is used. By default, ``["visual", "audio"]`` is
            used for Marengo 3.5 and ``["visual"]`` otherwise
        embedding_dimension (None): an optional embedding length in
            ``(128, 256, 512)``. Only supported by Marengo 3.5
        index_id (None): the ID of an existing TwelveLabs index to use in
            ``"index"`` mode. If not provided, a new index is created the
            first time one is needed
        index_name (None): a name for the index to create in ``"index"``
            mode when no ``index_id`` is provided
        analysis_model ("pegasus1.6"): the Pegasus model to use for
            captioning and segmentation
        prompt (None): the prompt to use for ``"caption"`` operations. If not
            provided, a default captioning prompt is used
        max_tokens (None): the maximum number of tokens to generate. For
            ``"caption"`` operations, the default is 512 and the value must be
            in ``[512, 98304]``. For ``"segment"`` operations, the API default
            (32768) is used by default, and the value must be in
            ``[2048, 98304]`` or ``"unlimited"`` (Pegasus 1.6 only)
        temperature (None): an optional sampling temperature
        segment_definitions (None): a list of segment definition dicts for
            ``"segment"`` operations. Each definition has an ``"id"``, a
            natural language ``"description"`` of the segments to detect, and
            optional ``"fields"`` of metadata to extract per segment. See
            https://docs.twelvelabs.io/docs/guides/segment-videos for the
            full format. By default, the video is segmented into scenes with
            a ``description`` field
        min_segment_duration (None): an optional minimum segment duration, in
            seconds, for ``"segment"`` operations
        max_segment_duration (None): an optional maximum segment duration, in
            seconds, for ``"segment"`` operations
        poll_interval (2.0): the number of seconds to wait between status
            checks of asynchronous TwelveLabs tasks
    """

    def __init__(self, d):
        self.operation = self.parse_string(d, "operation", default="embed")
        if self.operation not in OPERATIONS:
            raise ValueError(
                "Unsupported operation '%s'. Supported values are %s"
                % (self.operation, OPERATIONS)
            )

        self.mode = self.parse_string(d, "mode", default="on_the_fly")
        if self.mode not in MODES:
            raise ValueError(
                "Unsupported mode '%s'. Supported values are %s"
                % (self.mode, MODES)
            )

        self.api_key = self.parse_string(d, "api_key", default=None)

        self.embedding_model = self.parse_string(
            d, "embedding_model", default=None
        )
        if self.embedding_model is None:
            if self.mode == "index":
                self.embedding_model = DEFAULT_INDEX_EMBEDDING_MODEL
            else:
                self.embedding_model = DEFAULT_EMBEDDING_MODEL

        if (
            self.mode == "index"
            and self.embedding_model not in INDEX_EMBEDDING_MODELS
        ):
            raise ValueError(
                "Embedding model '%s' does not support indexing. Supported "
                "values in 'index' mode are %s. Use mode='on_the_fly' to "
                "embed without indexing"
                % (self.embedding_model, INDEX_EMBEDDING_MODELS)
            )

        self.embedding_options = self.parse_array(
            d, "embedding_options", default=None
        )
        self.embedding_dimension = self.parse_int(
            d, "embedding_dimension", default=None
        )
        if self.embedding_dimension is not None:
            if self.embedding_dimension not in EMBEDDING_DIMENSIONS:
                raise ValueError(
                    "embedding_dimension must be in %s; got %d"
                    % (EMBEDDING_DIMENSIONS, self.embedding_dimension)
                )

            if self.embedding_model == DEFAULT_INDEX_EMBEDDING_MODEL:
                raise ValueError(
                    "embedding_dimension is not supported by '%s'"
                    % self.embedding_model
                )

        self.index_id = self.parse_string(d, "index_id", default=None)
        self.index_name = self.parse_string(d, "index_name", default=None)

        self.analysis_model = self.parse_string(
            d, "analysis_model", default=DEFAULT_ANALYSIS_MODEL
        )
        self.prompt = self.parse_string(d, "prompt", default=None)
        self.max_tokens = self._parse_max_tokens(d)
        self.temperature = self.parse_number(d, "temperature", default=None)

        self.segment_definitions = self.parse_array(
            d, "segment_definitions", default=None
        )
        self.min_segment_duration = self.parse_number(
            d, "min_segment_duration", default=None
        )
        self.max_segment_duration = self.parse_number(
            d, "max_segment_duration", default=None
        )

        self.poll_interval = self.parse_number(d, "poll_interval", default=2.0)

    def _parse_max_tokens(self, d):
        max_tokens = d.get("max_tokens", None)

        if max_tokens is None:
            if self.operation == "caption":
                return MIN_CAPTION_MAX_TOKENS

            return None

        if max_tokens == UNLIMITED_MAX_TOKENS:
            if self.operation != "segment":
                raise ValueError(
                    "max_tokens='%s' is only supported for 'segment' "
                    "operations" % UNLIMITED_MAX_TOKENS
                )

            return max_tokens

        if isinstance(max_tokens, bool) or not isinstance(max_tokens, int):
            raise ValueError(
                "max_tokens must be an integer or '%s'; got %r"
                % (UNLIMITED_MAX_TOKENS, max_tokens)
            )

        if self.operation == "segment":
            min_tokens = MIN_SEGMENT_MAX_TOKENS
        else:
            min_tokens = MIN_CAPTION_MAX_TOKENS

        if not min_tokens <= max_tokens <= MAX_MAX_TOKENS:
            raise ValueError(
                "max_tokens must be in [%d, %d] for '%s' operations; got %d"
                % (min_tokens, MAX_MAX_TOKENS, self.operation, max_tokens)
            )

        return max_tokens


class TwelveLabsModel(fom.Model, fom.EmbeddingsMixin, fom.PromptMixin):
    """Wrapper for running inference with `TwelveLabs <https://twelvelabs.io>`_
    video foundation models.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz
        import fiftyone.brain as fob
        from fiftyone.utils.twelvelabs import TwelveLabsModel, TwelveLabsModelConfig

        dataset = foz.load_zoo_dataset("quickstart-video", max_samples=2)

        #
        # Video embeddings (Marengo 3.5, no indexing)
        #

        # Load directly
        model = TwelveLabsModel(TwelveLabsModelConfig({"operation": "embed"}))

        # Load via zoo
        # model = foz.load_zoo_model("twelvelabs-marengo3.5")

        dataset.compute_embeddings(model, embeddings_field="twelvelabs")

        # Text-to-video search
        index = fob.compute_similarity(
            dataset,
            model=model,
            embeddings="twelvelabs",
            brain_key="tl_sim",
        )

        view = dataset.sort_by_similarity(
            "a person riding a bike",
            brain_key="tl_sim",
            k=10,
        )

        session = fo.launch_app(view)

        #
        # Video captions (Pegasus 1.6)
        #

        # Load directly
        model = TwelveLabsModel(TwelveLabsModelConfig({"operation": "caption"}))

        # Load via zoo
        # model = foz.load_zoo_model("twelvelabs-pegasus1.6")

        dataset.apply_model(model, label_field="caption")

        #
        # Timestamped video segments with custom metadata (Pegasus 1.6)
        #

        # Load directly
        model = TwelveLabsModel(TwelveLabsModelConfig({"operation": "segment"}))

        # Load via zoo
        # model = foz.load_zoo_model("twelvelabs-pegasus1.6-segment")

        dataset.apply_model(model, label_field="segments")

        #
        # Index mode: index videos into TwelveLabs, then embed/analyze them
        #

        model = TwelveLabsModel(
            TwelveLabsModelConfig({"operation": "embed", "mode": "index"})
        )

        dataset.compute_embeddings(model, embeddings_field="twelvelabs_index")

        print(model.index_id)  # reuse later via the `index_id` parameter

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
        self._index_id = config.index_id
        self._asset_ids = {}
        self._indexed_asset_ids = {}
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

    @property
    def index_id(self):
        """The ID of the TwelveLabs index used in ``"index"`` mode, or None if
        no index has been used yet.
        """
        return self._index_id

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def predict(self, arg):
        """Generates a caption or segments for the given video, depending on
        the configured ``operation``.

        Args:
            arg: an active ``eta.core.video.FFmpegVideoReader`` or a video
                filepath/URL

        Returns:
            a :class:`fiftyone.core.labels.Classification` for ``"caption"``
            operations, or a :class:`fiftyone.core.labels.TemporalDetections`
            for ``"segment"`` operations
        """
        path = self._get_path(arg)

        if self.config.operation == "segment":
            segments = self._segment_video(path)
            metadata = self._get_video_metadata(arg, path)
            return _parse_segments(segments, metadata)

        caption = self._analyze_video(path)
        return fol.Classification(label=caption)

    def embed(self, arg):
        """Generates a Marengo embedding for the given video.

        Args:
            arg: an active ``eta.core.video.FFmpegVideoReader`` or a video
                filepath/URL

        Returns:
            a 1D numpy array
        """
        path = self._get_path(arg)

        if self.config.mode == "index":
            embedding = self._get_indexed_embedding(path)
        else:
            embedding = self._embed_video(path)

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
            a 1D numpy array
        """
        types = twelvelabs.types
        model_name = self.config.embedding_model

        if model_name == DEFAULT_INDEX_EMBEDDING_MODEL:
            response = self._client.embed.v_2.create(
                input_type="text",
                model_name=model_name,
                text=types.TextInputRequest(input_text=arg),
            )
        else:
            kwargs = {}
            if self.config.embedding_dimension is not None:
                kwargs["embedding_dimension"] = self.config.embedding_dimension

            response = self._client.embed.v_2.create(
                input_type="multi_input",
                model_name=model_name,
                multi_input=types.MultiInputRequest(input_text=arg),
                **kwargs,
            )

        return np.asarray(response.data[0].embedding, dtype=np.float32)

    def delete_index(self):
        """Deletes the TwelveLabs index used in ``"index"`` mode, if any.

        This permanently deletes the index and all videos indexed into it.
        """
        if self._index_id is None:
            return

        self._client.indexes.delete(self._index_id)
        logger.info("Deleted TwelveLabs index '%s'", self._index_id)

        self._index_id = None
        self._indexed_asset_ids = {}

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

    @staticmethod
    def _get_video_metadata(arg, path):
        if isinstance(arg, etav.FFmpegVideoReader):
            total_frame_count = arg.total_frame_count
            frame_rate = arg.frame_rate
            duration = total_frame_count / frame_rate if frame_rate else None
            return fome.VideoMetadata(
                total_frame_count=total_frame_count,
                frame_rate=frame_rate,
                duration=duration,
            )

        return fome.VideoMetadata.build_for(path)

    def _wait(self, retrieve, description):
        while True:
            obj = retrieve()
            status = obj.status
            if status == "ready":
                return obj

            if status in ("failed", "canceled"):
                error = getattr(obj, "error", None)
                message = getattr(error, "message", None) or error
                raise RuntimeError(
                    "TwelveLabs %s %s: %s" % (description, status, message)
                )

            time.sleep(self.config.poll_interval)

    def _get_asset_id(self, path):
        # Uploads the video as an asset once per path, and waits until the
        # asset is ready, since using it while processing is an error
        asset_id = self._asset_ids.get(path, None)
        if asset_id is not None:
            return asset_id

        if self._is_url(path):
            asset = self._client.assets.create(method="url", url=path)
        else:
            with open(path, "rb") as f:
                asset = self._client.assets.create(method="direct", file=f)

        self._wait(
            lambda: self._client.assets.retrieve(asset.id),
            "asset upload of '%s'" % path,
        )

        self._asset_ids[path] = asset.id
        return asset.id

    def _get_or_create_index_id(self):
        if self._index_id is not None:
            return self._index_id

        index_name = self.config.index_name or "fiftyone-%d" % time.time()
        index = self._client.indexes.create(
            index_name=index_name,
            models=[
                {
                    "model_name": self.config.embedding_model,
                    "model_options": ["visual", "audio"],
                }
            ],
        )

        logger.info(
            "Created TwelveLabs index '%s' (id: %s). Pass "
            "`index_id='%s'` to reuse it",
            index_name,
            index.id,
            index.id,
        )

        self._index_id = index.id
        return index.id

    def _get_indexed_asset_id(self, path):
        # Indexes the video once per path, and waits until indexing completes
        indexed_asset_id = self._indexed_asset_ids.get(path, None)
        if indexed_asset_id is not None:
            return indexed_asset_id

        asset_id = self._get_asset_id(path)
        index_id = self._get_or_create_index_id()

        indexed_asset = self._client.indexes.indexed_assets.create(
            index_id, asset_id=asset_id
        )
        self._wait(
            lambda: self._client.indexes.indexed_assets.retrieve(
                index_id, indexed_asset.id
            ),
            "indexing of '%s'" % path,
        )

        self._indexed_asset_ids[path] = indexed_asset.id
        return indexed_asset.id

    def _get_embedding_options(self):
        if self.config.embedding_options:
            return list(self.config.embedding_options)

        if self.config.embedding_model == DEFAULT_INDEX_EMBEDDING_MODEL:
            return ["visual"]

        return ["visual", "audio"]

    def _get_media_source(self, path):
        types = twelvelabs.types
        if self._is_url(path):
            return types.MediaSource(url=path)

        return types.MediaSource(asset_id=self._get_asset_id(path))

    def _embed_video(self, path):
        types = twelvelabs.types
        model_name = self.config.embedding_model
        embedding_options = self._get_embedding_options()
        fuse = (
            model_name != DEFAULT_INDEX_EMBEDDING_MODEL
            and len(set(embedding_options)) > 1
        )

        video_kwargs = {}
        if fuse:
            # Fuse all requested modalities into a single embedding. We also
            # request the separate embeddings, because no fused embedding is
            # returned when a modality is missing (e.g., a silent video)
            video_kwargs["embedding_type"] = [
                "separate_embedding",
                "fused_embedding",
            ]

        task_kwargs = {}
        if self.config.embedding_dimension is not None:
            task_kwargs["embedding_dimension"] = (
                self.config.embedding_dimension
            )

        task = self._client.embed.v_2.tasks.create(
            input_type="video",
            model_name=model_name,
            video=types.AsyncVideoInputRequest(
                media_source=self._get_media_source(path),
                embedding_option=embedding_options,
                embedding_scope=["clip", "asset"],
                **video_kwargs,
            ),
            **task_kwargs,
        )
        result = self._wait(
            lambda: self._client.embed.v_2.tasks.retrieve(task.id),
            "embedding task for '%s'" % path,
        )

        all_segments = result.data or []

        options = (["fused"] if fuse else []) + embedding_options
        for option in options:
            segments = [
                s for s in all_segments if s.embedding_option == option
            ]
            if not segments:
                continue

            if fuse and option != "fused":
                logger.warning(
                    "No fused embedding was returned for '%s', which may be "
                    "missing a modality. Using its '%s' embedding instead",
                    path,
                    option,
                )

            # Prefer the whole-video (asset) embedding; fall back to the
            # average of the clip embeddings
            for segment in segments:
                if segment.embedding_scope == "asset":
                    return np.asarray(segment.embedding, dtype=np.float32)

            return _average_embeddings([s.embedding for s in segments])

        raise RuntimeError(
            "TwelveLabs returned no %s embeddings for '%s'" % (options, path)
        )

    def _get_indexed_embedding(self, path):
        index_id = self._get_or_create_index_id()
        indexed_asset_id = self._get_indexed_asset_id(path)
        option = self._get_embedding_options()[0]

        indexed_asset = self._client.indexes.indexed_assets.retrieve(
            index_id, indexed_asset_id, embedding_option=[option]
        )

        # Indexed videos only have clip-level embeddings, so we average them
        # into a single video-level embedding
        segments = indexed_asset.embedding.video_embedding.segments or []
        clip_embeddings = [
            s.float_ for s in segments if s.embedding_option == option
        ]
        if not clip_embeddings:
            raise RuntimeError(
                "TwelveLabs index '%s' has no '%s' embeddings for '%s'"
                % (index_id, option, path)
            )

        return _average_embeddings(clip_embeddings)

    def _get_video_context(self, path):
        types = twelvelabs.types

        if self.config.mode == "index":
            # Index the video, then analyze the indexed asset
            self._get_indexed_asset_id(path)
            return types.VideoContext_AssetId(
                asset_id=self._get_asset_id(path)
            )

        if self._is_url(path):
            return types.VideoContext_Url(url=path)

        return types.VideoContext_AssetId(asset_id=self._get_asset_id(path))

    def _analyze_video(self, path):
        kwargs = {}
        if self.config.temperature is not None:
            kwargs["temperature"] = self.config.temperature

        response = self._client.analyze(
            model_name=self.config.analysis_model,
            video=self._get_video_context(path),
            prompt=self.config.prompt or DEFAULT_CAPTION_PROMPT,
            max_tokens=self.config.max_tokens,
            **kwargs,
        )

        return (response.data or "").strip()

    def _segment_video(self, path):
        types = twelvelabs.types

        kwargs = {}
        if self.config.temperature is not None:
            kwargs["temperature"] = self.config.temperature

        if self.config.max_tokens is not None:
            kwargs["max_tokens"] = self.config.max_tokens

        if self.config.min_segment_duration is not None:
            kwargs["min_segment_duration"] = self.config.min_segment_duration

        if self.config.max_segment_duration is not None:
            kwargs["max_segment_duration"] = self.config.max_segment_duration

        segment_definitions = (
            self.config.segment_definitions or DEFAULT_SEGMENT_DEFINITIONS
        )

        task = self._client.analyze_async.tasks.create(
            model_name=self.config.analysis_model,
            video=self._get_video_context(path),
            analysis_mode="time_based_metadata",
            response_format=types.AsyncResponseFormat(
                type="segment_definitions",
                segment_definitions=segment_definitions,
            ),
            **kwargs,
        )
        result = self._wait(
            lambda: self._client.analyze_async.tasks.retrieve(task.task_id),
            "segmentation task for '%s'" % path,
        )

        if result.error is not None:
            # E.g., unlimited segmentation may complete with partial results
            logger.warning(
                "TwelveLabs segmentation of '%s' completed with a warning: %s",
                path,
                getattr(result.error, "message", None) or result.error,
            )

        data = result.result.data if result.result is not None else None
        if not data:
            return {}

        return json.loads(data)


def _average_embeddings(embeddings):
    embedding = np.mean(np.asarray(embeddings, dtype=np.float32), axis=0)
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding /= norm

    return embedding


def _parse_segments(segments, metadata):
    detections = []
    for segment_id, items in segments.items():
        for item in items or []:
            detection = fol.TemporalDetection.from_timestamps(
                [item["start_time"], item["end_time"]],
                metadata=metadata,
                label=segment_id,
            )

            for name, value in (item.get("metadata") or {}).items():
                if name in _RESERVED_ATTRS:
                    name += "_"

                detection[name] = value

            detections.append(detection)

    return fol.TemporalDetections(detections=detections)
