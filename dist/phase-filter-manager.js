import { Filter as Filter$1, Point, Rectangle, SCALE_MODES, systems, DRAW_MODES, Geometry } from 'pixi.js';

var defaultVertex = "attribute vec2 aVertexPosition;uniform mat3 projectionMatrix;varying vec2 vTextureCoord;uniform vec4 inputSize;uniform vec4 inputFrame;uniform vec4 outputFrame;vec4 filterVertexPosition(void){vec2 position=aVertexPosition*max(outputFrame.zw,vec2(0.))+outputFrame.xy;return vec4((projectionMatrix*vec3(position,1.0)).xy,0.0,1.0);}void main(void){gl_Position=filterVertexPosition();vec2 outTextureCoord=aVertexPosition*(outputFrame.zw*inputSize.zw);vTextureCoord=clamp(outTextureCoord+(outputFrame.xy-inputFrame.xy)*inputSize.zw,vec2(.0,.0),inputFrame.zw*inputSize.zw);}";

var acsVertex = "attribute vec2 aVertexPosition;uniform mat3 projectionMatrix;varying vec2 vTextureCoord;varying vec2 vAbsoluteCoord;uniform vec4 inputSize;uniform vec4 inputFrame;uniform vec4 outputFrame;void main(void){vec2 absolutePosition=aVertexPosition*max(outputFrame.zw,vec2(0.))+outputFrame.xy;gl_Position=vec4((projectionMatrix*vec3(absolutePosition,1.0)).xy,0.0,1.0);vec2 outTextureCoord=aVertexPosition*(outputFrame.zw*inputSize.zw);vTextureCoord=clamp(outTextureCoord-(inputFrame.xy-outputFrame.xy)*inputSize.zw,vec2(0,0),vec2((inputFrame.zw-vec2(0.5,0.5))*inputSize.zw));vAbsoluteCoord=absolutePosition;}";

var acsFragment = "varying vec2 vTextureCoord;varying vec2 vAbsoluteCoord;uniform sampler2D uSampler;void main(void){gl_FragColor=texture2D(uSampler,vTextureCoord);}";

/**
 * A filter applies a post-processing effect on an input texture.
 *
 * @class
 * @extends PIXI.Filter
 */
class Filter extends Filter$1
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
        return Filter$1.defaultFragmentSrc;
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

Filter.BaseFilter = Filter$1;

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
class FilterScope
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
         * Pipeline of filter passes.
         * @readonly
         * @member {FilterPass[]}
         */
        this.filterPasses = [];

        /**
         * Filter pass index.
         * @readonly
         * @member {number}
         */
        this.currentIndex = 0;

        /**
         * Viewport object for reading scal.
         * @member {PIXI.Viewport}
         * @readonly
         */
        this.viewport = defaultViewport;
    }

    get currentFilter()
    {
        return this.filters[this.currentIndex];
    }

    get currentFilterPass()
    {
        return this.filterPasses[this.currentIndex];
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

const FILTER_RECTS = {
    NAKED_TARGET: 1,
    WHOLE_INPUT: 11,
};

var rescaleVertexSrc = "#define SHADER_NAME_ RescaleFilter\nattribute vec2 aVertexPosition;uniform mat3 projectionMatrix;varying vec2 vTextureCoord;uniform vec4 inputSize;uniform vec4 inputFrame;uniform vec4 outputFrame;vec4 filterVertexPosition(void){vec2 position=aVertexPosition*max(outputFrame.zw,vec2(0.))+outputFrame.xy;return vec4((projectionMatrix*vec3(position,1.0)).xy,0.0,1.0);}void main(void){gl_Position=filterVertexPosition();vTextureCoord=aVertexPosition*inputFrame.zw*inputSize.zw;}";

/**
 * Instead of applying a "shift" to fragments from the input-frame into the
 * output-frame, the rescale-filter will transform the vertex stream so that
 * all of the input-frame is visible in the output-frame.
 *
 * @class
 * @extends PIXI.Filter
 */
class RescaleFilter extends Filter
{
    constructor()
    {
        super(rescaleVertexSrc, Filter.defaultFragmentSrc);

        this.scaleMode = SCALE_MODES.LINEAR;
    }

    apply(filterManager, input, output, clear, state)
    {
        const sm = input.scaleMode;

        input.baseTexture.scaleMode = this.scaleMode;
        input.baseTexture.update();
        super.apply(filterManager, input, output, clear, state);
        input.baseTexture.scaleMode = sm;
        input.baseTexture.update();
    }
}

/**
 * Data object to store relevant filter frames for a filter.
 *
 * @namespace PIXI
 * @class
 * @private
 */
class FilterPass
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

const GEOMETRY_INDICES = [0, 1, 3, 2];

/**
 * Customized filter system for phase software. Features that are currently pending
 * to be merged into PixiJS:
 *
 * 1. Measurement pass
 * 2. Filter-pipe
 * 3. Composite filters
 * 4. Object clamp
 * 5. Custom "push" options
 *
 * @class
 * @extends PIXI.FilterSystem
 */
class FilterSystem extends systems.FilterSystem
{
    constructor(renderer, ...args)
    {
        super(renderer, ...args);

        this.globalUniforms.uniforms.inputFrameInverse = new Float32Array(2);
        this.globalUniforms.uniforms.outputFrameInverse = new Float32Array(2);
        this.globalUniforms.uniforms.objectClamp = new Float32Array(4);

        this.globalUniforms.uniforms.inputFrame = new Rectangle();

        this.identityFilter = new Filter();
        this.rescaleFilter = new RescaleFilter();
    }

    /**
     * @param {PIXI.DisplayObject} target
     * @param {PIXI.Filter[]} filters
     * @param {PIXI.ScopeOptions} options
     * @override
     */
    push(target, filters, options = target.filterOptions ? target.filterOptions : {})
    {
        const { renderer, defaultFilterStack: filterStack } = this;
        const state = this._newPipe(target, filters);

        if (filterStack.length === 1)
        {
            this.defaultFilterStack[0].renderTexture = renderer.renderTexture.current;

            if (this.renderer.renderTexture.current)
            {
                this.renderer.renderTexture.current.filterFrame = this.renderer.renderTexture.sourceFrame.clone();
            }
        }

        filterStack.push(state);

        if (options.viewport)
        {
            state.viewport = options.viewport;
        }

        this.measure(state);

        if (options.padding)
        {
            state.padding = Math.max(options.padding, state.padding);
        }
        if (options.resolution)
        {
            state.resolution = options.resolution;
        }

        if (state.filters.length > 0)
        {
            state.renderTexture = this.filterPassRenderTextureFor(state);
            state.textureDimensions.set(state.renderTexture.width, state.renderTexture.height);
            state.texturePixels.copyFrom(state.textureDimensions);

            state.renderTexture.filterFrame = state.inputFrame.clone().ceil(1);

            renderer.renderTexture.bind(state.renderTexture, state.inputFrame,
                new Rectangle(0, 0, state.inputFrame.width, state.inputFrame.height));
            renderer.renderTexture.clear();

            const limit = renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE);

            if (state.renderTexture.width > limit || state.renderTexture.height > limit)
            {
                throw new Error('Cannot execute filters: too large texture size.');
            }
        }

        this.activeState = state;
    }

    pop()
    {
        const filterStack = this.defaultFilterStack;
        const state = filterStack.pop();
        const filters = state.filters;

        this.activeState = state;

        state.currentIndex = 0;

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
                            ++state.currentIndex;
                            continue;// no need to flip-flop since input already was made the output
                        }
                    }

                    const t = flip;

                    flip = flop;
                    flop = t;

                    ++state.currentIndex;
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

    /** @override */
    applyFilter(filter, input, output, clear, options = this.resolveRenderOptions(filter.renderOptions, this.activeState))
    {
        const renderer = this.renderer;

        renderer.renderTexture.bind(output,
            output ? output.filterFrame : null, options.destinationFrame || (output && output.destinationFrame));

        if (clear && options.destinationFrame)
        {
            const gl = this.renderer.gl;
            const { x, y, width, height } = options.destinationFrame;

            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(x, y, width, height);
            renderer.renderTexture.clear([Math.random(), Math.random(), Math.random(), 1]);
            renderer.scissor.pop();
        }
        else if (clear)
        {
            renderer.renderTexture.clear();
        }

        filter.uniforms.uSampler = input;
        filter.uniforms.filterGlobals = this.globalUniforms;

        renderer.state.set(options.state ? options.state : filter.state);
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
     * @param {FilterScope} state
     */
    measure(state)
    {
        const { target } = state;
        let { filters } = state;

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

        state.filterPasses.length = 0;

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

        const { filterPasses, targetFrame, outputFrame } = state;

        let filterPassFrame = outputFrame;
        let renderable = true;
        let filtersMutable = false;

        for (let i = filters.length - 1; i >= 0; i--)
        {
            const filter = filters[i];

            filter.viewport = state.viewport;
            filter.measure(targetFrame, filterPassFrame.clone(), padding);
            const filterInput = filters[i].frame.fit(targetFrame);

            if (filterInput.width <= 0 || filterInput.height <= 0)
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
                filterInput.ceil();

                filterPasses.unshift(new FilterPass(
                    filterInput.clone(),
                    filterInput.clone(),
                    filterPassFrame.clone(),
                    filterPassFrame.clone(),
                ));

                filterPassFrame = filterInput;
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
    premeasure(target, filters, options = target.filterOptions)
    {
        const pipe = this._newPipe(target, filters);

        if (options)
        {
            pipe.viewport = options.viewport;
        }

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

    updateUniforms(filterPass)
    {
        const globalUniforms = this.globalUniforms.uniforms;

        globalUniforms.inputFrame.copyFrom(filterPass.inputFrame);
        //    globalUniforms.targetInFrame = filterPass.targetInFrame;
        globalUniforms.outputFrame.copyFrom(filterPass.outputFrame);
        //  globalUniforms.targetOutFrame = filterPass.targetOutFrame;

        this.globalUniforms.update();
    }

    updateTextureUniforms(texture)
    {
        const { inputSize, inputPixel } = this.globalUniforms.uniforms;

        inputSize[0] = texture.width;
        inputSize[1] = texture.height;
        inputSize[2] = 1.0 / inputSize[0];
        inputSize[3] = 1.0 / inputSize[1];

        inputPixel[0] = inputSize[0] * texture.resolution;
        inputPixel[1] = inputSize[1] * texture.resolution;
        inputPixel[2] = 1.0 / inputPixel[0];
        inputPixel[3] = 1.0 / inputPixel[1];

        this.globalUniforms.update();
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

        this.updateUniforms(state.filterPasses[filterIndex]);

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
     * Resolve any prescribed behaviours.
     * @private
     */
    resolveRenderOptions(renderOptions, state)
    {
        const clone = Object.assign({}, renderOptions);

        if (clone.frame === FILTER_RECTS.NAKED_TARGET)
        {
            clone.frame = state.nakedTargetBounds.clone().fit(this.inputFrame);
        }
        else if (clone.frame === FILTER_RECTS.WHOLE_INPUT)
        {
            clone.frame = this.inputFrame.clone();
        }

        if (clone.frame)
        {
            clone.geometry = this.convertFrameToGeometry(clone.frame);
        }

        return clone;
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
        const pipe = this.statePool.pop() || new FilterScope();

        if (target)
        {
            pipe.target = target;
            pipe.filters = filters ? filters : target.filters;
        }

        return pipe;
    }

    _newGeometry()
    {
        return FilterSystem.geometryPool.pop() || new Geometry();
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
FilterSystem.geometryPool = [];

/**
 * Pass these options to `FilterSystem#applyFilter` for additional features.
 *
 * @typedef {object} RenderOptions
 * @property {PIXI.DRAW_MODES][drawMode = PIXI.DRAW_MODES.TRIANGLE_STRIP]
 * @property {PIXI.Geometry}[geometry] - geometry to draw for the filter
 * @property {PIXI.Rectangle}[frame] - frame to draw in output texture (converted to geometry)
 */

/**
 * Pass these options to `FilterSystem#push`
 *
 * @typedef {object} ScopeOptions
 * @namespace PIXI
 * @property {number} padding - atleast this much padding will be provided
 * @property {number} resolution - override resolution for filters
 * @property {PIXI.Viewport} viewport - viewport provided to filters
 */

/**
 * Filters that are composed of additional filter passes should extend this
 * instead for lifecycle methods.
 */
class CompositeFilter extends Filter
{
    constructor(...args)
    {
        super(...args);

        /**
         * Filters owned by this.
         * @readonly
         * @member {Filter[]}
         */
        this.nestedFilters = [];
    }

    /**
     * Keep the given filter as a nested filter. This will bind the padding
     * & viewport properties of this filter to the nested filter.
     *
     * @param {PIXI.Filter} filter
     * @param {boolean}[noBind=false] - prevents uniform binding from parent to child
     * @returns {PIXI.Filter} the given filter
     * @protected
     */
    keep(filter, noBind = false)
    {
        filter.parentFilter = this;
        filter.viewport = this.viewport;
        filter.uniforms.binding = noBind ? null : this.uniformGroup;

        this.nestedFilters.push(filter);

        return filter;
    }

    /**
     * Remove the given filter from the nested filters.
     * @param {PIXI.Filter} filter
     * @protected
     */
    kick(filter)
    {
        const index = this.nestedFilters.indexOf(filter);

        if (index > 0)
        {
            filter.uniforms.binding = null;
            filter.parentFilter = null;
            this.nestedFilters.splice(index, 1);
        }
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
}

/**
 * A filter-pipe can be used by composite filters to manage their multi-pass pipeline. It
 * automates setting input-/output- frames for each pass, saving & using intermediate
 * textures, allocating intermediate textures, and overriding some global uniforms.
 *
 * An intermediate texture (i.e. not the input or final output texture) is called a bridge
 * texture. All bridge textures have the same dimensions (equal to the dimensions of the
 * input & output textures provided by the filter-manager).
 *
 * A pipe is a reusable object. Its lifecycle is defined by the the `open` and `closeWith`
 * methods.
 *
 * @memberof PHX
 * @class
 */
class FilterPipe
{
    constructor()
    {
        this._bridgeTextures = [];
        this._savedTextures = [];

        /**
         * Uniforms that require automated conversion
         * @private
         */
        this.auto = {};

        /**
         * Whether uniforms automation is being used.
         * @private
         * @member {boolean}
         */
        this.autoMode = false;
    }

    /**
     * (Re-)open this pipe with the given state variables.
     * @param {PIXI.systems.FilterSystem} filterManager
     * @param {PIXI.RenderTexture} input
     * @param {PIXI.RenderTexture} output
     * @param {boolean} clear
     * @param {object} state
     * @returns {FilterPipe} - `this` for chaining
     */
    open(filterManager, input, output, clear, state)
    {
        this.filterManager = filterManager;
        this.input = input;
        this.output = output;
        this.clear = clear;
        this.state = state;

        /**
         * Copy of whether the initial input was writable
         * @readonly
         * @member {boolean}
         */
        this.inputWritable = this.state.inputWritable;

        /**
         * The current intermediate texture
         * @readonly
         * @member {PIXI.RenderTexture}
         */
        this.bridgeTexture = input;

        /**
         * Whether to save the current bridge-texture after the next `bridge`
         * call.
         * @readonly
         * @member {boolean}
         * @see {PIXI.FilterPipe#save}
         */
        this.saveTexture = false;

        /**
         * The frame of the current bridge-texture.
         * @readonly
         * @member {PIXI.Rectangle}
         */
        this.bridgedFrame = filterManager.inputFrame.clone();

        /**
         * A copy of the final output-frame given by the filter-manager. The filter-manager's
         * copy will be overwritten by a `bridge` call.
         * @readonly
         * @member {PIXI.Rectangle}
         */
        this.endFrame = state.currentFilterPass.outputFrame;

        if (state.outputSwappable)
        {
            this.returnBridgeTexture(output);// output could be used as an intermediate too
        }

        return this;
    }

    /**
     * Save the bridged texture after the next `bridge` call. It will be pushed
     * onto the save-stack. You can use it via `FilterPipe#use`.
     *
     * WARNING: If the filter used in the next `bridge` call does not obey
     * `state.inputWritable=false`, then your saved texture may be corrupted. In
     * order to hedge against this, you should call save and then bridge an identity
     * filter (`filterManager.identityFilter`) and then bridge the filter you
     * need.
     * @returns {PIXI.FilterPipe} `this`
     */
    save()
    {
        this.saveTexture = true;

        return this;
    }

    /**
     * Use a saved texture, given its save-index. The save-index is the no. of save
     * calls you did before saving that texture, e.g. if you want to get the first
     * saved texture, its save-index is zero; however, if you have called `free` for
     * that particular save-index, `null` will be passed.
     * @param {number} saveIndex - no. of textures saved before the required one
     * @param {FilterPipe~useCallback} op - a function that uses the texture
     * @returns {PIXI.FilterPipe} `this`
     */
    use(saveIndex = 0, op)
    {
        if (op)
        {
            op(this._savedTextures[saveIndex]);
        }

        return this;
    }

    /**
     * Free a saved texture, given its save-index; subsequent calls to `use` will
     * pass `null` for this save-index.
     * @param {number}[saveIndex=0]
     * @returns {PIXI.FilterPipe} this
     */
    free(saveIndex = 0)
    {
        const freedTexture = this._savedTextures[saveIndex];

        this._savedTextures[saveIndex] = null;
        this.returnBridgeTexture(freedTexture);

        return this;
    }

    /**
     * Applies the given filter on a intermediate render-texture output.
     *
     * NOTE: The output (`nextFrame`) given for this filter automatically becomes the
     * input for the next filter.
     * @param {PIXI.Filter} filter - filter to apply
     * @param {PIXI.Rectangle}[nextFrame=this.filterManager.inputFrame] - output-frame for this filter
     * @param {object} renderOptions - render-options to pass to the filter
     * @returns {PIXI.FilterPipe} - `this`
     */
    bridge(filter, nextFrame = this.bridgedFrame, renderOptions)
    {
        const inputWritableHere = this.inputWritable || this.bridgeTexture !== this.input;

        this.state.inputWritable = !this.saveTexture && inputWritableHere;

        const nextTexture = this.getBridgeTexture(nextFrame);

        this.filterManager.outputFrame.copyFrom(nextFrame);
        this.autoRun();

        const nextOverride = filter.apply(this.filterManager, this.bridgeTexture,
            nextTexture, true, this.state, renderOptions);

        this.filterManager.inputFrame.copyFrom(nextFrame);// it is not next anymore :)
        this.filterManager.globalUniforms.update();

        // take care of the input bridge texture
        if (this.saveTexture)
        {
            this._savedTextures.push(this.bridgeTexture);
            this.saveTexture = false;
        }
        else if (nextOverride !== this.bridgeTexture && inputWritableHere)
        {
            this.returnBridgeTexture(this.bridgeTexture);
        }

        // take care of the output bridge texture
        if (nextOverride)
        {
            this.bridgeTexture = nextOverride;

            if (nextOverride !== nextTexture)
            { this.returnBridgeTexture(nextTexture); }
        }
        else
        {
            this.bridgeTexture = nextTexture;
        }

        this.bridgedFrame = nextFrame.clone();

        return this;
    }

    /**
     * Passes the current bridge-texture to the callback.
     * @param {PIXI.FilterPipe~useCallback} op
     * @returns {PIXI.FilterPipe} - `this`
     */
    useBridge(op)
    {
        op(this.bridgeTexture);

        return this;
    }

    /**
     * Applies the given filter as the last filter for this pipe. The output-frame must be
     * the one specified by the filter-manager.
     * @param {PIXI.Filter} filter
     * @param {object} renderOptions - render-options to pass to the filter.
     * @param {boolean}[noFinalize=false] - (experimental) don't finalize this pipe; use this
     *      when going to reset pipe to create another cycle.
     * @returns {PIXI.RenderTexture} - the closing texture, i.e. the texture that contains
     * the output. This must be returned to the filter-manager by the filter's `apply` method.
     */
    closeWith(filter, renderOptions, noFinalize = false)
    {
        const inputWritableHere = !this.saveTexture && (this.inputWritable || this.bridgeTexture !== this.input);

        this.state.inputWritable = inputWritableHere;

        this.filterManager.outputFrame.copyFrom(this.endFrame);
        this.autoRun();
        this.filterManager.globalUniforms.update();

        const closingTextureOverride = filter.apply(this.filterManager, this.bridgeTexture, this.closingTexture,
            this.clear, this.state, renderOptions);

        if (this.saveTexture)
        {
            this._savedTextures.push(this.bridgeTexture);
            this.saveTexture = false;
        }
        else if (closingTextureOverride !== this.bridgeTexture && inputWritableHere)
        {
            this.returnBridgeTexture(this.bridgeTexture);
        }

        if (closingTextureOverride && closingTextureOverride !== this.closingTexture)
        {
            this.overrideClosingTexture(closingTextureOverride);
        }

        const closingTexture = this.closingTexture;

        if (!noFinalize)
        {
            this.finalize();
        }

        return closingTexture;
    }

    reset()
    {
        // TODO: Finish this!
    }

    /**
     * Automate object-clamp setting by specifying the frame of the clamp, rather than
     * the clamp's value itself. To turn this off, call this again without any parameter.
     * @param {PIXI.Rectangle}[frame]
     * @returns {PIXI.FilterPipe} `this`
     */
    autoClamp(frame)
    {
        this.auto.objectClamp = frame ? frame : 0;
        this.autoMode = true;

        return this;
    }

    /**
     * Sets all the global uniforms set in `auto`.
     * @private
     */
    autoRun()
    {
        if (!this.autoMode)
        {
            return;
        }

        const { filterManager } = this;
        const { uniforms } = filterManager.globalUniforms;

        if (this.auto.objectClamp && this.auto.objectClamp !== 0)
        {
            uniforms.objectClamp = filterManager.convertFrameToClamp(this.auto.objectClamp);
        }
        else if (this.auto.objectClamp === 0)
        {
            uniforms.objectClamp = filterManager.convertFrameToClamp(this.state.nakedTargetBounds);
            this.auto.objectClamp = undefined;
        }

        filterManager.globalUniforms.update();
    }

    /**
     * Releases any resources held by this filter-pipe.
     * @private
     */
    finalize()
    {
        const { input, output } = this;

        for (let i = 0; i < this._bridgeTextures.length; i++)
        {
            const tex = this._bridgeTextures[i];

            if (tex === input || tex === output)
            {
                continue;
            }

            this.filterManager.returnFilterTexture(tex);
        }

        if (this.bridgeTexture !== this.input && this.bridgeTexture !== this.output)
        {
            this.filterManager.returnFilterTexture(this.bridgeTexture);
            this.bridgeTexture = null;
        }

        this._bridgeTextures.length = 0;

        const closing = this.closingTexture;

        for (let j = 0; j < this._savedTextures.length; j++)
        {
            const tex = this._savedTextures[j];

            if (tex === input || tex === output || tex === closing)
            {
                continue;
            }

            if (tex !== null)
            {
                this.filterManager.returnFilterTexture(tex);
            }
        }

        this._savedTextures.length = 0;

        this._closingTexture = undefined;
        this.filterManager = null;
        this.input = null;
        this.output = null;
        this.clear = null;
        this.state = null;

        this.auto = {};
        this.autoMode = false;
        this.bridgeTextureOptions = null;
    }

    get bridgeTextureOptions()
    {
        return this._bridgeTextureOptions;
    }
    set bridgeTextureOptions(value)
    {
        this._bridgeTextureOptions = value;
    }

    /**
     * A filter texture that can be used in bridges.
     * @readonly
     * @param {PIXI.Rectangle} frame - frame that the texture will hold
     * @returns {PIXI.RenderTexture}
     */
    getBridgeTexture(frame)
    {
        let bridgeTexture;

        if (this._bridgeTextures.length > 0)
        {
            bridgeTexture = this._bridgeTextures.pop();
        }
        else
        {
            bridgeTexture = this.filterManager.getFilterTexture(this.input);
        }

        bridgeTexture.filterFrame = frame;// this will be set when used!

        if (this.bridgeTextureOptions)
        {
            bridgeTexture.scaleMode = this.bridgeTextureOptions.scaleMode;
            if (bridgeTexture.scaleMode === undefined)
            {
                bridgeTexture.scaleMode = SCALE_MODES.LINEAR;
            }
        }

        return bridgeTexture;
    }

    /**
     * Free a bridge texture for use by this pipe.
     * @param {PIXI.RenderTexture} tex - a bridge texture that can be used for writes
     */
    returnBridgeTexture(tex)
    {
        if (!this.inputWritable && tex === this.input)
        {
            return;
        }

        this._bridgeTextures.push(tex);
    }

    /**
     * The texture to be used for the last filter pass.
     * @returns {PIXI.RenderTexture}
     */
    get closingTexture()
    {
        if (this._closingTexture)
        {
            return this._closingTexture;
        }

        if (this.state.outputSwappable)
        {
            this._closingTexture = this.getBridgeTexture(this.endFrame);

            return this._closingTexture;
        }

        this._closingTexture = this.output;

        return this._closingTexture;
    }

    /**
     * @private
     * @param {PIXI.Texture} tex
     */
    overrideClosingTexture(tex)
    {
        if (this._closingTexture && (tex !== this.output || this.state.outputSwappable))
        {
            this.returnBridgeTexture(this._closingTexture);
        }

        this._closingTexture = tex;
    }
}

/**
 * A singleton instance of `FilterPipe`, which is reusable.
 * @static
 * @member {PIXI.FilterPipe}
 */
FilterPipe.instance = new FilterPipe();

/**
 * @callback PIXI.FilterPipe~useCallback
 * @param {PIXI.Texture?} tex
 */

/**
 * @namespace PHX
 */

/**
 * @param {PIXI.Renderer} renderer
 */
function injectEF(renderer)
{
    const hppf = new FilterSystem(renderer);

    for (const i in renderer.runners)
    {
        renderer.runners[i].remove(renderer.filter);
        renderer.runners[i].add(hppf);
    }

    renderer.filter = hppf;

    return renderer;
}

export default Filter;
export { CompositeFilter, FILTER_RECTS, Filter, FilterPass, FilterPipe, FilterScope, injectEF };
//# sourceMappingURL=phase-filter-manager.js.map
