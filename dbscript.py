import fiftyone as fo
import fiftyone.core.odm as foo
import eta.core.utils as etau


# getting database information
conn = foo.get_db_conn()
db_info = conn.command("dbstats")
print(db_info)

# you can convert these information size to more readable format
print("Data size:", etau.to_human_bytes_str(db_info["dataSize"]))
print("Storage size:", etau.to_human_bytes_str(db_info["storageSize"]))

# getting all dataset information
sample_counts = []
sizes = []
datasets = fo.list_datasets()
for dataset_name in datasets:
	dataset = fo.load_dataset(dataset_name)
	dataset_info = dataset.stats(include_indexes=True)
	sample_counts.append(dataset_info["samples_count"])
	sizes.append(dataset_info["total_bytes"])

print("Min sample count:", min(sample_counts))
print("Max sample count:", max(sample_counts))
print("Min dataset size:", etau.to_human_bytes_str(min(sizes)))
print("Max dataset size:", etau.to_human_bytes_str(max(sizes)))
