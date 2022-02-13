import * as worker_util from "./worker_util"
import * as pcd from "./display3d"
import { Singleton } from "./singleton"
import * as three from "three"
import * as draco_loader from "./draco_loader"
import * as thumb_gen from "./thumbnail_generator"
import {RGBDProjector} from "./rgbd_projector"
import LRUCache, * as lru from "lru-cache"
import { Optional } from "@fiftyone/looker/src/state"



// Global state shared between various 3D looker elements
export class Looker3DState {
    public renderLoop: pcd.RenderLoop;
    public display: pcd.Display3D<HTMLCanvasElement>;
    public thumb_gen: thumb_gen.ThumbnailGenerator;
    // TODO: Consider caching thumbnails here
    
    private _rgbd_loader: RGBDProjector;
    private _draco_loader: Promise<draco_loader.DracoLoader>;
    private _mesh_cache: LRUCache<string, three.Mesh>;

    // TODO: Add more options. (thumb size, cache size, draco options, etc)
    constructor (config: pcd.SceneConfig){
        let canvas = document.createElement("canvas");
        this.renderLoop = new pcd.RenderLoop();
        this.display = new pcd.Display3D<HTMLCanvasElement>(canvas, config);
        this._mesh_cache = new LRUCache<string, three.Mesh>({
            max: 100
        });
        this._draco_loader = new draco_loader.DracoLoaderBuilder().build();
        this.thumb_gen = new thumb_gen.ThumbnailGenerator(200,200, config);
        this._rgbd_loader = new RGBDProjector();
    }

    public hasMesh (path: string): boolean {
        return this._mesh_cache.has(path);
    }

    public tryGetMesh (path: string): Optional<three.Mesh> {
        if (this.hasMesh(path)){
            return this._mesh_cache.get(path);
        }
        else {
            return null;
        }
    }

    public cacheMesh (path:string, mesh: three.Mesh): void {
        this._mesh_cache.set(path, mesh);
    }

    private _cacheGetter (key: string, getter: () => Promise<three.Mesh>): Promise<three.Mesh>{
        if (this.hasMesh(key)){
            let mesh = this._mesh_cache.get(key);
            return new Promise((resolve,_) => {
                resolve(mesh);
            });
        }
        else {
            return getter().then((mesh) => {
                this._mesh_cache.set(key, mesh);
                return mesh;
            });
        }
    }

    public getRGBDMesh (color: string, depth: string): Promise<three.Mesh> {
        return this._cacheGetter(color, () => {
            return this._rgbd_loader.createMesh(color, depth);
        });
    }

    public getDracoMesh (path: string): Promise<three.Mesh> {
        return this._cacheGetter(path, () => {
            return this._draco_loader.then((loader) => {
                return loader.loadRemoteMesh(path);
            });
        });
    }
};

export const Global3DState = new Singleton<Looker3DState>(Looker3DState);
