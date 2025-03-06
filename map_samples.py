"""Test map_samples"""

import argparse
import random
import time
from typing import Literal, Union
from tqdm import tqdm

import fiftyone as fo
from fiftyone.core.map import threading


def add_color(sample):
    """Simple mapping function that sleeps"""

    time.sleep(0.01)
    colors = ("red", "orange", "yellow", "green", "blue", "indigo", "purple")
    sample["color"] = random.choice(
        [c for c in colors if c != sample["color"]]
    )

    return {"id": sample.id, "color": sample["color"]}


def main(
    *_,
    function_type: Literal["map", "update"],
    limit: int,
    progress: Union[bool, Literal["workers"]],
    save: bool,
):
    """Execute maps"""

    dataset_name = "map-samples-test"
    try:
        dataset = fo.Dataset(dataset_name, persistent=True)
    except ValueError:
        dataset = fo.load_dataset(dataset_name)

    current = len(dataset)
    if current < limit:
        with tqdm(total=limit, desc="Adding samples to dataset") as pb:
            pb.update(current)
            while current < limit:
                batch_size = min(10000, limit - current)

                dataset.add_samples(
                    [
                        fo.Sample(filepath=f"/img/{i+current}.png")
                        for i in range(batch_size)
                    ],
                    progress=False,
                )
                current += batch_size
                pb.update(batch_size)

    sample_collection = dataset.limit(limit)

    mapper = threading.ThreadingMapBackend()

    start = time.time()
    if function_type == "map":
        for _ in mapper.map_samples(
            sample_collection, add_color, progress=progress, save=save
        ):
            ...
    else:
        mapper.update_samples(sample_collection, add_color, progress=progress)

    elapsed = time.time() - start

    print("elapsed:", round(elapsed, 4))
    print("samples_per_second:", round(limit / elapsed, 4))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(
        dest="function_type", help="Available functions types"
    )

    function_parsers = [
        subparsers.add_parser("map", help='Run "map_samples"'),
        subparsers.add_parser("update", help='Run "update_samples"'),
    ]

    for function_parser in function_parsers:
        function_parser.add_argument(
            "-l",
            "--limit",
            default=(default := 1000),
            type=int,
            help=(
                f"The limit for the test dataset "
                f"[{(limit_min:=1)}-{(limit_max:=1000000)}]. "
                f"Default: {default}"
            ),
        )

        function_parser.add_argument(
            "-p",
            "--progress",
            type=str,
            choices=(choices := ("y", "n", "workers")),
            default=(default := "y"),
            help=(
                "Whether to show progress bars. Choose from: ["
                f"{', '.join(choices)}]. Default: {default}."
            ),
        )

    function_parsers[0].add_argument(
        "-s",
        "--save",
        default=(default := False),
        action="store_true",
        help=f"Whether to save when mapping. Default: {default}.",
    )

    args = parser.parse_args()

    if not (limit_min := 1) < args.limit < (limit_max := 1000000):
        raise ValueError(
            f"limit must be inclusively between {limit_min} and {limit_max}."
        )

    args.progress = (
        args.progress if args.progress == "workers" else args.progress == "y"
    )

    main(**vars(args))
