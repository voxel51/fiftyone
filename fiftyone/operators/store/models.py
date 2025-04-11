"""
Execution store models.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime, timedelta
from dataclasses import dataclass, field, asdict
from typing import Optional, Any
from enum import Enum

from bson import ObjectId


class KeyPolicy(str, Enum):
    """
    Defines the eviction policy for a key in the execution store.

    - ``PERSIST``: The key is stored persistently and will never be automatically
      removed. It must be explicitly deleted.
    - ``EVICT``: The key is considered cacheable and may be removed automatically
      if a TTL is set, or manually via :meth:`clear_cache`.
    """

    PERSIST = "persist"
    EVICT = "evict"


@dataclass
class KeyDocument:
    """Model representing a key in the store."""

    store_name: str
    key: str
    value: Any
    _id: Optional[Any] = None
    dataset_id: Optional[ObjectId] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    policy: KeyPolicy = KeyPolicy.PERSIST

    @staticmethod
    def get_expiration(ttl: Optional[int]) -> Optional[datetime]:
        """Gets the expiration date for a key with the given TTL."""
        if ttl is None:
            return None

        return datetime.utcnow() + timedelta(seconds=ttl)

    @classmethod
    def from_dict(cls, doc: dict[str, Any]) -> "KeyDocument":
        """Creates a KeyDocument from a dictionary."""
        doc = dict(doc)  # avoid mutating the original input
        raw_policy = doc.pop("policy", None)

        fallback_policy = (
            KeyPolicy.EVICT if doc.get("expires_at") else KeyPolicy.PERSIST
        )
        policy = KeyPolicy(raw_policy) if raw_policy else fallback_policy

        return cls(**doc, policy=policy)

    def to_mongo_dict(self, exclude_id: bool = True) -> dict[str, Any]:
        """Serializes the document to a MongoDB dictionary."""
        data = asdict(self)
        if exclude_id:
            data.pop("_id", None)
        if self.policy:
            data["policy"] = self.policy.value
        return data


@dataclass
class StoreDocument(KeyDocument):
    """Model representing a Store."""

    key: str = "__store__"
    value: Optional[dict[str, Any]] = None

    @property
    def metadata(self) -> dict[str, Any]:
        """The metadata associated with the store."""
        return self.value or {}
