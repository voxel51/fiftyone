import * as looker from "@fiftyone/looker";
import {
    BaseConfig,
    BaseOptions,
    BaseState,
    BoundingBox,
    ControlMap,
    Coordinates,
    DEFAULT_IMAGE_OPTIONS,
    DEFAULT_BASE_OPTIONS,
    Dimensions,
    ImageConfig,
    Optional,
    Sample,
    Schema,
    StateUpdate
} from "@fiftyone/looker/src/state";
import { BaseElement } from "@fiftyone/looker/src/elements/base";
import { Overlay } from "@fiftyone/looker/src/overlays/base";
import { LookerElement, CanvasElement } from "@fiftyone/looker/src/elements/common";
import { GetElements } from "@fiftyone/looker/src/elements";
import { createElementsTree } from "@fiftyone/looker/src/elements/util";
import Flashlight, { FlashlightConfig, FlashlightOptions } from "@fiftyone/flashlight";
import React, { Fragment } from "react";
import ReactDOM from "react-dom";

import * as draco_loader from "./draco_loader"
import * as pcd from "./point_cloud_display"
import * as thumb_gen from "./thumbnail_generator"
import { ThumbnailGenerator } from "./thumbnail_generator";
import * as worker_util from "./worker_util"
import * as three from "three"


// TODO: This is just a prototype. Clean up later

class Singleton <T> {
    private _item: T = undefined;
    private _resolvers: worker_util.Resolver[] = [];
    private _cnstr: new (...args: any[]) => T;

    public constructor (cnstr: new (...args: any[]) => T) {
        this._cnstr = cnstr;
    }

    public make (...args: any[]): T {
        if (this._item) return this._item;
        this._item = new this._cnstr(...args);
        while (this._resolvers.length){
            this._resolvers.pop().resolve(this._item);
        }
        return this._item;
    }

    public get (): Promise<T> {
        return new Promise((resolve, reject) => {
            if (!this._item) {
                this._resolvers.push({resolve, reject});
            }
            else {
                resolve(this._item);
            }
        });
    }
};

// TODO: This should be themeable 
export const DEFAULT_3D_DISPLAY_CONFIG = new pcd.SceneConfigBuilder()
    .setBackgroundColor(0xAAAAAA)
    .build();


// TODO: This design makes it impossible to scene config at runtime
const _thumbnail_generator: Singleton<ThumbnailGenerator> = new Singleton<ThumbnailGenerator>(ThumbnailGenerator);
const _3D_display: Singleton<pcd.Display3D<HTMLCanvasElement>> = new Singleton<pcd.Display3D<HTMLCanvasElement>>(pcd.Display3D);
const _dracoLoader: Promise<draco_loader.DracoLoader> = new draco_loader.DracoLoaderBuilder().build();

function create3DDisplay (config: pcd.SceneConfig): pcd.Display3D<HTMLCanvasElement> {
    // https://github.com/mrdoob/three.js/blob/master/examples/webgl_multiple_canvases_circle.html
    // All modal display happens on this canvas, and is copied over to the looker elements' canvases
    const canvas = document.createElement("canvas");
    return _3D_display.make(canvas, config);
}

export class PointCloudConfig implements BaseConfig {
    thumbnail: boolean = true;
    thumbnail_width: number = 100;
    thumbnail_height: number = 100;
    src: string = "";
    dimensions: Dimensions = [0, 0];
    sampleId: string = "";
    fieldSchema: Schema;
    displayConfig: pcd.SceneConfig;

    constructor() {
        this.displayConfig = DEFAULT_3D_DISPLAY_CONFIG;
    }
};

export interface PointCloudState extends BaseState {
    config: PointCloudConfig;
};

export const DEFAULT_POINTCLOUD_STATE: PointCloudState = {
    config: new PointCloudConfig,
    disabled: false,
    cursorCoordinates: [0, 0],
    pixelCoordinates: [0, 0],
    disableControls: false,
    loaded: false,
    hovering: false,
    hoveringControls: false,
    showControls: false,
    showOptions: false,
    options: undefined,
    scale: 0,
    pan: [0, 0],
    panning: false,
    rotate: 0,
    strokeWidth: 0,
    fontSize: 0,
    wheeling: false,
    windowBBox: [0, 0, 0, 0],
    transformedWindowBBox: [0, 0, 0, 0],
    mediaBBox: [0, 0, 0, 0],
    transformedMediaBBox: [0, 0, 0, 0],
    canvasBBox: [0, 0, 0, 0],
    textPad: 0,
    pointRadius: 0,
    dashLength: 0,
    relativeCoordinates: [0, 0],
    mouseIsOnOverlay: false,
    showHelp: false,
    overlaysPrepared: false,
    disableOverlays: false,
    zoomToContent: false,
    setZoom: false,
    hasDefaultZoom: false,
    SHORTCUTS: undefined,
    error: 0,
    destroyed: false,
    reloading: false
};

export class PointCloudSample implements Sample {
    metadata: { width: number; height: number; };
    id: string = "";
    media_type: "model" = "model";
    filepath: string = "";
    compressed_path: string = "";
    tags: string[] = [];
    _label_tags: string[] = [];

};

export interface PointCloudOptions extends BaseOptions {
    zoom: boolean;
};

export const DEFAULT_POINTCLOUD_OPTIONS = {
    ...DEFAULT_BASE_OPTIONS,
    zoom: false
}

export class PointCloudElement extends BaseElement<PointCloudState, HTMLCanvasElement>{
    private _canvas: HTMLCanvasElement;
    private _ctx: CanvasRenderingContext2D;
    private _display: pcd.Display3D<HTMLCanvasElement>;
    private _thumb_gen: ThumbnailGenerator;
    private _thumb_image: HTMLImageElement;

    public createHTMLElement(update: StateUpdate<PointCloudState>, dispatchEvent: (eventType: string, details?: any) => void): HTMLCanvasElement {
        this._canvas = document.createElement("canvas");
        this._canvas.width = window.innerWidth;
        this._canvas.height = window.innerHeight;
        this._ctx = this._canvas.getContext("2d");
        this._thumb_image = new Image();

        update((state: Readonly<PointCloudState>) => {
            this._display = create3DDisplay(state.config.displayConfig);
            this._thumb_gen = _thumbnail_generator.make(state.config.thumbnail_width, state.config.thumbnail_height, state.config.displayConfig);
            return state;
        });

        return this._canvas;
    }

    private _renderThumbnail (mesh: three.Mesh) {
        this._thumb_gen.makeThumbnailURL(mesh).then((url) => {
            this._thumb_image.src = url;
            this._ctx.drawImage(this._thumb_image, 0, 0);
        });
    }

    private _renderScene (mesh: three.Mesh) {
        this._display.clearScene();
        this._display.addSceneItem(mesh);
        this._display.render();
        this._display.copyToCanvas(this._ctx);
    }

    public renderSelf(state: Readonly<PointCloudState>, sample: Readonly<Sample>): HTMLCanvasElement {
        _dracoLoader.then((loader) => {
            // TODO: URL THING BROKEN + NEED TO HANDLE COMPRESSED
            // TODO: Need to cache results here... 
            if (!sample.compressed_path) return;
            loader.loadRemoteMesh("http://localhost:5151/filepath/" + sample.compressed_path)
                .then((mesh) => {
                    if (state.config.thumbnail) this._renderThumbnail(mesh);
                    else this._renderScene(mesh);
                });
        });
        return this.element;
    }
};


export const get3DElements: GetElements<PointCloudState> = (
    config,
    update,
    dispatchEvent
) => {
    const elements = {
        node: LookerElement,
        children: [
            {
                node: PointCloudElement
            },
            {
                node: CanvasElement,
            },
        ]
    };

    return createElementsTree(
        config,
        elements,
        update,
        dispatchEvent
    );
};

export class PointCloudLooker extends looker.Looker<PointCloudState> {
    updateOptions(options: Optional<BaseOptions>): void {
        throw new Error("Method not implemented.");
    }
    protected hasDefaultZoom(state: PointCloudState, overlays: Overlay<PointCloudState>[]): boolean {
        return false;
    }
    protected getElements(config: Readonly<PointCloudConfig>): LookerElement<PointCloudState> {
        return get3DElements(config, this.updater, this.getDispatchEvent());
    }
    protected getDefaultOptions(): BaseOptions {
        return DEFAULT_POINTCLOUD_OPTIONS;
    }
    protected getInitialState(config: PointCloudConfig, options: Optional<BaseOptions>): PointCloudState {
        let state = { ...DEFAULT_POINTCLOUD_STATE };
        state.options = this.getDefaultOptions();
        state.config = config;

        // TODO: I guess I have to provide my own custom config options here given 
        // the flashlight invocation is hard coded...?
        state.config.displayConfig = DEFAULT_3D_DISPLAY_CONFIG;
        state.config.thumbnail_width = 100;
        state.config.thumbnail_height =  100;
        return state;
    }
};