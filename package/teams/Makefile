.PHONY: python docker docker-export

.DEFAULT_GOAL := docker-export

python:
	@python setup.py sdist bdist_wheel

docker: python
	@docker build -t voxel51/fiftyone-teams-app .

docker-export: docker
	@docker save voxel51/fiftyone-teams-app:latest | gzip > fiftyone-teams-app.tar.gz
