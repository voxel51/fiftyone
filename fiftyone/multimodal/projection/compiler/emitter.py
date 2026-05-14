"""
Compiled plan emitter and job dispatcher.

``emit_plan`` converts a resolved + DAG-annotated manifest into a
:class:`~.model.CompiledPlan`. ``dispatch`` slices a list of episode paths
into batches and emits :class:`~.model.ProjectionJob` documents ready for
MongoDB insertion.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from datetime import datetime

from .dag import build_dag
from .model import (
    CompiledChannelBinding,
    CompiledColumn,
    CompiledLogicalStream,
    CompiledPlan,
    CompiledProjection,
    CompiledProjectionSource,
    ComputeParameter,
    ComputeSpec,
    Grain,
    MatchSpec,
    NormalizationSpec,
    ProjectionJob,
    StreamComponent,
    TimestampCandidate,
    ValueSource,
)

_GRAIN_KEYS = {
    "observation": Grain.OBSERVATION,
    "signal_chunk": Grain.SIGNAL_CHUNK,
    "annotation": Grain.ANNOTATION,
    "segment": Grain.SEGMENT,
    "scene_summary": Grain.SCENE_SUMMARY,
}


def emit_plan(
    resolved: dict,
    dataset_id: str,
    manifest_source: str,
) -> CompiledPlan:
    """Build a :class:`~.model.CompiledPlan` from a resolved manifest dict.

    Args:
        resolved: output of :func:`~.resolver.resolve_manifest`
        dataset_id: FiftyOne dataset ObjectId string
        manifest_source: raw YAML string stored for audit

    Returns:
        a fully compiled plan with content-hashed ``plan_id``
    """
    channel_bindings = [
        _build_channel_binding(b) for b in resolved.get("channel_bindings", [])
    ]
    logical_streams = [
        _build_logical_stream(s) for s in resolved.get("logical_streams", [])
    ]

    dag_order, dag_levels, dep_map = build_dag(resolved.get("projections", []))

    level_of: dict[str, int] = {}
    for lvl_str, pids in dag_levels.items():
        for pid in pids:
            level_of[pid] = int(lvl_str)

    proj_by_id = {p["id"]: p for p in resolved.get("projections", [])}
    projections = [
        _build_projection(proj_by_id[pid], level_of[pid], dep_map[pid])
        for pid in dag_order
    ]

    cb_dicts = [b.to_dict() for b in channel_bindings]
    ls_dicts = [s.to_dict() for s in logical_streams]
    proj_dicts = [p.to_dict() for p in projections]
    plan_id = CompiledPlan.make_plan_id(cb_dicts, ls_dicts, proj_dicts)

    return CompiledPlan(
        plan_id=plan_id,
        dataset_id=dataset_id,
        compiled_at=datetime.utcnow(),
        manifest_source=manifest_source,
        channel_bindings=channel_bindings,
        logical_streams=logical_streams,
        projections=projections,
        dag_order=dag_order,
        dag_levels=dag_levels,
    )


def dispatch(
    plan: CompiledPlan,
    episode_paths: list[str],
    base_path: str,
    batch_size: int = 20,
) -> list[ProjectionJob]:
    """Slice episode paths into batches and emit one job document per batch.

    Output parquet paths follow the pattern::

        {base_path}/datasets/{dataset_id}/projections/{plan_id}/{projection_id}/part-{batch_index:04d}.parquet

    Args:
        plan: compiled plan to dispatch against
        episode_paths: GCS (or local) paths to MCAP files
        base_path: bucket/path root, e.g. ``gs://my-bucket``
        batch_size: number of episodes per job document

    Returns:
        list of :class:`~.model.ProjectionJob` documents (not yet persisted)
    """
    batches = [
        episode_paths[i : i + batch_size]
        for i in range(0, len(episode_paths), batch_size)
    ]
    jobs: list[ProjectionJob] = []
    for idx, batch in enumerate(batches):
        output_paths = {
            proj.id: (
                f"{base_path}/datasets/{plan.dataset_id}"
                f"/projections/{plan.plan_id}/{proj.id}/part-{idx:04d}.parquet"
            )
            for proj in plan.projections
        }
        jobs.append(
            ProjectionJob(
                plan_id=plan.plan_id,
                dataset_id=plan.dataset_id,
                batch_index=idx,
                episode_paths=batch,
                output_paths=output_paths,
            )
        )
    return jobs


# ---------------------------------------------------------------------------
# Channel binding builder
# ---------------------------------------------------------------------------


def _build_channel_binding(raw: dict) -> CompiledChannelBinding:
    match_raw = raw.get("match", {})
    match = MatchSpec(
        topic=match_raw.get("topic"),
        schema_name=match_raw.get("schema_name"),
        encoding=match_raw.get("encoding"),
        channel_metadata=match_raw.get("channel_metadata", {}),
    )

    candidates = []
    ts_spec = raw.get("timestamp_source", {})
    for cand in ts_spec.get("candidates", []):
        if "mcap" in cand:
            candidates.append(TimestampCandidate(mcap=cand["mcap"]))
        elif "decoded" in cand:
            decoded = cand["decoded"]
            candidates.append(
                TimestampCandidate(
                    decoded_path=decoded.get("path"),
                    decoded_well_known=decoded.get("well_known"),
                )
            )

    where_expr: str | None = None
    if where := raw.get("where"):
        where_expr = where.get("expr")

    return CompiledChannelBinding(
        id=raw["id"],
        match=match,
        codec=raw.get("codec"),
        codec_options=raw.get("codec_options", {}),
        where_expr=where_expr,
        timestamp_candidates=candidates,
        is_optional=raw.get("optional", False),
    )


# ---------------------------------------------------------------------------
# Logical stream builder
# ---------------------------------------------------------------------------


def _build_logical_stream(raw: dict) -> CompiledLogicalStream:
    kind = raw.get("kind", "bundle")

    components = []
    for comp in raw.get("components", []):
        source = comp.get("source", {})
        components.append(
            StreamComponent(
                name=comp["name"],
                channel_binding=source.get("channel_binding"),
                logical_stream=source.get("logical_stream"),
            )
        )

    sources = []
    for src in raw.get("sources", []):
        sources.append(
            {
                k: v
                for k, v in src.items()
                if k in ("channel_binding", "logical_stream", "projection")
            }
        )

    where_expr: str | None = None
    if where := raw.get("where"):
        where_expr = where.get("expr")

    return CompiledLogicalStream(
        id=raw["id"],
        kind=kind,
        components=components,
        sources=sources,
        where_expr=where_expr,
        metadata=raw.get("metadata", {}),
    )


# ---------------------------------------------------------------------------
# Projection builder
# ---------------------------------------------------------------------------


def _build_projection(
    raw: dict, dag_level: int, depends_on: list[str]
) -> CompiledProjection:
    grain_key = next(k for k in _GRAIN_KEYS if k in raw)
    grain = _GRAIN_KEYS[grain_key]

    sources = [_build_source(s) for s in raw.get("sources", [])]

    grain_spec = raw[grain_key]
    columns = _extract_columns(grain_spec, grain)

    return CompiledProjection(
        id=raw["id"],
        grain=grain,
        dag_level=dag_level,
        depends_on=depends_on,
        sources=sources,
        columns=columns,
        grain_spec=grain_spec,
        metadata=raw.get("metadata", {}),
    )


def _build_source(raw: dict) -> CompiledProjectionSource:
    return CompiledProjectionSource(
        name=raw["name"],
        channel_bindings=raw.get("channel_bindings", []),
        logical_streams=raw.get("logical_streams", []),
        projections=raw.get("projections", []),
    )


def _extract_columns(grain_spec: dict, grain: Grain) -> list[CompiledColumn]:
    """Pull the columns list out of whichever grain-specific sub-key holds it."""
    raw_columns: list[dict] = []

    if grain == Grain.OBSERVATION:
        raw_columns = grain_spec.get("columns", [])
    elif grain == Grain.SIGNAL_CHUNK:
        raw_columns = grain_spec.get("columns", [])
    elif grain == Grain.ANNOTATION:
        raw_columns = grain_spec.get("columns", [])
    elif grain == Grain.SEGMENT:
        raw_columns = grain_spec.get("columns", [])
    elif grain == Grain.SCENE_SUMMARY:
        raw_columns = grain_spec.get("columns", [])

    return [_build_column(c) for c in raw_columns]


def _build_column(raw: dict) -> CompiledColumn:
    value: ValueSource | None = None
    if v := raw.get("value"):
        value = ValueSource(path=v.get("path"), expr=v.get("expr"))

    compute: ComputeSpec | None = None
    if c := raw.get("compute"):
        params = {
            k: _build_compute_param(v)
            for k, v in c.get("parameters", {}).items()
        }
        compute = ComputeSpec(
            expr=c["expr"],
            depends_on=c.get("depends_on", []),
            parameters=params,
        )

    normalization: NormalizationSpec | None = None
    if n := raw.get("normalization"):
        normalization = NormalizationSpec(
            kind=n.get("kind", "raw"),
            source_unit=n.get("source_unit"),
            target_unit=n.get("target_unit"),
            scale=n.get("scale"),
            offset=n.get("offset"),
            range=n.get("range", []),
            description=n.get("description"),
        )

    return CompiledColumn(
        id=raw["id"],
        type=raw.get("type", "string"),
        value=value,
        compute=compute,
        name=raw.get("name"),
        column=raw.get("column"),
        quantity=raw.get("quantity"),
        unit=raw.get("unit"),
        normalization=normalization,
        storage=raw.get("storage", "scalar"),
        sample_set=raw.get("sample_set"),
        metadata=raw.get("metadata", {}),
    )


def _build_compute_param(raw: dict) -> ComputeParameter:
    normalization: NormalizationSpec | None = None
    if n := raw.get("normalization"):
        normalization = NormalizationSpec(
            kind=n.get("kind", "raw"),
            description=n.get("description"),
        )
    return ComputeParameter(
        value=raw.get("value"),
        quantity=raw.get("quantity"),
        unit=raw.get("unit"),
        normalization=normalization,
        description=raw.get("description"),
    )
