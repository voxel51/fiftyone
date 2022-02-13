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
import { ThumbnailSelectorElement, ErrorElement, TagsElement, HelpPanelElement, JSONPanelElement } from "@fiftyone/looker/src/elements/common";
import Flashlight, { FlashlightConfig, FlashlightOptions } from "@fiftyone/flashlight";

import * as three from "three"
import { Global3DState } from "./state";
import { SceneConfig, SceneConfigBuilder, DEFAULT_3D_DISPLAY_CONFIG } from "./display3d"

// Looker for RGBD data.
// ----------------------
// RGBD datasets are usually packaged as pairs of 
// image files representing color frames and depth frames. 
// This looker generates a point cloud on the client
// side and renders using a Display3D

const DEFAULT_RGBD_OPTIONS = {
    ...DEFAULT_BASE_OPTIONS,
    zoom: false
}

export class RGBDConfig implements BaseConfig {
    thumbnail: boolean = true;
    thumbnail_width: number = 100;
    thumbnail_height: number = 100;
    src: string = "";
    dimensions: Dimensions = [0, 0];
    sampleId: string = "";
    fieldSchema: Schema;
    displayConfig: SceneConfig;

    constructor() {
        this.displayConfig = DEFAULT_3D_DISPLAY_CONFIG;
    }
};

export interface RGBDState extends BaseState {
    config: RGBDConfig;
};

export class RGBDSample implements Sample {
    metadata: { width: number; height: number; };
    id: string;
    media_type: "image" | "model";
    filepath: string;
    depth_path: string;
    tags: string[];
    _label_tags: string[];

};

const DEFAULT_RGBD_STATE: RGBDState = {
    config: new RGBDConfig,
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


export class RGBDElement extends BaseElement<RGBDState, HTMLCanvasElement>{
    private _canvas: HTMLCanvasElement;
    private _ctx: CanvasRenderingContext2D; 
    private _image: HTMLImageElement;

    createHTMLElement(update: StateUpdate<RGBDState>, dispatchEvent: (eventType: string, details?: any) => void): HTMLCanvasElement {
        this._canvas = document.createElement("canvas");
        this._canvas.width = window.innerWidth;
        this._canvas.height = window.innerHeight;
        this._ctx = this._canvas.getContext("2d");
        this._image = new Image();

        update((state) => {
            Global3DState.make(state.config.displayConfig);
            return state;
        });
        return this._canvas;
    }

    renderSelf(state: Readonly<RGBDState>, sample: Readonly<Sample>): HTMLCanvasElement {
        Global3DState.get().then((state3d) => {
            if (state.config.thumbnail && false) {
                state3d.renderLoop.stop();
                this._image.src = sample.depth_path;
                this._image.onload = () => {
                    this._ctx.drawImage(this._image, 0, 0);
                };
            }
            else {
                state3d.getRGBDMesh(sample.filepath, sample.depth_path).then((mesh) => {
                    state3d.display.clearScene();
                    state3d.display.addSceneItem(mesh);
                    state3d.display.setSize(this._canvas.width, this._canvas.height);
                    state3d.display.setInteractionElement(this._canvas);
                    state3d.renderLoop.start(() => {
                        state3d.display.render();
                        state3d.display.copyToCanvas(this._ctx);
                    });
                });
            }
        });
        return this._canvas;
    }
};

export const getRGBDElements: GetElements<RGBDState> = (
    config,
    update,
    dispatchEvent
) => {
    const elements = {
        node: LookerElement,
        children: [
            {
                node: RGBDElement
            },
            {
                node: CanvasElement
            }
        ]
    };

    return createElementsTree(
        config,
        elements,
        update,
        dispatchEvent
    );
};

export class RGBDLooker extends looker.Looker<RGBDState> {
    updateOptions(options: Optional<BaseOptions>): void {
    }
    protected hasDefaultZoom(state: RGBDState, overlays: Overlay<RGBDState>[]): boolean {
        return false;
    }
    protected getElements(config: Readonly<BaseConfig>): LookerElement<RGBDState> {
        return getRGBDElements(config, this.updater, this.getDispatchEvent());
    }
    protected getDefaultOptions(): BaseOptions {
        return DEFAULT_RGBD_OPTIONS;
    }
    protected getInitialState(config: BaseConfig, options: Optional<BaseOptions>): RGBDState {
        let state = { ...DEFAULT_RGBD_STATE };
        state.options = this.getDefaultOptions();
        state.config = config;

        // TODO: I guess I have to provide my own custom config options here given 
        // the flashlight invocation is hard coded...?
        state.config.displayConfig = DEFAULT_3D_DISPLAY_CONFIG;
        state.config.thumbnail_width = 200;
        state.config.thumbnail_height =  200;
        return state;
    }
};