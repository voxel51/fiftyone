import fiftyone as fo
import fiftyone.core.odm as foo
import numpy as np
import time

from tests.unittests.decorators import drop_datasets


NUM_SAMPLES = 1024


def random_polyline(size):
    return fo.Polyline(points=[np.random.random((1, 2, size)).astype(np.float32).tolist()])


def create_base_dataset():
    base = fo.Dataset("base")

    for i in range(NUM_SAMPLES):
        base.add_sample(fo.Sample(f"test_{i}.jpg", large_field=random_polyline(20)))
    
    return base


@drop_datasets
def sample_copy_benchmark():
    print("-- copy --")

    base = create_base_dataset()

    copy = fo.Dataset("copy")

    start = time.time()
    for sample in base:
        copy.add_sample(sample)
    print(f"create: {time.time() - start}s")
    
    print(f"{int(foo.get_db_conn().command('dbstats')['dataSize'])} bytes")

    start = time.time()
    loaded = list(copy)
    print(f"load: {time.time() - start}s")


@drop_datasets
def sample_reference_benchmark():
    print("-- reference --")

    base = create_base_dataset()

    ref = fo.Dataset("ref", reference=base)

    start = time.time()
    for sample in base:
        ref.add_sample(fo.SampleReference(sample, extra_field="123"))
    print(f"create: {time.time() - start}s")

    print(f"{int(foo.get_db_conn().command('dbstats')['dataSize'])} bytes")

    start = time.time()
    loaded = list(ref)
    print(f"load: {time.time() - start}s")


if __name__ == "__main__":
    sample_copy_benchmark()
    sample_reference_benchmark()

    session = fo.launch_app()
    session.wait()