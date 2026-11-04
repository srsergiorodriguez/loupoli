import { describe, expect, it } from 'vitest';
import { decodeLpoly, encodeLpoly, type ProjectSettings } from '../../project/lpoly';
import { applyJournalPatch, type JournalPatch } from '../../project/journal';
import { SceneDocument } from '../../scene/SceneDocument';
import { History } from '../History';
import { deleteSelectedElements } from '../../geometry/topology';
import { CreateMeshNodeCommand } from './CreateMeshNodeCommand';
import {
  CreateCameraCommand,
  DeleteCameraCommand,
  UpdateCameraCommand
} from './CameraCommands';
import { ReplaceMeshCommand } from './ReplaceMeshCommand';
import { JoinNodesCommand } from './JoinNodesCommand';
import { joinMeshNodes } from '../joinMeshes';
import { DeleteMeshNodeCommand } from './DeleteMeshNodeCommand';
import { MoveVertexCommand } from './MoveVertexCommand';
import { TransformNodeCommand } from './TransformNodeCommand';
import { SetModifiersCommand } from './SetModifiersCommand';
import { RenameGroupCommand, RenameNodeCommand } from './RenameCommands';
import {
  CreateLightCommand,
  DeleteLightCommand,
  SetAmbientLightCommand,
  UpdateLightCommand
} from './LightCommands';
import {
  ReorderNodeCommand,
  SetNodeVisibilityCommand
} from './SceneOrderCommands';
import {
  CreateGroupCommand,
  TransformGroupCommand,
  UngroupGroupCommand
} from './GroupCommands';
import { bakeGroupTransform } from '../groupTransforms';

const SETTINGS: ProjectSettings = {
  shading: 'unlit',
  ps1Snap: false,
  ps1Affine: false
};

function validateAll(document: SceneDocument): void {
  for (const node of document.nodes) {
    expect(() => node.mesh.validate()).not.toThrow();
  }
}

describe('scene commands and journal', () => {
  it('reorders and hides scene nodes with localized undo', () => {
    const document = SceneDocument.createDefault();
    const history = new History();
    const cube = document.createNode('cube');
    document.insertNode(cube, 1);
    const reorder = new ReorderNodeCommand(document, cube, 1, 0);
    history.execute(reorder);
    expect(document.nodes.map((node) => node.name)).toEqual(['Cube', 'QuadSphere']);
    expect(reorder.journalPatch('forward')).toEqual({
      type: 'reorder-node',
      nodeId: cube.id,
      index: 0
    });
    history.undo();
    expect(document.nodes.map((node) => node.name)).toEqual(['QuadSphere', 'Cube']);

    const hide = new SetNodeVisibilityCommand(cube, false);
    history.execute(hide);
    expect(cube.visible).toBe(false);
    history.undo();
    expect(cube.visible).toBe(true);
  });

  it('undoes and redoes localized primitive creation and deletion', () => {
    const document = SceneDocument.createDefault();
    const history = new History();
    const cylinder = document.createNode('cylinder');
    const create = new CreateMeshNodeCommand(document, cylinder, 1);

    history.execute(create);
    expect(document.nodes.map((node) => node.name)).toEqual([
      'QuadSphere',
      'Cylinder'
    ]);
    validateAll(document);

    history.undo();
    expect(document.nodes.map((node) => node.name)).toEqual(['QuadSphere']);
    history.redo();
    expect(document.nodes.map((node) => node.name)).toEqual([
      'QuadSphere',
      'Cylinder'
    ]);

    const sphere = document.nodes[0];
    const remove = new DeleteMeshNodeCommand(document, sphere, 0);
    history.execute(remove);
    expect(document.nodes.map((node) => node.name)).toEqual(['Cylinder']);
    validateAll(document);

    history.undo();
    expect(document.nodes.map((node) => node.name)).toEqual([
      'QuadSphere',
      'Cylinder'
    ]);
    validateAll(document);
  });

  it('reconstructs a scene from a checkpoint and recorded deltas', () => {
    const document = SceneDocument.createDefault();
    const checkpoint = encodeLpoly(document, SETTINGS);
    const replay = decodeLpoly(checkpoint).document;
    const history = new History();
    const patches: JournalPatch[] = [];

    const addCylinder = new CreateMeshNodeCommand(
      document,
      document.createNode('cylinder'),
      1
    );
    history.execute(addCylinder);
    patches.push(addCylinder.journalPatch!('forward')!);

    const sphere = document.nodes[0];
    const before = sphere.mesh.getVertexPosition(0);
    const after: [number, number, number] = [
      before[0] + 0.2,
      before[1] + 0.1,
      before[2]
    ];
    const move = new MoveVertexCommand(
      sphere.mesh,
      0,
      before,
      after,
      sphere.id
    );
    history.execute(move);
    patches.push(move.journalPatch!('forward')!);

    const remove = new DeleteMeshNodeCommand(document, sphere, 0);
    history.execute(remove);
    patches.push(remove.journalPatch!('forward')!);

    for (const patch of patches) {
      applyJournalPatch(replay, patch);
    }

    expect(replay.nodes.map((node) => node.name)).toEqual(['Cylinder']);
    validateAll(replay);

    const checkpointWithDeletedSphere = encodeLpoly(replay, SETTINGS);
    const decoded = decodeLpoly(checkpointWithDeletedSphere);
    expect(decoded.document.nodes).toHaveLength(1);
    expect(decoded.document.nodes[0].primitive).toBe('cylinder');
  });

  it('restores a 100-edit vertex session exactly within the history budget', () => {
    const document = SceneDocument.createDefault();
    const mesh = document.nodes[0].mesh;
    const nodeId = document.nodes[0].id;
    const initialState = encodeLpoly(document, SETTINGS);
    const history = new History();
    const original = mesh.getVertexPosition(0);

    for (let edit = 0; edit < 100; edit += 1) {
      const before = mesh.getVertexPosition(0);
      const amplitude = (edit % 5) * 0.03;
      const after: [number, number, number] = [
        original[0] + amplitude,
        original[1] + amplitude * 0.5,
        original[2] + amplitude * 0.25
      ];
      history.execute(
        new MoveVertexCommand(mesh, 0, before, after, nodeId)
      );
    }

    expect(history.getState().undoCount).toBe(100);
    expect(history.getState().retainedBytes).toBeLessThan(32 * 1024 * 1024);

    for (let edit = 0; edit < 100; edit += 1) {
      expect(history.undo()).toBe(true);
    }

    expect(mesh.getVertexPosition(0)).toEqual(original);
    expect(Array.from(encodeLpoly(document, SETTINGS))).toEqual(
      Array.from(initialState)
    );
    validateAll(document);
  });


  it('commits and journals a localized object transform', () => {
    const document = SceneDocument.createDefault();
    const node = document.nodes[0];
    const before = {
      position: [...node.transform.position] as [number, number, number],
      rotation: [...node.transform.rotation] as [number, number, number],
      scale: [...node.transform.scale] as [number, number, number]
    };
    const after = {
      position: [1.5, -0.5, 0.25] as [number, number, number],
      rotation: [0.1, 0.2, 0.3] as [number, number, number],
      scale: [1.2, 0.8, 2] as [number, number, number]
    };
    const history = new History();
    const command = new TransformNodeCommand(node, before, after);

    history.execute(command);
    expect(node.transform).toEqual(after);
    validateAll(document);

    const checkpoint = encodeLpoly(document, SETTINGS);
    const replay = decodeLpoly(checkpoint).document;
    applyJournalPatch(replay, command.journalPatch('forward'));
    expect(replay.nodes[0].transform).toEqual(after);
    applyJournalPatch(replay, command.journalPatch('backward'));
    expect(replay.nodes[0].transform).toEqual(before);

    history.undo();
    expect(node.transform).toEqual(before);
    history.redo();
    expect(node.transform).toEqual(after);
  });




  it('sets a modifier stack with undo and journal replay', () => {
    const document = SceneDocument.createDefault();
    const node = document.nodes[0];
    const before = node.modifiers;
    const after = [
      {
        id: 'mirror-a',
        type: 'mirror' as const,
        enabled: true,
        axis: 'x' as const
      }
    ];
    const checkpoint = encodeLpoly(document, SETTINGS);
    const replay = decodeLpoly(checkpoint).document;
    const command = new SetModifiersCommand(node, before, after, 'Add Mirror');
    const history = new History();
    history.execute(command);
    expect(node.modifiers).toHaveLength(1);
    applyJournalPatch(replay, command.journalPatch('forward'));
    expect(replay.nodes[0].modifiers).toHaveLength(1);
    history.undo();
    expect(node.modifiers).toHaveLength(0);
    applyJournalPatch(replay, command.journalPatch('backward'));
    expect(replay.nodes[0].modifiers).toHaveLength(0);
    history.redo();
    expect(node.modifiers[0].type).toBe('mirror');
  });

  it('creates, transforms, and dissolves a group with journal replay', () => {
    const document = SceneDocument.createDefault();
    const history = new History();
    const node = document.nodes[0];
    const cylinder = document.createNode('cylinder');
    cylinder.setPosition([2, 0, 0]);
    document.insertNode(cylinder, 1);
    const group = document.createGroup();
    const pivot: [number, number, number] = [1, 0, 0];
    group.setTransform({ position: pivot, rotation: [0, 0, 0], scale: [1, 1, 1] });
    const checkpoint = encodeLpoly(document, SETTINGS);
    const replay = decodeLpoly(checkpoint).document;
    const children = [node, cylinder].map((child) => {
      const beforeTransform = {
        position: [...child.transform.position] as [number, number, number],
        rotation: [...child.transform.rotation] as [number, number, number],
        scale: [...child.transform.scale] as [number, number, number]
      };
      return {
        node: child,
        beforeParentId: null,
        beforeTransform,
        afterParentId: group.id,
        afterTransform: {
          position: [
            beforeTransform.position[0] - pivot[0],
            beforeTransform.position[1] - pivot[1],
            beforeTransform.position[2] - pivot[2]
          ] as [number, number, number],
          rotation: [...beforeTransform.rotation] as [number, number, number],
          scale: [...beforeTransform.scale] as [number, number, number]
        }
      };
    });
    const create = new CreateGroupCommand(document, group, 0, children);
    history.execute(create);
    expect(document.groups).toHaveLength(1);
    expect(document.nodes.every((item) => item.parentId === group.id)).toBe(true);
    expect(document.nodes[0].transform.position[0]).toBe(-1);
    for (const patch of create.journalPatch('forward')) {
      applyJournalPatch(replay, patch);
    }
    expect(replay.groups).toHaveLength(1);
    expect(replay.nodes.every((item) => item.parentId === group.id)).toBe(true);

    const before = {
      position: [1, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number]
    };
    const after = {
      position: [2, 2, 0] as [number, number, number],
      rotation: [0, 0, 0.4] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number]
    };
    const transform = new TransformGroupCommand(group, before, after);
    history.execute(transform);
    expect(group.transform.position).toEqual([2, 2, 0]);
    applyJournalPatch(replay, transform.journalPatch('forward'));
    expect(replay.groups[0].transform.position).toEqual([2, 2, 0]);

    const ungroupChildren = document.nodes.map((child) => {
      const beforeTransform = {
        position: [...child.transform.position] as [number, number, number],
        rotation: [...child.transform.rotation] as [number, number, number],
        scale: [...child.transform.scale] as [number, number, number]
      };
      return {
        node: child,
        beforeParentId: group.id,
        beforeTransform,
        afterParentId: null,
        afterTransform: bakeGroupTransform(group.transform, beforeTransform)
      };
    });
    const ungroup = new UngroupGroupCommand(
      document,
      group,
      0,
      ungroupChildren
    );
    history.execute(ungroup);
    expect(document.groups).toHaveLength(0);
    expect(document.nodes.every((item) => item.parentId === null)).toBe(true);
    for (const patch of ungroup.journalPatch('forward')) {
      applyJournalPatch(replay, patch);
    }
    expect(replay.groups).toHaveLength(0);
    expect(replay.nodes.every((item) => item.parentId === null)).toBe(true);

    history.undo();
    history.undo();
    expect(document.groups).toHaveLength(1);
    expect(document.nodes.every((item) => item.parentId === group.id)).toBe(true);
    expect(group.transform.position).toEqual([1, 0, 0]);
    history.undo();
    expect(document.groups).toHaveLength(0);
    expect(document.nodes.every((item) => item.parentId === null)).toBe(true);
  });

  it('deletes selected faces through a localized mesh snapshot and journal', () => {
    const document = SceneDocument.createDefault();
    const node = document.nodes[0];
    const checkpoint = encodeLpoly(document, SETTINGS);
    const replay = decodeLpoly(checkpoint).document;
    const before = node.mesh;
    const after = deleteSelectedElements(before, 'face', [0, 2]);
    const command = new ReplaceMeshCommand(
      node,
      before,
      after,
      'Delete 2 faces'
    );
    const history = new History();
    history.execute(command);

    expect(node.mesh.faceCount).toBe(before.faceCount - 2);
    expect(node.mesh.boundaryEdgeCount).toBeGreaterThan(0);
    validateAll(document);

    applyJournalPatch(replay, command.journalPatch('forward'));
    expect(replay.nodes[0].mesh.faceCount).toBe(after.faceCount);
    expect(replay.nodes[0].mesh.boundaryEdgeCount).toBe(
      after.boundaryEdgeCount
    );
    applyJournalPatch(replay, command.journalPatch('backward'));
    expect(replay.nodes[0].mesh.faceCount).toBe(before.faceCount);

    history.undo();
    expect(node.mesh).toBe(before);
    history.redo();
    expect(node.mesh).toBe(after);
  });


  it('joins objects in target space with scene undo and journal replay', () => {
    const document = SceneDocument.createDefault();
    const target = document.nodes[0];
    const source = document.createNode('cylinder');
    source.setPosition([2.5, 0.75, 0.25]);
    source.setTransform({
      position: [2.5, 0.75, 0.25],
      rotation: [0.2, 0.1, 0.3],
      scale: [0.75, 1.25, 0.5]
    });
    document.insertNode(source, 1);
    const sourceFaceCount = source.mesh.faceCount;
    const targetFaceCount = target.mesh.faceCount;
    const before = target.mesh;
    const after = joinMeshNodes([target, source], target);
    expect(after.faceCount).toBe(targetFaceCount + sourceFaceCount);
    expect(() => after.validate()).not.toThrow();

    const checkpoint = encodeLpoly(document, SETTINGS);
    const replay = decodeLpoly(checkpoint).document;
    const command = new JoinNodesCommand(document, target, before, after, [
      { node: source, index: 1 }
    ]);
    const history = new History();
    history.execute(command);
    expect(document.nodes).toHaveLength(1);
    expect(target.mesh).toBe(after);
    validateAll(document);

    const forward = command.journalPatch('forward');
    for (const patch of forward) {
      applyJournalPatch(replay, patch);
    }
    expect(replay.nodes).toHaveLength(1);
    expect(replay.nodes[0].mesh.faceCount).toBe(after.faceCount);

    history.undo();
    expect(document.nodes).toHaveLength(2);
    expect(document.nodes[1]).toBe(source);
    expect(target.mesh).toBe(before);

    const backward = command.journalPatch('backward');
    for (const patch of backward) {
      applyJournalPatch(replay, patch);
    }
    expect(replay.nodes).toHaveLength(2);
    expect(replay.nodes[1].id).toBe(source.id);
    expect(replay.nodes[0].mesh.faceCount).toBe(targetFaceCount);
    validateAll(replay);
  });

  it('keeps every mesh valid through a randomized structural command sequence', () => {
    const document = SceneDocument.createDefault();
    const history = new History();
    let seed = 0x51a7c0de;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const kinds = ['quadsphere', 'cylinder', 'grid', 'cube'] as const;

    for (let step = 0; step < 80; step += 1) {
      const action = Math.floor(random() * 5);
      if (action === 0 && document.nodes.length < 8) {
        const node = document.createNode(kinds[Math.floor(random() * kinds.length)]);
        node.setPosition([document.nodes.length * 2, 0, 0]);
        history.execute(
          new CreateMeshNodeCommand(document, node, document.nodes.length)
        );
      } else if (action === 1 && document.nodes.length > 0) {
        const index = Math.floor(random() * document.nodes.length);
        const node = document.nodes[index];
        history.execute(new DeleteMeshNodeCommand(document, node, index));
      } else if (action === 2 && document.nodes.length > 0) {
        const node = document.nodes[Math.floor(random() * document.nodes.length)];
        const vertex = Math.floor(random() * node.mesh.vertexCount);
        const before = node.mesh.getVertexPosition(vertex);
        const after: [number, number, number] = [
          before[0] + random() * 0.2 - 0.1,
          before[1] + random() * 0.2 - 0.1,
          before[2] + random() * 0.2 - 0.1
        ];
        history.execute(
          new MoveVertexCommand(node.mesh, vertex, before, after, node.id)
        );
      } else if (action === 3) {
        history.undo();
      } else {
        history.redo();
      }

      const ids = new Set<string>();
      for (const node of document.nodes) {
        expect(ids.has(node.id)).toBe(false);
        ids.add(node.id);
        expect(() => node.mesh.validate()).not.toThrow();
      }
    }

    expect(history.getState().retainedBytes).toBeLessThan(32 * 1024 * 1024);
  });

  it('renames objects and groups with undo and journal replay', () => {
    const document = SceneDocument.createDefault();
    const history = new History();
    const node = document.nodes[0];
    const replay = decodeLpoly(encodeLpoly(document, SETTINGS)).document;
    const renameNode = new RenameNodeCommand(node, node.name, 'Body');
    history.execute(renameNode);
    expect(document.nodes[0].name).toBe('Body');
    applyJournalPatch(replay, renameNode.journalPatch('forward'));
    expect(replay.nodes[0].name).toBe('Body');
    history.undo();
    expect(document.nodes[0].name).toBe('QuadSphere');

    const group = document.createGroup();
    document.insertGroup(group, 0);
    const groupReplay = decodeLpoly(encodeLpoly(document, SETTINGS)).document;
    const renameGroup = new RenameGroupCommand(group, group.name, 'Props');
    history.execute(renameGroup);
    expect(document.groups[0].name).toBe('Props');
    applyJournalPatch(groupReplay, renameGroup.journalPatch('forward'));
    expect(groupReplay.groups[0].name).toBe('Props');
    history.undo();
    expect(document.groups[0].name).toBe(group.name);
  });

  it('creates, edits, deletes, and replays lights', () => {
    const document = SceneDocument.createDefault();
    const history = new History();
    const light = document.createLight('point');
    const create = new CreateLightCommand(document, light, document.lights.length);
    history.execute(create);
    expect(document.lights.at(-1)?.id).toBe(light.id);
    const before = light.snapshot();
    const after = {
      ...before,
      name: 'Key lamp',
      intensity: 4,
      color: '#ff8844',
      castShadows: false,
      shadowSoftness: 0.6
    };
    const update = new UpdateLightCommand(light, before, after);
    history.execute(update);
    expect(light.name).toBe('Key lamp');
    const replay = decodeLpoly(encodeLpoly(document, SETTINGS)).document;
    applyJournalPatch(replay, update.journalPatch('forward'));
    expect(replay.lights.at(-1)?.name).toBe('Key lamp');
    expect(replay.lights.at(-1)?.castShadows).toBe(false);
    expect(replay.lights.at(-1)?.shadowSoftness).toBeCloseTo(0.6);
    const remove = new DeleteLightCommand(document, light, document.lights.length - 1);
    history.execute(remove);
    expect(document.lights.some((item) => item.id === light.id)).toBe(false);
    history.undo();
    expect(document.lights.some((item) => item.id === light.id)).toBe(true);
    const ambient = new SetAmbientLightCommand(
      document,
      { color: '#ffffff', intensity: 0.22 },
      { color: '#ffeedd', intensity: 0.4 }
    );
    history.execute(ambient);
    expect(document.ambientColor).toBe('#ffeedd');
    applyJournalPatch(replay, ambient.journalPatch('forward'));
    expect(replay.ambientIntensity).toBe(0.4);
  });

  it('creates, edits, deletes, and replays cameras', () => {
    const document = SceneDocument.createDefault();
    const history = new History();
    const camera = document.createCamera();
    camera.name = 'Hero';
    const create = new CreateCameraCommand(
      document,
      camera,
      document.cameras.length
    );
    history.execute(create);
    expect(document.cameras.at(-1)?.id).toBe(camera.id);
    const before = camera.snapshot();
    const after = { ...before, fov: 62, name: 'Hero cam' };
    history.execute(new UpdateCameraCommand(camera, before, after));
    expect(camera.fov).toBe(62);
    const replay = decodeLpoly(encodeLpoly(document, SETTINGS)).document;
    applyJournalPatch(
      replay,
      new UpdateCameraCommand(camera, before, after).journalPatch('forward')
    );
    expect(replay.cameras.at(-1)?.name).toBe('Hero cam');
    history.execute(
      new DeleteCameraCommand(document, camera, document.cameras.length - 1)
    );
    expect(document.cameras.some((item) => item.id === camera.id)).toBe(false);
    history.undo();
    expect(document.cameras.some((item) => item.id === camera.id)).toBe(true);
  });
});
