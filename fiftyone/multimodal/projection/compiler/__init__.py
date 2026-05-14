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

import logging

from .emitter import dispatch, emit_plan
from .expander import expand_manifest
from .model import CompiledPlan, JobStatus, ProjectionJob
from .parser import parse_manifest
from .resolver import resolve_manifest

logger = logging.getLogger(__name__)

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

    This is the primary entry point for end-to-end ingestion. It handles two
    scenarios correctly:

    **New manifest** — the compiled SHA-256 differs from the current plan, so a
    new plan is created, the old one is demoted, and jobs are created for all
    episode paths.

    **New episodes, same manifest** — the compiled SHA-256 matches the existing
    plan.  Only episode paths not already assigned to a job are dispatched;
    batch indices continue from the highest existing batch so there are no
    collisions.  If all paths are already covered, no new jobs are created.

    Args:
        yaml_source: raw manifest YAML string
        dataset_id: FiftyOne dataset ObjectId string
        episode_paths: GCS (or local) MCAP file paths to dispatch
        base_path: output path root, e.g. ``gs://my-bucket``
        batch_size: episodes per worker job

    Returns:
        ``(plan_doc, job_docs)`` — persisted MongoDB documents; ``job_docs``
        is empty when all paths were already covered
    """
    from fiftyone.factory.repo_factory import RepositoryFactory

    plan = compile(yaml_source, dataset_id=dataset_id)
    repo = RepositoryFactory.projection_repo()

    # Filter out episode paths that already have jobs for this plan so that
    # re-calling save() with new files doesn't re-queue already-processed ones.
    covered = repo.get_all_episode_paths(plan.plan_id)
    new_paths = [p for p in episode_paths if p not in covered]

    if covered:
        logger.info(
            "plan %s: %d/%d episodes already covered, dispatching %d new",
            plan.plan_id[:8],
            len(covered),
            len(episode_paths),
            len(new_paths),
        )

    # New batch indices continue from the highest existing batch so they don't
    # collide with already-inserted jobs for this plan.
    start_idx = repo.get_next_batch_index(plan.plan_id) if new_paths else 0
    jobs = dispatch(
        plan,
        new_paths,
        base_path=base_path,
        batch_size=batch_size,
        start_batch_index=start_idx,
    )

    plan_doc = repo.save_plan(plan)
    job_docs = repo.save_jobs(jobs)

    return plan_doc, job_docs
