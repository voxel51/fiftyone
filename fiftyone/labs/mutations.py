"""
FiftyOne Teams mutations.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import strawberry as gql

from .context import Info
from .permissions import IsAuthenticated
from .types import User


@gql.input
class UserLogin:
    email: str
    family_name: str
    given_name: str
    sub: str


@gql.type
class LoginSuccess:
    user: User


@gql.type
class LoginError:
    message: str


LoginResult = gql.union("LoginResult", (LoginSuccess, LoginError))


@gql.type
class Mutation:
    @gql.mutation(permission_classes=[IsAuthenticated])
    def login(self, user: UserLogin, info: Info) -> User:
        print(user)
        return
