"""
FiftyOne Teams permissions

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import typing as t

import strawberry.permission as gqlp

from fiftyone.server.data import Info

from fiftyone.teams.authentication import AuthenticatedUser


class IsAuthenticated(gqlp.BasePermission):
    message = "Unauthenticated request"

    async def has_permission(
        self, source: t.Any, info: Info, **kwargs: t.Dict
    ) -> bool:
        return isinstance(info.context.request.user, AuthenticatedUser)
