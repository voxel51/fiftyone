"""
Compiled projection plan data model.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class Grain(str, Enum):
    OBSERVATION = "observation"
    SIGNAL_CHUNK = "signal_chunk"
    ANNOTATION = "annotation"
    SEGMENT = "segment"
    SCENE_SUMMARY = "scene_summary"


# ---------------------------------------------------------------------------
# Channel binding types
# ---------------------------------------------------------------------------


@dataclass
class MatchSpec:
    topic: str | None = None
    schema_name: str | None = None
    # Not yet in the proto schema; stored verbatim until proto bindings land.
    encoding: str | None = None
    channel_metadata: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        d: dict = {}
        if self.topic is not None:
            d["topic"] = self.topic
        if self.schema_name is not None:
            d["schema_name"] = self.schema_name
        if self.encoding is not None:
            d["encoding"] = self.encoding
        if self.channel_metadata:
            d["channel_metadata"] = self.channel_metadata
        return d


@dataclass
class TimestampCandidate:
    """One candidate in a timestamp resolution policy."""

    # "log_time" | "publish_time"
    mcap: str | None = None
    decoded_path: str | None = None
    decoded_well_known: str | None = None

    def to_dict(self) -> dict:
        if self.mcap is not None:
            return {"mcap": self.mcap}
        if self.decoded_path is not None:
            return {"decoded": {"path": self.decoded_path}}
        if self.decoded_well_known is not None:
            return {"decoded": {"well_known": self.decoded_well_known}}
        return {}


@dataclass
class CompiledChannelBinding:
    id: str
    match: MatchSpec
    codec: str | None = None
    codec_options: dict = field(default_factory=dict)
    where_expr: str | None = None
    timestamp_candidates: list[TimestampCandidate] = field(
        default_factory=list
    )
    is_optional: bool = False

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "match": self.match.to_dict(),
            "codec": self.codec,
            "codec_options": self.codec_options,
            "where_expr": self.where_expr,
            "timestamp_candidates": [
                c.to_dict() for c in self.timestamp_candidates
            ],
            "is_optional": self.is_optional,
        }


# ---------------------------------------------------------------------------
# Logical stream types
# ---------------------------------------------------------------------------


@dataclass
class StreamComponent:
    name: str
    channel_binding: str | None = None
    logical_stream: str | None = None

    def to_dict(self) -> dict:
        d: dict = {"name": self.name}
        if self.channel_binding is not None:
            d["source"] = {"channel_binding": self.channel_binding}
        elif self.logical_stream is not None:
            d["source"] = {"logical_stream": self.logical_stream}
        return d


@dataclass
class CompiledLogicalStream:
    id: str
    kind: str  # "bundle" | "virtual"
    components: list[StreamComponent] = field(default_factory=list)
    # Virtual stream source refs: list of {"channel_binding"|"logical_stream": id}
    sources: list[dict] = field(default_factory=list)
    where_expr: str | None = None
    metadata: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "kind": self.kind,
            "components": [c.to_dict() for c in self.components],
            "sources": self.sources,
            "where_expr": self.where_expr,
            "metadata": self.metadata,
        }


# ---------------------------------------------------------------------------
# Projection column types
# ---------------------------------------------------------------------------


@dataclass
class ValueSource:
    path: str | None = None
    expr: str | None = None

    def to_dict(self) -> dict:
        if self.path is not None:
            return {"path": self.path}
        if self.expr is not None:
            return {"expr": self.expr}
        return {}


@dataclass
class NormalizationSpec:
    kind: str = "raw"
    source_unit: str | None = None
    target_unit: str | None = None
    scale: float | None = None
    offset: float | None = None
    range: list[float] = field(default_factory=list)
    description: str | None = None

    def to_dict(self) -> dict:
        d: dict = {"kind": self.kind}
        if self.source_unit is not None:
            d["source_unit"] = self.source_unit
        if self.target_unit is not None:
            d["target_unit"] = self.target_unit
        if self.scale is not None:
            d["scale"] = self.scale
        if self.offset is not None:
            d["offset"] = self.offset
        if self.range:
            d["range"] = self.range
        if self.description is not None:
            d["description"] = self.description
        return d


@dataclass
class ComputeParameter:
    value: bool | float | str | int | None = None
    quantity: str | None = None
    unit: str | None = None
    normalization: NormalizationSpec | None = None
    description: str | None = None

    def to_dict(self) -> dict:
        d: dict = {"value": self.value}
        if self.quantity is not None:
            d["quantity"] = self.quantity
        if self.unit is not None:
            d["unit"] = self.unit
        if self.normalization is not None:
            d["normalization"] = self.normalization.to_dict()
        if self.description is not None:
            d["description"] = self.description
        return d


@dataclass
class ComputeSpec:
    """Structured compute expression. CEL string stored verbatim for now."""

    expr: str
    depends_on: list[str] = field(default_factory=list)
    parameters: dict[str, ComputeParameter] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "expr": self.expr,
            "depends_on": self.depends_on,
            "parameters": {k: v.to_dict() for k, v in self.parameters.items()},
        }


@dataclass
class CompiledColumn:
    id: str
    type: str
    value: ValueSource | None = None
    compute: ComputeSpec | None = None
    name: str | None = None
    column: str | None = None
    quantity: str | None = None
    unit: str | None = None
    normalization: NormalizationSpec | None = None
    storage: str = "scalar"
    sample_set: str | None = None
    metadata: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        d: dict = {"id": self.id, "type": self.type, "storage": self.storage}
        if self.value is not None:
            d["value"] = self.value.to_dict()
        if self.compute is not None:
            d["compute"] = self.compute.to_dict()
        if self.name is not None:
            d["name"] = self.name
        if self.column is not None:
            d["column"] = self.column
        if self.quantity is not None:
            d["quantity"] = self.quantity
        if self.unit is not None:
            d["unit"] = self.unit
        if self.normalization is not None:
            d["normalization"] = self.normalization.to_dict()
        if self.sample_set is not None:
            d["sample_set"] = self.sample_set
        if self.metadata:
            d["metadata"] = self.metadata
        return d


# ---------------------------------------------------------------------------
# Projection types
# ---------------------------------------------------------------------------


@dataclass
class CompiledProjectionSource:
    name: str
    channel_bindings: list[str] = field(default_factory=list)
    logical_streams: list[str] = field(default_factory=list)
    projections: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "channel_bindings": self.channel_bindings,
            "logical_streams": self.logical_streams,
            "projections": self.projections,
        }


@dataclass
class CompiledProjection:
    id: str
    grain: Grain
    dag_level: int
    depends_on: list[str]
    sources: list[CompiledProjectionSource]
    columns: list[CompiledColumn]
    # Raw grain-specific spec (rows/chunks/intervals/aggregate) stored verbatim.
    # Workers consume this alongside columns. Expression fields within are
    # captured as strings pending the expression engine.
    grain_spec: dict
    metadata: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "grain": self.grain.value,
            "dag_level": self.dag_level,
            "depends_on": self.depends_on,
            "sources": [s.to_dict() for s in self.sources],
            "columns": [c.to_dict() for c in self.columns],
            "grain_spec": self.grain_spec,
            "metadata": self.metadata,
        }


# ---------------------------------------------------------------------------
# Top-level compiled plan
# ---------------------------------------------------------------------------


@dataclass
class CompiledPlan:
    plan_id: str
    dataset_id: str
    compiled_at: datetime
    manifest_source: str
    channel_bindings: list[CompiledChannelBinding]
    logical_streams: list[CompiledLogicalStream]
    projections: list[CompiledProjection]  # topologically sorted
    dag_order: list[str]
    dag_levels: dict[str, list[str]]  # "0" -> [proj_ids], "1" -> [...], ...

    @staticmethod
    def make_plan_id(
        channel_bindings: list[dict],
        logical_streams: list[dict],
        projections: list[dict],
    ) -> str:
        payload = json.dumps(
            {
                "channel_bindings": channel_bindings,
                "logical_streams": logical_streams,
                "projections": projections,
            },
            sort_keys=True,
        )
        return hashlib.sha256(payload.encode()).hexdigest()

    def to_mongo_doc(self) -> dict:
        return {
            "plan_id": self.plan_id,
            "dataset_id": self.dataset_id,
            "compiled_at": self.compiled_at,
            "is_current": True,
            "manifest_source": self.manifest_source,
            "channel_bindings": [b.to_dict() for b in self.channel_bindings],
            "logical_streams": [s.to_dict() for s in self.logical_streams],
            "projections": [p.to_dict() for p in self.projections],
            "dag": {
                "order": self.dag_order,
                "levels": self.dag_levels,
            },
        }


# ---------------------------------------------------------------------------
# Job document
# ---------------------------------------------------------------------------


@dataclass
class ProjectionJob:
    plan_id: str
    dataset_id: str
    batch_index: int
    episode_paths: list[str]
    output_paths: dict[str, str]
    job_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    status: JobStatus = JobStatus.PENDING
    episode_status: dict[str, str] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: str | None = None
    delegated_operation_id: str | None = None

    def __post_init__(self):
        if not self.episode_status:
            self.episode_status = {
                ep: JobStatus.PENDING.value for ep in self.episode_paths
            }

    def to_mongo_doc(self) -> dict:
        # episode_status is stored as an array so that episode paths (which
        # contain ".", "://", etc.) are never used as MongoDB field names.
        episode_status_arr = [
            {"path": path, "status": status}
            for path, status in self.episode_status.items()
        ]
        return {
            "job_id": self.job_id,
            "plan_id": self.plan_id,
            "dataset_id": self.dataset_id,
            "batch_index": self.batch_index,
            "episode_paths": self.episode_paths,
            "status": self.status.value,
            "episode_status": episode_status_arr,
            "output_paths": self.output_paths,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "error": self.error,
            "delegated_operation_id": self.delegated_operation_id,
        }
