"""

"""
import fiftyone.core.dataset as fod
import fiftyone.core.labels as fol
import fiftyone.core.sample as fos


dataset = fod.Dataset("test_dataset")

sample = fos.Sample.create(
    "1.jpg", tags=["train"], labels={"label1": fol.ImageLabel.create()}
)
dataset.add_sample(sample)

sample = fos.Sample.create(
    "2.jpg", tags=["test"], labels={"label2": fol.ImageLabel.create()}
)
dataset.add_sample(sample)

view = dataset.default_view()

###############################################################################
# Tags
###############################################################################

print("~~~~Tags Test~~~~")
print("  Num samples: %d" % len(view))
print("  Tags: %s" % view.get_tags())
print("Filtered: tag='train'")
view2 = view.match_tag("train")
print("  Num samples: %d" % len(view2))
print("  Tags: %s" % view2.get_tags())

###############################################################################
# Label Groups
###############################################################################

print()
print("~~~~Label Groups Test~~~~")
print("  Num samples: %d" % len(view))
print("  Label Groups: %s" % view.get_label_groups())
print("Filtered: label_group='label1'")
view2 = view.match_labels("label1")
print("  Num samples: %d" % len(view2))
print("  Label Groups: %s" % view2.get_label_groups())
