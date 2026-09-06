"""
Turns a local sample collection into a push plan: the metadata documents,
the media manifest, and the local→destination filepath map. Samples are
duck-typed (``filepath`` + ``to_dict()``) so this module stays free of
fiftyone imports and the plan logic tests without a database.
"""

import hashlib
import os
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List

from .session import ManifestEntry, ManifestSummary

MEDIA_KEY_ROOT = "media"


@dataclass(frozen=True)
class MediaEntry:
    """One local file and its destination key relative to the session prefix."""

    local_path: str
    dest_key: str
    size_bytes: int


@dataclass(frozen=True)
class PushPlan:
    sample_docs: List[Dict[str, Any]]
    media: List[MediaEntry]
    missing: List[str] = field(default_factory=list)

    @property
    def summary(self) -> ManifestSummary:
        return ManifestSummary(
            file_count=len(self.media),
            total_bytes=sum(entry.size_bytes for entry in self.media),
        )

    @property
    def manifest_entries(self) -> List[ManifestEntry]:
        """The summary itemized, in the wire's shape. Destination keys are
        already stable here, so a per-object admission decision can be made
        against this before any bytes move."""
        return [
            ManifestEntry(dest_key=entry.dest_key, size_bytes=entry.size_bytes)
            for entry in self.media
        ]

    def filepath_map(self, prefix: str) -> Dict[str, str]:
        return {
            entry.local_path: f"{prefix}{entry.dest_key}"
            for entry in self.media
        }


def dest_key_for(local_path: str, taken: Dict[str, str]) -> str:
    """A stable destination key: the basename, disambiguated by a short
    digest of the full local path on collision. Deterministic across runs,
    which is what makes re-running a push resumable."""
    base = os.path.basename(local_path)
    key = f"{MEDIA_KEY_ROOT}/{base}"
    if taken.get(key, local_path) == local_path:
        return key

    stem, extension = os.path.splitext(base)
    digest = hashlib.sha1(local_path.encode("utf-8")).hexdigest()[:8]
    return f"{MEDIA_KEY_ROOT}/{stem}-{digest}{extension}"


def build_push_plan(samples: Iterable[Any]) -> PushPlan:
    """Plans a push for the given samples (a dataset, a view, or any
    iterable of sample-shaped objects)."""
    sample_docs: List[Dict[str, Any]] = []
    media: List[MediaEntry] = []
    missing: List[str] = []
    keys_taken: Dict[str, str] = {}
    planned_paths = set()
    # The list is the plan's contract; this mirrors it for the per-sample
    # membership test, which the loop below runs once per sample. Planning
    # is on the interactive path now, behind a spinner.
    missing_paths = set()

    for sample in samples:
        local_path = sample.filepath
        if local_path not in planned_paths:
            planned_paths.add(local_path)
            if os.path.isfile(local_path):
                dest_key = dest_key_for(local_path, keys_taken)
                keys_taken[dest_key] = local_path
                media.append(
                    MediaEntry(
                        local_path=local_path,
                        dest_key=dest_key,
                        size_bytes=os.path.getsize(local_path),
                    )
                )
            else:
                missing.append(local_path)
                missing_paths.add(local_path)

        # A sample whose media is absent locally is excluded outright — a
        # metadata document pointing at bytes that never uploaded would
        # just come back as a per-sample rejection.
        if local_path not in missing_paths:
            sample_docs.append(sample.to_dict(include_private=True))

    return PushPlan(sample_docs=sample_docs, media=media, missing=missing)
