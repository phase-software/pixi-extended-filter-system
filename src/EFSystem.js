import { systems, Rectangle, Point, Geometry, DRAW_MODES } from 'pixi.js';
import { Filter } from './Filter';

const GEOMETRY_INDICES = [0, 1, 3, 2];

/**
 * Manages all the filters applied on an object in the display-object hierarchy. It
 * is stateful and is used to communicate information to filter objects.
 *
 * NOTE: It is expected that filters do not modify read-only members. If they really
 * need to, those members should be returned to their original state before returning
 * to the filter-manager.
 *
 * @class
 * @private
 */
class FilterPipe
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
        this._nakedTargetBounds = null;
        this._nakedSourceFrame = null;

        this.textureDimensions.set();
    }
}

export class EFSystem extends systems.FilterSystem
{
    constructor(renderer, ...args)
    {
        super(renderer, ...args);

        this.globalUniforms.uniforms.inputFrameInverse = new Float32Array(2);
        this.globalUniforms.uniforms.outputFrameInverse = new Float32Array(2);
        this.globalUniforms.uniforms.objectClamp = new Float32Array(4);

        this.identityFilter = new Filter();
    }

    /**
     * @override
     */
    push(target, filters, resolution = target.filterResolution ? target.filterResolution : 0)
    {
        const renderer = this.renderer;
        const filterStack = this.defaultFilterStack;
        const state = this._newPipe(target, filters);

        if (filterStack.length === 1)
        {
            this.defaultFilterStack[0].renderTexture = renderer.renderTexture.current;
        }

        filterStack.push(state);

        this.measure(state);

        if (resolution > 0)
        {
            state.resolution = resolution;
        }

        if (state.filters.length > 0)
        {
            state.renderTexture = this.filterPassRenderTextureFor(state);
            state.textureDimensions.set(state.renderTexture.width, state.renderTexture.height);

            state.renderTexture.filterFrame = state.inputFrame.clone().ceil(1);
            renderer.renderTexture.bind(state.renderTexture, state.inputFrame);
            renderer.renderTexture.clear();
        }
    }

    pop()
    {
        const filterStack = this.defaultFilterStack;
        const state = filterStack.pop();
        const filters = state.filters;

        this.activeState = state;

        if (filters.length > 0)
        {
            const globalUniforms = this.globalUniforms.uniforms;
            const { inputSize, inputPixel, inputClamp } = globalUniforms;

            globalUniforms.resolution = state.resolution;

            inputSize[0] = state.textureDimensions.x;
            inputSize[1] = state.textureDimensions.y;
            inputSize[2] = 1.0 / inputSize[0];
            inputSize[3] = 1.0 / inputSize[1];

            inputPixel[0] = inputSize[0] * state.resolution;
            inputPixel[1] = inputSize[1] * state.resolution;
            inputPixel[2] = 1.0 / inputPixel[0];
            inputPixel[3] = 1.0 / inputPixel[1];

            inputClamp[0] = 0.5 * inputPixel[2];
            inputClamp[1] = 0.5 * inputPixel[3];

            const lastState = filterStack[filterStack.length - 1];

            if (filters.length === 1)
            {
                this.passUniforms(state, 0);
                filters[0].apply(this, state.renderTexture, lastState.renderTexture, false, state);

                this.returnFilterTexture(state.renderTexture);
            }
            else
            {
                let flip = state.renderTexture;

                let flop = this.getOptimalFilterTexture(
                    flip.width,
                    flip.height,
                    state.resolution,
                );

                let i = 0;

                state.outputSwappable = true;
                state.inputWritable = true;

                for (i = 0; i < filters.length - 1; ++i)
                {
                    this.passUniforms(state, i);
                    flop.filterFrame = this.outputFrame.clone().ceil(1);

                    const output = filters[i].apply(this, flip, flop, true, state);

                    if (output && output !== flop) // output is different from the given one
                    {
                        if (output !== flip) // output is different than the provided input
                        {
                            this.returnFilterTexture(flop);
                            flop = output;
                        }
                        else
                        {
                            continue;// no need to flip-flop since input already was made the output
                        }
                    }

                    const t = flip;

                    flip = flop;
                    flop = t;
                }

                this.passUniforms(state, filters.length - 1);
                state.outputSwappable = false;
                state.inputWritable = true;
                filters[i].apply(this, flip, lastState.renderTexture, false, state);

                this.returnFilterTexture(flip);
                this.returnFilterTexture(flop);
            }
        }

        state.clear();
        this.statePool.push(state);
    }

    get inputFrame()
    {
        return this.globalUniforms.uniforms.inputFrame;
    }

    get outputFrame()
    {
        return this.globalUniforms.uniforms.outputFrame;
    }

    normalizePoint(value, into = value, texturePixels = this.activeState.texturePixels)
    {
        into.set(value.x / texturePixels.x, value.y / texturePixels.y);
    }

    /** @override */
    applyFilter(filter, input, output, clear, options = {})
    {
        const renderer = this.renderer;

        renderer.renderTexture.bind(output, output ? output.filterFrame : null);

        if (clear)
        {
            // gl.disable(gl.SCISSOR_TEST);
            renderer.renderTexture.clear();
            // gl.enable(gl.SCISSOR_TEST);
        }

        filter.uniforms.uSampler = input;
        filter.uniforms.filterGlobals = this.globalUniforms;

        renderer.state.set(filter.state);
        renderer.shader.bind(filter);

        if (options.geometry)
        {
            renderer.geometry.bind(options.geometry);
            renderer.geometry.draw(options.drawMode ? options.drawMode : DRAW_MODES.TRIANGLE_STRIP);
        }
        else if (filter.legacy)
        {
            this.quadUv.map(input._frame, input.filterFrame);

            renderer.geometry.bind(this.quadUv);
            renderer.geometry.draw(DRAW_MODES.TRIANGLES);
        }
        else
        {
            renderer.geometry.bind(this.quad);
            renderer.geometry.draw(DRAW_MODES.TRIANGLE_STRIP);
        }
    }

    /**
     * Measures all the frames needed in the given pipe. This includes
     * the target, input, output, and each filter's frame.
     *
     * NOTE: `measure` also calculates `resolution`, `padding`,
     *  and `legacy` of the pipe.
     *
     * @param {FilterPipe} state
     */
    measure(state)
    {
        let { target, filters } = state;

        let resolution = filters[0].resolution;

        let autoFit = filters[0].autoFit;

        let legacy = filters[0].legacy;

        let padding = filters[0].padding;

        for (let i = 1; i < filters.length; i++)
        {
            const filter =  filters[i];

            resolution = Math.min(resolution, filter.resolution);
            autoFit = autoFit && filter.autoFit;
            legacy = legacy || filter.legacy;

            if (!filter.additivePadding)
            {
                padding = Math.max(padding, filter.padding);
            }
            else
            {
                padding += filter.padding;
            }
        }

        // target- & output- frame measuring pass
        state.resolution = resolution;
        state.legacy = legacy;
        state.target = target;
        state.padding = padding;
        state.outputFrame.copyFrom(target.filterArea || target.getBounds(true));
        state.outputFrame.pad(padding);

        if (autoFit)
        {
            state.targetFrame = state.outputFrame.clone();
            state.targetFrame.ceil(resolution);
            state.outputFrame.fit(this.renderer.renderTexture.sourceFrame);
        }
        else
        {
            state.targetFrame = state.outputFrame;
        }

        state.outputFrame.ceil();

        const { targetFrame, outputFrame } = state;

        // per-filter frame measuring pass
        let filterPassFrame = outputFrame;

        let renderable = true;

        // can we modify filters? (only after it is cloned)
        let filtersMutable = false;

        for (let i = filters.length - 1; i >= 0; i--)
        {
            const filter = filters[i];

            if (filter.measure)
            {
                filter.measure(targetFrame, filterPassFrame.clone(), padding);
                const pfilterPassFrame = filters[i].frame;// .fit(targetFrame);

                if (pfilterPassFrame.width <= 0 || pfilterPassFrame.height <= 0)
                {
                    if (!filtersMutable)
                    {
                        filters = state.filters.slice();
                        state.filters = filters;
                        filtersMutable = true;
                    }

                    filters.splice(i, 1);
                }
                else
                {
                    renderable = renderable && filter.renderable;
                    pfilterPassFrame.ceil();
                    filterPassFrame = pfilterPassFrame;
                }
            }

            // filterPassFrame is the same
        }

        state.renderable = renderable;

        // filters may become empty if filters return empty rectangles as inputs.
        state.inputFrame = filters[0] && filters[0].frame ? filters[0].frame : outputFrame;
    }

    /**
     * Premeasure the frames needed by the filter system during a render pass.
     *
     * This is useful if you need measurements in a custom `render` method.
     *
     * TODO: Support caching measurements until flushing the filter pipe
     *
     * @param {PIXI.DisplayObject} target
     * @param {Array<PIXI.Filter>} filters
     * @returns {FilterPipe} pipe with measurements
     */
    premeasure(target, filters)
    {
        const pipe = this._newPipe(target, filters);

        this.measure(pipe);

        return pipe;
    }

    /**
     * @param {FilterPipe} state
     * @returns {PIXI.RenderTexture} - render texture suitable for the given filter pipe
     */
    filterPassRenderTextureFor(state)
    {
        let width = 0;

        let height = 0;

        let defaultIncluded = false;

        for (let i = 0; i < state.filters.length; i++)
        {
            const filter = state.filters[i];

            if (filter.frame)
            {
                width = Math.max(width, filter.frame.width);
                height = Math.max(height, filter.frame.height);
            }
            else if (!defaultIncluded)
            {
                width = Math.max(width, state.outputFrame.width);
                height = Math.max(height, state.outputFrame.height);
                defaultIncluded = true;
            }
        }

        return this.getOptimalFilterTexture(Math.ceil(width), Math.ceil(height), state.resolution);
    }

    passUniforms(state, filterIndex)
    {
        this._lastFilterIndex = filterIndex;

        const filter = state.filters[filterIndex];
        const nextFilter = (filterIndex === state.filters.length - 1) ? null : state.filters[filterIndex + 1];
        const globalUniforms = this.globalUniforms.uniforms;
        const { inputSize, inputPixel, inputClamp, objectClamp, inputFrameInverse, outputFrameInverse } = globalUniforms;
        const inputFrame = filter.frame;
        const outputFrame = nextFilter ? nextFilter.frame : state.outputFrame;

        inputClamp[2] = (inputFrame.width * inputSize[2]) - (0.5 * inputPixel[2]);
        inputClamp[3] = (inputFrame.height * inputSize[3]) - (0.5 * inputPixel[3]);

        objectClamp[0] = (Math.floor(state.nakedTargetBounds.left - inputFrame.left) + 0.5) * inputPixel[2];
        objectClamp[1] = (Math.floor(state.nakedTargetBounds.top - inputFrame.top) + 0.5) * inputPixel[3];
        objectClamp[2] = (Math.ceil(inputFrame.width - inputFrame.right + state.nakedTargetBounds.right) - 0.5) * inputPixel[2];
        objectClamp[3] = (Math.ceil(inputFrame.height - inputFrame.bottom + state.nakedTargetBounds.bottom) - 0.5) * inputPixel[3];

        globalUniforms.inputFrame = inputFrame;
        globalUniforms.outputFrame = outputFrame;

        inputFrameInverse[0] = 1 / inputFrame.width;
        inputFrameInverse[1] = 1 / inputFrame.height;

        outputFrameInverse[0] = 1 / outputFrame.width;
        outputFrameInverse[1] = 1 / outputFrame.height;

        //        if (state.legacy)
        {
            const filterArea = globalUniforms.filterArea;

            filterArea[0] = state.textureDimensions.x;
            filterArea[1] = state.textureDimensions.y;
            filterArea[2] = outputFrame.x;
            filterArea[3] = outputFrame.y;

            globalUniforms.filterClamp = globalUniforms.inputClamp;
        }

        this.globalUniforms.update();
    }

    /**
     * Converts the given frame into a geometry that the default vertex shader will
     * draw. `frame` should fit inside `outputFrame`.
     * @param {Rectangle} frame - the frame to draw
     * @param {Rectangle}[outputFrame] - the output frame in which the filter operates. This
     *      is what the texture being drawn to represents.
     * @returns {Geometry} - the geometry to be used
     */
    convertFrameToGeometry(frame, outputFrame = this.outputFrame)
    {
        const u0 = (frame.x - outputFrame.x) / outputFrame.width;
        const u1 = (frame.x - outputFrame.x + frame.width) / outputFrame.width;
        const v0 = (frame.y - outputFrame.y) / outputFrame.height;
        const v1 = (frame.y - outputFrame.y + frame.height) / outputFrame.height;
        const geometry = this._newGeometry();

        geometry.addAttribute('aVertexPosition', [
            u0, v0,
            u1, v0,
            u1, v1,
            u0, v1,
        ]);

        geometry.addIndex(GEOMETRY_INDICES);

        return geometry;
    }

    convertFrameToClamp(frame, outputFrame = this.outputFrame, textureDimensions = this.activeState.textureDimensions)
    {
        const clamp = new Float32Array(4);

        clamp[0] = (Math.floor(frame.x - outputFrame.x) + 0.5) / textureDimensions.x;
        clamp[1] = (Math.floor(frame.y - outputFrame.y) + 0.5) / textureDimensions.y;
        clamp[2] = (Math.ceil(frame.x + frame.width - outputFrame.x) - 0.5) / textureDimensions.x;
        clamp[3] = (Math.ceil(frame.x + frame.height - outputFrame.x) - 0.5) / textureDimensions.y;

        return clamp;
    }

    _newPipe(target, filters)
    {
        const pipe = this.statePool.pop() || new FilterPipe();

        if (target)
        {
            pipe.target = target;
            pipe.filters = filters ? filters : target.filters;
        }

        return pipe;
    }

    _newGeometry()
    {
        return EFSystem.geometryPool.pop() || new Geometry();
    }

    /** @override */
    getFilterTexture(input, resolution)
    {
        if (input === undefined)
        {
            console.error('Warning: getFilterTexture without a reference texture '
                + 'is deprecated. It defaults to a texture of the same size as output.');
            console.error(new Error().stack);
        }

        return super.getFilterTexture(input, resolution);
    }
}

/**
 * Pools of geometry objects for internal usage.
 * @member {PIXI.Geometry[]}
 * @private
 */
EFSystem.geometryPool = [];
