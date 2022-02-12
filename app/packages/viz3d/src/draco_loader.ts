import * as three from "three"
import * as draco from "draco3d"

import * as draco_worker_lib from "./draco_worker"
import draco_worker from "./draco_worker?worker"

import * as worker_util from "./worker_util"
export {LogLevel} from "./worker_util"

//export { DracoTaskConfig } from "./draco_worker"

// TODO: Improve performance.
// This might be too slow for smooth UI.
// As of Sun Feb 6 14:15:05 PST 2022 this can
// load ~5mb point clouds (compressed to ~650kb) in ~65ms/each. 
// ----
// Fri Feb 11 12:55:44 PST 2022
// Apple M1 Pro 8 core:
// load ~5mb point clouds (compressed to ~650kb) in ~17ms/each
// ----


// TODO: Might be faster to do batch processing.
// Measure overhead incurred from going back and 
// forth from the worker to the client side.

// TODO: Look into using some sort of shared ArrayBuffer 
// which should speed this up significantly. 
// (see: https://stackoverflow.com/questions/19152772/how-to-pass-large-data-to-web-workers)

class DracoLoaderConfig {
    public decodeConfig: draco_worker_lib.DracoTaskConfig;
    public wasmBinary: ArrayBuffer;
    public workerLimit: number = 4;
    public logLevel: draco_worker_lib.LogLevel = draco_worker_lib.LogLevel.INFO;
}

export class DracoLoader extends worker_util.WorkerPool {
    private _state: DracoLoaderConfig;

    constructor ( state: DracoLoaderConfig) {
       super(draco_worker, state.workerLimit);
        this._state = state;
        for (let i = 0; i < this._workers.length; i++){
            this._workers[i].postMessage(draco_worker_lib.createInitRequest(i, this._state.wasmBinary, this._state.logLevel));
        }
    }

    public onmessage(resolver: worker_util.Resolver, event: MessageEvent<any>) {
        let message = event.data;
        switch (message.type){
            case draco_worker_lib.ResultMessageType.DECODE:
                resolver.resolve(message.geometry);
                break;
            case draco_worker_lib.ResultMessageType.ERROR:
                resolver.reject(message.message);
                break;
        }
    }

    public decodeGeometry (buffer: ArrayBuffer): Promise<any>{
        return this.execute((worker, id) => {
            // TODO: For some reason can't use transfer here. Attempts to do so
            // throw "ArrayBuffer at index 0 is already detached" errors. Investigate this:
            // worker.postMessage(draco_worker_lib.createDecodeRequest(id, buffer, this._state.decodeConfig), [buffer]);

            worker.postMessage(draco_worker_lib.createDecodeRequest(id, buffer, this._state.decodeConfig));
        });
    }

    private _createGeometry (data) {
        let geometry = new three.BufferGeometry();
        if (data.index){
            geometry.setIndex(new three.BufferAttribute(data.index.array, 1));
        }

		for ( var i = 0; i < data.attributes.length; i ++ ) {
			var attribute = data.attributes[ i ];
			var name = attribute.name;
			var array = attribute.array;
			var itemSize = attribute.itemSize;

			geometry.setAttribute( name, new three.BufferAttribute( array, itemSize ) );
        }
        return geometry;
    }

    public loadMesh (buffer: ArrayBuffer): Promise<three.Mesh> {
        return this.decodeGeometry(buffer).then((bufferGeometry) => {
            bufferGeometry = this._createGeometry(bufferGeometry);

            var geometry;
            // Point cloud does not have face indices.
            if (bufferGeometry.index == null) {
                let material = new three.PointsMaterial({
                    vertexColors: true,
                    size: 0.0005
                });
                geometry = new three.Points(bufferGeometry, material);
            } else {
                let material = new three.MeshStandardMaterial({ vertexColors: three.VertexColors });
                if (bufferGeometry.attributes.normal === undefined) {
                    var geometryHelper = new GeometryHelper();
                    geometryHelper.computeVertexNormals(bufferGeometry);
                }
                geometry = new three.Mesh(bufferGeometry, material);
            }
            // Compute range of the geometry coordinates for proper rendering.
            bufferGeometry.computeBoundingBox();
            bufferGeometry.computeBoundingSphere();
            var sizeX = bufferGeometry.boundingBox.max.x - bufferGeometry.boundingBox.min.x;
            var sizeY = bufferGeometry.boundingBox.max.y - bufferGeometry.boundingBox.min.y;
            var sizeZ = bufferGeometry.boundingBox.max.z - bufferGeometry.boundingBox.min.z;
            var diagonalSize = Math.sqrt(sizeX * sizeX + sizeY * sizeY + sizeZ * sizeZ);
            var scale = 1.0 / diagonalSize;
            var midX =
                (bufferGeometry.boundingBox.min.x + bufferGeometry.boundingBox.max.x) / 2;
            var midY =
                (bufferGeometry.boundingBox.min.y + bufferGeometry.boundingBox.max.y) / 2;
            var midZ =
                (bufferGeometry.boundingBox.min.z + bufferGeometry.boundingBox.max.z) / 2;

            geometry.scale.multiplyScalar(scale);
            geometry.position.x = -midX * scale;
            geometry.position.y = -midY * scale;
            geometry.position.z = -midZ * scale;
            geometry.castShadow = true;
            geometry.receiveShadow = true;
            return geometry;
        });
    }

    public loadMeshes (buffers: ArrayBuffer[]): Promise<three.Mesh[]> {
        return Promise.all(buffers.map((b) => this.loadMesh(b)));
    }

    public loadRemoteMesh (url: string): Promise<three.Mesh> {
        return _loadFile("", url, "arraybuffer").then((buffer) => {
            return this.loadMesh(buffer as ArrayBuffer);
        });
    }

    public loadRemoteMeshes (urls: string[]): Promise<three.Mesh[]> {
        return Promise.all(urls.map((url) => this.loadRemoteMesh(url)));
    }
};

export class DracoLoaderBuilder {
    private _state: DracoLoaderConfig = new DracoLoaderConfig();

    // Google recommends pulling the decoder wasm from here at runtime. 
    private _decoder_url: string = "https://www.gstatic.com/draco/versioned/decoders/1.5.0/"

    constructor(){
        this._state.decodeConfig = draco_worker_lib.DEFAULT_TASK_CONFIG;
        this._state.workerLimit = 6;
        this._state.logLevel = draco_worker_lib.LogLevel.NONE;
    }

    public setDecoderUrl (url: string): DracoLoaderBuilder{
        this._decoder_url = url;
        return this;
    }

    public setWorkerCount (n: number): DracoLoaderBuilder{
        this._state.workerLimit = n
        return this;
    }

    public setDecodeConfig (config: draco_worker_lib.DracoTaskConfig): DracoLoaderBuilder{
        this._state.decodeConfig = config;
        return this;
    }

    public setLogLevel (logLevel: draco_worker_lib.LogLevel): DracoLoaderBuilder {
        this._state.logLevel = logLevel;
        return this;
    }

    public build (): Promise<DracoLoader> {
        return _loadFile(this._decoder_url, 'draco_decoder.wasm', 'arraybuffer')
            .then((buffer) => {
                this._state.wasmBinary = buffer as ArrayBuffer;
                return new DracoLoader(this._state);
            });
    }

};


type LoadResponseType = string | ArrayBuffer;

export function _loadFile (decoder_path: string, url: string, responseType: string) : Promise<LoadResponseType>{
    let loader = new three.FileLoader();
    loader.setPath(decoder_path);
    loader.setResponseType(responseType);
    return new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
    });
}