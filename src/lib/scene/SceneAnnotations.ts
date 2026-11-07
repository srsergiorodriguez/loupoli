import type { Vec3 } from '../geometry/HalfEdgeMesh';

/** One world-space or reference-local annotation polyline. */
export interface AnnotationStrokeSnapshot {
  readonly id: string;
  /** When set, points are in the reference plane's local space. */
  readonly referenceNodeId: string | null;
  readonly points: readonly Vec3[];
}

let nextAnnotationNumber = 1;

function annotationId(): string {
  const id = `annotation-${nextAnnotationNumber}`;
  nextAnnotationNumber += 1;
  return id;
}

/** Project-level world-space annotation strokes. */
export class SceneAnnotations {
  private strokes: AnnotationStrokeSnapshot[] = [];

  /** Ordered read-only strokes. */
  get all(): readonly AnnotationStrokeSnapshot[] {
    return this.strokes;
  }

  /** Add one stroke and return its stable id. */
  add(points: readonly Vec3[], referenceNodeId: string | null): string {
    const id = annotationId();
    this.strokes.push({
      id,
      referenceNodeId,
      points: points.map((point) => [point[0], point[1], point[2]])
    });
    return id;
  }

  /** Remove one stroke by id. */
  remove(id: string): boolean {
    const index = this.strokes.findIndex((stroke) => stroke.id === id);
    if (index < 0) {
      return false;
    }
    this.strokes.splice(index, 1);
    return true;
  }

  /** Remove every annotation stroke. */
  clear(): void {
    this.strokes = [];
  }

  /** Replace all strokes from a validated snapshot. */
  apply(snapshot: readonly AnnotationStrokeSnapshot[]): void {
    for (const stroke of snapshot) {
      const match = /^annotation-(\d+)$/.exec(stroke.id);
      if (match) {
        nextAnnotationNumber = Math.max(nextAnnotationNumber, Number(match[1]) + 1);
      }
    }
    this.strokes = snapshot.map((stroke) => ({
      id: stroke.id,
      referenceNodeId: stroke.referenceNodeId,
      points: stroke.points.map((point) => [
        point[0],
        point[1],
        point[2]
      ])
    }));
  }

  /** Detached snapshot for commands, autosave, and project files. */
  snapshot(): AnnotationStrokeSnapshot[] {
    return this.strokes.map((stroke) => ({
      id: stroke.id,
      referenceNodeId: stroke.referenceNodeId,
      points: stroke.points.map((point) => [
        point[0],
        point[1],
        point[2]
      ])
    }));
  }
}
