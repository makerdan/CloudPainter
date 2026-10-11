import { type ChangeEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Cloud,
  Copy,
  ClipboardPaste,
  Eye,
  EyeOff,
  Eraser,
  FileDown,
  Hand,
  ImagePlus,
  Layers,
  Paintbrush,
  Pencil,
  PenTool,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  X,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ActionTooltip, TooltipButton } from '@/components/tooltip-button';
import { BrushDisclosure } from '@/components/BrushDisclosure';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { LogoCreationPanel } from '@/components/LogoCreationPanel';
import { fitDimensionsWithinBounds, fitStageDimensions, getScaledImageDimensions } from '@/lib/imageDimensions';
import { ImageGenerator } from '@/components/ImageGenerator';
import { PoeUpscaleExport } from '@/components/PoeUpscaleExport';
import { DrawingColorControl } from '@/components/DrawingColorControl';
import { BrushStyleControl } from '@/components/BrushStyleControl';
import { BRUSH_STYLES, renderStroke, type BrushStyle, type DrawingTool, type Point, type Stroke } from '@/lib/strokeRenderer';
import { createInstrumentStroke, normalizePointerPressure, toolAfterColorSelection, TOOL_GUIDANCE, type DrawingInstrument } from '@/lib/drawingTools';
import { AccountProvider, AccountControls, SignInPage, SignUpPage } from '@/components/Account';
import { OutlinePanel } from '@/components/OutlinePanel';
import { viewportToProject } from '@/lib/outlineGeometry';
import { copyDrawing, pasteIntoLayers, renderDrawing, undoDrawing, redoDrawing, type DrawingClipboard, type DrawingEntry } from '@/lib/layerClipboard';

type PaintLayer = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  strokes: DrawingEntry[];
  redo: DrawingEntry[];
};
type Project = {
  image: string | null;
  width: number;
  height: number;
  layers: PaintLayer[];
  selectedLayerId: string;
  title: string;
  photoZoom: number;
  photoPan: { x: number; y: number };
};

const STORE_KEY = 'cloudpainter-project-v1';
const PREVIOUS_PROJECT_KEY = 'cloudpainter-previous-project-v1';

const PROJECT_HISTORY_KEY = 'cloudpainter-project-history-v1';

const STORAGE_WARNING_THRESHOLD = 0.8;
const id = () => `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const createLayer = (name: string): PaintLayer => ({
  id: id(), name, visible: true, opacity: 1, strokes: [], redo: [],
});
const freshProject = (): Project => {
  const layer = createLayer('Layer 1');
  return {
    image: null, width: 1200, height: 800, layers: [layer], selectedLayerId: layer.id,
    title: 'Untitled idea', photoZoom: 1, photoPan: { x: 0, y: 0 },
  };
};

function normalizeProjectView(project: Project): Project {
  const candidate = project as Project & { photoZoom?: unknown; photoPan?: { x?: unknown; y?: unknown } | null };
  const photoZoom = typeof candidate.photoZoom === 'number' && Number.isFinite(candidate.photoZoom)
    ? Math.max(1, Math.min(4, candidate.photoZoom))
    : 1;
  const photoPan = candidate.photoPan && typeof candidate.photoPan === 'object'
    ? {
        x: typeof candidate.photoPan.x === 'number' && Number.isFinite(candidate.photoPan.x) ? candidate.photoPan.x : 0,
        y: typeof candidate.photoPan.y === 'number' && Number.isFinite(candidate.photoPan.y) ? candidate.photoPan.y : 0,
      }
    : { x: 0, y: 0 };
  return { ...project, photoZoom, photoPan };
}

function readProject(): Project {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) {
      const project = JSON.parse(saved) as Project;
      if (project && Array.isArray(project.layers) && project.layers.length) return normalizeProjectView(project);
    }
  } catch {
    // Corrupt or unavailable browser storage starts a fresh local project.
  }
  return freshProject();
}

function readPreviousProject(): Project | null {
  try {
    const saved = localStorage.getItem(PREVIOUS_PROJECT_KEY);
    if (saved) {
      const project = JSON.parse(saved) as Project;
      if (project && Array.isArray(project.layers) && project.layers.length) return normalizeProjectView(project);
    }
  } catch {
    // Ignore corrupt or unavailable recovery data without affecting the active project.
  }
  return null;
}

function readProjectHistory(): Project[] {
  try {
    const saved = localStorage.getItem(PROJECT_HISTORY_KEY);
    if (saved) {
      const history = JSON.parse(saved) as unknown;
      if (Array.isArray(history)) {
        return history
          .filter((project): project is Project =>
            Boolean(project && Array.isArray(project.layers) && project.layers.length),
          )
          .map(normalizeProjectView);
      }
    }
  } catch {
    // Fall back to the earlier single-project recovery slot.
  }
  const previousProject = readPreviousProject();
  return previousProject ? [previousProject] : [];
}

type ExportSize = '1' | '2' | 'letter' | 'a4';

type PaperOrientation = 'match-sketch' | 'portrait' | 'landscape';

type PdfPaperSize = 'letter' | 'a4';

type PdfSafeMargin = '0.25' | '0.5' | '0.75';
const PRINT_PAPER_PIXELS = {
  letter: { width: 2550, height: 3300 },
  a4: { width: 2480, height: 3508 },
} as const;
const PRINT_PIXELS_PER_METER = 11_811;

function setPngResolution(dataUrl: string, pixelsPerMeter: number): string {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) throw new Error('Could not create the PNG export. Try again or use a smaller canvas.');

  const source = Uint8Array.from(atob(dataUrl.slice(prefix.length)), character => character.charCodeAt(0));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (source.length < 33 || signature.some((byte, index) => source[index] !== byte)) {
    throw new Error('Could not create the PNG export. Try again or use a smaller canvas.');
  }

  const readUint32 = (bytes: Uint8Array, offset: number) =>
    bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
  const writeUint32 = (bytes: Uint8Array, offset: number, value: number) => {
    bytes[offset] = value >>> 24;
    bytes[offset + 1] = value >>> 16;
    bytes[offset + 2] = value >>> 8;
    bytes[offset + 3] = value;
  };
  let ihdrEnd = 0;
  const retainedChunks: Uint8Array[] = [];
  for (let offset = signature.length; offset + 12 <= source.length;) {
    const length = readUint32(source, offset);
    const end = offset + 12 + length;
    if (end > source.length) throw new Error('Could not create the PNG export. Try again or use a smaller canvas.');
    const type = String.fromCharCode(...source.subarray(offset + 4, offset + 8));
    if (type === 'IHDR') {
      if (offset !== signature.length || length !== 13) throw new Error('Could not create the PNG export. Try again or use a smaller canvas.');
      ihdrEnd = end;
    } else if (type !== 'pHYs') {
      retainedChunks.push(source.subarray(offset, end));
    }
    offset = end;
    if (type === 'IEND') break;
  }
  if (!ihdrEnd) throw new Error('Could not create the PNG export. Try again or use a smaller canvas.');

  const physicalResolutionChunk = new Uint8Array(21);
  writeUint32(physicalResolutionChunk, 0, 9);
  physicalResolutionChunk.set([112, 72, 89, 115], 4); // pHYs
  writeUint32(physicalResolutionChunk, 8, pixelsPerMeter);
  writeUint32(physicalResolutionChunk, 12, pixelsPerMeter);
  physicalResolutionChunk[16] = 1; // Pixels per meter
  let crc = 0xffffffff;
  for (let index = 4; index < 17; index += 1) {
    crc ^= physicalResolutionChunk[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  writeUint32(physicalResolutionChunk, 17, (crc ^ 0xffffffff) >>> 0);

  const remainingLength = retainedChunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(ihdrEnd + physicalResolutionChunk.length + remainingLength);
  output.set(source.subarray(0, ihdrEnd));
  output.set(physicalResolutionChunk, ihdrEnd);
  let outputOffset = ihdrEnd + physicalResolutionChunk.length;
  for (const chunk of retainedChunks) {
    output.set(chunk, outputOffset);
    outputOffset += chunk.length;
  }
  let binary = '';
  for (let offset = 0; offset < output.length; offset += 0x8000) {
    binary += String.fromCharCode(...output.subarray(offset, offset + 0x8000));
  }
  return `${prefix}${btoa(binary)}`;
}

function getExportLayout(
  projectWidth: number,
  projectHeight: number,
  exportSize: ExportSize,
  paperOrientation: PaperOrientation,
) {
  if (exportSize === '1' || exportSize === '2') {
    const scale = Number(exportSize);
    return {
      width: projectWidth * scale,
      height: projectHeight * scale,
      scale,
      offsetX: 0,
      offsetY: 0,
    };
  }

  const portraitPaper = PRINT_PAPER_PIXELS[exportSize];
  const orientation = paperOrientation === 'match-sketch'
    ? projectWidth > projectHeight ? 'landscape' : 'portrait'
    : paperOrientation;
  const paper = orientation === 'landscape'
    ? { width: portraitPaper.height, height: portraitPaper.width }
    : portraitPaper;
  const scale = Math.min(paper.width / projectWidth, paper.height / projectHeight);
  return {
    width: paper.width,
    height: paper.height,
    scale,
    offsetX: (paper.width - projectWidth * scale) / 2,
    offsetY: (paper.height - projectHeight * scale) / 2,
  };
}

async function composeProjectCanvas(
  project: Project,
  layerCanvases: Record<string, HTMLCanvasElement | null>,
  exportSize: ExportSize,
  paperOrientation: PaperOrientation = 'match-sketch',
): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
  const layout = getExportLayout(project.width, project.height, exportSize, paperOrientation);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the PNG export. Try again or use a smaller canvas.');
  context.setTransform(layout.scale, 0, 0, layout.scale, layout.offsetX, layout.offsetY);

  if (project.image) {
    const photo = new Image();
    await new Promise<void>((resolve, reject) => {
      photo.onload = () => resolve();
      photo.onerror = () => reject(new Error('Could not include the reference photo in the PNG export. Try again or remove the photo before exporting.'));
      photo.src = project.image!;
    });
    try {
      const imageSize = fitDimensionsWithinBounds(photo.naturalWidth, photo.naturalHeight, project.width, project.height);
      context.drawImage(photo, (project.width - imageSize.width) / 2, (project.height - imageSize.height) / 2, imageSize.width, imageSize.height);
    } catch {
      throw new Error('Could not include the reference photo in the PNG export. Try again or remove the photo before exporting.');
    }
  }
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    const source = layerCanvases[layer.id];
    if (!source) throw new Error(`Could not export PNG because visible layer "${layer.name}" could not be read. No file was downloaded.`);
    context.globalAlpha = layer.opacity;
    try {
      context.drawImage(source, 0, 0);
    } catch {
      throw new Error(`Could not export PNG because visible layer "${layer.name}" could not be read. No file was downloaded.`);
    }
  }
  context.globalAlpha = 1;
  return { canvas, scale: layout.scale };
}

function createPrintPdf(
  source: HTMLCanvasElement,
  paperSize: PdfPaperSize,
  orientation: PdfOrientation,
  safeMargin: PdfSafeMargin,
): Blob {
  const portraitPage = paperSize === 'letter'
    ? { width: 612, height: 792 }
    : { width: 595.28, height: 841.89 };
  const page = orientation === 'landscape'
    ? { width: portraitPage.height, height: portraitPage.width }
    : portraitPage;
  const margin = PDF_SAFE_MARGIN_POINTS[safeMargin];
  const printableWidth = page.width - margin * 2;
  const printableHeight = page.height - margin * 2;
  const scale = Math.min(printableWidth / source.width, printableHeight / source.height);
  const artworkWidth = source.width * scale;
  const artworkHeight = source.height * scale;
  const artworkX = margin + (printableWidth - artworkWidth) / 2;
  const artworkY = margin + (printableHeight - artworkHeight) / 2;

  const flattened = document.createElement('canvas');
  flattened.width = source.width;
  flattened.height = source.height;
  const context = flattened.getContext('2d');
  if (!context) throw new Error('Could not create the PDF export. Try again or use a smaller sketch.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, flattened.width, flattened.height);
  context.drawImage(source, 0, 0);

  const jpegUrl = flattened.toDataURL('image/jpeg', 0.96);
  const jpegPrefix = 'data:image/jpeg;base64,';
  if (!jpegUrl.startsWith(jpegPrefix) || jpegUrl.length === jpegPrefix.length) {
    throw new Error('Could not create the PDF export. Try again or use a smaller sketch.');
  }
  const jpegBytes = Uint8Array.from(atob(jpegUrl.slice(jpegPrefix.length)), character => character.charCodeAt(0));
  const encode = (value: string) => new TextEncoder().encode(value);
  const imagePlacement = `q ${artworkWidth.toFixed(4)} 0 0 ${artworkHeight.toFixed(4)} ${artworkX.toFixed(4)} ${artworkY.toFixed(4)} cm /Im0 Do Q\n`;
  const imagePlacementBytes = encode(imagePlacement);
  const chunks: Uint8Array[] = [encode('%PDF-1.4\n')];
  const offsets = [0];
  let byteLength = chunks[0].byteLength;
  const appendObject = (objectNumber: number, objectParts: Uint8Array[]) => {
    offsets[objectNumber] = byteLength;
    for (const part of objectParts) {
      chunks.push(part);
      byteLength += part.byteLength;
    }
  };

  appendObject(1, [encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')]);
  appendObject(2, [encode('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')]);
  appendObject(3, [encode(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  )]);
  appendObject(4, [
    encode(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${flattened.width} /Height ${flattened.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\nstream\n`),
    jpegBytes,
    encode('\nendstream\nendobj\n'),
  ]);
  appendObject(5, [
    encode(`5 0 obj\n<< /Length ${imagePlacementBytes.byteLength} >>\nstream\n`),
    imagePlacementBytes,
    encode('endstream\nendobj\n'),
  ]);

  const xrefOffset = byteLength;
  const xref = [
    'xref\n0 6\n',
    '0000000000 65535 f \n',
    ...offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join('');
  const xrefBytes = encode(xref);
  const pdfBytes = new Uint8Array(byteLength + xrefBytes.byteLength);
  let cursor = 0;
  for (const chunk of chunks) {
    pdfBytes.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  pdfBytes.set(xrefBytes, cursor);
  return new Blob([pdfBytes.buffer], { type: 'application/pdf' });
}

function getPdfEffectivePpi(
  sourceWidth: number,
  sourceHeight: number,
  paperSize: PdfPaperSize,
  orientation: PdfOrientation,
  safeMargin: PdfSafeMargin,
): number {
  const portraitPage = paperSize === 'letter'
    ? { width: 612, height: 792 }
    : { width: 595.28, height: 841.89 };
  const page = orientation === 'landscape'
    ? { width: portraitPage.height, height: portraitPage.width }
    : portraitPage;
  const margin = PDF_SAFE_MARGIN_POINTS[safeMargin];
  const scale = Math.min(
    (page.width - margin * 2) / sourceWidth,
    (page.height - margin * 2) / sourceHeight,
  );
  return 72 / scale;
}
function Home() {
  const [project, setProject] = useState<Project>(readProject);
  const [projectHistory, setProjectHistory] = useState<Project[]>(readProjectHistory);
  const latestProject = useRef(project);
  latestProject.current = project;
  const [tool, setTool] = useState<DrawingTool>('brush');
  const lastDrawingTool = useRef<DrawingInstrument>('brush');
  const [color, setColor] = useState('#315d4d');
  const [toolSizes, setToolSizes] = useState<Record<DrawingTool, number>>({ brush: 8, pencil: 3, pen: 3, eraser: 16 });
  const [penPressureSensitivity, setPenPressureSensitivity] = useState(50);
  const brushSize = toolSizes[tool];
  const selectTool = (nextTool: DrawingTool) => {
    if (nextTool !== 'eraser') lastDrawingTool.current = nextTool;
    setTool(nextTool);
  };
  const [brushStyle, setBrushStyle] = useState<BrushStyle>('round');
  const [draft, setDraft] = useState<{ layerId: string; stroke: Stroke } | null>(null);
  const [savedStatus, setSavedStatus] = useState('Saved in this browser');
  const [storageEstimate, setStorageEstimate] = useState<BrowserStorageEstimate | null>(null);
  const [toast, setToast] = useState('');
  const [drawingClipboard, setDrawingClipboard] = useState<DrawingClipboard | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const { photoZoom, photoPan } = project;
  const [exportSize, setExportSize] = useState<ExportSize>('1');
  const [paperOrientation, setPaperOrientation] = useState<PaperOrientation>('match-sketch');
  const [pdfPaperSize, setPdfPaperSize] = useState<PdfPaperSize>('letter');
  const [pdfOrientation, setPdfOrientation] = useState<PdfOrientation>('portrait');
  const [pdfSafeMargin, setPdfSafeMargin] = useState<PdfSafeMargin>('0.5');
  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const [stageBounds, setStageBounds] = useState({ width: 0, height: 0 });
  const [outline, setOutline] = useState<{ image: string; key: string; photo: string; layerId: string } | null>(null);
  const [outlineOpening, setOutlineOpening] = useState(false);
  const outlineOpenId = useRef(0);
  const drawingRef = useRef(false);
  const panningRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const touchPointersRef = useRef(new Map<number, Point>());
  const pinchRef = useRef<{
    initialDistance: number;
    initialZoom: number;
    anchor: Point;
  } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const selectedLayer = project.layers.find(layer => layer.id === project.selectedLayerId) ?? project.layers[0];
  const pdfEffectivePpi = Math.round(getPdfEffectivePpi(
    project.width,
    project.height,
    pdfPaperSize,
    pdfOrientation,
    pdfSafeMargin,
  ));
  const visibleLayers = useMemo(() => [...project.layers].reverse(), [project.layers]);
  const stageSize = fitStageDimensions(
    project.width,
    project.height,
    stageBounds.width,
    Math.min(stageBounds.height, Math.max(1, window.innerHeight - 310)),
  );
  const clampPhotoPan = (pan: { x: number; y: number }, zoom = photoZoom) => ({
    x: Math.max(-stageSize.width * (zoom - 1) / 2, Math.min(stageSize.width * (zoom - 1) / 2, pan.x)),
    y: Math.max(-stageSize.height * (zoom - 1) / 2, Math.min(stageSize.height * (zoom - 1) / 2, pan.y)),
  });
  const outlineContextKey = JSON.stringify([project.selectedLayerId, project.width, project.height,
    selectedLayer.visible, photoZoom, photoPan.x, photoPan.y, stageSize.width, stageSize.height]);
  const currentOutlineContext = useRef({ key: outlineContextKey, photo: project.image });
  currentOutlineContext.current = { key: outlineContextKey, photo: project.image };

  useEffect(() => {
    outlineOpenId.current++;
    setOutlineOpening(false);
    if (outline && (outline.key !== outlineContextKey || outline.photo !== project.image)) {
      setOutline(null);
      setToast('Outline cancelled because the photo, view, or selected layer changed.');
    }
  }, [outlineContextKey, project.image]);
  useEffect(() => () => { outlineOpenId.current++; }, []);

  const openOutline = async () => {
    if (!project.image || !selectedLayer.visible || stageSize.width <= 0 || stageSize.height <= 0) return;
    const request = ++outlineOpenId.current;
    const key = outlineContextKey, photo = project.image, layerId = selectedLayer.id;
    setOutlineOpening(true);
    try {
      const image = new Image();
      image.src = photo;
      await image.decode();
      if (request !== outlineOpenId.current || currentOutlineContext.current.key !== key || currentOutlineContext.current.photo !== photo) return;
      // Snapshot ONLY the visible reference photo, never drawings or project data.
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 768 / Math.max(stageSize.width, stageSize.height));
      canvas.width = Math.max(1, Math.round(stageSize.width * scale));
      canvas.height = Math.max(1, Math.round(stageSize.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Photo preview is not supported by this browser.');
      const fitted = fitDimensionsWithinBounds(image.naturalWidth, image.naturalHeight, stageSize.width, stageSize.height);
      context.scale(canvas.width / stageSize.width, canvas.height / stageSize.height);
      context.translate(stageSize.width / 2 + photoPan.x, stageSize.height / 2 + photoPan.y);
      context.scale(photoZoom, photoZoom);
      context.drawImage(image, -fitted.width / 2, -fitted.height / 2, fitted.width, fitted.height);
      setOutline({ image: canvas.toDataURL('image/png'), key, photo, layerId });
    } catch {
      if (request === outlineOpenId.current) setToast('Could not read the visible photo for outlining. Your project is unchanged.');
    } finally {
      if (request === outlineOpenId.current) setOutlineOpening(false);
    }
  };

  const acceptOutline = (points: Point[]) => {
    if (!outline || outline.key !== currentOutlineContext.current.key || outline.photo !== currentOutlineContext.current.photo) return;
    try {
      const mapped = viewportToProject(points, photoZoom, photoPan.x / stageSize.width, photoPan.y / stageSize.height);
      const stroke: Stroke = { points: mapped, color, size: 2 * project.width / stageSize.width, tool: 'brush' };
      setProject(current => {
        if (current.image !== outline.photo || current.selectedLayerId !== outline.layerId
          || !current.layers.some(layer => layer.id === outline.layerId && layer.visible)) return current;
        return { ...current, layers: current.layers.map(layer => layer.id === outline.layerId
          ? { ...layer, strokes: [...layer.strokes, stroke], redo: [] } : layer) };
      });
      setOutline(null);
      setToast('Outline added to the selected layer. Undo removes it.');
    } catch {
      setToast('This outline no longer fits the current photo view. Run outlining again.');
    }
  };

  useEffect(() => {
    const stageWrap = stageWrapRef.current;
    if (!stageWrap) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setStageBounds({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stageWrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const updateViewportHeight = () => setStageBounds(current => ({ ...current }));
    window.addEventListener('resize', updateViewportHeight);
    return () => window.removeEventListener('resize', updateViewportHeight);
  }, []);

  useEffect(() => {
    if (stageSize.width <= 0 || stageSize.height <= 0) return;
    const clamped = clampPhotoPan(photoPan);
    if (clamped.x !== photoPan.x || clamped.y !== photoPan.y) setPhotoView(photoZoom, clamped);
  }, [stageSize.width, stageSize.height, photoZoom, photoPan.x, photoPan.y]);

  const announce = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  }, []);

  const refreshStorageEstimate = useCallback(async () => {
    const estimate = await readBrowserStorageEstimate();
    setStorageEstimate(estimate);
    return estimate;
  }, []);

  useEffect(() => {
    void refreshStorageEstimate();
  }, [refreshStorageEstimate]);

  useEffect(() => {
    setSavedStatus('Saving…');
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(project));
        setSavedStatus('Saved in this browser');
        void refreshStorageEstimate();
      } catch {
        setSavedStatus('Storage is full');
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [project, refreshStorageEstimate]);

  useEffect(() => {
    // Account navigation must not cancel the last debounced project save.
    const flush = () => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(latestProject.current)); }
      catch { setSavedStatus('Storage is full'); }
    };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, []);

  useEffect(() => {
    project.layers.forEach(layer => {
      const canvas = canvasRefs.current[layer.id];
      if (!canvas) return;
      if (canvas.width !== project.width) canvas.width = project.width;
      if (canvas.height !== project.height) canvas.height = project.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, project.width, project.height);
      renderDrawing(context, layer.strokes, project.width, project.height);
      if (draft?.layerId === layer.id) renderStroke(context, draft.stroke, project.width, project.height);
    });
  }, [project.layers, project.width, project.height, draft, renderStroke]);

  const updateProject = (updater: (current: Project) => Project) => setProject(current => updater(current));
  const setPhotoView = (zoom: number, pan: { x: number; y: number }) => updateProject(current => {
    if (current.photoZoom === zoom && current.photoPan.x === pan.x && current.photoPan.y === pan.y) return current;
    return { ...current, photoZoom: zoom, photoPan: pan };
  });
  const changeLayer = (layerId: string, updater: (layer: PaintLayer) => PaintLayer) => {
    updateProject(current => ({ ...current, layers: current.layers.map(layer => layer.id === layerId ? updater(layer) : layer) }));
  };

  const openPhoto = () => fileInput.current?.click();
  const useGeneratedReference = (source: string, prompt: string): Promise<void> => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      const { width, height } = getScaledImageDimensions(image.naturalWidth, image.naturalHeight);
      const layer = createLayer('Sketch layer');
      const nextProject: Project = {
        image: source, width, height, layers: [layer], selectedLayerId: layer.id,
        title: prompt.slice(0, 42) || 'Generated idea', photoZoom: 1, photoPan: { x: 0, y: 0 },
      };
      const estimate = await refreshStorageEstimate();
      const currentProject = latestProject.current;
      const nextHistory = withSavedProject(projectHistory, currentProject);
      if (!confirmHistoryWriteIfStorageIsLow(estimate, nextProject, nextHistory)) {
        reject(new Error('Storage warning dismissed. No changes were made.'));
        return;
      }
      try {
        localStorage.setItem(PROJECT_HISTORY_KEY, JSON.stringify(nextHistory));
      } catch {
        reject(new Error('Could not save a recovery copy of your current sketch. No changes were made.'));
        return;
      }
      setProjectHistory(nextHistory);
      setPanMode(false);
      setDrawingClipboard(null);
      setProject(nextProject);
      void refreshStorageEstimate();
      announce('Generated image added. You can now sketch over it.');
      resolve();
    };
    image.onerror = () => reject(new Error('Generated image could not be opened.'));
    image.src = source;
  });
  const restoreProject = async (savedProject: Project) => {
    const estimate = await refreshStorageEstimate();
    const currentProject = latestProject.current;
    const nextHistory = withSavedProject(projectHistory, currentProject);
    const nextProject = normalizeProjectView(savedProject);
    if (!confirmHistoryWriteIfStorageIsLow(estimate, nextProject, nextHistory)) return;
    try {
      localStorage.setItem(PROJECT_HISTORY_KEY, JSON.stringify(nextHistory));
    } catch {
      announce('Could not save the current sketch before restoring. Nothing changed.');
      return;
    }
    setProjectHistory(nextHistory);
    setPanMode(false);
    setDrawingClipboard(null);
    setProject(nextProject);
    void refreshStorageEstimate();
    announce(`Restored “${savedProject.title}”.`);
  };
  const deleteSavedProject = (index: number) => {
    const nextHistory = projectHistory.filter((_, currentIndex) => currentIndex !== index);
    try {
      localStorage.setItem(PROJECT_HISTORY_KEY, JSON.stringify(nextHistory));
    } catch {
      announce('Could not delete this saved sketch. Nothing changed.');
      return;
    }
    setProjectHistory(nextHistory);
    announce('Saved sketch deleted.');
  };
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      announce('Choose an image file to begin.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const { width, height } = getScaledImageDimensions(image.naturalWidth, image.naturalHeight);
        const layer = createLayer('Sketch layer');
        setPanMode(false);
        setDrawingClipboard(null);
        setProject(current => ({
          ...current, image: String(reader.result), width, height,
          layers: [layer], selectedLayerId: layer.id,
          title: file.name.replace(/\.[^.]+$/, '').slice(0, 42) || 'Untitled idea',
          photoZoom: 1, photoPan: { x: 0, y: 0 },
        }));
        announce('Photo added. Your original stays untouched.');
      };
      image.onerror = () => announce('That photo could not be opened. Try another image.');
      image.src = String(reader.result);
    };
    reader.onerror = () => announce('Could not read that file. Please try again.');
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const startBlank = () => {
    setDrawingClipboard(null);
    const layer = createLayer('Layer 1');
    setPanMode(false);
    setProject(current => ({
      ...current, image: null, width: 1200, height: 800, layers: [layer], selectedLayerId: layer.id,
      title: 'Untitled idea', photoZoom: 1, photoPan: { x: 0, y: 0 },
    }));
    announce('A fresh transparent canvas is ready.');
  };

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  const beginStroke = (event: PointerEvent<HTMLCanvasElement>, layer: PaintLayer) => {
    if (event.button !== 0 || !layer.visible) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const point = pointFromEvent(event);
    setDraft({
      layerId: layer.id,
      stroke: createInstrumentStroke(
        tool, point, color, brushSize * (project.width / stageSize.width), brushStyle,
        Math.floor(Math.random() * 4294967296), normalizePointerPressure(event.pointerType, event.pressure),
        penPressureSensitivity,
      ),
    });
  };
  const beginPhotoPan = (event: PointerEvent<HTMLDivElement>) => {
    if (!panMode || photoZoom <= 1 || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    panningRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: photoPan.x,
      originY: photoPan.y,
    };
    setIsPanning(true);
  };
  const handleStagePointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') {
      beginPhotoPan(event);
      return;
    }

    const touches = touchPointersRef.current;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size < 2) {
      beginPhotoPan(event);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (drawingRef.current) {
      drawingRef.current = false;
      setDraft(null);
    }
    panningRef.current = null;
    setIsPanning(false);

    const [first, second] = [...touches.values()];
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const stageRect = stageRef.current?.getBoundingClientRect();
    if (!stageRect) return;

    pinchRef.current = {
      initialDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      initialZoom: photoZoom,
      anchor: {
        x: (midpoint.x - stageRect.left - stageRect.width / 2 - photoPan.x) / photoZoom,
        y: (midpoint.y - stageRect.top - stageRect.height / 2 - photoPan.y) / photoZoom,
      },
    };
  };
  const handleStagePointerMoveCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || !touchPointersRef.current.has(event.pointerId)) return;
    touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const pinch = pinchRef.current;
    if (!pinch || touchPointersRef.current.size < 2) return;
    event.preventDefault();
    event.stopPropagation();

    const [first, second] = [...touchPointersRef.current.values()];
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    const nextZoom = Math.max(1, Math.min(4, pinch.initialZoom * distance / pinch.initialDistance));
    const stageRect = stageRef.current?.getBoundingClientRect();
    if (!stageRect) return;

    const nextPan = {
      x: midpoint.x - stageRect.left - stageRect.width / 2 - pinch.anchor.x * nextZoom,
      y: midpoint.y - stageRect.top - stageRect.height / 2 - pinch.anchor.y * nextZoom,
    };
    setPhotoView(nextZoom, clampPhotoPan(nextPan, nextZoom));
    if (nextZoom === 1) setPanMode(false);
  };
  const handleStagePointerEndCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    touchPointersRef.current.delete(event.pointerId);
    pinchRef.current = null;
  };
  const continuePhotoPan = (event: PointerEvent<HTMLDivElement>) => {
    const panning = panningRef.current;
    if (panning?.pointerId === event.pointerId) {
      setPhotoView(photoZoom, clampPhotoPan({
        x: panning.originX + event.clientX - panning.startX,
        y: panning.originY + event.clientY - panning.startY,
      }));
    }
  };
  const finishPhotoPan = (event: PointerEvent<HTMLDivElement>) => {
    if (panningRef.current?.pointerId === event.pointerId) {
      panningRef.current = null;
      setIsPanning(false);
    }
  };
  const continueStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const point = pointFromEvent(event);
    setDraft(current => {
      if (!current) return current;
      const last = current.stroke.points[current.stroke.points.length - 1];
      // Stationary touch/pointer events must not grow the stroke or darken its texture.
      if (last.x === point.x && last.y === point.y) return current;
      const pressure = current.stroke.instrument?.kind === 'pen' && current.stroke.instrument.version === 2
        ? { ...current.stroke.pressure!, samples: [...current.stroke.pressure!.samples, normalizePointerPressure(event.pointerType, event.pressure)] }
        : current.stroke.pressure;
      return {
        ...current,
        stroke: { ...current.stroke, points: [...current.stroke.points, point], ...(pressure ? { pressure } : {}) },
      };
    });
  };
  const finishStroke = () => {
    if (!drawingRef.current || !draft) return;
    drawingRef.current = false;
    const finished = draft;
    changeLayer(finished.layerId, layer => ({ ...layer, strokes: [...layer.strokes, finished.stroke], redo: [] }));
    setDraft(null);
  };

  const undo = () => {
    if (!selectedLayer?.strokes.length) return;
    changeLayer(selectedLayer.id, undoDrawing);
  };
  const redo = () => {
    if (!selectedLayer?.redo.length) return;
    changeLayer(selectedLayer.id, redoDrawing);
  };
  const clipboardLayer = project.layers.find(layer => layer.id === project.selectedLayerId);
  const copyLayerDrawing = () => {
    const snapshot = copyDrawing(clipboardLayer);
    if (!snapshot) { setToast('Nothing to copy: select a layer with drawings.'); return; }
    setDrawingClipboard(snapshot);
    setToast(`Copied drawing from ${clipboardLayer!.name}. Select a layer and paste.`);
  };
  const pasteLayerDrawing = () => {
    if (!drawingClipboard?.length) { setToast('Copy a layer drawing before pasting.'); return; }
    if (!clipboardLayer) { setToast('Select an existing layer before pasting.'); return; }
    const destinationId = clipboardLayer.id;
    updateProject(current => ({
      ...current, layers: pasteIntoLayers(current.layers, destinationId, drawingClipboard),
    }));
    setToast(`Pasted drawing into ${clipboardLayer.name}. Undo removes this paste.`);
  };
  const addLayer = () => {
    const next = createLayer(`Layer ${project.layers.length + 1}`);
    updateProject(current => ({ ...current, layers: [...current.layers, next], selectedLayerId: next.id }));
  };
  const deleteLayer = (layerId: string) => {
    if (project.layers.length <= 1) {
      announce('Keep at least one drawing layer in your project.');
      return;
    }
    const nextLayers = project.layers.filter(layer => layer.id !== layerId);
    updateProject(current => ({
      ...current, layers: nextLayers,
      selectedLayerId: current.selectedLayerId === layerId ? nextLayers[nextLayers.length - 1].id : current.selectedLayerId,
    }));
  };
  const moveLayer = (layerId: string, direction: -1 | 1) => {
    updateProject(current => {
      const index = current.layers.findIndex(layer => layer.id === layerId);
      const target = index + direction;
      if (target < 0 || target >= current.layers.length) return current;
      const layers = [...current.layers];
      [layers[index], layers[target]] = [layers[target], layers[index]];
      return { ...current, layers };
    });
  };
  const saveLayerName = () => {
    if (!renamingId) return;
    changeLayer(renamingId, layer => ({ ...layer, name: renameValue.trim() || layer.name }));
    setRenamingId(null);
  };
  const resetPhotoView = () => {
    setPhotoView(1, { x: 0, y: 0 });
    setPanMode(false);
  };
  const changePhotoZoom = (value: number) => {
    const nextZoom = Math.max(1, Math.min(4, value));
    setPhotoView(nextZoom, clampPhotoPan(photoPan, nextZoom));
    if (nextZoom === 1) setPanMode(false);
  };

  const exportPng = async () => {
    try {
      const { canvas } = await composeProjectCanvas(project, canvasRefs.current, exportSize, paperOrientation);
      const encodedPng = canvas.toDataURL('image/png');
      const png = exportSize === 'letter' || exportSize === 'a4'
        ? setPngResolution(encodedPng, PRINT_PIXELS_PER_METER)
        : encodedPng;
      const pngDataUrlPrefix = 'data:image/png;base64,';
      if (!png.startsWith(pngDataUrlPrefix) || png.length === pngDataUrlPrefix.length) {
        announce('Could not create the PNG export. Try again or use a smaller canvas.');
        return;
      }
      const link = document.createElement('a');
      const title = project.title.trim().replace(/[^\w-]+/g, '-') || 'cloudpainter-idea';
      const resolutionSuffix = exportSize === '2' ? '-2x' : '';
      link.download = `${title}${resolutionSuffix}.png`;
      link.href = png;
      link.click();
      announce('PNG exported. Your browser saved the finished composition.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      announce(message.startsWith('Could not include the reference photo')
        || message.startsWith('Could not export PNG because visible layer')
        || message.startsWith('Could not create the PNG export')
        ? message
        : 'Could not create the PNG export. Try again or use a smaller canvas.');
    }
  };

  const exportPdf = async () => {
    try {
      const { canvas } = await composeProjectCanvas(project, canvasRefs.current, '1');
      const pdf = createPrintPdf(canvas, pdfPaperSize, pdfOrientation, pdfSafeMargin);
      const title = project.title.trim().replace(/[^\w-]+/g, '-') || 'cloudpainter-idea';
      const downloadUrl = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.download = `${title}-${pdfPaperSize}-${pdfOrientation}.pdf`;
      link.href = downloadUrl;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      announce('PDF exported. Your browser saved the print-ready page.');
    } catch {
      announce('Could not create the PDF export. Try again or use a smaller sketch.');
    }
  };

  const composePngForUpscale = async (): Promise<Blob> => {
    const { canvas } = await composeProjectCanvas(project, canvasRefs.current, '1');
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob?.type === 'image/png' && blob.size > 0) resolve(blob);
        else reject(new Error('Could not create the merged PNG for upscaling. No image was sent.'));
      }, 'image/png');
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      )) return;
      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase();
        if (key === 'y') {
          event.preventDefault();
          redo();
        } else if (key === 'z') {
          event.preventDefault();
          if (event.shiftKey) redo(); else undo();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="CloudPainter">
          <span className="brand-mark"><Cloud size={19} strokeWidth={2.4} /></span>
          <span className="brand-name">cloud<em>painter</em></span>
        </div>
        <div className="topbar-right">
          <AccountControls />
          <span className="privacy-note"><Save size={13} /> Projects and photos stay here unless you explicitly send one to Poe for upscaling.</span>
          <span className="save-state" data-testid="status-save">{savedStatus}</span>
          <div className="top-actions">
              <ActionTooltip description="View five CloudPainter logo design directions."><Link href="/logo-options" className="button button-quiet logo-options-link" data-testid="link-logo-options">Logo directions</Link></ActionTooltip>
            <label className="export-size-control">
              <span>PNG size</span>
              <select aria-label="PNG export size" data-testid="select-export-size" value={exportSize} onChange={event => setExportSize(event.target.value as ExportSize)}>
                <option value={1}>Original size</option>
                <option value={2}>2× high resolution</option>
                <option value="letter">US Letter · 8.5 × 11 in</option>
                <option value="a4">A4 · 210 × 297 mm</option>
              </select>
            </label>
            {(exportSize === 'letter' || exportSize === 'a4') && (
              <label className="export-size-control">
                <span>Orientation</span>
                <select aria-label="Paper orientation" data-testid="select-export-orientation" value={paperOrientation} onChange={event => setPaperOrientation(event.target.value as PaperOrientation)}>
                  <option value="match-sketch">Match sketch</option>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>
            )}
            <TooltipButton description="Export the reference photo and visible drawing layers as a PNG." className="button button-primary" onClick={exportPng} data-testid="button-export"><Upload size={14} /> Export PNG</TooltipButton>
            <label className="export-size-control">
              <span>PDF paper</span>
              <select aria-label="PDF paper size" data-testid="select-pdf-paper" value={pdfPaperSize} onChange={event => setPdfPaperSize(event.target.value as PdfPaperSize)}>
                <option value="letter">US Letter</option>
                <option value="a4">A4</option>
              </select>
            </label>
            <label className="export-size-control">
              <span>PDF orientation</span>
              <select aria-label="PDF orientation" data-testid="select-pdf-orientation" value={pdfOrientation} onChange={event => setPdfOrientation(event.target.value as PdfOrientation)}>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            <label className="export-size-control">
              <span>Safe margin</span>
              <select aria-label="PDF print-safe margin" data-testid="select-pdf-margin" value={pdfSafeMargin} onChange={event => setPdfSafeMargin(event.target.value as PdfSafeMargin)}>
                <option value="0.25">¼ in</option>
                <option value="0.5">½ in</option>
                <option value="0.75">¾ in</option>
              </select>
            </label>
            <TooltipButton description="Download the full sketch centered inside the selected print-safe margin on a Letter or A4 page." className="button" onClick={exportPdf} data-testid="button-export-pdf"><FileDown size={14} /> Export PDF</TooltipButton>
          </div>
        </div>
      </header>

      <section className="workspace">
        <p
          className="pdf-resolution-status"
          data-quality={pdfEffectivePpi < 300 ? 'limited' : 'print-ready'}
          data-testid="pdf-resolution-status"
          role="status"
          aria-live="polite"
        >
          Approx. {pdfEffectivePpi} PPI at this print size. {pdfEffectivePpi < 300
            ? 'Fine details may soften; increase the safe margin to print the artwork smaller.'
            : 'Suitable for fine details.'}
        </p>
        <div className="intro-row">
          <div>
            <p className="eyebrow">A little room for what you see</p>
            <h1>Find a shape. Follow it.</h1>
            <p className="intro-copy">Start with a photo, spot something surprising, then sketch it into being.</p>
          </div>
          <div className="save-state">LOCAL PROJECT · AUTOSAVED</div>
        </div>

        <PoeUpscaleExport composeImage={composePngForUpscale} title={project.title} width={project.width} height={project.height} />

        <div className="workspace-grid">
          <aside className="panel side-panel">
            <div className="panel-title-row"><h2 className="panel-title">Your starting point</h2><span className="panel-kicker">01</span></div>
            <p className="section-label">Reference photo</p>
            <div className="source-card-frame">
              <TooltipButton
                description={project.image ? 'Choose a new reference photo, replacing the current photo and drawing layers.' : 'Choose a reference photo and start a fresh drawing layer; the original photo stays unchanged.'}
                type="button"
                className={`source-card ${project.image ? 'loaded' : ''}`}
                onClick={openPhoto}
                aria-label={project.image ? 'Replace reference photo' : 'Import a reference photo'}
                data-testid="button-photo-card"
              >
                {project.image ? (
                  <img src={project.image} alt="Your unchanged reference photo" data-testid="img-reference" />
                ) : (
                  <>
                    <span className="source-icon"><ImagePlus size={18} /></span>
                    <strong>Bring in a photograph</strong>
                    <span>JPG, PNG or another image</span>
                  </>
                )}
              </TooltipButton>
              {project.image && (
                <TooltipButton description="Remove the reference photo and keep your drawing layers." type="button" className="icon-button source-remove" aria-label="Remove photo" onClick={() => { resetPhotoView(); updateProject(current => ({ ...current, image: null })); }} data-testid="button-remove-photo"><X size={14} /></TooltipButton>
              )}
            </div>
            <div className="source-actions">
              <TooltipButton description="Start a fresh transparent canvas, replacing the current photo and all drawing layers." className="button" onClick={startBlank} data-testid="button-blank"><Plus size={13} /> Blank canvas</TooltipButton>
              <input ref={fileInput} hidden type="file" accept="image/*" onChange={handleFile} data-testid="input-photo" />
            </div>
            {storageEstimate && (
              <p className="storage-usage" role="status" aria-live="polite" data-testid="storage-usage">
                CloudPainter storage: about {formatStorageSize(storageEstimate.cloudPainterBytes)}
                {' · Local storage: about '}{formatStorageSize(storageEstimate.localStorageBytes)} of 5 MB guideline (browser limits vary)
                {storageEstimate.usageBytes !== undefined && storageEstimate.quotaBytes !== undefined
                  ? ` · Overall browser estimate: ${formatStorageSize(storageEstimate.usageBytes)} of ${formatStorageSize(storageEstimate.quotaBytes)} used`
                  : ''}
              </p>
            )}
            {projectHistory.length > 0 && (
              <section className="saved-sketches" aria-label="Saved sketches">
                <p className="section-label">Saved sketches · {projectHistory.length}</p>
                <div className="saved-sketch-list">
                  {projectHistory.map((savedProject, index) => (
                    <div className="saved-sketch-row" key={`${savedProject.title}-${index}`}>
                      <TooltipButton
                        description={`Restore “${savedProject.title}”. Your current sketch is saved first.`}
                        className="button saved-sketch-button"
                        onClick={() => restoreProject(savedProject)}
                        aria-label={`Restore saved sketch: ${savedProject.title}`}
                        data-testid={`button-restore-project-${index}`}
                      >
                        {savedProject.title}
                      </TooltipButton>
                      <TooltipButton
                        description={`Delete “${savedProject.title}” from saved sketches.`}
                        type="button"
                        className="button icon-button saved-sketch-delete"
                        onClick={() => deleteSavedProject(index)}
                        aria-label={`Delete saved sketch: ${savedProject.title}`}
                        data-testid={`button-delete-project-${index}`}
                      >
                        <Trash2 size={14} />
                      </TooltipButton>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <ImageGenerator onUse={useGeneratedReference} />

            <p className="section-label">Drawing layers <span className="panel-kicker"> · {project.layers.length}</span></p>
            <div className="layer-list">
              {visibleLayers.map((layer, index) => (
                <div key={layer.id} className={`layer-row ${selectedLayer?.id === layer.id ? 'active' : ''}`} data-testid={`layer-row-${layer.id}`}>
                  <TooltipButton description={`Select ${layer.name} for drawing and layer adjustments.${layer.visible ? '' : ' Show this layer before drawing on it.'}`} className="layer-select" onClick={() => updateProject(current => ({ ...current, selectedLayerId: layer.id }))} data-testid={`button-select-layer-${layer.id}`}>
                    <span className="layer-thumb"><Layers size={13} /></span>
                    {renamingId === layer.id ? (
                      <input className="rename-input" autoFocus value={renameValue} onChange={event => setRenameValue(event.target.value)} onBlur={saveLayerName} onKeyDown={event => { if (event.key === 'Enter') saveLayerName(); if (event.key === 'Escape') setRenamingId(null); }} onClick={event => event.stopPropagation()} aria-label="Rename layer" data-testid={`input-rename-${layer.id}`} />
                    ) : <span className="layer-name">{layer.name}</span>}
                  </TooltipButton>
                  <TooltipButton description={layer.visible ? `Hide ${layer.name} from the canvas and PNG export without deleting its drawings.` : `Show ${layer.name} on the canvas and include it in PNG exports.`} className="icon-button" aria-label={layer.visible ? 'Hide layer' : 'Show layer'} onClick={() => changeLayer(layer.id, current => ({ ...current, visible: !current.visible }))} data-testid={`button-visibility-${layer.id}`}>
                    {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </TooltipButton>
                  <TooltipButton description={`Change the name of ${layer.name}.`} className="icon-button" aria-label="Rename layer" onClick={() => { setRenamingId(layer.id); setRenameValue(layer.name); }} data-testid={`button-rename-${layer.id}`}><span style={{ fontSize: 13, lineHeight: 1 }}>Aa</span></TooltipButton>
                  <TooltipButton description={index === 0 ? `${layer.name} is already the top drawing layer.` : `Move ${layer.name} above the next drawing layer.`} className="icon-button layer-order" aria-label="Move layer up" onClick={() => moveLayer(layer.id, 1)} disabled={index === 0} data-testid={`button-layer-up-${layer.id}`}><ArrowUp size={13} /></TooltipButton>
                  <TooltipButton description={index === visibleLayers.length - 1 ? `${layer.name} is already the bottom drawing layer.` : `Move ${layer.name} below the next drawing layer.`} className="icon-button layer-order" aria-label="Move layer down" onClick={() => moveLayer(layer.id, -1)} disabled={index === visibleLayers.length - 1} data-testid={`button-layer-down-${layer.id}`}><ArrowDown size={13} /></TooltipButton>
                  <TooltipButton description={project.layers.length === 1 ? 'Keep at least one drawing layer; this is the only layer.' : `Delete ${layer.name} and all its drawings.`} className="icon-button" aria-label="Delete layer" onClick={() => deleteLayer(layer.id)} data-testid={`button-delete-layer-${layer.id}`}><Trash2 size={13} /></TooltipButton>
                </div>
              ))}
            </div>
            <TooltipButton description="Add and select a new transparent drawing layer above the others." className="add-layer" onClick={addLayer} data-testid="button-add-layer"><Plus size={14} /> Add a drawing layer</TooltipButton>
            <div className="layer-clipboard-controls">
              <TooltipButton className="add-layer" description={clipboardLayer?.strokes.length ? 'Copy this layer’s complete drawing, including erasing, to the app clipboard. The original stays unchanged; layer settings and the photo are not copied.' : 'Nothing to copy: select a layer with drawing content. An earlier copy stays available.'} onClick={copyLayerDrawing} disabled={!clipboardLayer?.strokes.length || !!draft} data-testid="button-copy-drawing"><Copy size={14} /> Copy drawing</TooltipButton>
              <TooltipButton className="add-layer" description={!drawingClipboard?.length ? 'Copy a layer drawing first. The drawing clipboard is local to this open app and clears on reload.' : !clipboardLayer ? 'Select an existing destination layer before pasting.' : 'Append the copied drawing to this layer without changing existing content. Copied erasers affect only the copy; one Undo removes the paste.'} onClick={pasteLayerDrawing} disabled={!drawingClipboard?.length || !clipboardLayer || !!draft} data-testid="button-paste-drawing"><ClipboardPaste size={14} /> Paste drawing</TooltipButton>
            </div>
            <p className="layer-footnote">Your photograph stays safely underneath, unchanged. Drawings live on their own layers.</p>
          </aside>

          <section className="editor" aria-label="Drawing workspace">
            <div className="panel toolbar">
              <div className="tool-group">
                {([
                  ['brush', 'Brush', Paintbrush], ['pencil', 'Pencil', Pencil],
                  ['pen', 'Pen', PenTool], ['eraser', 'Eraser', Eraser],
                ] as const).map(([instrument, label, Icon]) => (
                  <TooltipButton key={instrument} description={TOOL_GUIDANCE[instrument]} className={`tool-button instrument-button ${tool === instrument ? 'selected' : ''}`} aria-label={`${label} tool`} aria-pressed={tool === instrument} onClick={() => selectTool(instrument)} data-testid={`button-tool-${instrument}`}>
                    <Icon size={17} /><span>{label}</span>
                  </TooltipButton>
                ))}
                <span className="tool-divider" />
                <TooltipButton description={project.image ? 'Preview contours from the visible photo with local detection, hosted AI, or edge tracing. Nothing is drawn until you accept.' : 'Import a reference photo before outlining a subject.'} className="tool-button" aria-label="Outline" onClick={openOutline} disabled={!project.image || !selectedLayer.visible || outlineOpening} data-testid="button-outline"><Sparkles size={17} /></TooltipButton>
                <TooltipButton description={selectedLayer?.strokes.length ? 'Undo the most recent stroke or whole paste on the selected layer.' : 'Nothing to undo: the selected layer has no drawing actions.'} className="tool-button" aria-label="Undo" onClick={undo} disabled={!selectedLayer?.strokes.length} data-testid="button-undo"><Undo2 size={17} /></TooltipButton>
                <TooltipButton description={selectedLayer?.redo.length ? 'Restore the last undone stroke or whole paste on the selected layer.' : 'Nothing to redo: undo a drawing action on the selected layer first.'} className="tool-button" aria-label="Redo" onClick={redo} disabled={!selectedLayer?.redo.length} data-testid="button-redo"><Redo2 size={17} /></TooltipButton>
              </div>
              <div className="tool-group">
                <span className="canvas-meta">{project.width} × {project.height}</span>
                <TooltipButton description="Remove all drawings and undo/redo history from the selected layer; keep the photo and other layers." className="tool-button" aria-label="Clear selected layer" onClick={() => { if (selectedLayer) changeLayer(selectedLayer.id, layer => ({ ...layer, strokes: [], redo: [] })); }} data-testid="button-clear-layer"><RotateCcw size={15} /></TooltipButton>
              </div>
            </div>

            {outlineOpening && <p role="status">Preparing the visible photo for outlining…</p>}
            {outline && <OutlinePanel image={outline.image} contextKey={outlineContextKey}
              onAccept={acceptOutline} onClose={() => { setOutline(null); setToast('Outline cancelled. Your project is unchanged.'); }} />}

            <div className="panel stage-wrap" ref={stageWrapRef}>
              {project.image && (
                <div className="view-controls" aria-label="Reference photo view controls">
                  <TooltipButton description={photoZoom <= 1 ? 'Already at the minimum zoom: the photo fits the canvas.' : 'Zoom out by 25% to see more of the photo and drawings.'} className="view-control-button" type="button" aria-label="Zoom out" onClick={() => changePhotoZoom(photoZoom - 0.25)} disabled={photoZoom <= 1} data-testid="button-zoom-out"><Minus size={14} /></TooltipButton>
                  <label className="zoom-slider-label">
                    <span className="zoom-value">{Math.round(photoZoom * 100)}%</span>
                    <input
                      type="range"
                      min="100"
                      max="400"
                      step="25"
                      value={Math.round(photoZoom * 100)}
                      onChange={event => changePhotoZoom(Number(event.target.value) / 100)}
                      aria-label="Reference photo zoom"
                      data-testid="input-photo-zoom"
                    />
                  </label>
                  <TooltipButton description={photoZoom >= 4 ? 'Already at the maximum zoom of 400%.' : 'Zoom in by 25% to inspect photo and drawing details.'} className="view-control-button" type="button" aria-label="Zoom in" onClick={() => changePhotoZoom(photoZoom + 0.25)} disabled={photoZoom >= 4} data-testid="button-zoom-in"><ZoomIn size={14} /></TooltipButton>
                  <TooltipButton description={photoZoom <= 1 ? 'Zoom in first to reposition the view by dragging.' : panMode ? 'Leave reposition mode and return to drawing.' : 'Drag to reposition the zoomed photo and drawings without editing them.'} className={`view-control-button ${panMode ? 'selected' : ''}`} type="button" aria-label="Toggle photo reposition mode" aria-pressed={panMode} onClick={() => setPanMode(current => !current)} disabled={photoZoom <= 1} data-testid="button-pan-mode"><Hand size={14} /></TooltipButton>
                  <TooltipButton description={photoZoom === 1 && photoPan.x === 0 && photoPan.y === 0 ? 'The photo is already centered at its fitted zoom.' : 'Reset zoom and position to center the fitted photo; leave drawings unchanged.'} className="view-control-button" type="button" aria-label="Reset photo to fitted view" onClick={resetPhotoView} disabled={photoZoom === 1 && photoPan.x === 0 && photoPan.y === 0} data-testid="button-reset-photo-view"><RotateCcw size={14} /></TooltipButton>
                </div>
              )}
              <div className="stage" ref={stageRef} style={{
                aspectRatio: `${project.width} / ${project.height}`,
                width: stageSize.width || undefined,
                height: stageSize.height || undefined,
              }} data-testid="canvas-stage">
                <div
                  className={`stage-content ${panMode && photoZoom > 1 ? 'pan-ready' : ''} ${isPanning ? 'panning' : ''}`}
                  style={{ transform: `translate3d(${photoPan.x}px, ${photoPan.y}px, 0) scale(${photoZoom})` }}
                  onPointerDownCapture={handleStagePointerDownCapture}
                  onPointerMoveCapture={handleStagePointerMoveCapture}
                  onPointerUpCapture={handleStagePointerEndCapture}
                  onPointerCancelCapture={handleStagePointerEndCapture}
                  onPointerMove={continuePhotoPan}
                  onPointerUp={finishPhotoPan}
                  onPointerCancel={finishPhotoPan}
                >
                  {project.image && <img className="base-photo" src={project.image} alt="" draggable={false} />}
                  {project.layers.map((layer, index) => (
                    <canvas
                      key={layer.id}
                      ref={node => { canvasRefs.current[layer.id] = node; }}
                      style={{ zIndex: index + 1, opacity: layer.visible ? layer.opacity : 0, pointerEvents: !outline && layer.id === project.selectedLayerId && layer.visible ? 'auto' : 'none' }}
                      className={layer.id === project.selectedLayerId ? 'draw-surface' : ''}
                      onPointerDown={event => beginStroke(event, layer)}
                      onPointerMove={continueStroke}
                      onPointerUp={finishStroke}
                      onPointerCancel={finishStroke}
                      aria-label={`Drawing surface for ${layer.name}`}
                      data-testid={`canvas-layer-${layer.id}`}
                    />
                  ))}
                </div>
                {!project.image && !project.layers.some(layer => layer.strokes.length) && (
                  <div className="empty-stage">
                    <div className="empty-stage-inner">
                      <div className="empty-orbit"><Sparkles size={25} /></div>
                      <strong>What do you see?</strong>
                      <p>Upload a photo to find a hidden shape, or start with a blank canvas and let your hand wander.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="statusbar">
              <span className="hint"><span className="keyboard-key">⌘ Z</span> undo <span className="keyboard-key">⇧ ⌘ Z</span> redo</span>
              <span>{panMode ? 'Drag the photo to reposition it; your drawing stays unchanged.' : TOOL_GUIDANCE[tool]}</span>
            </div>
          </section>

          <aside className="panel right-panel">
            <div className="panel-title-row"><h2 className="panel-title">Drawing & feel</h2><span className="panel-kicker">02</span></div>
            <div hidden={tool !== 'brush'}>
            <BrushDisclosure title="Brush style" id="style" defaultOpen summary={BRUSH_STYLES.find(brush => brush.style === brushStyle)?.label}>
              <BrushStyleControl embedded value={brushStyle} color={color} onChange={setBrushStyle} />
            </BrushDisclosure>
            </div>
            <div hidden={tool !== 'pen'}>
              <BrushDisclosure title="Pressure sensitivity" id="pressure-sensitivity" summary={`${penPressureSensitivity}%`}>
                <p style={{ margin: '0 0 8px', color: '#747d73', fontSize: 10, lineHeight: 1.4 }}>Set how strongly pen pressure changes ink width. Lower values make pressure feel steadier; higher values make it more responsive.</p>
                <input
                  className="range-input"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={penPressureSensitivity}
                  onChange={event => setPenPressureSensitivity(Number(event.target.value))}
                  aria-label="Pen pressure sensitivity"
                  data-testid="input-pen-pressure-sensitivity"
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9aa097', fontSize: 9, marginTop: 7 }}><span>Steady</span><span>Responsive</span></div>
              </BrushDisclosure>
            </div>
            <BrushDisclosure title="Color" id="color" defaultOpen summary={<>
              <span className="header-color-preview" style={{ background: color }} aria-hidden="true" />
              <span>{color.toUpperCase()} · {tool.toUpperCase()}</span>
            </>}>
              <DrawingColorControl color={color} tool={tool} onChange={nextColor => { setColor(nextColor); selectTool(toolAfterColorSelection(tool, lastDrawingTool.current)); }} />
            </BrushDisclosure>
            <BrushDisclosure title={`${tool[0].toUpperCase()}${tool.slice(1)} size`} id="size" summary={`${brushSize} px`}>
              <input className="range-input" type="range" min="1" max="48" value={brushSize} onChange={event => setToolSizes(current => ({ ...current, [tool]: Number(event.target.value) }))} aria-label={`${tool[0].toUpperCase()}${tool.slice(1)} size`} data-testid="input-brush-size" />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9aa097', fontSize: 9, marginTop: 7 }}><span>Fine</span><span>Bold</span></div>
            </BrushDisclosure>
            <BrushDisclosure title="Layer opacity" id="opacity" summary={`${Math.round((selectedLayer?.opacity ?? 1) * 100)}%`}>
              <input className="range-input" type="range" min="0" max="100" value={Math.round((selectedLayer?.opacity ?? 1) * 100)} onChange={event => selectedLayer && changeLayer(selectedLayer.id, layer => ({ ...layer, opacity: Number(event.target.value) / 100 }))} aria-label="Layer opacity" data-testid="input-layer-opacity" />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9aa097', fontSize: 9, marginTop: 7 }}><span>Ghostly</span><span>Full ink</span></div>
            </BrushDisclosure>
            <BrushDisclosure title="A small reminder" id="reminder" reminder>
              <p>Sketch a shape you notice. Keep the photo as your guide, then hide it when you want to see your drawing on its own.</p>
            </BrushDisclosure>
          </aside>
        </div>
      </section>
      {toast && <div className="toast-message" role="status" data-testid="status-toast">{toast}</div>}
    </main>
  );
}

type LogoDirectionId = 'cloudline' | 'viewfinder' | 'gesture' | 'paperfold' | 'sunstudy';

const logoDirections: { id: LogoDirectionId; number: string; name: string; description: string }[] = [
  { id: 'cloudline', number: '01', name: 'Cloudline', description: 'A quiet sky shape traced in one continuous pencil line.' },
  { id: 'viewfinder', number: '02', name: 'Field of view', description: 'A photo frame and a small point of focus, held in balance.' },
  { id: 'gesture', number: '03', name: 'Brush in motion', description: 'A loose, confident stroke turns a cloud into a painter’s mark.' },
  { id: 'paperfold', number: '04', name: 'Folded study', description: 'A sheet of sketch paper, with a corner lifted toward the light.' },
  { id: 'sunstudy', number: '05', name: 'Weather note', description: 'A tiny sun meets an observing cloud: a mark for looking closer.' },
];

function LogoMark({ direction, size = 48 }: { direction: LogoDirectionId; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 64 64', role: 'img' as const, 'aria-hidden': true };
  if (direction === 'cloudline') return (
    <svg {...common}>
      <path d="M14 42h34a9 9 0 0 0 .5-18 16 16 0 0 0-30.8 3.1A8 8 0 0 0 14 42Z" fill="#d2e67b" stroke="#315d4d" strokeWidth="3.2" strokeLinejoin="round" />
      <path d="m20 50 25-25" stroke="#ee806b" strokeWidth="3.2" strokeLinecap="round" />
      <path d="m42 24 4 1-1 4" fill="none" stroke="#ee806b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (direction === 'viewfinder') return (
    <svg {...common}>
      <path d="M13 23v-7h9M42 16h9v9M51 41v7h-9M22 48h-9v-9" fill="none" stroke="#315d4d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="11" fill="#ee806b" />
      <circle cx="32" cy="32" r="4" fill="#fbfaf6" />
      <path d="M32 8v5M56 32h-5M32 56v-5M8 32h5" stroke="#b2c66b" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
  if (direction === 'gesture') return (
    <svg {...common}>
      <path d="M9 39c5-1 5-16 14-16 6 0 7 11 12 11 4 0 6-15 12-15 4 0 5 7 8 10" fill="none" stroke="#315d4d" strokeWidth="7" strokeLinecap="round" />
      <path d="M12 48c10-3 23-2 39-7" fill="none" stroke="#ee806b" strokeWidth="4" strokeLinecap="round" />
      <path d="m47 36 5 5-6 3" fill="#ee806b" />
    </svg>
  );
  if (direction === 'paperfold') return (
    <svg {...common}>
      <path d="M17 10h21l12 12v32H17z" fill="#fbfaf6" stroke="#315d4d" strokeWidth="3" strokeLinejoin="round" />
      <path d="M38 10v14h12" fill="#d2e67b" stroke="#315d4d" strokeWidth="3" strokeLinejoin="round" />
      <path d="M24 35c2-7 11-8 14-1 4 0 6 3 6 7H23c0-3 0-5 1-6Z" fill="#ee806b" />
      <path d="M24 47h17" stroke="#315d4d" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
  return (
    <svg {...common}>
      <circle cx="43" cy="19" r="8" fill="#e4b33f" />
      <path d="M14 44h36a9 9 0 0 0 0-18 16 16 0 0 0-30.8 2.9A7.5 7.5 0 0 0 14 44Z" fill="#315d4d" />
      <path d="M21 36c3-4 7-4 10 0 3-4 7-4 10 0" fill="none" stroke="#d2e67b" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M17 52h30" stroke="#ee806b" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function LogoWordmark({ direction }: { direction: LogoDirectionId }) {
  return <span className={`direction-wordmark wordmark-${direction}`} aria-label="CloudPainter"><span>cloud</span><em>painter</em></span>;
}

function LogoOptions({ directions }: { directions: typeof logoDirections }) {
  return (
    <main className="app-shell logo-options-shell">
      <header className="topbar logo-options-topbar">
        <Link href="/" className="brand" aria-label="Return to CloudPainter workspace" data-testid="link-workspace-home">
          <span className="brand-mark"><Cloud size={19} strokeWidth={2.4} /></span>
          <span className="brand-name">cloud<em>painter</em></span>
        </Link>
        <Link href="/" className="button button-quiet workspace-return" data-testid="link-return-workspace">Back to sketch workspace</Link>
      </header>
      <section className="logo-review">
        <div className="logo-review-heading">
          <p className="eyebrow">Identity studies · 05 directions</p>
          <h1>Marks for looking closer.</h1>
          <p className="intro-copy">Five distinct sketches for a calm, observant creative practice. Comparison only — your workspace mark is unchanged.</p>
        </div>
        <LogoCreationPanel logoDirections={directions} />
        <div className="logo-directions" data-testid="logo-options-list">
          {directions.map((direction, index) => (
            <article className={`logo-direction direction-${direction.id}`} key={direction.id} data-testid={`logo-option-${direction.id}`}>
              <div className="direction-heading">
                <span className="direction-index">{direction.number} / 05</span>
                <span className="direction-note">{index % 2 === 0 ? 'SKY + SKETCH' : 'OBSERVATION + FORM'}</span>
              </div>
              <div className="direction-preview">
                <div className="logo-preview-header" data-testid={`preview-header-${direction.id}`}>
                  <span className={`logo-preview-mark mark-${direction.id}`}><LogoMark direction={direction.id} size={42} /></span>
                  <LogoWordmark direction={direction.id} />
                </div>
                <div className="favicon-preview-wrap">
                  <span className="favicon-caption">FAVICON</span>
                  <span className={`logo-preview-favicon mark-${direction.id}`} data-testid={`preview-favicon-${direction.id}`}><LogoMark direction={direction.id} size={28} /></span>
                </div>
              </div>
              <div className="direction-copy">
                <h2>{direction.name}</h2>
                <p>{direction.description}</p>
              </div>
            </article>
          ))}
        </div>
        <footer className="logo-review-footer">
          <span>Concept explorations</span>
          <Link href="/" className="footer-workspace-link" data-testid="link-footer-workspace">Return to your sketch →</Link>
        </footer>
      </section>
    </main>
  );
}

const queryClient = new QueryClient();
function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/sign-in/*?" component={SignInPage} /><Route path="/sign-up/*?" component={SignUpPage} /><Route path="/logo-options">{() => <LogoOptions directions={logoDirections} />}</Route><Route component={NotFound} /></Switch>;
}
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={350} skipDelayDuration={100}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <ErrorBoundary><AccountProvider><Router /></AccountProvider></ErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

function withSavedProject(history: Project[], project: Project): Project[] {
  const serializedProject = JSON.stringify(project);
  return [project, ...history.filter(saved => JSON.stringify(saved) !== serializedProject)];
}

type PdfOrientation = 'portrait' | 'landscape';

const PDF_SAFE_MARGIN_POINTS: Record<PdfSafeMargin, number> = {
  '0.25': 18,
  '0.5': 36,
  '0.75': 54,
};

function projectedStorageRisk(estimate: BrowserStorageEstimate, nextProject: Project, nextHistory: Project[]): number {
  const currentProjectBytes = (localStorage.getItem(STORE_KEY)?.length ?? 0) * 2;
  const currentHistoryBytes = (localStorage.getItem(PROJECT_HISTORY_KEY)?.length ?? 0) * 2;
  const nextProjectBytes = JSON.stringify(nextProject).length * 2;
  const nextHistoryBytes = JSON.stringify(nextHistory).length * 2;
  const localStorageDelta = nextProjectBytes - currentProjectBytes + nextHistoryBytes - currentHistoryBytes;
  const projectedLocalStorageBytes = Math.max(0, estimate.localStorageBytes + localStorageDelta);
  const risks = [projectedLocalStorageBytes / LOCAL_STORAGE_QUOTA_GUIDELINE_BYTES];
  if (estimate.usageBytes !== undefined && estimate.quotaBytes !== undefined && estimate.quotaBytes > 0) {
    const projectedBrowserUsage = Math.max(0, estimate.usageBytes + localStorageDelta);
    risks.push(projectedBrowserUsage / estimate.quotaBytes);
  }
  return Math.max(...risks);
}

function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${Math.ceil(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(1)} ${units[unit]}`;
}

function confirmHistoryWriteIfStorageIsLow(estimate: BrowserStorageEstimate | null, nextProject: Project, nextHistory: Project[]): boolean {
  if (!estimate) return true;
  const projectedRisk = projectedStorageRisk(estimate, nextProject, nextHistory);
  if (projectedRisk < STORAGE_WARNING_THRESHOLD) return true;
  const percent = Math.min(100, Math.round(projectedRisk * 100));
  return window.confirm(
    `Browser storage is nearing its estimated limit (about ${percent}% used after this change). Saving a recovery copy may fail. Make room in your browser storage before continuing if needed. CloudPainter will not delete any sketches. Continue?`,
  );
}

type BrowserStorageEstimate = { cloudPainterBytes: number; localStorageBytes: number; usageBytes?: number; quotaBytes?: number };

async function readBrowserStorageEstimate(): Promise<BrowserStorageEstimate | null> {
  let cloudPainterBytes = 0;
  let localStorageBytes = 0;
  try {
    const cloudPainterKeys = new Set([STORE_KEY, PREVIOUS_PROJECT_KEY, PROJECT_HISTORY_KEY]);
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key === null) continue;
      const value = localStorage.getItem(key) ?? '';
      const bytes = (key.length + value.length) * 2;
      localStorageBytes += bytes;
      if (cloudPainterKeys.has(key)) cloudPainterBytes += bytes;
    }
  } catch {
    return null;
  }
  let browserEstimate: { usage?: number; quota?: number } | undefined;
  try {
    browserEstimate = await navigator.storage?.estimate?.();
  } catch {
    // The localStorage estimate remains useful if the browser quota API is unavailable.
  }
  return {
    cloudPainterBytes,
    localStorageBytes,
    ...(typeof browserEstimate?.usage === 'number' ? { usageBytes: browserEstimate.usage } : {}),
    ...(typeof browserEstimate?.quota === 'number' ? { quotaBytes: browserEstimate.quota } : {}),
  };
}

const LOCAL_STORAGE_QUOTA_GUIDELINE_BYTES = 5 * 1024 * 1024;
