"""
FiftyOne Teams mutations.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from dacite import Config, from_dict
import motor
from pymongo import ReturnDocument
import strawberry as gql

from .permissions import IsAuthenticated
from .query import User
from .utils import Info


@gql.input
class UserInput:
    email: str
    family_name: str
    given_name: str
    sub: str


@gql.type
class Mutation:
    @gql.mutation(permission_classes=[IsAuthenticated])
    async def login(self, user: UserInput, info: Info) -> User:
        db = info.context.db
        users: motor.MotorCollection = db.users
        updated_user = await users.find_one_and_update(
            {"sub": user.sub},
            {
                "$set": {
                    "email": user.email,
                    "family_name": user.family_name,
                    "given_name": user.given_name,
                    "sub": user.sub,
                }
            },
            return_document=ReturnDocument.AFTER,
            upsert=True,
        )

        updated_user["id"] = updated_user.pop("_id")
        return from_dict(User, updated_user, config=Config(check_types=False))
