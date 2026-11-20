import { classRegistry, filters, type T2DPipelineState, type TWebGLUniformLocationMap } from 'fabric';

type HighlightsShadowsOptions = {
  highlights: number;
  shadows: number;
};

export class HighlightsShadows extends filters.BaseFilter<'HighlightsShadows', HighlightsShadowsOptions> {
  declare highlights: number;
  declare shadows: number;

  static type = 'HighlightsShadows';
  static defaults: HighlightsShadowsOptions = { highlights: 0, shadows: 0 };
  static uniformLocations = ['uHighlights', 'uShadows'];

  constructor(options: Partial<HighlightsShadowsOptions> = {}) {
    super(options);
  }

  getFragmentSource() {
    return `
      precision highp float;
      uniform sampler2D uTexture;
      uniform float uHighlights;
      uniform float uShadows;
      varying vec2 vTexCoord;
      void main() {
        vec4 color = texture2D(uTexture, vTexCoord);
        float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
        float highlightWeight = luminance * luminance;
        float shadowWeight = (1.0 - luminance) * (1.0 - luminance);
        vec3 highlightDirection = uHighlights >= 0.0 ? vec3(1.0) - color.rgb : -color.rgb;
        vec3 shadowDirection = uShadows >= 0.0 ? vec3(1.0) - color.rgb : -color.rgb;
        color.rgb = clamp(
          color.rgb
            + highlightDirection * abs(uHighlights) * highlightWeight * 0.45
            + shadowDirection * abs(uShadows) * shadowWeight * 0.45,
          0.0,
          1.0
        );
        gl_FragColor = color;
      }
    `;
  }

  applyTo2d({ imageData: { data } }: T2DPipelineState) {
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index] / 255;
      const green = data[index + 1] / 255;
      const blue = data[index + 2] / 255;
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const highlightWeight = luminance * luminance;
      const shadowWeight = (1 - luminance) * (1 - luminance);
      for (let channel = 0; channel < 3; channel++) {
        const value = data[index + channel] / 255;
        const highlightDirection = this.highlights >= 0 ? 1 - value : -value;
        const shadowDirection = this.shadows >= 0 ? 1 - value : -value;
        data[index + channel] = Math.round(255 * Math.max(0, Math.min(1,
          value
            + highlightDirection * Math.abs(this.highlights) * highlightWeight * 0.45
            + shadowDirection * Math.abs(this.shadows) * shadowWeight * 0.45,
        )));
      }
    }
  }

  isNeutralState() {
    return this.highlights === 0 && this.shadows === 0;
  }

  sendUniformData(gl: WebGLRenderingContext, uniformLocations: TWebGLUniformLocationMap) {
    gl.uniform1f(uniformLocations.uHighlights, this.highlights);
    gl.uniform1f(uniformLocations.uShadows, this.shadows);
  }
}

classRegistry.setClass(HighlightsShadows);
