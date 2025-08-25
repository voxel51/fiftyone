import ray

import fiftyone.core.view as fov


def serialize_samples(samples):
    dataset_name = samples._root_dataset.name
    stages = (
        samples._serialize() if isinstance(samples, fov.DatasetView) else None
    )
    return dataset_name, stages


def deserialize_samples(serialized_samples):
    import fiftyone as fo

    dataset_name, stages = serialized_samples

    dataset = fo.load_dataset(dataset_name)
    if stages is not None:
        return fov.DatasetView._build(dataset, stages)
    return dataset


class FiftyOneActor:
    """Class for FiftyOne Ray actors.

    Args:
        serialized_samples: a serialized representation of a
            :class:`fiftyone.core.collections.SampleCollection`
    """

    def __init__(self, serialized_samples, **kwargs):
        super().__init__(**kwargs)
        self.samples = deserialize_samples(serialized_samples)


class ActorPoolContext:
    """Context manager for a pool of Ray actors.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        actor_type: the :class:`FiftyOneActor` subclass to instantiate
            for each worker
        num_workers (int): the number of workers in the pool
    """

    def __init__(self, samples, actor_type, *args, num_workers=4, **kwargs):
        super().__init__()
        self.serialized_samples_ref = ray.put(serialize_samples(samples))
        self.num_workers = num_workers
        self.actor_type = actor_type
        self.actors = [
            self.actor_type.remote(
                self.serialized_samples_ref, *args, **kwargs
            )
            for _ in range(self.num_workers)
        ]
        self.pool = ray.util.ActorPool(self.actors)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        # Clean up refs
        for actor in self.actors:
            del actor

        del self.serialized_samples_ref

    def submit(self, ids, payloads):
        self.pool.submit(lambda a, v: a.run.remote(*v), (ids, payloads))
