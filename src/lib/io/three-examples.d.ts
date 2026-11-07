declare module 'three/examples/jsm/loaders/GLTFLoader.js' {
  import type { AnimationClip, Group } from 'three';

  export class GLTFLoader {
    parseAsync(
      data: ArrayBuffer,
      path: string
    ): Promise<{ scene: Group; animations: AnimationClip[] }>;
  }
}

declare module 'three/examples/jsm/exporters/GLTFExporter.js' {
  import type { AnimationClip, Object3D } from 'three';

  export class GLTFExporter {
    parseAsync(
      input: Object3D,
      options: {
        binary: boolean;
        trs?: boolean;
        animations?: AnimationClip[];
      }
    ): Promise<ArrayBuffer>;
  }
}
