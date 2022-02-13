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

class RGBDProjector {

};

// Looker for RGBD data.
// ----------------------
// RGBD datasets are usually packaged as pairs of 
// image files representing color frames and depth frames. 
// This looker generates a point cloud on the client
// side and renders using a Display3D

interface RGBDState extends BaseState {

};

class RGBDConfig extends BaseConfig {

};

export class RGBDElement extends BaseElement<RGBDState, HTMLCanvasElement>{
    private _canvas: HTMLCanvasElement;
    private _ctx: CanvasRenderingContext2D; 
    private _image: HTMLImageElement;

    createHTMLElement(update: StateUpdate<RGBDState>, dispatchEvent: (eventType: string, details?: any) => void): HTMLCanvasElement {
        this._canvas = document.createElement("canvas");
        this._ctx = this._canvas.getContext("2d");
        this._image = new Image();

        update((state) => {
            Global3DState.make(state.config.scene);
            return state;
        });
        return this._canvas;
    }

    renderSelf(state: Readonly<RGBDState>, sample: Readonly<Sample>): HTMLCanvasElement {

        return this._canvas;
    }
};