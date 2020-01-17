import { Point, Rectangle } from 'pixi.js';

const defaultScale = new Point(1, 1);

const defaultViewport = {
    scale: defaultScale,
};

/**
 * Stateful object for handling filters of a specific display object.
 *
 * @class
 * @private
 */
export class FilterScope
{
    constructor()
    {
        /**
         * The render-texture that was used to draw the object without filters. It
         * need not contain the same data.
         * @readonly
         * @member {PIXI.RenderTexture}
         */
        this.renderTexture = null;

        /**
         * Whether the filter is allowed to write on the input texture; this is `true`
         * by default but filters can use this to communicate with nested filters.
         * @member {boolean}
         */
        this.inputWritable = true;

        /**
         * Whether returning a texture different than the given output is allowed
         * for the current filter pass. This can also be used by filters to communicate
         * with nested filters.
         * @member {boolean}
         */
        this.outputSwappable = false;

        /**
         * Target of the filters
         * We store for case when custom filter wants to know the element it was applied on
         * @readonly
         * @member {PIXI.DisplayObject}
         */
        this.target = null;

        /**
         * Compatibility with PixiJS v4 filters
         * @readonly
         * @member {boolean}
         * @default false
         */
        this.legacy = false;

        /**
         * Resolution of filters
         * @readonly
         * @member {number}
         * @default 1
         */
        this.resolution = 1;

        /**
         * Whether all filters can be rendered in reasonable time.
         * @readonly
         * @member {boolean}
         */
        this.renderable = true;

        /**
         * Frame of the target object's total filter area (including padding).
         * @readonly
         * @member {PIXI.Rectangle}
         * @private
         */
        this.targetFrame = null;

        /**
         * Frame in which pixels are to be calculated for rendering onto the
         * final renderTexture/screen.
         * @readonly
         * @member {PIXI.Rectangle}
         * @private
         */
        this.outputFrame = new Rectangle();

        /**
         * Dimensions of the render-texture that will be mapped onto the screen.
         * @readonly
         * @member {PIXI.Point}
         * @private
         */
        this.textureDimensions = new Point();

        /**
         * Dimensions of the render texture multiplied by the resolution. These are
         * actual number of pixels in the render-texture. If the resolution is greater
         * than 1, then the render-texture will be downscaled before rendering to the
         * screen.
         */
        this.texturePixels = new Point();

        /**
         * Collection of filters
         * @readonly
         * @member {PIXI.Filter[]}
         * @private
         */
        this.filters = [];

        /**
         * Viewport object for reading scal.
         * @member {PIXI.Viewport}
         * @readonly
         */
        this.viewport = defaultViewport;
    }

    /**
     * Legacy alias of `FilterPipe#inputFrame`.
     * @returns {PIXI.Rectangle}
     */
    get sourceFrame()
    {
        return this.inputFrame;
    }

    /**
     * Legacy alias of `FilterPipe#textureDimensions`, in `PIXI.Rectangle` form.
     * @returns {PIXI.Rectangle}
     */
    get destinationFrame()
    {
        return new Rectangle(0, 0, this.textureDimensions.x, this.textureDimensions.y);
    }

    /**
     * Bounds of the target, without the filter padding. Don't modify the returned object.
     * @returns {PIXI.Rectangle}
     */
    get nakedTargetBounds()
    {
        if (this._nakedTargetBounds)
        {
            return this._nakedTargetBounds;
        }

        this._nakedTargetBounds = this.target.getBounds(true);// don't update transform during a render pass

        return this._nakedTargetBounds;
    }

    /**
     * The source frame, just without the padding applied; use this for clamping. It is
     * the naked target bounds intersected with the screen. Don't modify the returned
     * object.
     * @returns {PIXI.Rectangle}
     */
    get nakedSourceFrame()
    {
        if (this._nakedSourceFrame)
        {
            return this._nakedSourceFrame;
        }

        this._nakedSourceFrame = this.nakedTargetBounds.clone().fit(this.outputFrame);

        return this._nakedSourceFrame;
    }

    normalize(ivec, ovec)
    {
        ovec.x = ivec.x * this.viewport.scale.x / this.texturePixels.x;
        ovec.y = ivec.y * this.viewport.scale.y / this.texturePixels.y;
    }

    /**
     * Clears the state
     * @private
     */
    clear()
    {
        this.target = null;
        this.filters = null;
        this.renderTexture = null;
        this.resolution = 0;
        this.viewport = defaultViewport;
        this._nakedTargetBounds = null;
        this._nakedSourceFrame = null;

        this.textureDimensions.set();
    }
}

export default FilterScope;
