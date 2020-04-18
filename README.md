# Phase's Effects Management System

This repo was original introduced to provide additional features on top of Pixi's in-built filter system; however,
it has since drastically changed from the tiny set of modifications into a full blown subsystem.

## Filters

Each effect is rendered using a filter. A filter is a function on an input texture that applies post-processing
effects and writes the results into an output texture.

## Three-Layer Fork Mechanism

The usage of underlay (drop-shadow) or overlay (inner-shadow) filters on _high-frequency_ images results in unacceptable aliasing artifacts. For this, post-processing effects are split into three layers - below, middle, and above.

* The drop-shadows render into the "below" layer while inner-shadows render into the "above" layer.

* The node's layer sits in the middle, and it can be rendered without going through a texture.

* This technique only works when the effects are limited to 
