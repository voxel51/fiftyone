import fiftyone as fo
import fiftyone.core.odm as foo
import eta.core.utils as etau
import json


result = {}

# getting database information
conn = foo.get_db_conn()
db_info = conn.command("dbstats")
result["db_info"] = db_info
print(db_info)

# you can convert these information size to more readable format
print("Data size:", etau.to_human_bytes_str(db_info["dataSize"]))
print("Storage size:", etau.to_human_bytes_str(db_info["storageSize"]))

# getting all dataset information
sample_counts = []
sizes = []
datasets = fo.list_datasets()
field_types = {}


for dataset_name in datasets:
	dataset = fo.load_dataset(dataset_name)
	dataset_info = dataset.stats(include_indexes=True)
	sample_counts.append(dataset_info["samples_count"])
	sizes.append(dataset_info["total_bytes"])
	for field in dataset.get_field_schema().values():
		field_type = field.__class__.__name__
		field_types[field_type] = field_types.get(field_type, 0) + 1

print("Min sample count:", min(sample_counts))
print("Max sample count:", max(sample_counts))
print("Min dataset size:", etau.to_human_bytes_str(min(sizes)))
print("Max dataset size:", etau.to_human_bytes_str(max(sizes)))
print("Field distribution:", field_types)

result["samle_counts"] = sample_counts
result["min_sample_count"] = min(sample_counts)
result["max_sample_count"] = max(sample_counts)
result["sizes"] = sizes
result["min_size"] = min(sizes)
result["max_size"] = max(sizes)
result["field_distribution"] = field_types

with open("db_info.json", "w") as f:
	json.dump(result, f, indent=4)
