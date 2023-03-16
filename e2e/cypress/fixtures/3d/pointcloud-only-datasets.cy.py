import fiftyone as fo

dataset = fo.Dataset()
pcd_sample = fo.Sample("resources/cone.pcd")
dataset.add_sample(pcd_sample)
fo.launch_app(dataset)
