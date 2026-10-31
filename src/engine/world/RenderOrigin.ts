import { Vector3 } from 'three';

/** Logical doubles stay untouched. GPU positions use a nearby grid origin in the same metre units. */
export class RenderOrigin {
  readonly position = new Vector3();
  private readonly cellSize: number;

  constructor(cellSize = 1024) {
    if (!Number.isFinite(cellSize) || cellSize <= 0)
      throw new RangeError('Origin cell must be positive.');
    this.cellSize = cellSize;
  }

  update(logical: Readonly<Vector3>) {
    const size = this.cellSize;
    this.position.set(
      Math.round(logical.x / size) * size,
      Math.round(logical.y / size) * size,
      Math.round(logical.z / size) * size,
    );
  }

  toRender(logical: Readonly<Vector3>, out: Vector3) {
    return out.copy(logical).sub(this.position);
  }
  toLogical(render: Readonly<Vector3>, out: Vector3) {
    return out.copy(render).add(this.position);
  }
}
