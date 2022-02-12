import * as draco from "draco3d"
import * as worker_utils from "./worker_util"
import { ResultMessage } from "./thumbnail_worker";

export {LogLevel} from "./worker_util"

// Based on Google Draco loader example https://github.com/google/draco/blob/master/javascript/example/DRACOLoader.js

export enum ControlMessgeType {
    INIT,
    DECODE
};

export enum ResultMessageType {
    DECODE,
    ERROR
};

export interface AttributeIDs {
    position: string;
    normal: string;
    color: string;
    uv: string;
};

export const DEFAULT_ATTRIBUTE_IDs: AttributeIDs = {
    position: "POSITION",
    normal: "NORMAL",
    color: "COLOR",
    uv: "TEX_COORD"
};

export interface AttributeTypes {
    position: string;
    normal: string;
    color: string;
    uv: string;
};

export const DEFAULT_ATTRIBUTE_TYPES: AttributeTypes = {
    position: "Float32Array",
    normal: "Float32Array",
    color: "Float32Array",
    uv: "Float32Array"
};

export interface DecoderConfig {};

export interface DracoTaskConfig {
    attributeIDs: AttributeIDs;
    attributeTypes: AttributeTypes;
    useUniqueIDs: boolean;
};

export const DEFAULT_TASK_CONFIG: DracoTaskConfig = {
    attributeIDs: DEFAULT_ATTRIBUTE_IDs,
    attributeTypes: DEFAULT_ATTRIBUTE_TYPES,
    useUniqueIDs: false
};


export class DracoWorkerControlMessage {
    type: ControlMessgeType;
    id: number;
    log_level?: worker_utils.LogLevel;
    dracoBinary?: ArrayBuffer;
    decodeConfig?: DracoTaskConfig;
    buffer?: ArrayBuffer;

    private constructor () {}
    public static initMessage (id: number, wasmBinary: ArrayBuffer, log_level: worker_utils.LogLevel): DracoWorkerControlMessage {
        let res = new DracoWorkerControlMessage();
        res.id = id;
        res.dracoBinary = wasmBinary;
        res.type = ControlMessgeType.INIT;
        res.log_level = log_level;
        return res;
    }

    public static decodeMessage (id: number, config: DracoTaskConfig, buffer: ArrayBuffer): DracoWorkerControlMessage {
        let res = new DracoWorkerControlMessage();
        res.type = ControlMessgeType.DECODE;
        res.id = id;
        res.buffer = buffer;
        res.decodeConfig = config;
        return res;
    }
};

export class DracoWorkerResultMessage {
    type: ResultMessageType;
    id: number;
    message: string;
    buffer?: ArrayBuffer;

    private constructor() {}

    public static decodeMessage (id: number, buffer: ArrayBuffer): DracoWorkerResultMessage {
        let res = new DracoWorkerResultMessage();
        res.id = id;
        res.type = ResultMessageType.DECODE;
        res.buffer = buffer;
        return res;
    }

    public static errorMessage (id: number, message: string): DracoWorkerResultMessage {
        let res = new DracoWorkerResultMessage();
        res.type = ResultMessageType.ERROR;
        res.id = id;
        res.message = message;
        return res;
    }
};

const ATTRIBUTE_MAP = {
    Int8Array: Int8Array,
    Int16Array: Int16Array,
    Int32Array: Int32Array,
    Float32Array: Float32Array,
    Float64Array: Float64Array,
    Uint8Array: Uint8Array,
    Uint16Array: Uint16Array,
    Uint32Array: Uint32Array,
}

class DracoWorker extends worker_utils.WorkerBase {
    private _dracoModule: draco.DecoderModule;
    private _initialized: boolean = false;
    private _dracoPromise: Promise<draco.DecoderModule>;
    private _decodeStart: number;

    public constructor () {
        super();
    }

    private _initialize (id: number, wasm: ArrayBuffer, log_level: worker_utils.LogLevel){
        this._initializeWorker("DracoWorker", id, log_level);
        this._dracoPromise = draco.createDecoderModule({wasmBinary: wasm})
        this._initialized = true;
        this._logInfo("Initialized");
    }

    private _decode (module: draco.DecoderModule, id: number, buffer: ArrayBuffer, config: DracoTaskConfig){
        this._dracoModule = module;
        let decoder = new this._dracoModule.Decoder();
        let decodeBuffer = new this._dracoModule.DecoderBuffer();
        decodeBuffer.Init(new Int8Array(buffer), buffer.byteLength);
        try {
            let geometry = this._decodeGeometry(decoder, decodeBuffer, config);
            let buffers = geometry.attributes.map( ( attr ) => attr.array.buffer );
            geometry["buffers"] = buffers;
            if ( geometry.index ) buffers.push( geometry.index.array.buffer );
            this._logInfo("Decoded");
            self.postMessage({ type: ResultMessageType.DECODE, id: this._workerID, geometry: geometry });
        }
        catch (error){
            console.error(error);
            self.postMessage(DracoWorkerResultMessage.errorMessage(this._workerID, error));
        }
        finally {
            this._dracoModule.destroy(decodeBuffer);
            this._dracoModule.destroy(decoder);
        }
    }

    private _decodeGeometry (decoder: draco.Decoder, buffer: draco.DecoderBuffer, config: DracoTaskConfig) {
        let geometryType = decoder.GetEncodedGeometryType(buffer);
        var dracoGeometry;
        var decodingStatus;

        if (geometryType === this._dracoModule.TRIANGULAR_MESH){
            dracoGeometry = new this._dracoModule.Mesh();
            decodingStatus = decoder.DecodeBufferToMesh(buffer, dracoGeometry);
        }
        else if (geometryType === this._dracoModule.POINT_CLOUD){
            dracoGeometry = new this._dracoModule.PointCloud();
            decodingStatus = decoder.DecodeBufferToPointCloud(buffer, dracoGeometry);
        } else {
            throw new Error(this._formatMessage("Unexpected geometry type"));
        }

        if (!decodingStatus.ok() || dracoGeometry.ptr === 0) {
            throw new Error(this._formatMessage("Decoding failed: " + decodingStatus.error_msg()));
        }

		var geometry = { index: null, attributes: [] };

		// Gather all vertex attributes.

		for ( var attributeName in config.attributeIDs ) {
			var attributeType = ATTRIBUTE_MAP[config.attributeTypes[attributeName] ];

			var attribute;
			var attributeID;

			// A Draco file may be created with default vertex attributes, whose attribute IDs
			// are mapped 1:1 from their semantic name (POSITION, NORMAL, ...). Alternatively,
			// a Draco file may contain a custom set of attributes, identified by known unique
			// IDs. glTF files always do the latter, and `.drc` files typically do the former.
			if ( config.useUniqueIDs ) {

				attributeID = config.attributeIDs[ attributeName ];
				attribute = decoder.GetAttributeByUniqueId( dracoGeometry, attributeID );

			} else {
				attributeID = decoder.GetAttributeId( dracoGeometry, this._dracoModule[ config.attributeIDs[ attributeName ] ] );

				if ( attributeID === - 1 ) continue;

				attribute = decoder.GetAttribute( dracoGeometry, attributeID );
			}

			geometry.attributes.push( this._decodeAttribute(decoder, dracoGeometry, attributeName, attributeType, attribute ) );

		}

		// Add index.
		if ( geometryType === this._dracoModule.TRIANGULAR_MESH ) {

			// Generate mesh faces.
			var numFaces = dracoGeometry.num_faces();
			var numIndices = numFaces * 3;
			var dataSize = numIndices * 4;
			var ptr = this._dracoModule._malloc( dataSize );
			decoder.GetTrianglesUInt32Array( dracoGeometry, dataSize, ptr );
			var index = new Uint32Array( this._dracoModule.HEAPU32.buffer, ptr, numIndices ).slice();
			this._dracoModule._free( ptr );

			geometry.index = { array: index, itemSize: 1 };

		}

		this._dracoModule.destroy( dracoGeometry );

		return geometry;

    }

	private _decodeAttribute( decoder: draco.Decoder, dracoGeometry, attributeName, attributeType, attribute ) {

		var numComponents = attribute.num_components();
		var numPoints = dracoGeometry.num_points();
		var numValues = numPoints * numComponents;
		var dracoArray;
		var ptr;
		var array;

		switch ( attributeType ) {

			case Float32Array:
				var dataSize = numValues * 4;
				ptr = this._dracoModule._malloc( dataSize );
				decoder.GetAttributeDataArrayForAllPoints( dracoGeometry, attribute, this._dracoModule.DT_FLOAT32, dataSize, ptr );
				array = new Float32Array( this._dracoModule.HEAPF32.buffer, ptr, numValues ).slice();
				this._dracoModule._free( ptr );
				break;

			case Int8Array:
				ptr = this._dracoModule._malloc( numValues );
				decoder.GetAttributeDataArrayForAllPoints( dracoGeometry, attribute, this._dracoModule.DT_INT8, numValues, ptr );
				array = new Int8Array( this._dracoModule.HEAP8.buffer, ptr, numValues ).slice();
				this._dracoModule._free( ptr );
				break;

			case Int16Array:
				var dataSize = numValues * 2;
				ptr = this._dracoModule._malloc( dataSize );
				decoder.GetAttributeDataArrayForAllPoints( dracoGeometry, attribute, this._dracoModule.DT_INT16, dataSize, ptr );
				array = new Int16Array( this._dracoModule.HEAP16.buffer, ptr, numValues ).slice();
				this._dracoModule._free( ptr );
				break;

			case Int32Array:
				var dataSize = numValues * 4;
				ptr = this._dracoModule._malloc( dataSize );
				decoder.GetAttributeDataArrayForAllPoints( dracoGeometry, attribute, this._dracoModule.DT_INT32, dataSize, ptr );
				array = new Int32Array( this._dracoModule.HEAP32.buffer, ptr, numValues ).slice();
				this._dracoModule._free( ptr );
				break;

			case Uint8Array:
				ptr = this._dracoModule._malloc( numValues );
				decoder.GetAttributeDataArrayForAllPoints( dracoGeometry, attribute, this._dracoModule.DT_UINT8, numValues, ptr );
				array = new Uint8Array( this._dracoModule.HEAPU8.buffer, ptr, numValues ).slice();
				this._dracoModule._free( ptr );
				break;

			case Uint16Array:
				var dataSize = numValues * 2;
				ptr = this._dracoModule._malloc( dataSize );
				decoder.GetAttributeDataArrayForAllPoints( dracoGeometry, attribute, this._dracoModule.DT_UINT16, dataSize, ptr );
				array = new Uint16Array( this._dracoModule.HEAPU16.buffer, ptr, numValues ).slice();
				this._dracoModule._free( ptr );
				break;

			case Uint32Array:
				var dataSize = numValues * 4;
				ptr = this._dracoModule._malloc( dataSize );
				decoder.GetAttributeDataArrayForAllPoints( dracoGeometry, attribute, this._dracoModule.DT_UINT32, dataSize, ptr );
				array = new Uint32Array( this._dracoModule.HEAPU32.buffer, ptr, numValues ).slice();
				this._dracoModule._free( ptr );
				break;

			default:
				throw new Error( this._formatMessage('Unexpected attribute type.' ));
                }

		return {
			name: attributeName,
			array: array,
			itemSize: numComponents
		};

	}

    public handleMessage (event) {
        let message: DracoWorkerControlMessage = event.data;
        switch (message.type){
            case ControlMessgeType.INIT:
                this._initialize(message.id, message.dracoBinary, message.log_level);
                break;
            case ControlMessgeType.DECODE:
                this._logDebug("decode requested");
                this._dracoPromise.then((module) => {
                    this._logDebug("decoding");
                    this._dracoModule = module;
                    this._decode(module, message.id, message.buffer, message.decodeConfig);
                })
                break;
        }
    }
};

export function createTaskConfig (attributeIDs: AttributeIDs, attributeTypes: AttributeTypes): DracoTaskConfig {
    return {
        attributeIDs: attributeIDs || DEFAULT_ATTRIBUTE_IDs,
        attributeTypes: attributeTypes || DEFAULT_ATTRIBUTE_TYPES,
        useUniqueIDs: !! attributeIDs
    };
}

export function createDecodeRequest (id: number, buffer: ArrayBuffer, config: DracoTaskConfig): DracoWorkerControlMessage {
    return DracoWorkerControlMessage.decodeMessage(id, config, buffer);
}

export function createInitRequest (id: number, wasm: ArrayBuffer, log_level: worker_utils.LogLevel): DracoWorkerControlMessage {
    return DracoWorkerControlMessage.initMessage(id, wasm, log_level);
}


var worker = new DracoWorker();
self.onmessage = (event) => worker.handleMessage(event);
