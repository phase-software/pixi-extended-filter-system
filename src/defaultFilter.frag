varying vec2 vTextureCoord;

uniform vec4 inputFrame;
uniform vec4 outputFrame;
uniform sampler2D uSampler;

void main(void){
   gl_FragColor = texture2D(uSampler, vTextureCoord * inputFrame.zw * outputFrameInverse.xy);
}
