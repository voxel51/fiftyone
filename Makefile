.PHONY: app python docker docker-export

.DEFAULT_GOAL := docker-export

app:
	@cd app && yarn && yarn build && cd ..

python: app
	@python -Im build

docker: python
	@docker build -t voxel51/fiftyone .

docker-export: docker
	@docker save voxel51/fiftyone:latest | gzip > fiftyone.tar.gz
