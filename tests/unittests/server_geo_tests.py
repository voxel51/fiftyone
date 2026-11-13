"""Map queries follow saved subset membership and cache revisions.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
import unittest

import fiftyone as fo
import fiftyone.core.subsets as fosub
import fiftyone.server.routes.geo as geo


class GeoSubsetTests(unittest.IsolatedAsyncioTestCase):
    async def test_subset_switch_and_membership_edit(self):
        dataset = fo.Dataset()
        try:
            dataset.add_samples(
                [
                    fo.Sample(
                        filepath="/tmp/%d.png" % i,
                        location=fo.GeoLocation(point=[i, i]),
                    )
                    for i in range(3)
                ]
            )
            ids = dataset.values("id")
            subset = fosub.save_subset(dataset, "points", samples=ids[:1])
            filters = json.dumps(
                {"_selection_scope": {"subsetId": subset["id"]}}
            )
            modified = str(dataset.last_modified_at)

            async def points(scope):
                return await geo._fetch_geo_points(
                    dataset.name,
                    dataset._sample_collection_name,
                    "location.point",
                    scope,
                    None,
                    None,
                    modified,
                    str(
                        fosub.get_subset(dataset, subset["id"])[
                            "last_modified_at"
                        ]
                    ),
                )

            self.assertEqual(await points(filters), {ids[0]: [0, 0]})
            fosub.add_members(dataset, subset["id"], samples=[ids[1]])
            self.assertEqual(
                await points(filters),
                {ids[0]: [0, 0], ids[1]: [1, 1]},
            )
            self.assertEqual(set(await points(None)), set(ids))
        finally:
            geo._fetch_geo_points.cache_clear()
            dataset.delete()
