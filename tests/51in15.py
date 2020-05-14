"""
Fiftyone if fifteen minutes

"""
from pprint import pprint

import fiftyone as fo


def print_section(section_name):
    print("_" * 40 + section_name + "_" * 40)
    print()


def print_snippet(snippet_str, snippet):
    print("%s -> %s" % (snippet_str, type(snippet)))
    if isinstance(snippet, dict):
        pprint(snippet)
    else:
        print(snippet)
    print()


dataset = fo.Dataset("fiftyone_in_fifteen")
sample_id = dataset.add_sample(filepath="/path/to/img1.jpg", tags=["train"])
dataset.add_sample(
    filepath="/path/to/img2.jpg",
    tags=["train"],
    metadata=fo.Metadata(size_bytes=1024, mime_type=".jpg"),
)
dataset.add_sample(filepath="/path/to/img3.jpg", tags=["test"])
sample = dataset[sample_id]

###############################################################################
# Poking Around
###############################################################################

print_section("Poking Around")

print_snippet("len(dataset)", len(dataset))

# get all accessible fields on samples of a dataset
print_snippet("dataset.get_sample_fields()", dataset.get_sample_fields())

# get all fields that are subclass of `Label`
print_snippet(
    "dataset.get_sample_fields(field_type=fo.Label)",
    dataset.get_sample_fields(field_type=fo.Label),
)

# @todo(Tyler)
# dataset.sample_type  # -> type
# fiftyone.core.sample.ImageSample

print_snippet("dataset.summary()", dataset.summary())

print_snippet("dataset.view()", dataset.view())

print_snippet("dataset.view().take(5)", dataset.view().take(5))
print_snippet("len(dataset.view().take(5))", len(dataset.view().take(5)))

###############################################################################
# Basics with DatasetViews
###############################################################################

print_section("Basics with DatasetViews")

view = dataset.view()

print('view.sort_by("filepath", reverse=True)')
for sample in view.sort_by("filepath", reverse=True):
    print("\t", sample.filepath)
print()

print('view.sort_by("model_1_preds.confidence")')
for sample in view.sort_by("model_1_preds.confidence", reverse=True):
    print("\t", sample.filepath)
print()

print("view.skip(1).limit(1).first().filepath")
print(view.skip(1).limit(1).first().filepath)
print()
print("view[1:2].first().filepath")
print(view[1:2].first().filepath)
print()

view = dataset.view()
print_snippet("view[str(sample.id)]", view[str(sample.id)])

print("view[0]")
try:
    view[0]
except Exception as e:
    print("%s: %s" % (type(e), e))
print()

print_snippet(
    'len(view.match({"tags": "train"}))', len(view.match({"tags": "train"}))
)

id = str(sample.id)
print_snippet("len(view.select([id]))", len(view.select([id])))
print_snippet("len(view.exclude([id]))", len(view.exclude([id])))

# samples that have the `sample.metadata` field populated
print_snippet(
    '[s.metadata for s in dataset.view().exists("metadata")]',
    [s.metadata for s in dataset.view().exists("metadata")],
)

print("chaining view operations:")
snippet_str = """
view = (
    dataset
    .view()
    .match({"tags": "train"})
    .exists("file_hash")
    .sort_by("filepath")[10:20]
    .take(5)
)
"""
view = (
    dataset.view()
    .match({"tags": "train"})
    .exists("file_hash")
    .sort_by("filepath")[10:20]
    .take(5)
)
print_snippet(snippet_str, view)

# add one or more samples to a dataset
print_snippet(
    'dataset.add_sample(filepath="new1.jpg")',
    dataset.add_sample(filepath="new1.jpg"),
)

snippet_str = """
dataset.add_samples(
    [
        {"filepath": "new_batch1.jpg"},
        {"filepath": "new_batch2.jpg"},
        {"filepath": "new_batch3.jpg"},
        {"filepath": "new_batch4.jpg"},
    ]
)
"""
snippet = dataset.add_samples(
    [
        {"filepath": "new_batch1.jpg"},
        {"filepath": "new_batch2.jpg"},
        {"filepath": "new_batch3.jpg"},
        {"filepath": "new_batch4.jpg"},
    ]
)
print_snippet(snippet_str, snippet)

# samples can NOT be added to a view
print('view.add_sample(filepath="new1.jpg")')
try:
    view.add_sample(filepath="new1.jpg")
except Exception as e:
    print("%s: %s" % (type(e), e))
print()

# @todo(Tyler)
# # delete all matching samples
# view.delete_samples()

# delete a single sample
sample = dataset[sample_id]
print("del dataset[sample_id]")
del dataset[sample_id]
print("sample = dataset[sample_id]")
try:
    sample = dataset[sample_id]
except Exception as e:
    print("%s: %s" % (type(e), e))
print()

###############################################################################
# Fields of Samples
###############################################################################

print_section("Fields of Samples")

print_snippet("sample", sample)
print_snippet("dataset.get_sample_fields()", dataset.get_sample_fields())

print_snippet("sample.id", sample.id)
print_snippet("sample.filepath", sample.filepath)
print_snippet("sample.tags", sample.tags)
print_snippet("sample.metadata", sample.metadata)

sample["my_boolean"] = True
print_snippet('sample["my_boolean"]', sample["my_boolean"])
print_snippet("sample.my_boolean", sample.my_boolean)

sample["my_int"] = 51
print_snippet('sample["my_int"]', sample["my_int"])
print_snippet("sample.my_int", sample.my_int)

sample["my_string"] = "fiftyone"
print_snippet('sample["my_string"]', sample["my_string"])
print_snippet("sample.my_string", sample.my_string)

sample["my_list"] = ["fifty", "one"]
print_snippet('sample["my_list"]', sample["my_list"])
print_snippet("sample.my_list", sample.my_list)

sample["my_dict"] = {"fifty": 50, "one": "uno"}
print_snippet('sample["my_dict"]', sample["my_dict"])
print_snippet("sample.my_dict", sample.my_dict)

sample["my_label"] = fo.Classification(label="cow", confidence=0.98)
print_snippet('sample["my_label"]', sample["my_label"])
print_snippet("sample.my_label", sample.my_label)

print_snippet("sample", sample)
print_snippet("dataset.get_sample_fields()", dataset.get_sample_fields())

print("sample.my_list = 67")
try:
    sample.my_list = 67
except Exception as e:
    print("%s: %s" % (type(e), e))
print()

# @todo(Tyler)
# ListFields only contain elements of one Field type
sample.my_list = [1, 2]
# ValidationError: StringField only accepts string values: ['my_field']

# @todo(Tyler)
# dataset.delete_field("my_list")
# sample["my_list"] = 9
# print_snippet("dataset.get_sample_fields()", dataset.get_sample_fields())
