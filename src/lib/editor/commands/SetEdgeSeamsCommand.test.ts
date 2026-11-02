import { describe, expect, it } from 'vitest';
import { SceneDocument } from '../../scene/SceneDocument';
import { applyJournalPatch } from '../../project/journal';
import { SetEdgeSeamsCommand } from './SetEdgeSeamsCommand';

describe('SetEdgeSeamsCommand', () => {
  it('marks and clears seam bits with undo and journal patches', () => {
    const document = SceneDocument.createDefault();
    const node = document.nodes[0];
    const mesh = node.mesh;
    const edges = [0, 2];
    const revision = mesh.meshRevision;

    const command = new SetEdgeSeamsCommand(mesh, node.id, edges, true);
    command.execute();

    expect(edges.every((edge) => mesh.isEdgeSeam(edge))).toBe(true);
    expect(mesh.meshRevision).toBe(revision + 2);
    expect(command.journalPatch('forward')).toEqual([
      { type: 'set-edge-seam', nodeId: node.id, edge: 0, seam: true },
      { type: 'set-edge-seam', nodeId: node.id, edge: 2, seam: true }
    ]);

    command.undo();
    expect(edges.every((edge) => mesh.isEdgeSeam(edge))).toBe(false);
    expect(command.journalPatch('backward')).toEqual([
      { type: 'set-edge-seam', nodeId: node.id, edge: 0, seam: false },
      { type: 'set-edge-seam', nodeId: node.id, edge: 2, seam: false }
    ]);
  });

  it('writes only seam endpoints into the overlay buffer', () => {
    const document = SceneDocument.createDefault();
    const mesh = document.nodes[0].mesh;
    const before = new Float32Array(mesh.edgeCount * 6);
    expect(mesh.writeSeamEdgePositions(before)).toBe(0);

    mesh.setEdgeSeam(3, true);
    const after = new Float32Array(mesh.edgeCount * 6);
    expect(mesh.writeSeamEdgePositions(after)).toBe(1);
    const halfEdge = mesh.edgeHalfEdge[3];
    const origin = mesh.heOrigin[halfEdge];
    expect(after[0]).toBeCloseTo(mesh.getVertexPosition(origin)[0]);
    expect(after[1]).toBeCloseTo(mesh.getVertexPosition(origin)[1]);
    expect(after[2]).toBeCloseTo(mesh.getVertexPosition(origin)[2]);
  });

  it('replays seam journal patches into a reconstructed document', () => {
    const source = SceneDocument.createDefault();
    const node = source.nodes[0];
    const command = new SetEdgeSeamsCommand(node.mesh, node.id, [5], true);
    const patch = command.journalPatch('forward');
    const target = SceneDocument.createDefault();
    expect(target.nodes[0].mesh.isEdgeSeam(5)).toBe(false);
    if (patch) {
      for (const item of Array.isArray(patch) ? patch : [patch]) {
        applyJournalPatch(target, { ...item, nodeId: target.nodes[0].id });
      }
    }
    expect(target.nodes[0].mesh.isEdgeSeam(5)).toBe(true);
  });

  it('reports a no-op when every selected edge is already marked', () => {
    const document = SceneDocument.createDefault();
    const mesh = document.nodes[0].mesh;
    mesh.setEdgeSeam(4, true);
    const command = new SetEdgeSeamsCommand(mesh, document.nodes[0].id, [4], true);
    expect(command.noop).toBe(true);
  });
});
