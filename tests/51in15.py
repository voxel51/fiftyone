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
sample_id = dataset.add_sample(filepath="/path/to/img.jpg", tags=["train"])
sample = dataset[sample_id]


###############################################################################
# Poking Around
###############################################################################

print_section("Poking Around")

print_snippet("len(dataset)", len(dataset))

# get all accessible fields on samples of a dataset
print_snippet("dataset.get_sample_fields()", dataset.get_sample_fields())

# @todo(Tyler)
# get all fields that are subclass of `Labels`
# dataset.get_sample_fields(type=fo.Labels)  # -> dict

# @todo(Tyler)
# dataset.sample_type  # -> type
# fiftyone.core.sample.ImageSample

print_snippet("dataset.summary()", dataset.summary())

# @todo(Tyler)
# dataset.view()  # -> fiftyone.core.view.DatasetView

# @todo(Tyler)
# grab 5 random samples
# dataset.view.sample(5)  # -> fiftyone.core.view.DatasetView

# @todo(Tyler)
# all methods on views are also valid on datasets. The dataset merely creates
# a view and calls the method on that view:
# dataset.sample(5)  # -> fiftyone.core.view.DatasetView

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

print_snippet("sample", sample)
print_snippet("dataset.get_sample_fields()", dataset.get_sample_fields())
