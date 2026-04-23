"""
FiftyOne Server multimodal ingest and workspace helpers.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from abc import ABC, abstractmethod
import importlib
import logging
import os
import time

import cachetools

import fiftyone.core.fields as fof
import fiftyone.core.metadata as fom
import fiftyone.core.rendering as fopr
from fiftyone.server.multimodal_codecs import (
    _SCHEMA_CODEC_REGISTRY,
    FoxgloveSchemaCodec,
    RosSchemaCodec,
    SchemaCodec,
    SchemaCodecRegistry,
    _get_schema_name,
)
from fiftyone.server.multimodal_common import (
    _CATALOG_VERSION,
    _DEFAULT_BOOTSTRAP_RENDER_MESSAGE_COUNT,
    _DEFAULT_BOOTSTRAP_TRANSFORM_WINDOW_NS,
    _DEFAULT_SOURCE_KIND,
    _STREAM_WINDOW_BINARY_CACHE_MAX_ENTRIES,
    _STREAM_WINDOW_BINARY_CACHE_TTL_SECONDS,
    _TIMELINE_INDEX_CACHE_MAX_ENTRIES,
    _TIMELINE_INDEX_CACHE_TTL_SECONDS,
    MULTIMODAL_RAW_BUFFER_BINARY_CONTENT_TYPE,
    MultimodalDependencyError,
    MultimodalError,
    MultimodalIngestArtifacts,
    MultimodalRouteError,
    PersistedMultimodalWorkspaceState,
)
from fiftyone.server.multimodal_rendering import (
    DefaultMultimodalRenderingPlanner,
    MultimodalRenderingPlanner,
    _build_default_layout_tree,
    _build_default_rendering_plan_layout_tree,
    _normalize_rendering_plan_payload,
    _select_default_image_streams,
    _serialize_rendering_plan,
    _validate_layout_tree,
)
from fiftyone.server.multimodal_transport import (
    _build_message_id,
    _build_raw_message_record,
    _build_scene_id,
    _build_stream_lookup,
    _build_stream_record,
    _build_stream_window_binary_response,
    _build_timeline_index_policy_key,
    _build_timeline_index_response,
    _build_workspace_response,
    _decode_catalog_details,
    _finalize_location_topics,
    _finalize_streams,
    _get_raw_message_payload_bytes,
    _get_scene_start_ns,
    _get_summary_scene_time_range,
    _has_persisted_timeline_index_artifacts,
    _ingest_reader,
    _init_timeline_index_accumulators,
    _iter_reader_messages,
    _iter_timeline_index_policies,
    _load_persisted_timeline_index,
    _make_stream_window_binary_cache_key,
    _make_time_range_document,
    _make_timeline_index_cache_key,
    _normalize_max_messages_per_stream,
    _normalize_stream_ids,
    _normalize_time_value,
    _normalize_timestamp_fallback,
    _normalize_timestamp_source,
    _persist_timeline_index_artifacts,
    _resolve_media_path,
    _resolve_message_sync_timestamp_ns,
    _resolve_sample_field,
    _serialize_frame,
    _serialize_location_topic,
    _serialize_stream,
    _serialize_time_range,
    _serialize_transform,
    _to_absolute_ns,
    _validate_known_stream_ids,
)

logger = logging.getLogger(__name__)

_MULTIMODAL_SERVICE = None


class MultimodalSourceAdapter(ABC):
    """Abstract adapter for reading multimodal source data."""

    def build_catalog(self, source_path, media_field, scene_id):
        """Builds a persisted catalog for the given source."""
        return self.ingest_source(
            source_path=source_path,
            media_field=media_field,
            scene_id=scene_id,
        ).metadata

    @abstractmethod
    def ingest_source(self, source_path, media_field, scene_id):
        """Builds persisted ingest artifacts for the given source."""

    @abstractmethod
    def read_stream_window(
        self,
        source_path,
        stream_ids,
        start_time_ns,
        end_time_ns,
        max_messages_per_stream=None,
        timestamp_source="header.stamp",
        fallback="log_time",
    ):
        """Reads raw message payloads for the requested streams."""

    @abstractmethod
    def read_bootstrap_window(
        self,
        source_path,
        anchor_time_ns,
        render_stream_ids,
        transform_stream_ids,
        location_stream_ids,
        transform_window_ns=None,
        render_message_count=None,
        timestamp_source="header.stamp",
        fallback="log_time",
    ):
        """Reads a boot-oriented raw window for first paint."""

    @abstractmethod
    def read_timeline_index(
        self,
        source_path,
        stream_ids=None,
        timestamp_source="log_time",
        fallback="log_time",
    ):
        """Reads timestamp indexes for the requested streams."""

    @abstractmethod
    def get_source_fingerprint(self, source_path):
        """Builds a cheap fingerprint for the source file."""


class SourceAdapterRegistry:
    """Registry of built-in multimodal source adapters."""

    def __init__(self):
        self._adapter_entries = {}
        self._extension_map = {}

    def register(self, source_kind, adapter, extensions=None):
        self._adapter_entries[source_kind] = adapter
        for extension in extensions or ():
            self._extension_map[extension.lower()] = source_kind

    def get(self, source_kind):
        try:
            return self._adapter_entries[source_kind]
        except KeyError as error:
            raise MultimodalRouteError(
                400, "Unsupported multimodal source kind '%s'" % source_kind
            ) from error

    def infer(self, source_path):
        extension = os.path.splitext(source_path)[1].lower()
        source_kind = self._extension_map.get(extension)
        if source_kind is None:
            raise MultimodalRouteError(
                400,
                "Unable to infer a multimodal source adapter for '%s'"
                % source_path,
            )

        return source_kind


class McapSourceAdapter(MultimodalSourceAdapter):
    """MCAP source adapter backed by ``mcap.reader``."""

    def __init__(self, codec_registry=None, reader_factory=None):
        self._codec_registry = codec_registry or _SCHEMA_CODEC_REGISTRY
        self._reader_factory = reader_factory

    def _make_reader(self, stream):
        if self._reader_factory is not None:
            return self._reader_factory(stream)

        return _get_mcap_reader_module().make_reader(stream)

    def ingest_source(self, source_path, media_field, scene_id):
        with open(source_path, "rb") as stream:
            reader = self._make_reader(stream)
            return _ingest_reader(
                reader=reader,
                scene_id=scene_id,
                media_field=media_field,
                source_path=source_path,
                source_kind="mcap",
                codec_registry=self._codec_registry,
            )

    def read_stream_window(
        self,
        source_path,
        stream_ids,
        start_time_ns,
        end_time_ns,
        max_messages_per_stream=None,
        timestamp_source="header.stamp",
        fallback="log_time",
    ):
        response_streams = {}
        message_indexes = {stream_id: 0 for stream_id in stream_ids}

        for stream_id in stream_ids:
            response_streams[stream_id] = []

        with open(source_path, "rb") as stream:
            reader = self._make_reader(stream)
            for schema, channel, message in _iter_reader_messages(
                reader,
                topics=stream_ids,
                start_ns=start_time_ns,
                end_ns=end_time_ns,
            ):
                stream_id = channel.topic
                if (
                    max_messages_per_stream is not None
                    and message_indexes[stream_id] >= max_messages_per_stream
                ):
                    continue

                message_index = message_indexes[stream_id]
                message_indexes[stream_id] += 1
                response_streams[stream_id].append(
                    _build_raw_message_record(
                        schema=schema,
                        stream_id=stream_id,
                        message=message,
                        message_index=message_index,
                        codec_registry=self._codec_registry,
                        timestamp_source=timestamp_source,
                        fallback=fallback,
                    )
                )

        return response_streams

    def read_bootstrap_window(
        self,
        source_path,
        anchor_time_ns,
        render_stream_ids,
        transform_stream_ids,
        location_stream_ids,
        transform_window_ns=None,
        render_message_count=None,
        timestamp_source="header.stamp",
        fallback="log_time",
    ):
        render_stream_ids = list(render_stream_ids or [])
        transform_stream_ids = list(transform_stream_ids or [])
        location_stream_ids = list(location_stream_ids or [])
        auxiliary_stream_ids = transform_stream_ids + location_stream_ids
        render_message_count = int(
            render_message_count or _DEFAULT_BOOTSTRAP_RENDER_MESSAGE_COUNT
        )
        transform_window_ns = int(
            transform_window_ns or _DEFAULT_BOOTSTRAP_TRANSFORM_WINDOW_NS
        )
        response_streams = {}
        message_indexes = {}

        for stream_id in render_stream_ids + auxiliary_stream_ids:
            if stream_id in response_streams:
                continue
            response_streams[stream_id] = []
            message_indexes[stream_id] = 0

        with open(source_path, "rb") as stream:
            reader = self._make_reader(stream)
            unresolved_render_stream_ids = set(render_stream_ids)

            for schema, channel, message in _iter_reader_messages(
                reader, topics=render_stream_ids or None
            ):
                stream_id = channel.topic
                if stream_id not in unresolved_render_stream_ids:
                    continue

                sync_timestamp_ns = _resolve_message_sync_timestamp_ns(
                    codec_registry=self._codec_registry,
                    schema_name=(schema.name if schema is not None else None),
                    schema=schema,
                    payload=message.data,
                    log_time_ns=int(message.log_time),
                    publish_time_ns=int(message.publish_time),
                    timestamp_source=timestamp_source,
                    fallback=fallback,
                )
                if sync_timestamp_ns < anchor_time_ns:
                    continue

                message_index = message_indexes[stream_id]
                message_indexes[stream_id] += 1
                response_streams[stream_id].append(
                    _build_raw_message_record(
                        schema=schema,
                        stream_id=stream_id,
                        message=message,
                        message_index=message_index,
                        codec_registry=self._codec_registry,
                        timestamp_source=timestamp_source,
                        fallback=fallback,
                        sync_timestamp_ns=sync_timestamp_ns,
                    )
                )
                if len(response_streams[stream_id]) >= render_message_count:
                    unresolved_render_stream_ids.discard(stream_id)
                    if not unresolved_render_stream_ids:
                        break

        if auxiliary_stream_ids:
            auxiliary_start_time_ns = max(
                0, anchor_time_ns - transform_window_ns
            )
            auxiliary_end_time_ns = anchor_time_ns + transform_window_ns

            with open(source_path, "rb") as stream:
                reader = self._make_reader(stream)
                for schema, channel, message in _iter_reader_messages(
                    reader,
                    topics=auxiliary_stream_ids,
                    start_ns=auxiliary_start_time_ns,
                    end_ns=auxiliary_end_time_ns,
                ):
                    stream_id = channel.topic
                    message_index = message_indexes[stream_id]
                    message_indexes[stream_id] += 1
                    response_streams[stream_id].append(
                        _build_raw_message_record(
                            schema=schema,
                            stream_id=stream_id,
                            message=message,
                            message_index=message_index,
                            codec_registry=self._codec_registry,
                            timestamp_source=timestamp_source,
                            fallback=fallback,
                        )
                    )

        return response_streams

    def read_timeline_index(
        self,
        source_path,
        stream_ids=None,
        timestamp_source="log_time",
        fallback="log_time",
    ):
        topics = list(stream_ids) if stream_ids else None
        timeline_streams = {}
        shared_timestamps = set()

        with open(source_path, "rb") as stream:
            reader = self._make_reader(stream)
            for schema, channel, message in _iter_reader_messages(
                reader, topics=topics
            ):
                stream_id = channel.topic
                log_time_ns = int(message.log_time)
                publish_time_ns = int(message.publish_time)
                sync_timestamp_ns = _resolve_message_sync_timestamp_ns(
                    codec_registry=self._codec_registry,
                    schema_name=(schema.name if schema is not None else None),
                    schema=schema,
                    payload=message.data,
                    log_time_ns=log_time_ns,
                    publish_time_ns=publish_time_ns,
                    timestamp_source=timestamp_source,
                    fallback=fallback,
                )
                timeline_streams.setdefault(stream_id, []).append(
                    {
                        "timestamp_ns": sync_timestamp_ns,
                        "log_time_ns": log_time_ns,
                        "publish_time_ns": publish_time_ns,
                    }
                )
                shared_timestamps.add(sync_timestamp_ns)

        return {
            "timestamps_ns": sorted(shared_timestamps),
            "streams": {
                stream_id: sorted(
                    stream_timestamps,
                    key=lambda sample: (
                        sample["timestamp_ns"],
                        sample["log_time_ns"],
                    ),
                )
                for stream_id, stream_timestamps in timeline_streams.items()
            },
        }

    def get_source_fingerprint(self, source_path):
        stat = os.stat(source_path)
        return fom.MultimodalSourceFingerprint(
            path=source_path,
            size_bytes=int(stat.st_size),
            mtime_ns=int(stat.st_mtime_ns),
        )


class SceneStateRepository(ABC):
    """Abstract repository for persisted multimodal workspace state."""

    @abstractmethod
    def ensure_schema(self, dataset):
        """Ensures the dataset can persist rendering plans."""

    @abstractmethod
    def load(self, sample):
        """Loads persisted workspace state from the sample."""

    @abstractmethod
    def save(self, dataset, sample, metadata, rendering_plan):
        """Persists workspace state on the sample."""


class SampleMultimodalSceneRepository(SceneStateRepository):
    """Sample-backed repository for multimodal workspace state."""

    def ensure_schema(self, dataset):
        if dataset.has_sample_field("rendering_plan"):
            return

        dataset.add_sample_field(
            "rendering_plan",
            fof.EmbeddedDocumentField,
            embedded_doc_type=fopr.RenderingPlan,
        )

    def load(self, sample):
        metadata = sample.metadata
        if not isinstance(metadata, fom.MultimodalMetadata):
            metadata = None

        rendering_plan = None
        if sample.has_field("rendering_plan"):
            rendering_plan = sample["rendering_plan"]

        if not isinstance(rendering_plan, fopr.MultimodalRenderingPlan):
            rendering_plan = None

        return PersistedMultimodalWorkspaceState(
            metadata=metadata,
            rendering_plan=rendering_plan,
        )

    def save(self, dataset, sample, metadata, rendering_plan):
        self.ensure_schema(dataset)
        sample.metadata = metadata
        sample["rendering_plan"] = rendering_plan
        sample.save()
        return PersistedMultimodalWorkspaceState(
            metadata=sample.metadata,
            rendering_plan=sample["rendering_plan"],
        )


class MultimodalWorkspaceService:
    """Service that owns multimodal ingest and sample-backed workspace reads."""

    def __init__(
        self,
        adapter_registry=None,
        planner=None,
        repository=None,
        adapter=None,
    ):
        if adapter_registry is None:
            adapter_registry = SourceAdapterRegistry()

        if adapter is not None:
            adapter_registry.register(
                _DEFAULT_SOURCE_KIND,
                adapter,
                extensions=[".mcap"],
            )

        self._adapter_registry = adapter_registry
        self._planner = planner or DefaultMultimodalRenderingPlanner()
        self._repository = repository or SampleMultimodalSceneRepository()
        self._timeline_index_cache = cachetools.TTLCache(
            maxsize=_TIMELINE_INDEX_CACHE_MAX_ENTRIES,
            ttl=_TIMELINE_INDEX_CACHE_TTL_SECONDS,
        )
        self._stream_window_binary_cache = cachetools.TTLCache(
            maxsize=_STREAM_WINDOW_BINARY_CACHE_MAX_ENTRIES,
            ttl=_STREAM_WINDOW_BINARY_CACHE_TTL_SECONDS,
        )

    def ingest_workspace(
        self,
        dataset,
        sample,
        media_field,
        overwrite=False,
        source_kind=None,
    ):
        source_path = _resolve_media_path(sample, media_field)
        scene_id = _build_scene_id(dataset, sample, media_field)
        state = self._repository.load(sample)
        if state.metadata is not None:
            source_kind = source_kind or state.metadata.source_kind

        if source_kind is None:
            source_kind = self._adapter_registry.infer(source_path)

        adapter = self._adapter_registry.get(source_kind)
        source_fingerprint = adapter.get_source_fingerprint(source_path)

        if not overwrite and not _requires_ingest(
            metadata=state.metadata,
            rendering_plan=state.rendering_plan,
            media_field=media_field,
            source_fingerprint=source_fingerprint,
            source_kind=source_kind,
        ):
            return state

        started_at = time.perf_counter()
        ingest_artifacts = adapter.ingest_source(
            scene_id=scene_id,
            media_field=media_field,
            source_path=source_path,
        )
        metadata = ingest_artifacts.metadata
        rendering_plan = self._planner.build_rendering_plan(metadata)
        _persist_timeline_index_artifacts(
            metadata=metadata,
            timeline_indexes=ingest_artifacts.timeline_indexes,
        )
        persisted_state = self._repository.save(
            dataset=dataset,
            sample=sample,
            metadata=metadata,
            rendering_plan=rendering_plan,
        )
        logger.debug(
            "Ingested multimodal workspace %s in %.3f ms (%d streams)",
            source_path,
            (time.perf_counter() - started_at) * 1000,
            len(metadata.streams),
        )
        return persisted_state

    def get_workspace(self, dataset, sample, media_field, source_kind=None):
        return self.ingest_workspace(
            dataset=dataset,
            sample=sample,
            media_field=media_field,
            overwrite=False,
            source_kind=source_kind,
        )

    def update_workspace(self, dataset, sample, rendering_plan):
        if not isinstance(rendering_plan, dict):
            raise MultimodalRouteError(
                400, "Workspace request body must be a rendering plan object"
            )

        media_field = rendering_plan.get("mediaField")
        state = self.get_workspace(
            dataset=dataset,
            sample=sample,
            media_field=media_field,
            source_kind=rendering_plan.get("sourceKind"),
        )
        normalized_rendering_plan = _normalize_rendering_plan_payload(
            rendering_plan,
            metadata=state.metadata,
            current_rendering_plan=state.rendering_plan,
        )
        return self._repository.save(
            dataset=dataset,
            sample=sample,
            metadata=state.metadata,
            rendering_plan=normalized_rendering_plan,
        )

    def read_stream_window_binary(
        self,
        dataset,
        sample,
        media_field,
        stream_ids,
        start_time_ns,
        end_time_ns,
        max_messages_per_stream=None,
        source_kind=None,
    ):
        state = self.get_workspace(
            dataset, sample, media_field, source_kind=source_kind
        )
        stream_lookup = _build_stream_lookup(state.metadata)
        _validate_known_stream_ids(stream_ids, stream_lookup)
        scene_start_ns = _get_scene_start_ns(state.metadata)
        absolute_start_time_ns = _to_absolute_ns(start_time_ns, scene_start_ns)
        absolute_end_time_ns = _to_absolute_ns(end_time_ns, scene_start_ns)
        timestamp_source = _normalize_timestamp_source(
            state.rendering_plan.sync.timestamp_source
        )
        fallback = _normalize_timestamp_fallback(
            state.rendering_plan.sync.fallback
        )
        cache_key = _make_stream_window_binary_cache_key(
            metadata=state.metadata,
            stream_ids=stream_ids,
            start_time_ns=absolute_start_time_ns,
            end_time_ns=absolute_end_time_ns,
            max_messages_per_stream=max_messages_per_stream,
            timestamp_source=timestamp_source,
            fallback=fallback,
        )
        cached_response = self._stream_window_binary_cache.get(cache_key)
        if cached_response is not None:
            logger.debug(
                "Stream-window cache hit for %s [%s, %s] (%d streams)",
                state.metadata.source_path,
                absolute_start_time_ns,
                absolute_end_time_ns,
                len(stream_ids),
            )
            return cached_response

        adapter = self._adapter_registry.get(state.metadata.source_kind)
        started_at = time.perf_counter()
        raw_messages = adapter.read_stream_window(
            source_path=state.metadata.source_path,
            stream_ids=stream_ids,
            start_time_ns=absolute_start_time_ns,
            end_time_ns=absolute_end_time_ns,
            max_messages_per_stream=max_messages_per_stream,
            timestamp_source=timestamp_source,
            fallback=fallback,
        )
        logger.debug(
            "Read multimodal stream window %s [%s, %s] in %.3f ms (%d streams)",
            state.metadata.source_path,
            absolute_start_time_ns,
            absolute_end_time_ns,
            (time.perf_counter() - started_at) * 1000,
            len(raw_messages),
        )
        response = _build_stream_window_binary_response(
            scene_id=state.metadata.scene_id,
            start_time_ns=absolute_start_time_ns,
            end_time_ns=absolute_end_time_ns,
            stream_lookup=stream_lookup,
            stream_ids=stream_ids,
            raw_messages=raw_messages,
            scene_start_ns=scene_start_ns,
        )
        self._stream_window_binary_cache[cache_key] = response
        return response

    def read_bootstrap_window_binary(
        self,
        dataset,
        sample,
        media_field,
        anchor_time_ns,
        render_stream_ids,
        transform_stream_ids,
        location_stream_ids,
        transform_window_ns=None,
        source_kind=None,
    ):
        window_data = self._read_bootstrap_window_data(
            dataset=dataset,
            sample=sample,
            media_field=media_field,
            anchor_time_ns=anchor_time_ns,
            render_stream_ids=render_stream_ids,
            transform_stream_ids=transform_stream_ids,
            location_stream_ids=location_stream_ids,
            transform_window_ns=transform_window_ns,
            source_kind=source_kind,
        )
        return _build_stream_window_binary_response(**window_data)

    def _read_bootstrap_window_data(
        self,
        dataset,
        sample,
        media_field,
        anchor_time_ns,
        render_stream_ids,
        transform_stream_ids,
        location_stream_ids,
        transform_window_ns=None,
        source_kind=None,
    ):
        state = self.get_workspace(
            dataset, sample, media_field, source_kind=source_kind
        )
        stream_lookup = _build_stream_lookup(state.metadata)
        scene_start_ns = _get_scene_start_ns(state.metadata)
        requested_stream_ids = []
        for stream_id in (
            list(render_stream_ids)
            + list(transform_stream_ids)
            + list(location_stream_ids)
        ):
            if stream_id not in requested_stream_ids:
                requested_stream_ids.append(stream_id)

        _validate_known_stream_ids(requested_stream_ids, stream_lookup)
        absolute_anchor_time_ns = _to_absolute_ns(
            anchor_time_ns, scene_start_ns
        )
        timestamp_source = _normalize_timestamp_source(
            state.rendering_plan.sync.timestamp_source
        )
        fallback = _normalize_timestamp_fallback(
            state.rendering_plan.sync.fallback
        )
        absolute_transform_window_ns = int(
            transform_window_ns or _DEFAULT_BOOTSTRAP_TRANSFORM_WINDOW_NS
        )
        adapter = self._adapter_registry.get(state.metadata.source_kind)

        started_at = time.perf_counter()
        raw_messages = adapter.read_bootstrap_window(
            source_path=state.metadata.source_path,
            anchor_time_ns=absolute_anchor_time_ns,
            render_stream_ids=render_stream_ids,
            transform_stream_ids=transform_stream_ids,
            location_stream_ids=location_stream_ids,
            transform_window_ns=absolute_transform_window_ns,
            render_message_count=_DEFAULT_BOOTSTRAP_RENDER_MESSAGE_COUNT,
            timestamp_source=timestamp_source,
            fallback=fallback,
        )
        logger.debug(
            "Read multimodal bootstrap window %s around %s in %.3f ms (%d streams)",
            state.metadata.source_path,
            absolute_anchor_time_ns,
            (time.perf_counter() - started_at) * 1000,
            len(requested_stream_ids),
        )
        absolute_start_time_ns = max(
            scene_start_ns,
            absolute_anchor_time_ns - absolute_transform_window_ns,
        )
        absolute_end_time_ns = (
            absolute_anchor_time_ns + absolute_transform_window_ns
        )
        return {
            "scene_id": state.metadata.scene_id,
            "start_time_ns": absolute_start_time_ns,
            "end_time_ns": absolute_end_time_ns,
            "stream_lookup": stream_lookup,
            "stream_ids": requested_stream_ids,
            "raw_messages": raw_messages,
            "scene_start_ns": scene_start_ns,
        }

    def read_timeline_index(
        self,
        dataset,
        sample,
        media_field,
        stream_ids=None,
        timestamp_source=None,
        fallback=None,
        source_kind=None,
    ):
        state = self.get_workspace(
            dataset, sample, media_field, source_kind=source_kind
        )
        stream_lookup = _build_stream_lookup(state.metadata)
        scene_start_ns = _get_scene_start_ns(state.metadata)
        if stream_ids is None:
            stream_ids = list(stream_lookup.keys())

        _validate_known_stream_ids(stream_ids, stream_lookup)
        timestamp_source = _normalize_timestamp_source(
            timestamp_source or state.rendering_plan.sync.timestamp_source
        )
        fallback = _normalize_timestamp_fallback(
            fallback or state.rendering_plan.sync.fallback
        )
        cache_key = _make_timeline_index_cache_key(
            metadata=state.metadata,
            stream_ids=stream_ids,
            timestamp_source=timestamp_source,
            fallback=fallback,
        )
        cached_response = self._timeline_index_cache.get(cache_key)
        if cached_response is not None:
            logger.debug(
                "Timeline cache hit for %s (%d streams)",
                state.metadata.source_path,
                len(stream_ids),
            )
            return cached_response

        started_at = time.perf_counter()
        timeline_index = _load_persisted_timeline_index(
            metadata=state.metadata,
            timestamp_source=timestamp_source,
            fallback=fallback,
        )
        if timeline_index is None:
            state = self.ingest_workspace(
                dataset=dataset,
                sample=sample,
                media_field=media_field,
                overwrite=True,
                source_kind=source_kind,
            )
            stream_lookup = _build_stream_lookup(state.metadata)
            scene_start_ns = _get_scene_start_ns(state.metadata)
            timeline_index = _load_persisted_timeline_index(
                metadata=state.metadata,
                timestamp_source=timestamp_source,
                fallback=fallback,
            )

        if timeline_index is None:
            raise MultimodalRouteError(
                500,
                "Persisted multimodal timeline index is unavailable after ingest",
            )

        logger.debug(
            "Read multimodal timeline index %s in %.3f ms (%d streams, %d timestamps)",
            state.metadata.source_path,
            (time.perf_counter() - started_at) * 1000,
            len(stream_ids),
            len(timeline_index["timestamps_ns"]),
        )
        response = _build_timeline_index_response(
            scene_id=state.metadata.scene_id,
            timestamp_source=timestamp_source,
            timestamps_ns=timeline_index["timestamps_ns"],
            streams=[
                {
                    "streamId": stream_id,
                    "samples": timeline_index["streams"].get(stream_id, []),
                }
                for stream_id in stream_ids
            ],
            scene_start_ns=scene_start_ns,
        )
        self._timeline_index_cache[cache_key] = response
        return response


def ingest_sample_multimodal_workspace(
    dataset, sample, media_field, overwrite=False, source_kind=None
):
    """Persists the catalog and rendering plan for a multimodal sample."""
    service = _get_multimodal_service()
    state = service.ingest_workspace(
        dataset=dataset,
        sample=sample,
        media_field=media_field,
        overwrite=overwrite,
        source_kind=source_kind,
    )
    return _build_workspace_response(
        dataset=dataset,
        sample=sample,
        metadata=state.metadata,
        rendering_plan=state.rendering_plan,
    )


def inspect_sample_multimodal_workspace(
    dataset, sample, media_field, source_kind=None
):
    """Builds workspace inventory and rendering defaults for a sample."""
    state = _get_multimodal_service().get_workspace(
        dataset=dataset,
        sample=sample,
        media_field=media_field,
        source_kind=source_kind,
    )
    return _build_workspace_response(
        dataset=dataset,
        sample=sample,
        metadata=state.metadata,
        rendering_plan=state.rendering_plan,
    )


def update_sample_multimodal_workspace(dataset, sample, rendering_plan):
    """Persists the updated rendering plan for a multimodal sample."""
    state = _get_multimodal_service().update_workspace(
        dataset=dataset,
        sample=sample,
        rendering_plan=rendering_plan,
    )
    return _serialize_rendering_plan(state.rendering_plan)


def read_sample_multimodal_stream_window_binary(
    dataset,
    sample,
    media_field,
    stream_ids,
    start_time_ns,
    end_time_ns,
    max_messages_per_stream=None,
    source_kind=None,
):
    """Reads a binary raw message window for the requested multimodal streams."""
    return _get_multimodal_service().read_stream_window_binary(
        dataset=dataset,
        sample=sample,
        media_field=media_field,
        stream_ids=stream_ids,
        start_time_ns=start_time_ns,
        end_time_ns=end_time_ns,
        max_messages_per_stream=max_messages_per_stream,
        source_kind=source_kind,
    )


def read_sample_multimodal_timeline_index(
    dataset,
    sample,
    media_field,
    stream_ids,
    timestamp_source=None,
    fallback=None,
    source_kind=None,
):
    """Reads a timestamp playback index for the requested streams."""
    return _get_multimodal_service().read_timeline_index(
        dataset=dataset,
        sample=sample,
        media_field=media_field,
        stream_ids=stream_ids,
        timestamp_source=timestamp_source,
        fallback=fallback,
        source_kind=source_kind,
    )


def read_sample_multimodal_bootstrap_window_binary(
    dataset,
    sample,
    media_field,
    anchor_time_ns,
    render_stream_ids,
    transform_stream_ids,
    location_stream_ids,
    transform_window_ns=None,
    source_kind=None,
):
    """Reads a binary first-paint bootstrap raw window."""
    return _get_multimodal_service().read_bootstrap_window_binary(
        dataset=dataset,
        sample=sample,
        media_field=media_field,
        anchor_time_ns=anchor_time_ns,
        render_stream_ids=render_stream_ids,
        transform_stream_ids=transform_stream_ids,
        location_stream_ids=location_stream_ids,
        transform_window_ns=transform_window_ns,
        source_kind=source_kind,
    )


def _get_multimodal_service():
    global _MULTIMODAL_SERVICE

    if _MULTIMODAL_SERVICE is None:
        adapter_registry = SourceAdapterRegistry()
        adapter_registry.register(
            "mcap",
            McapSourceAdapter(_SCHEMA_CODEC_REGISTRY),
            extensions=[".mcap"],
        )
        _MULTIMODAL_SERVICE = MultimodalWorkspaceService(
            adapter_registry=adapter_registry,
            planner=DefaultMultimodalRenderingPlanner(),
            repository=SampleMultimodalSceneRepository(),
        )

    return _MULTIMODAL_SERVICE


def _requires_ingest(
    metadata, rendering_plan, media_field, source_fingerprint, source_kind
):
    if metadata is None or rendering_plan is None:
        return True

    if metadata.catalog_version != _CATALOG_VERSION:
        return True

    if metadata.source_kind != source_kind:
        return True

    if metadata.media_field != media_field:
        return True

    if rendering_plan.media_field != media_field:
        return True

    if rendering_plan.source_kind != source_kind:
        return True

    try:
        _validate_layout_tree(
            rendering_plan.layout_tree,
            rendering_plan.panels or [],
        )
    except MultimodalRouteError:
        return True

    fingerprint = metadata.source_fingerprint
    if fingerprint is None:
        return True

    if any(
        (
            fingerprint.path != source_fingerprint.path,
            int(fingerprint.size_bytes) != int(source_fingerprint.size_bytes),
            int(fingerprint.mtime_ns) != int(source_fingerprint.mtime_ns),
        )
    ):
        return True

    return not _has_persisted_timeline_index_artifacts(metadata)


def _get_mcap_reader_module():
    try:
        return importlib.import_module("mcap.reader")
    except Exception as exc:
        raise MultimodalDependencyError(
            "The 'mcap>=1,<2' package is required for built-in mcap support"
        ) from exc
