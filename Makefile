.PHONY: app python docker docker-export

.DEFAULT_GOAL := docker-export

app:
	@cd app && yarn && yarn build && cd ..

clean:
	@rm -rf ./dist/*

python: app clean
	@python -Im build

docker: python
	@docker build -t voxel51/fiftyone .

docker-export: docker
	@docker save voxel51/fiftyone:latest | gzip > fiftyone.tar.gz
