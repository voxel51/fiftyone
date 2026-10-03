"""
Authorization for the label-schema operators.

Built on ``ctx.user`` (an
:class:`fiftyone.operators.executor.ExecutionContextUser`). FiftyOne
has no users: ``ctx.user`` is ``None`` and every check passes, so the
schema lens is a visibility preference any App user may edit. FiftyOne
Enterprise populates ``ctx.user`` with the viewer's ``role`` and
``dataset_permission`` on every operator execution, and these checks
gate the operators there; an ADMIN bypasses dataset-permission
thresholds.

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
    # Enum or string, like ``permission_rank``.
    role = getattr(user, "role", None)
    return str(getattr(role, "value", role)) == ADMIN_ROLE


def has_min_dataset_permission(ctx, minimum: str) -> bool:
    """True when the viewer's dataset permission is at least ``minimum``
    (no ``ctx.user`` → no permission system → True; ADMIN → True)."""
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
