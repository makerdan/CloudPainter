import { type ChangeEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CircleHelp,
  Cloud,
  Eye,
  EyeOff,
  Eraser,
  ImagePlus,
  Layers,
  Paintbrush,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { fitDimensionsWithinBounds, fitStageDimensions, getScaledImageDimensions } from '@/lib/imageDimensions';

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
  const fileInput = useRef<HTMLInputElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const [stageBounds, setStageBounds] = useState({ width: 0, height: 0 });
  const drawingRef = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const selectedLayer = project.layers.find(layer => layer.id === project.selectedLayerId) ?? project.layers[0];
  const visibleLayers = useMemo(() => [...project.layers].reverse(), [project.layers]);
  const stageSize = fitStageDimensions(
    project.width,
    project.height,
    stageBounds.width,
    Math.min(stageBounds.height, Math.max(1, window.innerHeight - 310)),
  );

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
    const rect = event.currentTarget.getBoundingClientRect();
    setDraft({
      layerId: layer.id,
      stroke: { points: [point], color, size: brushSize * (project.width / rect.width), tool },
    });
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
            <button className="button button-primary" onClick={exportPng} data-testid="button-export"><Upload size={14} /> Export PNG</button>
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
            <div className={`source-card ${project.image ? 'loaded' : ''}`}>
              {project.image ? (
                <>
                  <img src={project.image} alt="Your unchanged reference photo" data-testid="img-reference" />
                  <button className="icon-button" style={{ position: 'absolute', top: 6, right: 6, background: '#fbfaf6ed' }} aria-label="Remove photo" onClick={() => updateProject(current => ({ ...current, image: null }))} data-testid="button-remove-photo"><X size={14} /></button>
                </>
              ) : (
                <>
                  <span className="source-icon"><ImagePlus size={18} /></span>
                  <strong>Bring in a photograph</strong>
                  <span>JPG, PNG or another image</span>
                </>
              )}
            </div>
            <div className="source-actions">
              <button className="button" onClick={openPhoto} data-testid="button-upload"><Upload size={13} /> Upload photo</button>
              <button className="button" onClick={startBlank} data-testid="button-blank"><Plus size={13} /> Blank canvas</button>
              <input ref={fileInput} className="sr-only" type="file" accept="image/*" onChange={handleFile} data-testid="input-photo" />
            </div>

            <p className="section-label">Drawing layers <span className="panel-kicker"> · {project.layers.length}</span></p>
            <div className="layer-list">
              {visibleLayers.map((layer, index) => (
                <div key={layer.id} className={`layer-row ${selectedLayer?.id === layer.id ? 'active' : ''}`} data-testid={`layer-row-${layer.id}`}>
                  <button className="layer-select" onClick={() => updateProject(current => ({ ...current, selectedLayerId: layer.id }))} data-testid={`button-select-layer-${layer.id}`}>
                    <span className="layer-thumb"><Layers size={13} /></span>
                    {renamingId === layer.id ? (
                      <input className="rename-input" autoFocus value={renameValue} onChange={event => setRenameValue(event.target.value)} onBlur={saveLayerName} onKeyDown={event => { if (event.key === 'Enter') saveLayerName(); if (event.key === 'Escape') setRenamingId(null); }} onClick={event => event.stopPropagation()} aria-label="Rename layer" data-testid={`input-rename-${layer.id}`} />
                    ) : <span className="layer-name">{layer.name}</span>}
                  </button>
                  <button className="icon-button" aria-label={layer.visible ? 'Hide layer' : 'Show layer'} title={layer.visible ? 'Hide layer' : 'Show layer'} onClick={() => changeLayer(layer.id, current => ({ ...current, visible: !current.visible }))} data-testid={`button-visibility-${layer.id}`}>
                    {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button className="icon-button" aria-label="Rename layer" title="Rename layer" onClick={() => { setRenamingId(layer.id); setRenameValue(layer.name); }} data-testid={`button-rename-${layer.id}`}><span style={{ fontSize: 13, lineHeight: 1 }}>Aa</span></button>
                  <button className="icon-button layer-order" aria-label="Move layer up" title="Move layer up" onClick={() => moveLayer(layer.id, 1)} disabled={index === 0} data-testid={`button-layer-up-${layer.id}`}><ArrowUp size={13} /></button>
                  <button className="icon-button layer-order" aria-label="Move layer down" title="Move layer down" onClick={() => moveLayer(layer.id, -1)} disabled={index === visibleLayers.length - 1} data-testid={`button-layer-down-${layer.id}`}><ArrowDown size={13} /></button>
                  <button className="icon-button" aria-label="Delete layer" title="Delete layer" onClick={() => deleteLayer(layer.id)} data-testid={`button-delete-layer-${layer.id}`}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <button className="add-layer" onClick={addLayer} data-testid="button-add-layer"><Plus size={14} /> Add a drawing layer</button>
            <p className="layer-footnote">Your photograph stays safely underneath, unchanged. Drawings live on their own layers.</p>
          </aside>

          <section className="editor" aria-label="Drawing workspace">
            <div className="panel toolbar">
              <div className="tool-group">
                <button className={`tool-button ${tool === 'pen' ? 'selected' : ''}`} title="Pen" aria-label="Pen tool" onClick={() => setTool('pen')} data-testid="button-tool-pen"><Paintbrush size={17} /></button>
                <button className={`tool-button ${tool === 'eraser' ? 'selected' : ''}`} title="Eraser" aria-label="Eraser tool" onClick={() => setTool('eraser')} data-testid="button-tool-eraser"><Eraser size={17} /></button>
                <span className="tool-divider" />
                <button className="tool-button" title="Undo" aria-label="Undo" onClick={undo} disabled={!selectedLayer?.strokes.length} data-testid="button-undo"><Undo2 size={17} /></button>
                <button className="tool-button" title="Redo" aria-label="Redo" onClick={redo} disabled={!selectedLayer?.redo.length} data-testid="button-redo"><Redo2 size={17} /></button>
              </div>
              <div className="tool-group">
                <span className="canvas-meta">{project.width} × {project.height}</span>
                <button className="tool-button" title="Clear selected layer" aria-label="Clear selected layer" onClick={() => { if (selectedLayer) changeLayer(selectedLayer.id, layer => ({ ...layer, strokes: [], redo: [] })); }} data-testid="button-clear-layer"><RotateCcw size={15} /></button>
              </div>
            </div>

            <div className="panel stage-wrap" ref={stageWrapRef}>
              <div className="stage" style={{
                aspectRatio: `${project.width} / ${project.height}`,
                width: stageSize.width || undefined,
                height: stageSize.height || undefined,
              }} data-testid="canvas-stage">
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
              <span>{tool === 'pen' ? 'Draw over the photo; your original stays put.' : 'Erase only from the selected layer.'}</span>
            </div>
          </section>

          <aside className="panel right-panel">
            <div className="panel-title-row"><h2 className="panel-title">Brush & feel</h2><span className="panel-kicker">02</span></div>
            <div className="control-block">
              <div className="control-head"><span>Color</span><span className="control-value">{tool === 'eraser' ? 'ERASER' : 'INK'}</span></div>
              <div className="color-row">
                {PALETTE.map((swatch, index) => <button key={swatch} className={`swatch ${color === swatch ? 'active' : ''}`} style={{ background: swatch }} aria-label={`Choose color ${index + 1}`} onClick={() => { setColor(swatch); setTool('pen'); }} data-testid={`button-color-${index + 1}`} />)}
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

const queryClient = new QueryClient();
function Router() {
  return <Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch>;
}
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <ErrorBoundary><Router /></ErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
