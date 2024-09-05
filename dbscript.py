import json
import base64
from bson.timestamp import Timestamp

import fiftyone as fo
import fiftyone.core.odm as foo
import eta.core.utils as etau


def retrieve_db_info(output_file="db_result.json", max_dataset_count=10000):
    result = {}

    # getting database information
    conn = foo.get_db_conn()
    db_info = conn.command("dbstats")
    result["db_info"] = db_info

    # you can convert these information size to more readable format
    print("Data size:", etau.to_human_bytes_str(db_info["dataSize"]))
    print("Storage size:", etau.to_human_bytes_str(db_info["storageSize"]))

    # getting all dataset information
    sample_counts = []
    sizes = []
    sample_sizes = []
    datasets = fo.list_datasets()
    field_types = {}

    with etau.ProgressBar() as pb:
        n = min(len(datasets), max_dataset_count)
        for i in pb(range(n)):
            dataset_name = datasets[i]

            try:
                dataset = fo.load_dataset(dataset_name)
                dataset_info = dataset.stats(include_indexes=True)
                sample_counts.append(dataset_info["samples_count"])
                sizes.append(dataset_info["total_bytes"])
                sample_sizes.append(dataset_info["samples_bytes"])
                for field in dataset.get_field_schema().values():
                    field_type = field.__class__.__name__
                    field_types[field_type] = (
                        field_types.get(field_type, 0) + 1
                    )
            except Exception as e:
                print(f"Error processing dataset '{dataset_name}': {e}")

    print("Number of datasets:", len(datasets))
    print("Min sample count:", min(sample_counts))
    print("Max sample count:", max(sample_counts))
    print("Min dataset size:", etau.to_human_bytes_str(min(sizes)))
    print("Max dataset size:", etau.to_human_bytes_str(max(sizes)))
    print("Min sample size:", etau.to_human_bytes_str(min(sample_sizes)))
    print("Max sample size:", etau.to_human_bytes_str(max(sample_sizes)))
    
    print("Field distribution:", field_types)

    result["samle_counts"] = sample_counts
    result["min_sample_count"] = min(sample_counts)
    result["max_sample_count"] = max(sample_counts)
    result["num_datasets"] = len(datasets)
    result["sizes"] = sizes
    result["min_size"] = min(sizes)
    result["max_size"] = max(sizes)
    result["sample_sizes"] = sample_sizes
    result["min_sample_size"] = min(sample_sizes)
    result["max_sample_size"] = max(sample_sizes)
    result["field_distribution"] = field_types

    def custom_serializer(obj):
        if isinstance(obj, Timestamp):
            return str(obj)  # Convert to string
        elif isinstance(obj, bytes):
            return base64.b64encode(obj).decode(
                "utf-8"
            )  # Convert bytes to base64-encoded string
        raise TypeError(f"Type {type(obj)} is not serializable")

    with open(output_file, "w") as f:
        json.dump(result, f, indent=4, default=custom_serializer)
        print(
            f"Finished exporting information to {output_file}, {len(sizes)}/{len(datasets)} datasets processed successfully!"
        )


if __name__ == "__main__":
    retrieve_db_info()
