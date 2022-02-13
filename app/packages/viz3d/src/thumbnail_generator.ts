import thumbnail_worker from "./thumbnail_worker?worker"
import * as thumbnail_lib from "./thumbnail_worker"
import * as three from "three"
import * as worker_util from "./worker_util"
import * as pcd from "./display3d"

import {SceneConfig} from "./display3d"

// TODO: Might be faster to do batch processing.
// Measure overhead incurred from going back and 
// forth from the work to the client side.

// For some reason the offscreen api isn't working for me...
export class BackgroundThumbnailGenerator extends worker_util.WorkerPool {
    private _canvases: OffscreenCanvas[] = [];

    public constructor (worker_count: number, width: number, height: number, config: SceneConfig) {
        super(thumbnail_worker, worker_count);
        for (let i = 0; i < worker_count; i++){
            let canvas = new OffscreenCanvas(width, height);
            let worker = this._workers[i];
            worker.postMessage(thumbnail_lib.ControlMessage.init(i, thumbnail_lib.LogLevel.NONE, canvas, config), [canvas]);
            this._canvases.push(canvas);
        }
    }

    public makeThumbnailBlob (mesh: three.Mesh): Promise<Blob>{
        return this.execute((worker,id) => {
            worker.postMessage(thumbnail_lib.ControlMessage.thumbnailBlob(id,mesh.geometry));
        });
    }

    public makeThumbnailBlobs (meshes: three.Mesh[]): Promise<Blob[]>{
        return Promise.all(meshes.map((mesh) => this.makeThumbnailBlob(mesh)));
    }

    public makeThumbnailURL (mesh: three.Mesh): Promise<string>{
        return this.execute((worker,id) => {
            worker.postMessage(thumbnail_lib.ControlMessage.thumbnailURL(id,mesh.geometry));
        });
    }

    public makeThumbnailURLs (meshes: three.Mesh[]): Promise<string[]>{
        return Promise.all(meshes.map((mesh) => this.makeThumbnailURL(mesh)));
    }

    public onmessage (resolver: worker_util.Resolver, event: MessageEvent<any>) {
        let message = event.data as thumbnail_lib.ResultMessage;
        switch(message.type) {
            case thumbnail_lib.ResultMessageType.THUMBNAIL_BLOB:
                resolver.resolve(message.thumbnail_blob);
                break;
            case thumbnail_lib.ResultMessageType.THUMBNAIL_URL:
                resolver.resolve(message.thumbnail_url);
                break;
            case thumbnail_lib.ResultMessageType.ERROR:
                resolver.reject(message.message);
                break;
        }
    }
};

// TODO: For some reason the background generator isn't working...
// After testing, it doesn't seem to be much (if at all faster...)
export class ThumbnailGenerator {
    private _canvas: HTMLCanvasElement;
    private _display: pcd.Display3D<HTMLCanvasElement>;

    public constructor (width: number, height: number, scene: pcd.SceneConfig) {
        this._canvas = document.createElement("canvas");
        this._display = new pcd.Display3D<HTMLCanvasElement>(this._canvas, scene);
        this._display.setSize(width, height);
    }

    public getSize (): {width: number, height: number} {
        return {width: this._canvas.width, height: this._canvas.height};
    }

    public setSize (width: number, height: number) {
        this._canvas.width = width;
        this._canvas.height = height;
        this._display.onResize();
    }

    public makeThumbnail (mesh: three.Mesh): Promise<Blob> {
        this._display.clearScene();
        this._display.addSceneItem(mesh);
        this._display.render();
        return this._display.getScreenShot();
    }

    public makeThumbnailURL (mesh: three.Mesh): Promise<string> {
        var resolver: worker_util.Resolver = undefined;
        let promise = new Promise<string>((resolve, reject) => {
            resolver = {resolve, reject};
        });

        let reader = new FileReader();
        reader.onloadend = (_) => {
            resolver.resolve(reader.result);
        };

        this.makeThumbnail(mesh).then((b) => {
            reader.readAsDataURL(b);
        });

        return promise;
    }

    public makeThumbnailURLs (meshes: three.Mesh[]): Promise<string[]> {
        return Promise.all(meshes.map((v) => this.makeThumbnailURL(v)));
    }


};