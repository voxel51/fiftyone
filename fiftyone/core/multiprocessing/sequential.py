from .map import MapBackend


class SequentialMapBackend(MapBackend):
    """Executes map_samples sequentially using iter_samples."""

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
        results = {}

        for sample in sample_collection.iter_samples(
            progress=progress, autosave=save
        ):
            result = map_fcn(sample)
            if reduce_fcn and result is not None:
                results[sample.id] = result

        if reduce_fcn:
            return reduce_fcn(sample_collection, results)
        return None
