import { t } from "@fiftyone/looker/src/overlays/util";
import * as three from "three"
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls"
import { Resolver } from "./worker_util";

// Define point cloud display logic and styling here
// so that it can be shared between app and worker
// thumbnail renderers

interface Dimensions {
    width: number;
    height: number;
}

export enum FloorType {
    GRID
};

export class SceneConfig {
    background_color: three.Color;
    save_drawing_buffer: boolean;
    fov: number;
    near: number;
    far: number;

    controlsEnabled: boolean;
    keyControls: boolean;
    autoRotate: boolean;
    autoRotateSpeed: number;

    fogEnabled: boolean;
    fogNear: number;
    fogFar: number;
    fogColor: three.Color;

    floorEnabled: boolean;
    floorType: FloorType;
    floorSize: number;
    floorDivision: number;

};

export class SceneConfigBuilder {
    private _config: SceneConfig;

    public constructor () {
        this._config = new SceneConfig();
        this._config.background_color = new three.Color(0xCCCCCC);
        this._config.near = 0.1;
        this._config.fov = 75;
        this._config.far = 1000;

        this._config.controlsEnabled = true;
        this._config.save_drawing_buffer = true;
        this._config.autoRotateSpeed = 1;
        this._config.autoRotate = false;
        this._config.keyControls = false;

        this._config.fogEnabled = false;

        this._config.floorEnabled = false;
        this._config.floorType = FloorType.GRID;
        this._config.floorSize = 3;
        this._config.floorDivision = 10;
    }

    public setFloor (type: FloorType, size: number, divs: number): SceneConfigBuilder {
        this._config.floorEnabled = true;
        this._config.floorType = type;
        this._config.floorSize= size;
        this._config.floorDivision = divs;
    }

    public setFog (color: number, near: number = 0.025, far: number = 20): SceneConfigBuilder {
        this._config.fogEnabled = true;
        this._config.fogNear = near;
        this._config.fogFar = far;
        this._config.fogColor = new three.Color(color);
        return this;
    }

    public setControlsEnabled (enabled: boolean): SceneConfigBuilder {
        this._config.controlsEnabled = enabled;
        return this;
    }

    public setAutoRotate (enabled: boolean, speed: number = 1): SceneConfigBuilder {
        this._config.autoRotate = enabled;
        this._config.controlsEnabled = true;
        this._config.autoRotateSpeed = speed;
        return this;
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
    private _controls: OrbitControls;

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

        if (this._config.floorEnabled){
            var grid;
            if (config.floorType == FloorType.GRID) {
                grid = new three.GridHelper(config.floorSize, config.floorDivision);
            }
            this._scene.add(grid);
        }


        if (this._config.fogEnabled){
            this._scene.fog = new three.Fog(config.fogColor, config.fogNear, config.fogFar);
        }

        if (this._config.controlsEnabled) {
            this._initializeControls(this._renderer.domElement);
        }

        // TODO: Add rest of scene stuff... Lighting, ground plane, fog, etc
    }

    private _initializeControls (element: HTMLElement): void {
        if (!this._config.controlsEnabled) return;
        if (this._controls) this._controls.reset();
        this._controls = new OrbitControls(this._camera, element);
        this._controls.enabled = true;
        this._controls.enableKeys = this._config.keyControls;
        this._controls.autoRotate = this._config.autoRotate;
        this._controls.autoRotateSpeed = this._config.autoRotateSpeed;
        this._controls.update();
    }

    /// Set DOM element for interacting with 3D scene
    public setInteractionElement (element: HTMLElement): void {
        if (!this._config.controlsEnabled) return;
        this._initializeControls(element);
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

    public copyToCanvas (ctx: CanvasRenderingContext2D) {
        ctx.drawImage(this._renderer.domElement, 0, 0);
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
        if (this._config.controlsEnabled && this._controls) {
            this._controls.update();
        }
        this._renderer.render(this._scene, this._camera);
    }

};