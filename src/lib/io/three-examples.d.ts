declare module 'three/examples/jsm/loaders/GLTFLoader.js' {
  import type { Group } from 'three';

  export class GLTFLoader {
    parseAsync(data: ArrayBuffer, path: string): Promise<{ scene: Group }>;
  }
}

declare module 'three/examples/jsm/exporters/GLTFExporter.js' {
  import type { Object3D } from 'three';

  export class GLTFExporter {
    parseAsync(
      input: Object3D,
      options: { binary: boolean; trs?: boolean }
    ): Promise<ArrayBuffer>;
  }
}
