import { systems, Rectangle, Point, DRAW_MODES } from 'pixi.js';

const START = 0;
const MEASURED = 1;

/**
 * System plugin to the renderer to manage filter states.
 *
 * @class
 * @private
 */
class FilterPipe
{
    constructor()
    {
        this.renderTexture = null;

        /**
         * Target of the filters
         * We store for case when custom filter wants to know the element it was applied on
         * @member {PIXI.DisplayObject}
         */
        this.target = null;

        /**
         * Compatibility with PixiJS v4 filters
         * @member {boolean}
         * @default false
         */
        this.legacy = false;

        /**
         * Resolution of filters
         * @member {number}
         * @default 1
         */
        this.resolution = 1;

        /**
         * Whether all filters can be rendered in reasonable time.
         * @member {boolean}
         */
        this.renderable = true;

        /**
         * Frame of the target object's total filter area.
         * @member {PIXI.Rectangle}
         * @private
         */
        this.targetFrame = null;

        /**
         * Frame in which pixels are to be calculated for rendering onto the
         * final renderTexture/screen.
         * @member {PIXI.Rectangle}
         * @private
         */
        this.outputFrame = new Rectangle();

        /**
         * Dimensions of the renderer texture on which the output pixels are stored.
         * @member {PIXI.Point}
         * @private
         */
        this.textureDimensions = new Point();

        /**
         * Collection of filters
         * @member {PIXI.Filter[]}
         * @private
         */
        this.filters = [];
    }

    /**
     * clears the state
     * @private
     */
    clear()
    {
        this.target = null;
        this.filters = null;
        this.renderTexture = null;
    }
}

export class EFSystem extends systems.FilterSystem
{
    constructor(renderer, ...args)
    {
        super(renderer, ...args);

        this.globalUniforms.uniforms.inputFrameInverse = new Float32Array(2);
        this.globalUniforms.uniforms.outputFrameInverse = new Float32Array(2);
    }

    /**
     * @override
     */
    push(target, filters)
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

        state.renderTexture = this.filterPassRenderTextureFor(state);
        state.textureDimensions.set(state.renderTexture.width, state.renderTexture.height);

        state.renderTexture.filterFrame = state.inputFrame;
        renderer.renderTexture.bind(state.renderTexture, state.inputFrame);
        renderer.renderTexture.clear();
    }

    pop()
    {
        const filterStack = this.defaultFilterStack;
        const state = filterStack.pop();
        const filters = state.filters;

        this.activeState = state;

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

        this.globalUniforms.update();

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

            for (i = 0; i < filters.length - 1; ++i)
            {
                this.passUniforms(state, i);
                flop.filterFrame = state.filters[i + 1].frame ? state.filters[i + 1].frame : state.outputFrame;
                filters[i].apply(this, flip, flop, true, state);

                const t = flip;

                flip = flop;
                flop = t;
            }

            filters[i].apply(this, flip, lastState.renderTexture, false, state);

            this.returnFilterTexture(flip);
            this.returnFilterTexture(flop);
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
    applyFilter(filter, input, output, clear)
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

        if (filter.legacy)
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
        const { target, filters } = state;

        let resolution = filters[0].resolution;

        let padding = filters[0].padding;

        let autoFit = filters[0].autoFit;

        let legacy = filters[0].legacy;

        let renderable = filters[0].renderable === undefined ? true : filters[0].renderable;

        for (let i = 1; i < filters.length; i++)
        {
            const filter =  filters[i];

            resolution = Math.min(resolution, filter.resolution);
            padding = Math.max(padding, filter.padding);
            autoFit = autoFit || filter.autoFit;
            legacy = legacy || filter.legacy;
            renderable = renderable && (filter.renderable !== undefined ? filter.renderable : true);
        }

        // target- & output- frame measuring pass
        state.resolution = resolution;
        state.legacy = legacy;
        state.renderable = renderable;
        state.target = target;
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

        state.outputFrame.ceil(resolution);

        const { targetFrame, outputFrame } = state;

        // per-filter frame measuring pass
        let filterPassFrame = outputFrame;

        for (let i = filters.length - 1; i >= 0; i--)
        {
            const filter = filters[i];

            if (filter.measure)
            {
                filter.measure(targetFrame, filterPassFrame.clone());
                filterPassFrame = filters[i].frame.fit(targetFrame);
            }
            else
            {
                filterPassFrame = outputFrame;
            }
        }

        state.inputFrame = filters[0].frame ? filters[0].frame : outputFrame;
    }

    /**
     * Premeasure the frames needed by the filter system during a render pass.
     *
     * This is useful if you need measurements in a custom `render` method.
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
     * @returns {PIXI.RenderTexture}
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

        return this.getOptimalFilterTexture(width, height, state.resolution);
    }

    passUniforms(state, filterIndex)
    {
        const filter = state.filters[filterIndex];
        const nextFilter = (filterIndex === state.filters.length - 1) ? null : state.filters[filterIndex];
        const globalUniforms = this.globalUniforms.uniforms;
        const { inputSize, inputPixel, inputClamp, inputFrameInverse, outputFrameInverse } = globalUniforms;
        const inputFrame = filter.frame ? filter.frame : state.outputFrame;
        const outputFrame = (nextFilter && nextFilter.frame) ? nextFilter.frame : state.outputFrame;

        inputClamp[2] = (inputFrame.width * inputSize[2]) - (0.5 * inputPixel[2]);
        inputClamp[3] = (inputFrame.height * inputSize[3]) - (0.5 * inputPixel[3]);

        globalUniforms.inputFrame = inputFrame;
        globalUniforms.outputFrame = outputFrame;

        inputFrameInverse[0] = 1 / inputFrame.width;
        inputFrameInverse[1] = 1 / inputFrame.height;

        outputFrameInverse[0] = 1 / outputFrame.width;
        outputFrameInverse[1] = 1 / outputFrame.height;

        if (state.legacy)
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
}
