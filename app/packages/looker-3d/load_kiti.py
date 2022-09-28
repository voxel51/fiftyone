import fiftyone as fo
import fiftyone.zoo as foz
import os

# dataset = foz.load_zoo_dataset("kitti", split="train")

dataset = fo.load_dataset("kitti-copy")

dataset.add_sample_field("pcd_filepath", fo.StringField)

# firstSample = dataset.first()

# dataDir = os.path.dirname(firstSample.filepath)
# dataDirParent = os.path.dirname(dataDir)
# pointsDir = os.path.join(dataDirParent, 'pcds')
# print(pointsDir)

# for sample in dataset.iter_samples(progress=True):
#   base = os.path.basename(sample.filepath)
#   filename = os.path.splitext(base)[0]
#   pcd_filename = filename + '.bin.pcd'
#   pcd_filepath = os.path.join(pointsDir, pcd_filename)
#   sample['pcd_filepath'] = pcd_filepath
#   sample.save()
