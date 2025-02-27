from concurrent.futures import ThreadPoolExecutor

import fiftyone.core.utils as fou

from .map import MapBackend


class ThreadMapBackend(MapBackend):
    """Executes map_samples using threads."""

    def map_samples(
        self,
        sample_collection,
        map_fcn,
        reduce_fcn=None,
        save=None,
        num_workers=None,
        shard_size=None,
        shard_method="id",
        progress=None,
    ):
        max_workers = fou.recommend_thread_pool_workers(num_workers)
        results = {}

        def process_sample(sample):
            result = map_fcn(sample)
            return (sample.id, result) if result is not None else None

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [
                executor.submit(process_sample, sample)
                for sample in sample_collection
            ]
            for fut in futures:
                res = fut.result()
                if res and reduce_fcn:
                    sample_id, output = res
                    results[sample_id] = output

        if reduce_fcn:
            return reduce_fcn(sample_collection, results)
        return None
