import { Filter as BaseFilter } from 'pixi.js';
import defaultVertex from './defaultFilter.vert';
import acsVertex from './acs.vert';
import acsFragment from './acs.frag';

/**
 * Special type of shader that applies a 2D filter on pixel in an input and
 * gives the required output. `Filter#measure` is used to determine the input
 * needed by this filter, given an output that the system demands.
 */
export class Filter extends BaseFilter
{
    /** @override */
    constructor(vertex = defaultVertex, fragment, uniforms)
    {
        super(vertex, fragment, uniforms);

        this.additivePadding = false;

        this.nestedFilters = [];

        this.parentFilter = null;// are you just a filter-pass for another fitler?

        this.padding = undefined;

        /**
         * Render options that work when applying this filter.
         *
         * @member {PIXI.RenderOptions}
         */
        this.renderOptions = {};
    }

    /**
     * @memberof PIXI.Filter
     * @member {number}
     * @name defaultPadding
     * @abstract
     *
     * Create a <code>defaultPadding</code> property if your filter has an instrinsic need
     * for one. The padding can be overridden by the client. The default padding
     * should return the padding needed when viewport scale is 1 (it should not
     * consider viewport in its calculation)
     */

    /**
     * @memberof PIXI.Filter
     * @member {number}
     * @name defaultResolution
     * @abstract
     *
     * Create a <code>defaultResolution</code> property if your filter recommends a
     * specific resolution. This should be 1, 2, or 4, but not more since higher resolutions
     * need more memory.
     */

    get padding()
    {
        let normalPadding;// padding when viewport scale is 1

        if (this._paddingOverride !== undefined)
        {
            normalPadding = this._paddingOverride;
        }
        else if (this.defaultPadding !== undefined)
        {
            normalPadding = this.defaultPadding;
        }
        else
        {
            normalPadding = 0;
        }

        let padding = normalPadding * this.viewportScale;

        for (const filter of this.nestedFilters)
        {
            padding = Math.max(filter.padding, padding);
        }

        return Math.ceil(padding);
    }
    set padding(value)
    {
        this._paddingOverride = value;
    }

    get viewport()
    {
        return this._viewport;
    }
    set viewport(value)
    {
        this._viewport = value;

        for (const filter of this.nestedFilters)
        {
            filter.viewport = value;
        }
    }

    /**
     * Overridable method called by `measure`. Use this to provide your custom measurements,
     * by setting `this._frame` and `this._renderable`.
     * @param {PIXI.Rectangle} targetBounds
     * @param {PIXI.Rectangle} passBounds
     * @param {number} padding
     * @abstract
     * @see {@link PIXI.Filter#frame}
     * @see {@link PIXI.Filter#renderable}
     */
    onMeasure(targetBounds, passBounds, padding)// eslint-disable-line no-unused-vars
    {
        this._frame = passBounds;
        this._renderable = true;
    }

    /**
     * Measures the input frame needed by this filter to calculate pixels
     * in the pass-output. It should keep the results in `Filter#frame`
     * @param {PIXI.Rectangle} targetBounds - bounds of the target object
     * @param {PIXI.Rectangle} passBounds - frame in which output is required
     * @param {number} padding - padding applied in the target bounds
     */
    measure(targetBounds, passBounds, padding)
    {
        this.onMeasure(targetBounds, passBounds, padding);

        if (this.frame === null || this.frame === undefined)
        {
            throw new Error(`${this.constructor.name}#onMeasure does not set Filter#_frame.`);
        }
        if (this.renderable === undefined)
        {
            throw new Error(`${this.constructor.name}#onMeasure does not set Filter#_renderable.`);
        }

        for (const filter of this.nestedFilters)
        {
            filter.measure(targetBounds, passBounds, padding);
            this._frame.enlarge(filter._frame);
            this._renderable = this._renderable && filter._renderable;
        }

        for (const filter of this.nestedFilters)
        {
            filter._frame.copyFrom(this._frame);
        }
    }

    /**
     * Input frame required by this filter, as recorded by the last measure
     * pass.
     * @returns {PIXI.Rectangle}
     */
    get frame()
    {
        return this._frame;
    }

    /**
     * Whether this filter can be applied without reducing the refresh rate
     * significantly
     * @returns {boolean}
     */
    get renderable()
    {
        return this._renderable;
    }

    get viewportScale()
    {
        return this.viewport ? Math.max(this.viewport.scale.x, this.viewport.scale.y) : 1;
    }

    apply(filterManager, input, output, clear, state, renderOptions)
    {
        filterManager.applyFilter(this, input, output, clear, renderOptions);
    }

    static get defaultVertexSrc()
    {
        return defaultVertex;
    }

    static get defaultFragmentSrc()
    {
        return BaseFilter.defaultFragmentSrc;
    }

    static get acsVertexSrc()
    {
        return acsVertex;
    }

    static get acsFragmentSrc()
    {
        return acsFragment;
    }
}

Filter.BaseFilter = BaseFilter;

export default Filter;
