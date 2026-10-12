import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createProjectBackup,
  MAX_PROJECT_BACKUP_BYTES,
  parseProjectBackup,
  type EditableProject,
} from './projectBackup.ts';

const project: EditableProject = {
  image: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
  width: 640,
  height: 480,
  layers: [
    {
      id: 'layer-ink',
      name: 'Ink',
      visible: false,
      opacity: 0.72,
      strokes: [
        {
          points: [{ x: 0.2, y: 0.4 }, { x: 0.8, y: 0.6 }],
          color: '#173f55',
          size: 7,
          tool: 'pen',
          brush: { style: 'dry', version: 1, seed: 42 },
          instrument: { kind: 'pen', version: 2, seed: 17 },
          pressure: { version: 1, samples: [0.3, 0.9], sensitivity: 65 },
        },
        { kind: 'paste', entries: [{ kind: 'background-fill', color: '#fffefa' }] },
      ],
      redo: [{ kind: 'clear' }],
    },
    { id: 'layer-color', name: 'Color', visible: true, opacity: 1, strokes: [], redo: [] },
  ],
  selectedLayerId: 'layer-ink',
  title: 'A portable sketch',
  photoZoom: 2.25,
  photoPan: { x: -48.5, y: 31 },
  referencePhotoVisible: false,
  referencePhotoOpacity: 37,
};

test('backup round trips the reference photo, canvas settings, layers, strokes, and redo history', () => {
  assert.deepEqual(parseProjectBackup(createProjectBackup(project)), project);
});

test('rejects malformed JSON, an unsupported version, and malformed project data', () => {
  assert.throws(() => parseProjectBackup('{'), /not a readable CloudPainter/i);
  assert.throws(() => parseProjectBackup(JSON.stringify({
    format: 'cloudpainter-project', version: 99, project,
  })), /version is not supported/i);
  assert.throws(() => parseProjectBackup(JSON.stringify({
    format: 'cloudpainter-project', version: 1, project: { ...project, selectedLayerId: 'missing' },
  })), /missing required sketch data/i);
});

test('rejects unsupported image data and drawing records rather than repairing them silently', () => {
  assert.throws(() => parseProjectBackup(JSON.stringify({
    format: 'cloudpainter-project', version: 1, project: { ...project, image: 'https://example.com/photo.png' },
  })), /missing required sketch data/i);
  const invalidStroke = { points: [], color: '#000', size: 2, tool: 'brush' };
  const invalidProject = {
    ...project,
    layers: [{ ...project.layers[0], strokes: [invalidStroke] }],
  };
  assert.throws(() => parseProjectBackup(JSON.stringify({
    format: 'cloudpainter-project', version: 1, project: invalidProject,
  })), /unsupported drawing data/i);
});

test('rejects oversized backups before parsing and leaves the caller project unchanged', () => {
  const before = structuredClone(project);
  const oversized = ' '.repeat(MAX_PROJECT_BACKUP_BYTES + 1);
  assert.throws(() => parseProjectBackup(oversized), /larger than 2 MB/i);
  assert.deepEqual(project, before);
});

test('rejects backups with excessive layer or drawing history counts', () => {
  const tooManyLayers = Array.from({ length: 101 }, (_, index) => ({
    id: `layer-${index}`, name: `Layer ${index}`, visible: true, opacity: 1, strokes: [], redo: [],
  }));
  assert.throws(() => parseProjectBackup(JSON.stringify({
    format: 'cloudpainter-project', version: 1, project: { ...project, layers: tooManyLayers },
  })), /missing required sketch data/i);
  const manyEntries = Array.from({ length: 20_001 }, () => ({ kind: 'clear' }));
  assert.throws(() => parseProjectBackup(JSON.stringify({
    format: 'cloudpainter-project',
    version: 1,
    project: { ...project, layers: [{ ...project.layers[0], strokes: manyEntries }] },
  })), /larger than 2 MB|unsupported drawing data/i);
});
