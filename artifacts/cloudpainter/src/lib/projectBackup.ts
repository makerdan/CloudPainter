import { isSafeDrawingColor, normalizeStroke, type Stroke } from './strokeRenderer.ts';
import type { DrawingEntry } from './layerClipboard.ts';
import { MAX_PROJECT_DIMENSION } from './imageDimensions.ts';

export type ProjectBackupLayer = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  strokes: DrawingEntry[];
  redo: DrawingEntry[];
};

export type EditableProject = {
  image: string | null;
  width: number;
  height: number;
  layers: ProjectBackupLayer[];
  selectedLayerId: string;
  title: string;
  photoZoom: number;
  photoPan: { x: number; y: number };
  referencePhotoVisible: boolean;
  referencePhotoOpacity: number;
};

const BACKUP_FORMAT = 'cloudpainter-project';
const BACKUP_VERSION = 1;
export const MAX_PROJECT_BACKUP_BYTES = 2 * 1024 * 1024;
const MAX_PROJECT_LAYERS = 100;
const MAX_DRAWING_ENTRIES = 20_000;
const MAX_DRAWING_POINTS = 250_000;
const MAX_PASTE_DEPTH = 8;
const IMAGE_DATA_URL = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/]+={0,2})$/i;

type ValidationBudget = { entries: number; points: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function invalidProject(): never {
  throw new Error('This backup is missing required sketch data or contains unsupported drawing data.');
}

function validateStrokeMetadata(value: Record<string, unknown>, points: number): void {
  if (!hasOnlyKeys(value, ['points', 'color', 'size', 'tool', 'brush', 'instrument', 'pressure'])) {
    invalidProject();
  }
  if (value.brush !== undefined) {
    const brush = value.brush;
    if (!isRecord(brush) || !hasOnlyKeys(brush, ['style', 'version', 'seed'])
      || !['round', 'chisel', 'soft', 'dry'].includes(String(brush.style))
      || brush.version !== 1 || typeof brush.seed !== 'number' || !Number.isFinite(brush.seed)) {
      invalidProject();
    }
  }
  if (value.instrument !== undefined) {
    const instrument = value.instrument;
    if (!isRecord(instrument) || !hasOnlyKeys(instrument, ['kind', 'version', 'seed'])
      || !['pencil', 'pen'].includes(String(instrument.kind))
      || (instrument.version !== 1 && !(instrument.kind === 'pen' && instrument.version === 2))
      || typeof instrument.seed !== 'number' || !Number.isFinite(instrument.seed)) {
      invalidProject();
    }
  }
  if (value.pressure !== undefined) {
    const pressure = value.pressure;
    if (!isRecord(pressure) || !hasOnlyKeys(pressure, ['version', 'samples', 'sensitivity'])
      || pressure.version !== 1 || !Array.isArray(pressure.samples)
      || pressure.samples.length !== points
      || !pressure.samples.every(sample => typeof sample === 'number' && Number.isFinite(sample) && sample >= 0 && sample <= 1)
      || (pressure.sensitivity !== undefined
        && (typeof pressure.sensitivity !== 'number' || !Number.isFinite(pressure.sensitivity)
          || pressure.sensitivity < 0 || pressure.sensitivity > 100))) {
      invalidProject();
    }
  }
}

function validateDrawingEntries(value: unknown, budget: ValidationBudget, depth = 0): DrawingEntry[] {
  if (!Array.isArray(value)) invalidProject();
  const normalized: DrawingEntry[] = [];
  for (const item of value) {
    if (!isRecord(item) || ++budget.entries > MAX_DRAWING_ENTRIES) invalidProject();
    if (item.kind === 'clear') {
      if (!hasOnlyKeys(item, ['kind'])) invalidProject();
      normalized.push({ kind: 'clear' });
      continue;
    }
    if (item.kind === 'background-fill') {
      if (!hasOnlyKeys(item, ['kind', 'color']) || !isSafeDrawingColor(item.color)) invalidProject();
      normalized.push({ kind: 'background-fill', color: item.color });
      continue;
    }
    if (item.kind === 'paste') {
      if (!hasOnlyKeys(item, ['kind', 'entries']) || depth >= MAX_PASTE_DEPTH
        || !Array.isArray(item.entries) || item.entries.length === 0) invalidProject();
      normalized.push({ kind: 'paste', entries: validateDrawingEntries(item.entries, budget, depth + 1) });
      continue;
    }
    if (!Array.isArray(item.points)) invalidProject();
    budget.points += item.points.length;
    if (budget.points > MAX_DRAWING_POINTS) invalidProject();
    validateStrokeMetadata(item, item.points.length);
    const stroke: Stroke | null = normalizeStroke(item);
    if (!stroke) invalidProject();
    normalized.push(stroke);
  }
  return normalized;
}

function validateImage(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  const match = IMAGE_DATA_URL.exec(value);
  if (!match || match[1].length % 4 !== 0) return false;
  return true;
}

function validateProject(value: unknown): EditableProject {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'image', 'width', 'height', 'layers', 'selectedLayerId', 'title',
    'photoZoom', 'photoPan', 'referencePhotoVisible', 'referencePhotoOpacity',
  ])) invalidProject();
  if (!validateImage(value.image)
    || !Number.isInteger(value.width) || (value.width as number) < 1 || (value.width as number) > MAX_PROJECT_DIMENSION
    || !Number.isInteger(value.height) || (value.height as number) < 1 || (value.height as number) > MAX_PROJECT_DIMENSION
    || !Array.isArray(value.layers) || value.layers.length < 1 || value.layers.length > MAX_PROJECT_LAYERS
    || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120
    || typeof value.selectedLayerId !== 'string'
    || typeof value.photoZoom !== 'number' || !Number.isFinite(value.photoZoom) || value.photoZoom < 1 || value.photoZoom > 4
    || !isRecord(value.photoPan) || !hasOnlyKeys(value.photoPan, ['x', 'y'])
    || typeof value.photoPan.x !== 'number' || !Number.isFinite(value.photoPan.x) || Math.abs(value.photoPan.x) > 100_000
    || typeof value.photoPan.y !== 'number' || !Number.isFinite(value.photoPan.y) || Math.abs(value.photoPan.y) > 100_000
    || typeof value.referencePhotoVisible !== 'boolean'
    || !Number.isInteger(value.referencePhotoOpacity) || (value.referencePhotoOpacity as number) < 0
    || (value.referencePhotoOpacity as number) > 100) invalidProject();

  const layerIds = new Set<string>();
  const budget: ValidationBudget = { entries: 0, points: 0 };
  const layers: ProjectBackupLayer[] = value.layers.map(layerValue => {
    if (!isRecord(layerValue) || !hasOnlyKeys(layerValue, ['id', 'name', 'visible', 'opacity', 'strokes', 'redo'])
      || typeof layerValue.id !== 'string' || !layerValue.id || layerValue.id.length > 128
      || layerIds.has(layerValue.id)
      || typeof layerValue.name !== 'string' || !layerValue.name.trim() || layerValue.name.length > 120
      || typeof layerValue.visible !== 'boolean'
      || typeof layerValue.opacity !== 'number' || !Number.isFinite(layerValue.opacity)
      || layerValue.opacity < 0 || layerValue.opacity > 1) invalidProject();
    layerIds.add(layerValue.id);
    return {
      id: layerValue.id,
      name: layerValue.name,
      visible: layerValue.visible,
      opacity: layerValue.opacity,
      strokes: validateDrawingEntries(layerValue.strokes, budget),
      redo: validateDrawingEntries(layerValue.redo, budget),
    };
  });
  if (!layerIds.has(value.selectedLayerId)) invalidProject();

  return {
    image: value.image as string | null,
    width: value.width as number,
    height: value.height as number,
    layers,
    selectedLayerId: value.selectedLayerId as string,
    title: value.title as string,
    photoZoom: value.photoZoom as number,
    photoPan: { x: value.photoPan.x as number, y: value.photoPan.y as number },
    referencePhotoVisible: value.referencePhotoVisible as boolean,
    referencePhotoOpacity: value.referencePhotoOpacity as number,
  };
}

function assertBackupSize(value: string): void {
  if (new TextEncoder().encode(value).byteLength > MAX_PROJECT_BACKUP_BYTES) {
    throw new Error('This project backup is larger than 2 MB. Use a smaller project or photo.');
  }
}

export function createProjectBackup(project: EditableProject): string {
  const validatedProject = validateProject(project);
  const contents = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, project: validatedProject });
  assertBackupSize(contents);
  return contents;
}

export function parseProjectBackup(contents: string): EditableProject {
  assertBackupSize(contents);
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error('This file is not a readable CloudPainter project backup.');
  }
  if (!isRecord(parsed) || !hasOnlyKeys(parsed, ['format', 'version', 'project'])
    || parsed.format !== BACKUP_FORMAT) {
    throw new Error('This file is not a CloudPainter project backup.');
  }
  if (parsed.version !== BACKUP_VERSION) {
    throw new Error(`This project backup version is not supported. Supported version: ${BACKUP_VERSION}.`);
  }
  return validateProject(parsed.project);
}
