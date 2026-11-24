/** Model-file formats offered by the shared export dialog. */
export type ModelExportFormat = 'obj' | 'glb';

/** Objects included in a model export. */
export type ModelExportScope = 'active' | 'selected' | 'scene';

/** Supported export-atlas size choices. */
export type TextureAtlasSize = 'auto' | '1024' | '2048' | '4096';

/** Which clips GLB should export. */
export type ExportClipMode = 'active' | 'all';

/** Whether GLB uses each clip's own range or one custom range. */
export type ExportRangeMode = 'clip' | 'custom';

/** Complete options for exporting the scene as OBJ or GLB. */
export interface ModelExportOptions {
  readonly format: ModelExportFormat;
  readonly scope: ModelExportScope;
  readonly includeTextures: boolean;
  readonly unifyTextures: boolean;
  readonly atlasSize: TextureAtlasSize;
  readonly upAxis: 'y' | 'z';
  readonly scale: number;
  readonly includeAnimation: boolean;
  readonly clipMode: ExportClipMode;
  readonly clipId: string | null;
  readonly rangeMode: ExportRangeMode;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly sampleFps: number;
  readonly includeCameras: boolean;
  readonly includeLights: boolean;
  readonly bakeModulators: boolean;
}
