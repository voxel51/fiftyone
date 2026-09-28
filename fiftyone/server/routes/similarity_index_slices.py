"""
FiftyOne Server /similarity-index-slices route.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request

import fiftyone.core.media as fom
from fiftyone.core.utils import run_sync_task
from fiftyone.server.decorators import route
import fiftyone.server.utils as fosu


class SimilarityIndexSlices(HTTPEndpoint):
    """The group slices a similarity index has samples in, so a search over
    a grouped dataset offers only the slices the index can match."""

    @route
    async def post(self, request: Request, data: dict):
        dataset_name = data.get("dataset")
        brain_key = data.get("brainKey")
        for name, value in (
            ("dataset", dataset_name),
            ("brainKey", brain_key),
        ):
            if not isinstance(value, str) or not value:
                raise HTTPException(
                    status_code=400,
                    detail="'%s' must be a non-empty string" % name,
                )

        return {
            "slices": await run_sync_task(
                _index_slices, dataset_name, brain_key
            )
        }


def _index_slices(dataset_name, brain_key):
    dataset = fosu.load_and_cache_dataset(dataset_name)
    if dataset.media_type != fom.GROUP:
        return []

    if brain_key not in dataset.list_brain_runs():
        raise HTTPException(
            status_code=400,
            detail="Dataset '%s' has no brain run '%s'"
            % (dataset_name, brain_key),
        )

    samples = dataset.select_group_slices(_allow_mixed=True)
    config = dataset.get_brain_info(brain_key).config
    embeddings_field = getattr(config, "embeddings_field", None)
    if embeddings_field and dataset.has_field(embeddings_field):
        # A field the run wrote marks its samples without loading the index
        covered = samples.exists(embeddings_field)
    else:
        sample_ids = dataset.load_brain_results(brain_key).sample_ids
        if sample_ids is None:
            # A backend that cannot list its samples could cover any slice
            return list(dataset.group_slices)

        covered = samples.select(list(sample_ids))

    names = set(covered.distinct(dataset.group_field + ".name"))
    return [name for name in dataset.group_slices if name in names]
