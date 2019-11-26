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
    }

    /**
     * Measures the input frame needed by this filter to calculate pixels
     * in the pass-output. It should keep the results in `Filter#frame`
     * @param {PIXI.Rectangle} targetBounds - bounds of the target object
     * @param {PIXI.Rectangle} passBounds - frame in which output is required
     * @param {number} padding - padding applied in the target bounds
     */
    measure(targetBounds, passBounds, padding)// eslint-disable-line no-unused-vars
    {
        this._frame = passBounds;
        this._renderable = true;
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
