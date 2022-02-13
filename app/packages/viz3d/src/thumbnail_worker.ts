import * as pc_display from "./display3d"
import * as worker_utils from "./worker_util"
import * as three from "three"
import { OffscreenCanvas } from "three";

export {LogLevel} from "./worker_util"

export enum ControlMessageType {
    INIT,
    THUMBNAIL_BLOB,
    THUMBNAIL_URL
};

export class ControlMessage {
    public type: ControlMessageType;
    public id: number;
    public log_level?: worker_utils.LogLevel;
    public config?: pc_display.SceneConfig;
    public canvas?: OffscreenCanvas;
    public mesh?: three.BufferGeometry;

    private constructor () {}

    public static init (id: number, log_level: worker_utils.LogLevel, canvas: OffscreenCanvas, config: pc_display.SceneConfig): ControlMessage {
        let res = new ControlMessage();
        res.id = id;
        res.type = ControlMessageType.INIT;
        res.config = config;
        res.log_level = log_level;
        res.canvas = canvas;
        return res;
    }

    public static thumbnailBlob (id: number, mesh: three.BufferGeometry): ControlMessage {
        let res = new ControlMessage();
        res.type = ControlMessageType.THUMBNAIL_BLOB;
        res.mesh = mesh;
        res.id = id;
        return res;
    }

    public static thumbnailURL (id: number, mesh: three.BufferGeometry): ControlMessage {
        let res = new ControlMessage();
        res.type = ControlMessageType.THUMBNAIL_URL;
        res.mesh = mesh;
        res.id = id;
        return res;
    }
};

export enum ResultMessageType {
    THUMBNAIL_BLOB,
    THUMBNAIL_URL,
    ERROR
};

export class ResultMessage {
    public type: ResultMessageType;
    public id: number;
    public message?: string;
    public thumbnail_blob?: Blob;
    public thumbnail_url?: string;

    private constructor () {}

    public static error (id: number, message: string): ResultMessage {
        let res = new ResultMessage();
        res.type = ResultMessageType.ERROR;
        res.id = id;
        res.message = message;
        return res;
    }

    public static thumbnailBlob (id: number, thumbnail: Blob): ResultMessage {
        let res = new ResultMessage();
        res.type = ResultMessageType.THUMBNAIL_BLOB;
        res.id = id;
        res.thumbnail_blob = thumbnail;
        return res;
    }

    public static thumbnailURL (id: number, thumbnail: string): ResultMessage {
        let res = new ResultMessage();
        res.type = ResultMessageType.THUMBNAIL_URL;
        res.id = id;
        res.thumbnail_url = thumbnail;
        return res;
    }
};

class ThumbnailGenerator3D extends worker_utils.WorkerBase {
    private _display: pc_display.Display3D<OffscreenCanvas>;

    public constructor () {
        super();
    }

    private _initialize (id: number, log_level: worker_utils.LogLevel, config: pc_display.SceneConfig, canvas: OffscreenCanvas){
        this._initializeWorker("ThumbnailGenerator", id, log_level);
        this._workerID = id;
        this._display = new pc_display.Display3D<OffscreenCanvas>(canvas, config);
        this._logDebug("Worker Initialized");
        let geom = new three.BoxBufferGeometry(0.4, 0.4, 0.4);
        let mat = new three.MeshBasicMaterial();
        let mesh = new three.Mesh(geom, mat);
        this._display.addSceneItem(mesh);
        
    }


    private _generateThumbnail (mesh: three.Mesh): Promise<Blob> {
        //this._display.addSceneItem(mesh);
        let data = this._display.getScreenShot();
        //this._display.clearScene();
        return data;
    }


    public handleMessage (event) {
        let message = event.data as ControlMessage;
        if (message.type === ControlMessageType.INIT){
            this._initialize(message.id, message.log_level, message.config, message.canvas);
        }
        else if (message.type === ControlMessageType.THUMBNAIL_BLOB || message.type === ControlMessageType.THUMBNAIL_URL) {
            this._logDebug("Thumbnail requested");
            // TODO: Measure performance. This is a hack because there seems to be
            // a problem with sending a Three.BufferGeometry over to a worker
            let geom = new three.BufferGeometry(message.mesh);
            let mesh: three.Mesh = new three.Mesh(geom);
            this._generateThumbnail(mesh).then((data) => {
                this._logDebug("Thumbnail Generated");
                if (message.type == ControlMessageType.THUMBNAIL_URL){
                    let url = new FileReaderSync().readAsDataURL(data);
                    self.postMessage(ResultMessage.thumbnailURL(this._workerID, url));
                }
                else if (message.type === ControlMessageType.THUMBNAIL_BLOB) {
                    self.postMessage(ResultMessage.thumbnailBlob(this._workerID, data));
                }
            });

        }
    }
};

var worker = new ThumbnailGenerator3D();
self.onmessage = (event) => {
    worker.handleMessage(event);
};

