import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Upload, X } from "lucide-react";
import {
  getGetImageGenerationConfigQueryKey,
  upscalePoeImage,
  useGetImageGenerationConfig,
  type PoeUpscaleInput,
} from "@workspace/api-client-react";
import { buildPoeUpscalePrompt } from "@workspace/api-zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePaletteAccount } from "./Account";

type Props = {
  composeImage: () => Promise<Blob>;
  title: string;
  width: number;
  height: number;
};

type UpscaleOperation = {
  controller: AbortController;
  actor: string;
  phase: "preparing" | "sending";
  cancelled: boolean;
};

const MAX_UPSCALE_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_UPSCALE_BASE64_CHARS = Math.ceil(MAX_UPSCALE_IMAGE_BYTES / 3) * 4;
const INVALID_PNG_ERROR = "Poe did not return a valid PNG. No file was downloaded.";
const UPSCALE_SIZE_ERROR = "Poe returned an image outside the supported size limit. No file was downloaded.";

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not prepare the PNG for transfer."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not prepare the PNG for transfer."));
        return;
      }
      const comma = reader.result.indexOf(",");
      if (comma < 0) {
        reject(new Error("Could not prepare the PNG for transfer."));
        return;
      }
      resolve(reader.result.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function decodeUpscalePng(encoded: unknown): Uint8Array {
  if (typeof encoded === "string" && encoded.length > MAX_UPSCALE_BASE64_CHARS) {
    throw new Error(UPSCALE_SIZE_ERROR);
  }
  if (typeof encoded !== "string" || encoded.length === 0 || encoded.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error(INVALID_PNG_ERROR);
  }

  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new Error(INVALID_PNG_ERROR);
  }
  if (binary.length === 0) throw new Error(INVALID_PNG_ERROR);
  if (binary.length > MAX_UPSCALE_IMAGE_BYTES) throw new Error(UPSCALE_SIZE_ERROR);

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71
    || bytes[4] !== 13 || bytes[5] !== 10 || bytes[6] !== 26 || bytes[7] !== 10) {
    throw new Error(INVALID_PNG_ERROR);
  }
  return bytes;
}

function safeError(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  }
  return "Poe Assistant could not complete the upscale. It was not retried.";
}

export function PoeUpscaleExport({ composeImage, title, width, height }: Props) {
  const { userId, sessionId, isLoaded } = usePaletteAccount();
  const identity = `${userId ?? ""}:${sessionId ?? ""}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const operationRef = useRef<UpscaleOperation | null>(null);
  const [scale, setScale] = useState<PoeUpscaleInput["scale"]>(4);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const configuration = useGetImageGenerationConfig({
    query: {
      queryKey: [...getGetImageGenerationConfigQueryKey(), identity],
      enabled: isLoaded,
      staleTime: 0,
      refetchInterval: 30_000,
      retry: false,
    },
  });
  const signedIn = Boolean(userId);
  const configured = configuration.data?.configured === true;
  const prompt = buildPoeUpscalePrompt(scale);
  const eligible = Boolean(signedIn && configuration.data?.signedIn && configuration.data.allowed
    && configuration.data.remaining > 0 && configuration.data.globalRemaining > 0);
  const sizeSupported = width <= 2048 && height <= 2048
    && width * scale <= 8192 && height * scale <= 8192
    && width * height * scale ** 2 <= 20_000_000;

  function isCurrentOperation(operation: UpscaleOperation): boolean {
    return operationRef.current === operation
      && !operation.controller.signal.aborted
      && operation.actor === identityRef.current;
  }

  useEffect(() => {
    setStatus("");
    setError("");
    if (operationRef.current) {
      operationRef.current.cancelled = true;
      operationRef.current.controller.abort();
    }
    operationRef.current = null;
    setPending(false);
    setConfirmOpen(false);
  }, [identity]);
  useEffect(() => () => {
    if (operationRef.current) {
      operationRef.current.cancelled = true;
      operationRef.current.controller.abort();
      operationRef.current = null;
    }
  }, []);

  async function sendUpscale() {
    if (pending || !eligible || !configured || !sizeSupported) return;
    const operation: UpscaleOperation = {
      controller: new AbortController(),
      actor: identity,
      phase: "preparing",
      cancelled: false,
    };
    operationRef.current = operation;
    setPending(true);
    setError("");
    setStatus("Preparing the merged composition…");
    try {
      const blob = await composeImage();
      if (!isCurrentOperation(operation)) return;
      if (blob.type !== "image/png" || blob.size <= 0 || blob.size > 8 * 1024 * 1024) {
        throw new Error("The merged PNG is outside the supported size limit. No image was sent.");
      }
      const pngBase64 = await blobToBase64(blob);
      if (!isCurrentOperation(operation)) return;
      operation.phase = "sending";
      setStatus("Sending the merged image to Poe Assistant…");
      const result = await upscalePoeImage(
        { pngBase64, scale },
        { signal: operation.controller.signal },
      );
      if (!isCurrentOperation(operation)) return;
      if (!result || typeof result !== "object" || result.mime !== "image/png"
        || result.width !== width * scale || result.height !== height * scale) {
        throw new Error("Poe did not return a PNG at the exact requested dimensions. No file was downloaded.");
      }
      const bytes = decodeUpscalePng(result.b64_json);
      const imageBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(imageBuffer).set(bytes);
      const objectUrl = URL.createObjectURL(new Blob([imageBuffer], { type: "image/png" }));
      const link = document.createElement("a");
      const safeTitle = title.trim().replace(/[^\w-]+/g, "-") || "cloudpainter-idea";
      link.download = `${safeTitle}-assistant-${scale}x.png`;
      link.href = objectUrl;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      setStatus(`Upscaled PNG downloaded (${result.width} × ${result.height}).`);
      setConfirmOpen(false);
    } catch (caught) {
      if (!isCurrentOperation(operation)) return;
      setError(caught instanceof Error && !("data" in caught) ? caught.message : safeError(caught));
      setStatus("");
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = null;
        if (operation.actor === identityRef.current) setPending(false);
        if (!operation.cancelled || operation.phase === "sending") void configuration.refetch();
      }
    }
  }

  function cancel() {
    if (pending) {
      const operation = operationRef.current;
      if (operation) {
        operation.cancelled = true;
        operation.controller.abort();
        setStatus(operation.phase === "sending"
          ? "Request stopped. Poe may have charged points if processing had already started; it was not retried."
          : "Request stopped before sending.");
      }
    }
    setConfirmOpen(false);
  }

  return (
    <>
      <section className="upscale-export panel" aria-labelledby="upscale-export-title">
        <div className="upscale-export-copy">
          <h2 id="upscale-export-title">Poe Assistant upscale export</h2>
          {status && <p role="status" className="upscale-progress" data-testid="upscale-status">{status}</p>}
          {error && <p role="alert" className="upscale-error" data-testid="upscale-error">{error}</p>}
          {!sizeSupported && <p role="status">This composition is too large for {scale}× export. Output is limited to 8192 pixels per side and 20 megapixels; input is limited to 2048 pixels per side. Choose a smaller composition or scale.</p>}
          {!isLoaded && <p role="status">Checking account…</p>}
          {signedIn && configuration.data && !configuration.data.allowed && <p role="status">Poe image access is disabled for this account. Ask the project owner for help.</p>}
          {signedIn && configuration.data?.allowed && <p className="upscale-budget">
            {configuration.data.remaining} of {configuration.data.dailyLimit} account attempts and {configuration.data.globalRemaining} shared attempts remain today. These are request caps, not point estimates.
          </p>}
          {!configured && isLoaded && signedIn && <p role="status">{configuration.isLoading ? "Checking Poe connection…" : configuration.isError ? "Could not check Poe connection. Reopen this page to retry." : "Poe is not configured for this project."}</p>}
        </div>
        <div className="upscale-export-controls">
          <label className="upscale-size-control">
            <span>Upscale</span>
            <select aria-label="Poe Assistant upscale factor" data-testid="select-upscale-factor" value={scale}
              onChange={event => setScale(Number(event.target.value) as PoeUpscaleInput["scale"])} disabled={pending}>
              <option value={4}>4×</option>
              <option value={8}>8×</option>
            </select>
          </label>
          <button type="button" className="button" disabled={pending || !eligible || !configured || !sizeSupported}
            onClick={() => { setError(""); setConfirmOpen(true); }} data-testid="button-upscale-export">
            <Upload size={14} /> Review {scale}× export
          </button>
        </div>
      </section>
      <Dialog open={confirmOpen} onOpenChange={value => { if (!value) cancel(); else setConfirmOpen(true); }}>
        <DialogContent className="upscale-confirm">
          <DialogHeader>
            <DialogTitle>Send this composition to Poe?</DialogTitle>
            <DialogDescription>
              This sends the merged photo and visible layers to Poe Assistant and may use Poe points. Assistant chooses the provider. The prompt will be “{prompt}”. Continue only if you accept that.
            </DialogDescription>
          </DialogHeader>
          <p className="generation-disclosure">The result is accepted only as a readable PNG at exactly {width * scale} × {height * scale} pixels. Poe may still use points if it fails or is cancelled after processing starts.</p>
          <div className="upscale-confirm-actions">
            {pending ? (
              <button type="button" className="button button-quiet" onClick={cancel} data-testid="button-cancel-upscale">
                <X size={14} /> Stop request
              </button>
            ) : (
              <>
                <button type="button" className="button button-quiet" onClick={cancel}>Keep image in browser</button>
                <button type="button" className="button button-primary" onClick={() => void sendUpscale()} data-testid="button-confirm-upscale">
                  <Download size={14} /> Send and upscale
                </button>
              </>
            )}
            {pending && <span role="status"><Loader2 size={14} className="generation-spinner" /> Processing…</span>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
