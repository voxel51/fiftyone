"""Sample Example

- `tag`: sample splits (or groupings because they could intersect)
  `[train, test, validation, etc.]`
- `insight`: `feature`, `attribute`, etc.
- `*_group`: a `label_group` or `insight_group`, the group that spans across
  samples, e.g.
  `label_groups = [ground_truth, model_1_preds, ...]`
  `insight_groups = [file_hash, hardness_1, hardness_2, ...]`
- `*Set`: a `sample.labels`/`sample.insights` returns a `LabelSet`/`InsightSet`
  of all `Label`/`Insight`s for a single sample
"""
import fiftyone as fo
import fiftyone.core.dataset as fod
import fiftyone.core.labels as fol
import fiftyone.core.view as fov

dataset = fod.Dataset(name="cifar100")
sample = next(dataset.iter_samples())

###############################################################################
# TAGS
###############################################################################

# samples can have arbitrary tags
print(sample.get_tags())
# ['train']

###############################################################################
# LABELS
###############################################################################

print(type(sample.get_labels()))
# <class 'dict'>

print(type(sample.get_label("ground_truth_fine")))
# <fiftyone.core.label.ClassificationLabel>

print(sample.get_label("ground_truth_fine"))
# {
#     "label": "mountain",
#     "confidence": null
# }

# @todo(Tyler)
# print(sample.get_label("ground_truth_fine").group)
# "ground_truth_fine"

# @todo(Tyler)
# print(sample.labels["model_1_pred"])
# {
#     "label": "cattle",
#     "confidence": 0.43415618
# }

###############################################################################
# INSIGHTS
###############################################################################

# @todo(Tyler)
# print(type(sample.insights))
# <class 'dict'>

# @todo(Tyler)
# print(type(sample.insights["model_1_hardness"]))
# <fiftyone.core.insight.HardnessInsight>

# @todo(Tyler)
# print(sample.insights["model_1_hardness"].group)
# "model_1_hardness"

# @todo(Tyler)
# print(sample.insights["model_1_hardness"])
# {
#     "hardness": 0.98457465762,
#     "ground_truth": "ground_truth_fine"
#     "prediction": "model_1_pred"
# }

###############################################################################
# TAGS/GROUPS ON DATASETS
###############################################################################

print(dataset.get_tags())
# ["train", "test"]

# @todo(Tyler)
# dataset.get_label_groups()
# ["ground_truth_fine", "ground_truth_coarse", "model_1_pred", "model_2_pred"]

# @todo(Tyler)
# dataset.get_insight_groups()
# ["file_hash", "model_1_hardness", "model_2_hardness"]

###############################################################################
# DATASET VIEWS
###############################################################################

# @todo(Tyler)
# Give me the top 10 hardest samples with GT label of 'mountain'
# view = (
#     fov.DatasetView(dataset=dataset)
#     .filter({"labels.ground_truth_label.label": "mountain"})
#     .sort("insights.model_1_hardness.hardness", order=fov.DESCENDING)
#     .limit(10)
# )

# @todo(Tyler)
# Give me 5 random samples that have "model_1_pred" label on them
# view = (
#     fov.DatasetView(dataset=dataset)
#     .filter({"labels": "model_1_pred"})
#     .sample(5)
# )

# iterate the query
# for sample in view.iter_samples():
#     print(sample.filepath)

# @todo(Tyler)
# browse the images
# session = fo.launch_dashboard(view=view)
