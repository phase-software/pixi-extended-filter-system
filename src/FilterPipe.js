import { SCALE_MODES } from 'pixi.js';

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
export class FilterPipe
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
        this.state.inputWritable = !this.saveTexture && this.inputWritable ? true : this.bridgeTexture !== this.input;

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

        if (closingTextureOverride)
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
