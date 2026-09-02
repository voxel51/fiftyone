"""
Tests for the model zoo's manifest memoization.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import contextlib
from unittest import mock

import fiftyone as fo
import fiftyone.zoo.models as fozm

SOURCE = "https://github.com/voxel51/openai-clip"


@contextlib.contextmanager
def _manifest(cache_enabled, remote_sources=None):
    """Runs with the memo in the given config state and empty, over a manifest
    whose every build is counted and whose downloads are stubbed out.

    Yields ``(build, download, remote_sources)``; mutating ``remote_sources``
    stands in for a source another process registered on disk.
    """
    if remote_sources is None:
        remote_sources = {}

    with mock.patch.object(
        fo.config, "model_zoo_manifest_cache_enabled", cache_enabled
    ), mock.patch.object(
        fozm,
        "_build_zoo_models_manifest",
        side_effect=lambda: (mock.Mock(), remote_sources),
    ) as build, mock.patch.object(
        fozm, "_download_model_metadata"
    ) as download:
        fozm._invalidate_zoo_models_manifest()
        try:
            yield build, download, remote_sources
        finally:
            fozm._invalidate_zoo_models_manifest()


class TestManifestMemoDisabled:
    """The default: building the manifest parses every manifest on disk, but a
    local session can repoint ``model_zoo_dir`` or register a source from
    another process and expects the next call to see it.
    """

    def test_it_is_off_by_default(self):
        assert fo.config.model_zoo_manifest_cache_enabled is False

    def test_every_load_reads_disk_again(self):
        with _manifest(cache_enabled=False) as (build, _, _):
            fozm._load_zoo_models_manifest()
            fozm._load_zoo_models_manifest()

            assert build.call_count == 2

    def test_a_source_registered_elsewhere_is_seen(self):
        with _manifest(cache_enabled=False) as (_, _, remote_sources):
            fozm._load_zoo_models_manifest()
            remote_sources[SOURCE] = object()

            _, sources = fozm._load_zoo_models_manifest()

            assert SOURCE in sources


class TestManifestMemoEnabled:
    """Memoized for the life of the process, so a service reaching it per
    request pays for the build once — and whatever writes a new manifest to
    disk has to drop the memo, since the lookup that follows a download reads
    through it and would otherwise miss what was just fetched.
    """

    def test_repeat_loads_build_once(self):
        with _manifest(cache_enabled=True) as (build, _, _):
            fozm._load_zoo_models_manifest()
            fozm._load_zoo_models_manifest()

            assert build.call_count == 1

    def test_a_download_is_visible_to_the_next_lookup(self):
        with _manifest(cache_enabled=True) as (build, download, sources):
            fozm._parse_model_identifier(SOURCE)
            builds_before = build.call_count
            sources[SOURCE] = object()

            _, loaded = fozm._load_zoo_models_manifest()

            download.assert_called_once()
            assert build.call_count > builds_before
            assert SOURCE in loaded

    def test_a_source_already_registered_keeps_the_memo(self):
        # Nothing was written, so re-reading every manifest on disk would be
        # the cost this memo exists to avoid
        with _manifest(
            cache_enabled=True, remote_sources={SOURCE: object()}
        ) as (build, download, _):
            fozm._parse_model_identifier(SOURCE)
            builds_before = build.call_count

            fozm._load_zoo_models_manifest()

            download.assert_not_called()
            assert build.call_count == builds_before
