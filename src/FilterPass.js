import { Rectangle } from 'pixi.js';

/**
 * Data object to store relevant filter frames for a filter.
 *
 * @namespace PIXI
 * @class
 * @private
 */
export class FilterPass
{
    constructor(inputFrame = null, targetInFrame = null,
        outputFrame = null, targetOutFrame = null, destinationFrame)
    {
        this.inputFrame = inputFrame;
        this.targetInFrame = targetInFrame;
        this.outputFrame = outputFrame;
        this.targetOutFrame = targetOutFrame;

        this.destinationFrame = destinationFrame;
    }

    reset()
    {
        /**
         * The filter-frame of the input texture.
         * @member {PIXI.Rectangle}
         */
        this.inputFrame = null;

        /**
         * The frame inside the input-frame on which the filter is to be applied.
         * @member {PIXI.Rectangle}
         */
        this.targetInFrame = null;

        /**
         * The filter-frame of the output render-texture.
         * @member {PIXI.Rectangle}
         */
        this.outputFrame = null;

        /**
         * The frame inside the output-frame in which the filter's results will be
         * written. Anything outside this will be copied from the input texture.
         * @member {PIXI.Rectangle}
         */
        this.targetOutFrame = null;

        this.destinationFrame = null;
    }
}
