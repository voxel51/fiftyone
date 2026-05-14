"""
MCAP projection manifest compiler.

Converts a manifest YAML into a :class:`~.model.CompiledPlan` and emits
:class:`~.model.ProjectionJob` documents ready for MongoDB insertion.

Pipeline::

    parse_manifest()   — YAML → raw validated dict
        ↓
    expand_manifest()  — expand {{var.field}} repeat blocks
        ↓
    resolve_manifest() — validate all cross-references
        ↓
    emit_plan()        — build CompiledPlan with content hash + DAG
        ↓
    dispatch()         — slice episodes into batched job documents

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from .emitter import dispatch, emit_plan
from .expander import expand_manifest
from .model import CompiledPlan, JobStatus, ProjectionJob
from .parser import parse_manifest
from .resolver import resolve_manifest

__all__ = [
    "compile",
    "dispatch",
    "save",
    "CompiledPlan",
    "ProjectionJob",
    "JobStatus",
]


def compile(yaml_source: str, dataset_id: str) -> CompiledPlan:
    """Compile a manifest YAML string into a :class:`~.model.CompiledPlan`.

    Runs all compiler phases in order: parse → expand → resolve → emit.

    Args:
        yaml_source: raw manifest YAML string
        dataset_id: FiftyOne dataset ObjectId string that owns this plan

    Returns:
        a :class:`~.model.CompiledPlan` with a content-addressed ``plan_id``

    Raises:
        :class:`~.parser.ManifestParseError`: on invalid YAML structure
        :class:`~.expander.TemplateExpansionError`: on bad template interpolation
        :class:`~.resolver.ManifestResolveError`: on unknown cross-references
        :class:`~.dag.CyclicDependencyError`: on circular projection dependencies
    """
    raw = parse_manifest(yaml_source)
    expanded = expand_manifest(raw)
    resolved = resolve_manifest(expanded)
    return emit_plan(
        resolved, dataset_id=dataset_id, manifest_source=yaml_source
    )


def save(
    yaml_source: str,
    dataset_id: str,
    episode_paths: list,
    base_path: str,
    batch_size: int = 20,
) -> tuple:
    """Compile a manifest, persist the plan and jobs to MongoDB, and return both.

    This is the primary entry point for end-to-end ingestion. It:
      1. Compiles the manifest YAML into a :class:`~.model.CompiledPlan`
      2. Writes the plan to ``multimodal_manifest_plans`` (upsert by plan_id,
         demoting any previously current plan for this dataset)
      3. Batches ``episode_paths`` into jobs and inserts them into
         ``multimodal_projection_jobs``

    Args:
        yaml_source: raw manifest YAML string
        dataset_id: FiftyOne dataset ObjectId string
        episode_paths: GCS (or local) MCAP file paths to dispatch
        base_path: output path root, e.g. ``gs://my-bucket``
        batch_size: episodes per worker job

    Returns:
        ``(plan_doc, job_docs)`` — persisted MongoDB documents
    """
    from fiftyone.factory.repo_factory import RepositoryFactory

    plan = compile(yaml_source, dataset_id=dataset_id)
    jobs = dispatch(
        plan, episode_paths, base_path=base_path, batch_size=batch_size
    )

    repo = RepositoryFactory.projection_repo()
    plan_doc = repo.save_plan(plan)
    job_docs = repo.save_jobs(jobs)

    return plan_doc, job_docs
