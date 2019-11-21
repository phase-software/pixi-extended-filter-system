precision highp float;

varying vec2 vTextureCoord;

uniform vec4 inputFrame;
uniform vec4 outputFrame;
uniform vec4 inputPixel;
uniform sampler2D uSampler;

/**
 * Assuming that the output frame "fits" inside the input frame, this fragment shader
 * will copy pixels from location in the input texture that corresponds to the output
 * frame. This is done by pure translation.
 */
void main(void) {
   gl_FragColor = texture2D(uSampler, clamp(
            vTextureCoord - (inputFrame.xy - outputFrame.xy) * inputPixel.zw,
            vec2(0, 0),
            vec2((inputFrame.zw - vec2(0.5, 0.5)) * inputPixel.zw)
       ));
}
