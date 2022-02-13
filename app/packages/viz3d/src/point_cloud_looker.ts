import * as looker from "@fiftyone/looker";
import {
    BaseConfig,
    BaseOptions,
    BaseState,
    DEFAULT_BASE_OPTIONS,
    Dimensions,
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

import * as pcd from "./display3d"
import * as three from "three"
import * as css from "./point_cloud_looker.module.css"
import {Global3DState, Looker3DState} from "./state"


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
        this.displayConfig = pcd.DEFAULT_3D_DISPLAY_CONFIG;
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

export class ControlsElement extends BaseElement<PointCloudState> {
    private _element: HTMLElement;

    createHTMLElement(update: StateUpdate<PointCloudState>, dispatchEvent: (eventType: string, details?: any) => void): HTMLElement {
        let el = this._element = document.createElement("div");
        let camResetBtn = document.createElement("div");

        el.classList.add(css.controls);

        camResetBtn.classList.add(css.controlButton);
        camResetBtn.innerText = "CAM RESET";
        camResetBtn.addEventListener("click", () => {
            Global3DState.get().then((core) => {
                core.display.resetCamera();
            });
        });

        el.appendChild(camResetBtn);

        return this._element;
    }
    renderSelf(state: Readonly<PointCloudState>, sample: Readonly<Sample>): HTMLElement {
        if (state.config.thumbnail) {
            this._element.classList.add(css.hidden);
        }
        else {
            this._element.classList.remove(css.hidden);
        }
        return this._element;
    }
};

export class PointCloudElement extends BaseElement<PointCloudState, HTMLCanvasElement>{
    private _canvas: HTMLCanvasElement;
    private _ctx: CanvasRenderingContext2D;
    private _thumb_image: HTMLImageElement;
    private _state_3d: Looker3DState;

    public createHTMLElement(update: StateUpdate<PointCloudState>, dispatchEvent: (eventType: string, details?: any) => void): HTMLCanvasElement {
        this._canvas = document.createElement("canvas");
        this._canvas.width = window.innerWidth;
        this._canvas.height = window.innerHeight;
        this._ctx = this._canvas.getContext("2d");
        this._thumb_image = new Image();

        update((state: Readonly<PointCloudState>) => {
            this._state_3d = Global3DState.make(state.config.displayConfig);
            return state;
        });

        return this._canvas;
    }

    private _renderThumbnail (mesh: three.Mesh, bbox:[number,number,number,number]) {
        Global3DState.get().then((core) => {
            core.renderLoop.stop();
            let dims = core.thumb_gen.getSize();
            core.thumb_gen.makeThumbnailURL(mesh).then((url) => {
                this._thumb_image.src = url;
                this._ctx.drawImage(this._thumb_image, 
                    0, 0, dims.width, dims.height,
                    0, 0, bbox[2], bbox[3]
                );
            });
        });
    }

    private _renderScene (mesh: three.Mesh) {
        this._state_3d.renderLoop.stop();
        this._state_3d.display.clearScene();
        this._state_3d.display.addSceneItem(mesh);
        this._state_3d.display.setInteractionElement(this._canvas);
        this._state_3d.display.setSize(this._canvas.width, this._canvas.height);

        this._state_3d.renderLoop.start(() => {
            this._state_3d.display.render();
            this._state_3d.display.copyToCanvas(this._ctx);
        });
    }

    public renderSelf(state: Readonly<PointCloudState>, sample: Readonly<Sample>): HTMLCanvasElement {
        // TODO: Need to resolve with main contributors how to best represent samples.
        // Currently I have raw point cloud datasets that I pre-compress with draco before visualizing.
        // In theory, this could be done internally in fiftyone, and would offer a better user experience.
        // On the flip side, this compression step is fairly slow. Maybe some notion of "pre-processing"
        // will have to be added to fiftyone datasets and importers to handle this.

        // TODO: Need a way to easily trigger thumbnail/expanded states in limited testing situations.
        //
        if (!sample.compressed_path) return this.element;
        let path = "http://localhost:5151/filepath/" + sample.compressed_path;
        //let path = sample.compressed_path;
        this._state_3d.getDracoMesh(path).then((mesh) => {
            //this._renderScene(mesh);
            if (state.config.thumbnail) this._renderThumbnail(mesh, state.canvasBBox);
            else this._renderScene(mesh);
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
            {
                node: ControlsElement
            },
            {
                node: ThumbnailSelectorElement
            },
            { node: ErrorElement },
            { node: JSONPanelElement },
            { node: HelpPanelElement },
            { node: TagsElement }

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
        state.config.displayConfig = pcd.DEFAULT_3D_DISPLAY_CONFIG;
        state.config.thumbnail_width = 200;
        state.config.thumbnail_height =  200;
        return state;
    }
};