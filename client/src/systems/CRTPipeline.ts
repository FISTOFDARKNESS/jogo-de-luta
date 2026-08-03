import Phaser from 'phaser';

export class CRTPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  public static readonly KEY = 'CRTPipeline';

  constructor(game: Phaser.Game) {
    super({
      game,
      renderTarget: true,
      fragShader: `
        precision mediump float;
        uniform sampler2D uMainSampler;
        varying vec2 outTexCoord;

        void main(void) {
          vec2 uv = outTexCoord;
          
          // Leve distorcao esferica (CRT barrel distortion)
          vec2 cc = uv - 0.5;
          float distSq = dot(cc, cc);
          vec2 distortedUv = uv + cc * distSq * 0.05;

          // Bordas pretas para o monitor CRT
          if (distortedUv.x < 0.0 || distortedUv.x > 1.0 || distortedUv.y < 0.0 || distortedUv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
          }

          vec4 color = texture2D(uMainSampler, distortedUv);

          // Scanlines
          float scanline = sin(distortedUv.y * 650.0) * 0.035;
          color.rgb -= scanline;

          // Vignette
          float vignette = smoothstep(0.75, 0.45, length(uv - 0.5));
          color.rgb *= mix(0.8, 1.0, vignette);

          gl_FragColor = color;
        }
      `
    });
  }
}
