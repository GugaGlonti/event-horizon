import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Input: original glTFs and the selected 1024px JPEG paint maps (see CREDITS.md).
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/build-spacecraft-assets.mjs SOURCE_DIRECTORY');
const destination = fileURLToPath(new URL('../src/features/spacecraft/assets/', import.meta.url));
await mkdir(destination, { recursive: true });
const radius = 4.8;
const layouts = {
  Spitfire: [
    [-4.5056, 0.135, -2.29, 0.49],
    [4.5056, 0.135, -2.29, 0.49],
    [-4.5056, -1.27, -2.29, 0.49],
    [4.5056, -1.27, -2.29, 0.49],
  ],
  Striker: [
    [0, 0.25, -3.54, 0.14],
    [-1.133, -0.23, -2.5, 0.27],
    [1.133, -0.23, -2.5, 0.27],
  ],
  Insurgent: [
    [-0.758, 0.273, -3.2, 0.42],
    [0.758, 0.273, -3.2, 0.42],
    [-2.37, -0.17, -2.66, 0.23],
    [2.37, -0.17, -2.66, 0.23],
    [-1.686, 0.699, -3.03, 0.15],
    [1.686, 0.699, -3.03, 0.15],
  ],
};
const manifest = {};
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pad = (bytes, fill = 0) =>
  Buffer.concat([bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4, fill)]);

for (const [name, engines] of Object.entries(layouts)) {
  const original = await readFile(path.join(source, `${name}.gltf`));
  const document = JSON.parse(original);
  const binary = Buffer.from(document.buffers[0].uri.split(',')[1], 'base64');
  const texture = await readFile(path.join(source, `${name}.jpg`));
  const primitive = document.meshes[0].primitives[0];
  const positions = document.accessors[primitive.attributes.POSITION];
  const center = positions.min.map((min, i) => (min + positions.max[i]) / 2);
  const positionOffset = document.bufferViews[positions.bufferView].byteOffset ?? 0;
  let extent = 0;
  for (let i = 0; i < positions.count; i++) {
    const point = center.map(
      (c, axis) => binary.readFloatLE(positionOffset + i * 12 + axis * 4) - c,
    );
    extent = Math.max(extent, Math.hypot(...point));
  }
  const scale = radius / extent;
  const transform = (point) => [
    -(point[0] - center[0]) * scale,
    (point[1] - center[1]) * scale,
    -(point[2] - center[2]) * scale,
  ];
  // Bake +Z → -Z and a centered, conservative 5m collision envelope into the vertices.
  for (const attribute of ['POSITION', 'NORMAL']) {
    const accessor = document.accessors[primitive.attributes[attribute]];
    const offset = document.bufferViews[accessor.bufferView].byteOffset ?? 0;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < accessor.count; i++) {
      const point = [0, 1, 2].map((axis) => binary.readFloatLE(offset + i * 12 + axis * 4));
      const result = attribute === 'POSITION' ? transform(point) : [-point[0], point[1], -point[2]];
      for (let axis = 0; axis < 3; axis++) {
        binary.writeFloatLE(result[axis], offset + i * 12 + axis * 4);
        min[axis] = Math.min(min[axis], result[axis]);
        max[axis] = Math.max(max[axis], result[axis]);
      }
    }
    if (attribute === 'POSITION') Object.assign(accessor, { min, max });
  }
  let byteOffset = 0;
  const chunks = document.bufferViews.map((view, index) => {
    const content =
      index === document.images[0].bufferView
        ? texture
        : binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    view.byteOffset = byteOffset;
    view.byteLength = content.length;
    const aligned = pad(content);
    byteOffset += aligned.length;
    return aligned;
  });
  const bytes = Buffer.concat(chunks);
  document.buffers = [{ byteLength: bytes.length }];
  document.images[0].mimeType = 'image/jpeg';
  document.materials[0].doubleSided = false;
  // A restrained texture lift keeps panel detail readable on the unlit side of a hull.
  document.materials[0].emissiveTexture = { index: 0 };
  document.materials[0].emissiveFactor = [0.16, 0.18, 0.22];
  Object.assign(document.materials[0].pbrMetallicRoughness, {
    metallicFactor: 0.18,
    roughnessFactor: 0.72,
  });
  document.asset.extras = { author: 'Quaternius', license: 'CC0-1.0' };
  const json = pad(Buffer.from(JSON.stringify(document)), 0x20);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + json.length + bytes.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bytes.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const glb = Buffer.concat([header, json, binHeader, bytes]);
  await writeFile(path.join(destination, `${name.toLowerCase()}.glb`), glb);
  manifest[name.toLowerCase()] = {
    sourceSha256: hash(original),
    sha256: hash(glb),
    triangles: document.accessors[primitive.indices].count / 3,
    radius,
    engines: engines.map(([x, y, z, size]) => {
      const [px, py, pz] = transform([x, y, z]);
      return { x: px, y: py, z: pz, radius: size * scale };
    }),
  };
  console.log(`${name}: ${manifest[name.toLowerCase()].triangles} triangles, ${glb.length} bytes`);
}
await writeFile(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(
  path.join(destination, 'License-Quaternius.txt'),
  await readFile(path.join(source, 'License.txt')),
);
