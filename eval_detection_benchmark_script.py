import fiftyone as fo
import time
import pandas as pd
import argparse
from typing import List


def parse_worker_counts(workers_str: str) -> List[int]:
    """Parse comma-separated worker counts into a list of integers"""
    return [int(w.strip()) for w in workers_str.split(",")]


def run_evaluation(dataset, config: dict) -> float:
    """Run evaluation with given configuration and return execution time"""
    print(f"\nRunning configuration: {config['name']}")

    start_time = time.time()
    results = dataset.evaluate_detections(
        "detections",
        gt_field="detections",
        eval_key=f"eval_predictions_{int(time.time())}_{config['name']}",
        use_beam_map=True,
        shard_method=config["shard_method"],
        num_workers=config["num_workers"],
        progress=True,
    )
    duration = time.time() - start_time

    print(f"Duration: {duration:.2f} seconds")
    return duration


def run_baseline(dataset) -> float:
    """Run evaluation without beam_map to establish baseline"""
    print("\nRunning baseline (no beam_map)")
    start_time = time.time()
    results = dataset.evaluate_detections(
        "detections",
        gt_field="detections",
        eval_key=f"eval_predictions_{int(time.time())}_baseline",
        use_beam_map=False,
        progress=True,
    )
    duration = time.time() - start_time
    print(f"Baseline Duration: {duration:.2f} seconds")
    return duration


def profile_configurations(
    dataset_name: str = "bdd100k-validation",
    worker_counts: List[int] = [1, 2, 4, 8],
    shard_methods: List[str] = ["slice", "id"],
) -> pd.DataFrame:
    """Profile different configurations and return results as DataFrame"""
    # Load dataset
    dataset = fo.load_dataset(dataset_name)

    # Run baseline first
    baseline_duration = run_baseline(dataset)

    # Generate configurations based on input parameters
    configs = []
    for method in shard_methods:
        for workers in worker_counts:
            configs.append(
                {
                    "name": f"{method}_{workers}w",
                    "shard_method": method,
                    "num_workers": workers,
                }
            )

    results = []
    for config in configs:
        duration = run_evaluation(dataset, config)
        results.append(
            {
                "configuration": config["name"],
                "shard_method": config["shard_method"],
                "num_workers": config["num_workers"],
                "duration": duration,
            }
        )

    # Add baseline to results
    results.insert(
        0,
        {
            "configuration": "baseline",
            "shard_method": "none",
            "num_workers": 0,
            "duration": baseline_duration,
        },
    )

    # Convert to DataFrame for easy analysis
    df = pd.DataFrame(results)
    df = df.sort_values("duration")

    return df


def main():
    parser = argparse.ArgumentParser(
        description="Profile FiftyOne detection evaluation performance"
    )

    parser.add_argument(
        "--dataset",
        type=str,
        default="bdd100k-validation",
        help="Name of the dataset to use (default: bdd100k-validation)",
    )

    parser.add_argument(
        "--workers",
        type=str,
        default="1,2,4,8,16",
        help="Comma-separated list of worker counts to test (default: 1,2,4,8)",
    )

    parser.add_argument(
        "--shard-methods",
        type=str,
        default="slice,id",
        help="Comma-separated list of shard methods to test (default: slice,id)",
    )

    parser.add_argument(
        "--output",
        type=str,
        default="detection_eval_performance.csv",
        help="Output CSV file path (default: detection_eval_performance.csv)",
    )

    args = parser.parse_args()

    # Parse worker counts and shard methods
    worker_counts = parse_worker_counts(args.workers)
    shard_methods = [m.strip() for m in args.shard_methods.split(",")]

    # Run profiling
    results_df = profile_configurations(
        dataset_name=args.dataset,
        worker_counts=worker_counts,
        shard_methods=shard_methods,
    )

    # Print summary
    print("\n=== Performance Summary ===")
    print("\nSorted by execution time:")
    print(results_df.to_string(index=False))

    # Analysis by shard method
    print("\nAverage duration by shard method:")
    print(results_df.groupby("shard_method")["duration"].mean())

    # Analysis by number of workers
    print("\nAverage duration by number of workers:")
    print(results_df.groupby("num_workers")["duration"].mean())

    # Save results to CSV
    results_df.to_csv(args.output, index=False)
    print(f"\nResults saved to {args.output}")


if __name__ == "__main__":
    main()
