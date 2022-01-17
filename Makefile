IMAGENAME=fiftyone

.PHONY: app python docker docker-export

.DEFAULT_GOAL := docker-export

app:
	@cd app && yarn && yarn build && cd ..

python: app
	@python setup.py sdist bdist_wheel

docker: python
	@docker build -t voxel51/fiftyone .

docker-export: docker
	@docker save ${IMAGENAME}:latest | gzip > ${IMAGENAME}.tar.gz
