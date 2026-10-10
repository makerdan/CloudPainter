import { type ChangeEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CircleHelp,
  Cloud,
  Eye,
  EyeOff,
  Eraser,
  Hand,
  ImagePlus,
  Layers,
  Paintbrush,
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
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { fitDimensionsWithinBounds, fitStageDimensions, getScaledImageDimensions } from '@/lib/imageDimensions';
import { ImageGenerator } from '@/components/ImageGenerator';

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; size: number; tool: 'pen' | 'eraser' };
type PaintLayer = {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  strokes: Stroke[];
  redo: Stroke[];
};
type Project = {
  image: string | null;
  width: number;
  height: number;
  layers: PaintLayer[];
  selectedLayerId: string;
  title: string;
};

const STORE_KEY = 'cloudpainter-project-v1';
const PALETTE = ['#315d4d', '#ee806b', '#e3ad3b', '#6d86a3', '#8b72a6', '#e6c9a9'];
const id = () => `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const createLayer = (name: string): PaintLayer => ({
  id: id(), name, visible: true, opacity: 1, strokes: [], redo: [],
});
const freshProject = (): Project => {
  const layer = createLayer('Layer 1');
  return { image: null, width: 1200, height: 800, layers: [layer], selectedLayerId: layer.id, title: 'Untitled idea' };
};

function readProject(): Project {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) {
      const project = JSON.parse(saved) as Project;
      if (project && Array.isArray(project.layers) && project.layers.length) return project;
    }
  } catch {
    // Corrupt or unavailable browser storage starts a fresh local project.
  }
  return freshProject();
}

function Home() {
  const [project, setProject] = useState<Project>(readProject);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState(PALETTE[0]);
  const [brushSize, setBrushSize] = useState(8);
  const [draft, setDraft] = useState<{ layerId: string; stroke: Stroke } | null>(null);
  const [savedStatus, setSavedStatus] = useState('Saved in this browser');
  const [toast, setToast] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoPan, setPhotoPan] = useState({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const [stageBounds, setStageBounds] = useState({ width: 0, height: 0 });
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
    setPhotoPan(current => clampPhotoPan(current));
  }, [stageSize.width, stageSize.height, photoZoom]);

  const announce = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  }, []);

  useEffect(() => {
    setSavedStatus('Saving…');
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(project));
        setSavedStatus('Saved in this browser');
      } catch {
        setSavedStatus('Storage is full');
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [project]);

  const renderStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (!stroke.points.length) return;
    ctx.save();
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const first = stroke.points[0];
    if (stroke.points.length === 1) {
      ctx.beginPath();
      ctx.arc(first.x * project.width, first.y * project.height, stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(first.x * project.width, first.y * project.height);
      stroke.points.slice(1).forEach(point => ctx.lineTo(point.x * project.width, point.y * project.height));
      ctx.stroke();
    }
    ctx.restore();
  }, [project.width, project.height]);

  useEffect(() => {
    project.layers.forEach(layer => {
      const canvas = canvasRefs.current[layer.id];
      if (!canvas) return;
      if (canvas.width !== project.width) canvas.width = project.width;
      if (canvas.height !== project.height) canvas.height = project.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.clearRect(0, 0, project.width, project.height);
      layer.strokes.forEach(stroke => renderStroke(context, stroke));
      if (draft?.layerId === layer.id) renderStroke(context, draft.stroke);
    });
  }, [project.layers, project.width, project.height, draft, renderStroke]);

  const updateProject = (updater: (current: Project) => Project) => setProject(current => updater(current));
  const changeLayer = (layerId: string, updater: (layer: PaintLayer) => PaintLayer) => {
    updateProject(current => ({ ...current, layers: current.layers.map(layer => layer.id === layerId ? updater(layer) : layer) }));
  };

  const openPhoto = () => fileInput.current?.click();
  const useGeneratedReference = (source: string, prompt: string): Promise<void> => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const { width, height } = getScaledImageDimensions(image.naturalWidth, image.naturalHeight);
      const layer = createLayer('Sketch layer');
      setPhotoZoom(1);
      setPhotoPan({ x: 0, y: 0 });
      setPanMode(false);
      setProject({
        image: source, width, height, layers: [layer], selectedLayerId: layer.id,
        title: prompt.slice(0, 42) || 'Generated idea',
      });
      announce('Generated image added. You can now sketch over it.');
      resolve();
    };
    image.onerror = () => reject(new Error('Generated image could not be opened.'));
    image.src = source;
  });
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
        setPhotoZoom(1);
        setPhotoPan({ x: 0, y: 0 });
        setPanMode(false);
        setProject(current => ({
          ...current, image: String(reader.result), width, height,
          layers: [layer], selectedLayerId: layer.id,
          title: file.name.replace(/\.[^.]+$/, '').slice(0, 42) || 'Untitled idea',
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
    const layer = createLayer('Layer 1');
    setPhotoZoom(1);
    setPhotoPan({ x: 0, y: 0 });
    setPanMode(false);
    setProject(current => ({ ...current, image: null, width: 1200, height: 800, layers: [layer], selectedLayerId: layer.id, title: 'Untitled idea' }));
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
      stroke: { points: [point], color, size: brushSize * (project.width / stageSize.width), tool },
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
    setPhotoZoom(nextZoom);
    setPhotoPan(clampPhotoPan(nextPan, nextZoom));
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
      setPhotoPan(clampPhotoPan({
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
    setDraft(current => current ? { ...current, stroke: { ...current.stroke, points: [...current.stroke.points, point] } } : current);
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
    changeLayer(selectedLayer.id, layer => ({
      ...layer, strokes: layer.strokes.slice(0, -1), redo: [...layer.redo, layer.strokes[layer.strokes.length - 1]],
    }));
  };
  const redo = () => {
    if (!selectedLayer?.redo.length) return;
    changeLayer(selectedLayer.id, layer => ({
      ...layer, strokes: [...layer.strokes, layer.redo[layer.redo.length - 1]], redo: layer.redo.slice(0, -1),
    }));
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
    setPhotoZoom(1);
    setPhotoPan({ x: 0, y: 0 });
    setPanMode(false);
  };
  const changePhotoZoom = (value: number) => {
    const nextZoom = Math.max(1, Math.min(4, value));
    setPhotoZoom(nextZoom);
    setPhotoPan(current => clampPhotoPan(current, nextZoom));
    if (nextZoom === 1) setPanMode(false);
  };

  const exportPng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = project.width;
    canvas.height = project.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    const finish = () => {
      project.layers.forEach(layer => {
        if (!layer.visible) return;
        const source = canvasRefs.current[layer.id];
        if (!source) return;
        context.globalAlpha = layer.opacity;
        context.drawImage(source, 0, 0);
      });
      context.globalAlpha = 1;
      const link = document.createElement('a');
      link.download = `${project.title.trim().replace(/[^\w-]+/g, '-') || 'cloudpainter-idea'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      announce('PNG exported. Your browser saved the finished composition.');
    };
    if (project.image) {
      const photo = new Image();
      photo.onload = () => {
        const imageSize = fitDimensionsWithinBounds(photo.naturalWidth, photo.naturalHeight, project.width, project.height);
        const x = (project.width - imageSize.width) / 2;
        const y = (project.height - imageSize.height) / 2;
        context.drawImage(photo, x, y, imageSize.width, imageSize.height);
        finish();
      };
      photo.onerror = () => finish();
      photo.src = project.image;
    } else {
      finish();
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT') return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
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
          <span className="privacy-note"><Save size={13} /> Projects and photos stay in this browser</span>
          <span className="save-state" data-testid="status-save">{savedStatus}</span>
          <div className="top-actions">
              <ActionTooltip description="View five CloudPainter logo design directions."><Link href="/logo-options" className="button button-quiet logo-options-link" data-testid="link-logo-options">Logo directions</Link></ActionTooltip>
            <TooltipButton description="Export the reference photo and visible drawing layers as a PNG." className="button button-primary" onClick={exportPng} data-testid="button-export"><Upload size={14} /> Export PNG</TooltipButton>
          </div>
        </div>
      </header>

      <section className="workspace">
        <div className="intro-row">
          <div>
            <p className="eyebrow">A little room for what you see</p>
            <h1>Find a shape. Follow it.</h1>
            <p className="intro-copy">Start with a photo, spot something surprising, then sketch it into being.</p>
          </div>
          <div className="save-state">LOCAL PROJECT · AUTOSAVED</div>
        </div>

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
            <p className="layer-footnote">Your photograph stays safely underneath, unchanged. Drawings live on their own layers.</p>
          </aside>

          <section className="editor" aria-label="Drawing workspace">
            <div className="panel toolbar">
              <div className="tool-group">
                <TooltipButton description="Draw strokes on the selected visible layer using the current color and brush size." className={`tool-button ${tool === 'pen' ? 'selected' : ''}`} aria-label="Pen tool" onClick={() => setTool('pen')} data-testid="button-tool-pen"><Paintbrush size={17} /></TooltipButton>
                <TooltipButton description="Erase drawings from the selected visible layer without changing the photo or other layers." className={`tool-button ${tool === 'eraser' ? 'selected' : ''}`} aria-label="Eraser tool" onClick={() => setTool('eraser')} data-testid="button-tool-eraser"><Eraser size={17} /></TooltipButton>
                <span className="tool-divider" />
                <TooltipButton description={selectedLayer?.strokes.length ? 'Undo the most recent drawing or erasing stroke on the selected layer.' : 'Nothing to undo: the selected layer has no strokes.'} className="tool-button" aria-label="Undo" onClick={undo} disabled={!selectedLayer?.strokes.length} data-testid="button-undo"><Undo2 size={17} /></TooltipButton>
                <TooltipButton description={selectedLayer?.redo.length ? 'Restore the last undone stroke on the selected layer.' : 'Nothing to redo: undo a stroke on the selected layer first.'} className="tool-button" aria-label="Redo" onClick={redo} disabled={!selectedLayer?.redo.length} data-testid="button-redo"><Redo2 size={17} /></TooltipButton>
              </div>
              <div className="tool-group">
                <span className="canvas-meta">{project.width} × {project.height}</span>
                <TooltipButton description="Remove all drawings and undo/redo history from the selected layer; keep the photo and other layers." className="tool-button" aria-label="Clear selected layer" onClick={() => { if (selectedLayer) changeLayer(selectedLayer.id, layer => ({ ...layer, strokes: [], redo: [] })); }} data-testid="button-clear-layer"><RotateCcw size={15} /></TooltipButton>
              </div>
            </div>

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
                      style={{ zIndex: index + 1, opacity: layer.visible ? layer.opacity : 0, pointerEvents: layer.id === project.selectedLayerId && layer.visible ? 'auto' : 'none' }}
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
              <span>{panMode ? 'Drag the photo to reposition it; your drawing stays unchanged.' : tool === 'pen' ? 'Draw over the photo; your original stays put.' : 'Erase only from the selected layer.'}</span>
            </div>
          </section>

          <aside className="panel right-panel">
            <div className="panel-title-row"><h2 className="panel-title">Brush & feel</h2><span className="panel-kicker">02</span></div>
            <div className="control-block">
              <div className="control-head"><span>Color</span><span className="control-value">{tool === 'eraser' ? 'ERASER' : 'INK'}</span></div>
              <div className="color-row">
                {PALETTE.map((swatch, index) => <TooltipButton key={swatch} description={`${color === swatch && tool === 'pen' ? 'Current drawing color' : 'Use drawing color'} ${swatch.toUpperCase()}${tool === 'eraser' ? ' and switch from erasing to drawing' : ''}.`} className={`swatch ${color === swatch ? 'active' : ''}`} style={{ background: swatch }} aria-label={`Choose color ${index + 1} (${swatch.toUpperCase()})`} onClick={() => { setColor(swatch); setTool('pen'); }} data-testid={`button-color-${index + 1}`} />)}
                <label className="color-custom" aria-label="Choose custom color"><Plus size={14} /><input type="color" value={color} onChange={event => { setColor(event.target.value); setTool('pen'); }} data-testid="input-color-custom" /></label>
              </div>
            </div>
            <div className="control-block">
              <div className="control-head"><span>Brush size</span><span className="control-value">{brushSize} px</span></div>
              <input className="range-input" type="range" min="1" max="48" value={brushSize} onChange={event => setBrushSize(Number(event.target.value))} aria-label="Brush size" data-testid="input-brush-size" />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9aa097', fontSize: 9, marginTop: 7 }}><span>Fine</span><span>Bold</span></div>
            </div>
            <div className="control-block">
              <div className="control-head"><span>Layer opacity</span><span className="control-value">{Math.round((selectedLayer?.opacity ?? 1) * 100)}%</span></div>
              <input className="range-input" type="range" min="0" max="100" value={Math.round((selectedLayer?.opacity ?? 1) * 100)} onChange={event => selectedLayer && changeLayer(selectedLayer.id, layer => ({ ...layer, opacity: Number(event.target.value) / 100 }))} aria-label="Layer opacity" data-testid="input-layer-opacity" />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9aa097', fontSize: 9, marginTop: 7 }}><span>Ghostly</span><span>Full ink</span></div>
            </div>
            <div className="tool-tip-card">
              <div className="tip-title"><CircleHelp size={14} /> A small reminder</div>
              <p>Sketch a shape you notice. Keep the photo as your guide, then hide it when you want to see your drawing on its own.</p>
            </div>
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

function LogoOptions() {
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
        <div className="logo-directions" data-testid="logo-options-list">
          {logoDirections.map((direction, index) => (
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
  return <Switch><Route path="/" component={Home} /><Route path="/logo-options" component={LogoOptions} /><Route component={NotFound} /></Switch>;
}
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={350} skipDelayDuration={100}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <ErrorBoundary><Router /></ErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
