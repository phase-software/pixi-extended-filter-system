import { systems, Rectangle, Point, DRAW_MODES } from 'pixi.js';

/**
 * System plugin to the renderer to manage filter states.
 *
 * @class
 * @private
 */
class FilterState
{
    constructor()
    {
        this.renderTexture = null;

        /**
         * Target of the filters
         * We store for case when custom filter wants to know the element it was applied on
         * @member {PIXI.DisplayObject}
         * @private
         */
        this.target = null;

        /**
         * Compatibility with PixiJS v4 filters
         * @member {boolean}
         * @default false
         * @private
         */
        this.legacy = false;

        /**
         * Resolution of filters
         * @member {number}
         * @default 1
         * @private
         */
        this.resolution = 1;

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

        this.globalUniforms.inputFrameInverse = new Float32Array(2);
        this.globalUniforms.outputFrameInverse = new Float32Array(2);
    }

    /**
     * @override
     */
    push(target, filters)
    {
        const renderer = this.renderer;
        const filterStack = this.defaultFilterStack;
        const state = this.statePool.pop() || new FilterState();

        let resolution = filters[0].resolution;

        let padding = filters[0].padding;

        let autoFit = filters[0].autoFit;

        let legacy = filters[0].legacy;

        for (let i = 1; i < filters.length; i++)
        {
            const filter =  filters[i];

            resolution = Math.min(resolution, filter.resolution);
            padding = Math.max(padding, filter.padding);
            autoFit = autoFit || filter.autoFit;
            legacy = legacy || filter.legacy;
        }

        if (filterStack.length === 1)
        {
            this.defaultFilterStack[0].renderTexture = renderer.renderTexture.current;
        }

        filterStack.push(state);
        state.resolution = resolution;
        state.legacy = legacy;
        state.target = target;
        state.outputFrame.copyFrom(target.filterArea || target.getBounds(true));
        state.outputFrame.pad(padding);

        if (autoFit)
        {
            state.targetFrame = state.outputFrame.clone();
            state.outputFrame.fit(this.renderer.renderTexture.outputFrame);
        }
        else
        {
            state.targetFrame = state.outputFrame;
        }

        this.measure(state);// measure input frame

        state.outputFrame.ceil(resolution);
        state.renderTexture = this.filterPassRenderTextureFor(state);
        state.filters = filters;
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

    measure = (state) =>
    {
        const { filters, target, targetFrame, outputFrame } = state;

        let filterPassFrame = outputFrame;

        for (let i = filters.length - 1; i >= 0; i--)
        {
            const filter = filters[i];

            if (filter.measure)
            {
                filter.measure(target, targetFrame, filterPassFrame);
                filterPassFrame = filters[i].frame.fit(targetFrame);
            }
            else
            {
                filterPassFrame = outputFrame;
            }
        }

        state.inputFrame = filters[0].frame ? filters[0].frame : outputFrame;
    }

    filterPassRenderTextureFor = (state) =>
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

        globalUniforms.update();
    }
}
