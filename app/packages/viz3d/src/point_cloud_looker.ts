import * as looker from "@fiftyone/looker";
import {
    BaseConfig,
    BaseOptions,
    BaseState,
    BoundingBox,
    ControlMap,
    Coordinates,
    DEFAULT_IMAGE_OPTIONS,
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
import * as three from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import * as draco_loader from "./draco_loader"
import * as pc_display from "./point_cloud_display"
import { BufferAttribute } from "@fiftyone/looker/src/three";


const _dracoLoader: Promise<draco_loader.DracoLoader> = new draco_loader.DracoLoaderBuilder().build();

export class PointCloudConfig implements BaseConfig {
    thumbnail: boolean = false;
    src: string = "";
    dimensions: Dimensions = [0, 0];
    sampleId: string = "";
    fieldSchema: Schema;
    displayConfig: pc_display.SceneConfig;

    constructor() {
        this.displayConfig = new pc_display.SceneConfigBuilder().build();
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

export class PointCloudElement extends BaseElement<PointCloudState, HTMLCanvasElement>{
    private _canvas: HTMLCanvasElement;
    private _display: pc_display.Display3D<HTMLCanvasElement>;

    private _render() {
        this._display.render();
    }

    createHTMLElement(update: StateUpdate<PointCloudState>, dispatchEvent: (eventType: string, details?: any) => void): HTMLCanvasElement {
        this._canvas = document.createElement("canvas");
        this._canvas.width = window.innerWidth;
        this._canvas.height = window.innerHeight;

        // TODO: Need to source display config from elsewhere... 
        let config = new pc_display.SceneConfigBuilder()
            .setBackgroundColor(0xAAAAAA)
            .build();
        this._display = new pc_display.Display3D<HTMLCanvasElement>(this._canvas, config);

        update((state: Readonly<PointCloudState>) => {
            return state;
        });

        return this._canvas;
    }

    renderSelf(state: Readonly<PointCloudState>, sample: Readonly<Sample>): HTMLCanvasElement {
        _dracoLoader.then((loader) => {
            // TODO: URL THING BROKEN + NEED TO HANDLE COMPRESSED
            if (!sample.compressed_path) return;
            loader.loadRemoteMesh(sample.compressed_path)
                .then((mesh) => {
                    this._display.clearScene();
                    this._display.addSceneItem(mesh);
                    this._render();
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
        return DEFAULT_IMAGE_OPTIONS;
    }
    protected getInitialState(config: PointCloudConfig, options: Optional<BaseOptions>): PointCloudState {
        let state = { ...DEFAULT_POINTCLOUD_STATE };
        state.options = this.getDefaultOptions();
        state.config = config;
        return state;
    }
};