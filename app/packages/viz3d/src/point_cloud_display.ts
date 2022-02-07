import * as three from "three"
import { Resolver } from "./worker_util";

// Define point cloud display logic and styling here
// so that it can be shared between app and worker
// thumbnail renderers

interface Dimensions {
    width: number;
    height: number;
}

export class SceneConfig {
    background_color: three.Color;
    save_drawing_buffer: boolean;
    fov: number;
    near: number;
    far: number;
};

export class SceneConfigBuilder {
    private _config: SceneConfig;

    public constructor () {
        this._config = new SceneConfig();
        this._config.background_color = new three.Color(0xCCCCCC);
        this._config.near = 0.1;
        this._config.fov = 75;
        this._config.far = 1000;
        this._config.save_drawing_buffer = true;
    }

    public setCamera (fov: number, near: number, far: number): SceneConfigBuilder {
        this._config.near = near;
        this._config.far = far;
        this._config.fov = fov;
        return this;
    }

    public setBackgroundColor (color: number): SceneConfigBuilder {
        this._config.background_color = new three.Color(color);
        return this;
    }

    public setSaveDrawingBuffer (save: boolean): SceneConfigBuilder {
        this._config.save_drawing_buffer = save;
        return this;
    }
    
    public build (): SceneConfig {
        return this._config;
    }
}


export class Display3D <T extends HTMLCanvasElement> {
    private _scene: three.Scene;
    private _canvas: T;
    private _camera: three.PerspectiveCamera;
    private _config: SceneConfig;
    private _renderer: three.WebGLRenderer;
    private _dimensions: Dimensions;
    private _sceneMeshes: three.Mesh[] = [];

    public constructor (canvas: T, config: SceneConfig) {
        this._canvas = canvas;
        this._config = config;
        this._scene = new three.Scene();
        this._scene.background = config.background_color;
        this._renderer = new three.WebGLRenderer({
            canvas,
            antialias: true,
            preserveDrawingBuffer: true
        });
        this._dimensions = {width: canvas.width, height: canvas.height};
        this._camera = new three.PerspectiveCamera(config.fov, canvas.width / canvas.height, config.near, config.far);
        // TODO: handle camera stuff
        this._camera.position.set(1, 0.15, 1);
        this._camera.lookAt(0, 0, 0);
        this._camera.updateProjectionMatrix();
        let grid = new three.GridHelper(3, 10);
        this._scene.add(grid);

        // TODO: Add rest of scene stuff... Lighting, ground plane, fog, etc
        
    }

    public setSize (width: number, height: number){
        this._renderer.setSize(width, height);
        this.onResize();
    }

    public onResize (): void {
        if (this._dimensions.width !== this._canvas.width || this._dimensions.height !== this._canvas.height){
            this._dimensions.width = this._canvas.width;
            this._dimensions.height = this._canvas.height;
            this._camera.aspect = this._canvas.width / this._canvas.height;
            this._camera.updateProjectionMatrix();
        }
    }

    public getScreenShot (): Promise<Blob> {
        if (this._renderer.domElement.convertToBlob) {
            return this._renderer.domElement.convertToBlob();
        }
        else {
            var resolver: Resolver;
            var promise = new Promise<Blob>((resolve, reject) => {
                resolver = {resolve, reject};
            });
            this._renderer.domElement.toBlob((res) => {
                resolver.resolve(res);
            });
            return promise;
        }
    }

    public clearScene (): void {
        for (let i = 0; i < this._sceneMeshes.length; i++){
            let mesh: three.Mesh = this._sceneMeshes[i];
            this._scene.remove(mesh);
        }
        this._sceneMeshes =[];
    }

    public addSceneItem (mesh: three.Mesh): void {
        // TODO: add way to handle camera positioning
        this._sceneMeshes.push(mesh);
        this._scene.add(mesh);
    }

    public render (): void {
        this._renderer.render(this._scene, this._camera);
    }

    public copyToCanvas (ctx: CanvasRenderingContext2D) {
        ctx.drawImage(this._renderer.domElement, 0, 0);
    }
};