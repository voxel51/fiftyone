"""
DAG construction, topological sort, and cycle detection for projections.

Projections that source from other projections form a directed acyclic graph.
This module builds that graph, assigns DAG levels, and returns a topological
execution order. Circular dependencies raise immediately with a clear message.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from collections import deque


class CyclicDependencyError(ValueError):
    pass


def build_dag(
    projections: list[dict],
) -> tuple[list[str], dict[str, list[str]], dict[str, int]]:
    """Build a DAG from a flat list of resolved projection dicts.

    Args:
        projections: resolved projection dicts, each with an ``id`` key and a
            ``sources`` list whose entries may include a ``projections`` list
            of upstream projection IDs

    Returns:
        A three-tuple of:
        - ``order``: projection IDs in topological execution order
        - ``levels``: mapping of level string ("0", "1", ...) to projection ID lists
        - ``dep_map``: mapping of projection ID to list of upstream projection IDs
    """
    ids = [p["id"] for p in projections]
    id_set = set(ids)

    dep_map: dict[str, list[str]] = {}
    for proj in projections:
        upstream: list[str] = []
        for source in proj.get("sources", []):
            for pid in source.get("projections", []):
                if pid not in id_set:
                    raise ValueError(
                        f"Projection '{proj['id']}' references unknown upstream "
                        f"projection '{pid}'"
                    )
                upstream.append(pid)
        dep_map[proj["id"]] = upstream

    order = _topo_sort(ids, dep_map)
    levels = _assign_levels(order, dep_map)
    return order, levels, dep_map


def _topo_sort(ids: list[str], dep_map: dict[str, list[str]]) -> list[str]:
    """Kahn's algorithm. Raises CyclicDependencyError if a cycle is detected."""
    in_degree: dict[str, int] = {pid: 0 for pid in ids}
    dependents: dict[str, list[str]] = {pid: [] for pid in ids}

    for pid, deps in dep_map.items():
        for dep in deps:
            in_degree[pid] += 1
            dependents[dep].append(pid)

    queue: deque[str] = deque(pid for pid in ids if in_degree[pid] == 0)
    order: list[str] = []

    while queue:
        node = queue.popleft()
        order.append(node)
        for dependent in dependents[node]:
            in_degree[dependent] -= 1
            if in_degree[dependent] == 0:
                queue.append(dependent)

    if len(order) != len(ids):
        remaining = [pid for pid in ids if pid not in set(order)]
        raise CyclicDependencyError(
            f"Circular dependency detected among projections: {remaining}"
        )

    return order


def _assign_levels(
    order: list[str], dep_map: dict[str, list[str]]
) -> dict[str, list[str]]:
    """Assign each projection to a DAG level based on its longest dependency chain."""
    level_of: dict[str, int] = {}
    for pid in order:
        if not dep_map[pid]:
            level_of[pid] = 0
        else:
            level_of[pid] = max(level_of[dep] for dep in dep_map[pid]) + 1

    levels: dict[str, list[str]] = {}
    for pid, lvl in level_of.items():
        levels.setdefault(str(lvl), []).append(pid)
    return levels
