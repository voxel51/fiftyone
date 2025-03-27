import fiftyone as fo
import time
import pandas as pd
import argparse
from typing import List
from functools import wraps


def cleanup_after(func):
    """Decorator to automatically clean up dataset after evaluation"""

    @wraps(func)
    def wrapper(dataset, *args, **kwargs):
        # Store original fields before evaluation
        original_fields = list(dataset.get_field_schema().keys())

        try:
            # Run the evaluation function
            result = func(dataset, *args, **kwargs)
            return result
        finally:
            # Clean up regardless of whether evaluation succeeded or failed
            field_names = list(dataset.get_field_schema().keys())
            for field in field_names:
                if field not in original_fields:
                    dataset.delete_sample_field(field)

    return wrapper


def parse_worker_counts(workers_str: str) -> List[int]:
    """Parse comma-separated worker counts into a list of integers"""
    return [int(w.strip()) for w in workers_str.split(",")]


def parse_backends(backends_str: str) -> List[str]:
    """Parse comma-separated backend types into a list of strings"""
    valid_backends = ["thread", "process"]
    backends = [b.strip().lower() for b in backends_str.split(",")]

    # Validate backends
    for backend in backends:
        if backend not in valid_backends:
            raise ValueError(
                f"Invalid backend: {backend}. Must be one of: {valid_backends}"
            )

    return backends


def parse_backoff_options(backoff_str: str) -> List[bool]:
    """Parse backoff option into a list of boolean values to test"""
    valid_options = ["true", "false", "both"]
    option = backoff_str.strip().lower()
    if option not in valid_options:
        raise ValueError(
            f"Invalid backoff option: {option}. Must be one of: {valid_options}"
        )

    if option == "both":
        return [True, False]
    return [option == "true"]


@cleanup_after
def run_evaluation(dataset, config: dict) -> float:
    """Run evaluation with given configuration and return execution time"""
    print(f"\nRunning configuration: {config['name']}")

    start_time = time.time()
    try:
        # Create evaluation parameters
        kwargs = {
            "multiprocessing": config["num_workers"] > 0,
            "progress": "workers" if config["num_workers"] > 1 else True,
        }

        # Only add these parameters if using parallel processing
        if config["num_workers"] > 0:
            kwargs.update(
                {
                    "shard_method": config["shard_method"],
                    "num_workers": config["num_workers"],
                    "backend": config.get("backend", "process"),
                    "use_backoff": config.get("use_backoff", False),
                }
            )

        results = dataset.evaluate_detections(
            "detections",
            gt_field="detections",
            eval_key=f"eval_predictions_{int(time.time())}_{config['name']}",
            **kwargs,
        )
    except Exception as e:
        print(f"Error: {e}")
    duration = time.time() - start_time
    print(f"Duration: {duration:.2f} seconds")
    return duration


@cleanup_after
def run_baseline(dataset) -> float:
    """Run evaluation without beam_map to establish baseline"""
    print("\nRunning baseline (no parallelization)")
    start_time = time.time()
    results = dataset.evaluate_detections(
        "detections",
        gt_field="detections",
        eval_key=f"eval_predictions_{int(time.time())}_baseline",
        multiprocessing=False,
        progress=True,
    )
    duration = time.time() - start_time
    print(f"Baseline Duration: {duration:.2f} seconds")
    return duration


def profile_configurations(
    dataset_name: str = "bdd100k-validation",
    worker_counts: List[int] = [1, 2, 4, 8],
    shard_methods: List[str] = ["slice", "id"],
    backends: List[str] = ["process"],
    run_baseline_eval: bool = True,
    backoff_options: List[bool] = [False],
) -> pd.DataFrame:
    """Profile different configurations and return results as DataFrame"""
    # Load dataset
    dataset = fo.load_dataset(dataset_name)

    # Initialize results list
    results = []

    # Run baseline if requested
    if run_baseline_eval:
        baseline_duration = run_baseline(dataset)
        results.append(
            {
                "configuration": "baseline",
                "shard_method": "none",
                "num_workers": 0,
                "backend": "none",
                "use_backoff": False,
                "duration": baseline_duration,
            }
        )

    # Generate configurations based on input parameters
    configs = []
    for backend in backends:
        for method in shard_methods:
            for workers in worker_counts:
                # Only test backoff with parallel processing
                backoff_to_test = backoff_options if workers > 1 else [False]
                for use_backoff in backoff_to_test:
                    configs.append(
                        {
                            "name": f"{method}_{workers}w_{backend}_{'backoff' if use_backoff else 'no_backoff'}",
                            "shard_method": method,
                            "num_workers": workers,
                            "backend": backend,
                            "use_backoff": use_backoff,
                        }
                    )

    for config in configs:
        duration = run_evaluation(dataset, config)
        results.append(
            {
                "configuration": config["name"],
                "shard_method": config["shard_method"],
                "num_workers": config["num_workers"],
                "backend": config["backend"],
                "use_backoff": config["use_backoff"],
                "duration": duration,
            }
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
        help="Comma-separated list of worker counts to test (default: 1,2,4,8,16)",
    )

    parser.add_argument(
        "--shard-methods",
        type=str,
        default="slice,id",
        help="Comma-separated list of shard methods to test (default: slice,id)",
    )

    parser.add_argument(
        "--backends",
        type=str,
        default="thread,process",
        help="Comma-separated list of backends to test (options: thread,process) (default: process)",
    )

    parser.add_argument(
        "--output",
        type=str,
        default="detection_eval_performance.csv",
        help="Output CSV file path (default: detection_eval_performance.csv)",
    )

    parser.add_argument(
        "--skip-baseline",
        action="store_true",
        help="Skip running the baseline (non-parallel) evaluation",
    )

    parser.add_argument(
        "--use-backoff",
        type=str,
        default="both",
        choices=["true", "false", "both"],
        help="Use exponential backoff for retrying failed operations. Options: true, false, both",
    )

    args = parser.parse_args()

    # Parse worker counts, shard methods, and backends
    worker_counts = parse_worker_counts(args.workers)
    shard_methods = [m.strip() for m in args.shard_methods.split(",")]
    backends = parse_backends(args.backends)
    backoff_options = parse_backoff_options(args.use_backoff)

    # Run profiling
    results_df = profile_configurations(
        dataset_name=args.dataset,
        worker_counts=worker_counts,
        shard_methods=shard_methods,
        backends=backends,
        run_baseline_eval=not args.skip_baseline,
        backoff_options=backoff_options,
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

    # Analysis by backend
    print("\nAverage duration by backend:")
    print(results_df.groupby("backend")["duration"].mean())

    # Save results to CSV
    results_df.to_csv(args.output, index=False)
    print(f"\nResults saved to {args.output}")


if __name__ == "__main__":
    main()
