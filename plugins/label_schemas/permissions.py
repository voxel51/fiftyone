"""
Authorization for the label-schema operators.

Built on ``ctx.user`` (an
:class:`fiftyone.operators.executor.ExecutionContextUser`), which
FiftyOne Teams populates with the viewer's ``role`` and
``dataset_permission`` — the same fields the other Teams plugins gate
on. When there is no ``ctx.user`` the permission system is not being
enforced (single-user OSS), so every check passes; an ADMIN bypasses
dataset-permission thresholds.

Reads are VIEW-gated: listing/getting docs feeds the Explore schema
lens and the dataset's default-schema visibility, which must work for
every viewer of the dataset. Mutations are MANAGE-gated.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

#: Dataset permission levels, ordered. Mirrors
#: ``fiftyone.internal.dataset_permissions.DatasetPermission``.
PERMISSION_RANK = {
    "NO_ACCESS": 0,
    "VIEW": 1,
    "TAG": 2,
    "EDIT": 3,
    "MANAGE": 4,
}

ADMIN_ROLE = "ADMIN"


def permission_rank(permission) -> int:
    """Rank for a dataset permission (string or enum), 0 when unknown."""
    if permission is None:
        return 0
    value = getattr(permission, "value", permission)
    return PERMISSION_RANK.get(str(value), 0)


def is_admin(ctx) -> bool:
    user = getattr(ctx, "user", None)
    if user is None:
        return False
    return str(getattr(user, "role", None)) == ADMIN_ROLE


def has_min_dataset_permission(ctx, minimum: str) -> bool:
    """True when the viewer's dataset permission is at least ``minimum``
    (no ``ctx.user`` → unenforced → True; ADMIN → True)."""
    user = getattr(ctx, "user", None)
    if user is None:
        return True
    if is_admin(ctx):
        return True
    return permission_rank(
        getattr(user, "dataset_permission", None)
    ) >= permission_rank(minimum)


def can_read(ctx) -> bool:
    return has_min_dataset_permission(ctx, "VIEW")


def can_manage(ctx) -> bool:
    return has_min_dataset_permission(ctx, "MANAGE")
