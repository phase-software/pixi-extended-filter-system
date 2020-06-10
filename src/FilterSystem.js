import { systems, Geometry, DRAW_MODES, Rectangle } from 'pixi.js';
import { Filter } from './Filter';
import { FilterScope as FilterPipe } from './FilterScope';
import FilterRects from './FilterRects';
import { RescaleFilter } from './filter-rescale';
import { FilterPass } from './FilterPass';
import { nextPow2 } from '@pixi/utils';

/** @typedef {import('./Filter').Filter} Filter */
/** @typedef {import('./FilterPass').FilterPass} FilterPass */

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
export class FilterSystem extends systems.FilterSystem
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

        this.defaultFilterStack[0] = new FilterPipe();
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
        else if (options.viewport)
        {
        //    state.resolution = nextPow2(options.viewport.scale.x);
        }

        state.rendererSnapshot.sourceFrame.copyFrom(renderer.renderTexture.sourceFrame);
        state.rendererSnapshot.destinationFrame.copyFrom(renderer.renderTexture.destinationFrame);

        if (state.filters.length > 0)
        {
            state.renderTexture = this.filterPassRenderTextureFor(state);
            state.textureDimensions.set(state.renderTexture.width, state.renderTexture.height);
            state.texturePixels.copyFrom(state.textureDimensions);
            state.texturePixels.x *= state.resolution;
            state.texturePixels.y *= state.resolution;

            state.renderTexture.filterFrame = state.inputFrame.clone().ceil(1);

            renderer.renderTexture.bind(state.renderTexture, state.inputFrame);
            renderer.renderTexture.clear();

            const limit = renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE);

            if (state.renderTexture.width > limit || state.renderTexture.height > limit)
            {
                throw new Error('Cannot execute filters: too large texture size.');
            }
        }

        //  this.activeState = state;
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

            if (filters.length > 0 && state.target.layeredFilterManager
                && !state.target.layeredFilterLifecycle._renderLock
                && state.target.layeredFilterManager.requiresLayers())
            {
                state.target.layeredFilterManager.applyScope(this);
                this.returnFilterTexture(state.renderTexture);
            }
            else if (filters.length === 1)
            {
                this.passUniforms(state, 0);
                state.restoreSnapshot = lastState.renderTexture;

                filters[0].apply(this, state.renderTexture, lastState.renderTexture, false, state);

                state.restoreSnapshot = false;
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
                            // ++state.currentIndex;
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
                state.restoreSnapshot = lastState.renderTexture;

                filters[i].apply(this, flip, lastState.renderTexture, false, state);

                state.restoreSnapshot = false;
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

    /**
     * @override
     */
    applyFilter(filter, input, output, clear, options = this.resolveRenderOptions(filter.renderOptions, this.activeState))
    {
        const renderer = this.renderer;

        if (this.activeState.restoreSnapshot === output)
        {
            renderer.renderTexture.bind(output,
                this.activeState.rendererSnapshot.sourceFrame,
                this.activeState.rendererSnapshot.destinationFrame);
        }
        else
        {
            const defaultDestinationFrame = output && output.filterFrame
                ? new Rectangle(
                    0,
                    0,
                    output.filterFrame.width, output.filterFrame.height)
                : new Rectangle(0, 0, this.outputFrame.width, this.outputFrame.height);

            renderer.renderTexture.bind(output,
                output ? output.filterFrame : null,
                options.destinationFrame || (output && output.destinationFrame) || defaultDestinationFrame);
        }

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
     * Measures all the frames needed in the given pipe. This includes the target, input, output, and each filter's
     * frame.
     *
     * NOTE: `measure` also calculates `resolution`, `padding`, and `legacy` of the pipe.
     *
     * @param {FilterScope} state
     */
    measure(state)
    {
        const { target } = state;
        let { filters } = state;

        const resolution = filters[0].resolution;

        let autoFit = filters[0].autoFit;

        let legacy = filters[0].legacy;

        filters[0].viewport = state.viewport;

        let padding = filters[0].padding;

        for (let i = 1; i < filters.length; i++)
        {
            const filter =  filters[i];

            filter.viewport = state.viewport;
            filter.resolution = state.resolution;

            autoFit = autoFit && filter.autoFit;
            legacy = legacy || filter.legacy;

            //    if (!filter.additivePadding)
            //    {
            padding = Math.max(padding, filter.padding);
            //    }
            //    else
            //    {
            //        padding += filter.padding;
            //    }
        }

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

        //        state.outputFrame.ceil();

        const { filterPasses, targetFrame, outputFrame } = state;

        let filterPassFrame = outputFrame;
        let renderable = true;
        let filtersMutable = false;

        for (let i = filters.length - 1; i >= 0; i--)
        {
            const filter = filters[i];

            filter.viewport = { scale: state.target.scale };
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

        if (!state.inputFrame)
        {
            state.inputFrame = new Rectangle();
        }

        state.inputFrame.copyFrom(filters[0] && filters[0].frame ? filters[0].frame : outputFrame);
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

        if (clone.frame === FilterRects.NAKED_TARGET)
        {
            clone.frame = state.nakedTargetBounds.clone().fit(this.inputFrame);
        }
        else if (clone.frame === FilterRects.WHOLE_INPUT)
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
