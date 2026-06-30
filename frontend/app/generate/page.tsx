"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Expand, Heart, RefreshCw, Save, WandSparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api, GeneratedImage, Generation } from "@/lib/api";

type DownloadFormat = "png" | "jpeg" | "webp";
type ProgressStep = "idle" | "limit" | "prompt" | "generate" | "save";
type SizeMode = "preset" | "custom";

const aspectRatios = ["16:9", "1:1", "4:5", "9:16"];
const sizeModes: SizeMode[] = ["preset", "custom"];
const modes = ["Fast", "Premium", "Realistic", "Illustration"];
const variationOptions = [1, 2, 4];

const progressLabels: Record<ProgressStep, string> = {
  idle: "Ready",
  limit: "Checking limit",
  prompt: "Enhancing prompt",
  generate: "Generating images",
  save: "Saving library"
};

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [sizeMode, setSizeMode] = useState<"preset" | "custom">("preset");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);
  const [variations, setVariations] = useState(1);
  const [mode, setMode] = useState("Fast");
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [progress, setProgress] = useState<ProgressStep>("idle");
  const [copied, setCopied] = useState(false);
  const refinementRef = useRef<HTMLTextAreaElement | null>(null);

  const cost = useMemo(() => Number(generation?.estimated_cost || 0).toFixed(2), [generation]);
  const selectedSize = sizeMode === "custom" ? `Custom ${customWidth}x${customHeight} px` : aspectRatio;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    setProgress("limit");
    try {
      await pause(250);
      setProgress("prompt");
      await pause(250);
      setProgress("generate");
      const result = await api.generate({ prompt, aspect_ratio: selectedSize, variations, mode });
      setProgress("save");
      setGeneration(result.generation);
      setImages(result.images);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
      setProgress("idle");
    }
  }

  async function imageAction(image: GeneratedImage, actionType: "download_image" | "save_image" | "favorite_image") {
    const updated = await api.imageAction(image.id, actionType);
    setImages((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    if (selectedImage?.id === updated.id) setSelectedImage(updated);
  }

  async function downloadImage(image: GeneratedImage, format: DownloadFormat) {
    try {
      const blob = await api.downloadImage(image.id, format);
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `prezlab-${image.id}.${format}`);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setImages((items) => items.map((item) => (item.id === image.id ? { ...item, downloaded_count: (item.downloaded_count || 0) + 1 } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function refineSelected(event: FormEvent) {
    event.preventDefault();
    if (!selectedImage || !generation) return;
    setError("");
    setRefining(true);
    try {
      const result = await api.refine({
        parent_generation_id: generation.id,
        parent_image_id: selectedImage.id,
        prompt,
        refinement_prompt: refinementPrompt,
        aspect_ratio: selectedSize,
        variations,
        mode
      });
      setGeneration(result.generation);
      setImages(result.images);
      setSelectedImage(result.images[0] || null);
      setRefinementPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refinement failed");
    } finally {
      setRefining(false);
    }
  }

  function openRefine(image: GeneratedImage) {
    setSelectedImage(image);
    window.setTimeout(() => refinementRef.current?.focus(), 80);
  }

  useEffect(() => {
    if (selectedImage) refinementRef.current?.focus();
  }, [selectedImage]);

  function enhancePrompt() {
    const additions = [
      "Style: polished, high-end, presentation-ready.",
      `Composition: ${selectedSize} layout with a clear focal point and controlled negative space.`,
      "Lighting: refined professional lighting with natural depth.",
      "Avoid: confidential details, client logos, distorted text, clutter, and unrealistic hands."
    ];
    setPrompt((value) => `${value.trim()}\n\n${additions.join("\n")}`.trim());
  }

  async function copyEnhancedPrompt() {
    if (!generation?.enhanced_prompt) return;
    await navigator.clipboard.writeText(generation.enhanced_prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <AppShell>
      <header className="page-header generate-header">
        <div>
          <h1 className="page-title">Generate images</h1>
          <div className="muted">Create production-ready visuals, refine directions, and export formats for creative workflows.</div>
        </div>
        <div className="status-pill">{loading ? progressLabels[progress] : "Ready"}</div>
      </header>

      <section className="generate-workspace">
        <form className="panel prompt-panel form" onSubmit={submit}>
          <div className="field">
            <div className="field-header">
              <label htmlFor="prompt">Prompt</label>
              <button className="text-button" onClick={enhancePrompt} type="button">
                <WandSparkles size={15} />
                Enhance
              </button>
            </div>
            <textarea className="textarea prompt-textarea" id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} required />
            <div className="warning">Do not include confidential client information unless approved.</div>
          </div>

          <SegmentedControl label="Size mode" options={sizeModes} value={sizeMode} onChange={setSizeMode} />
          {sizeMode === "preset" ? (
            <SegmentedControl label="Aspect ratio" options={aspectRatios} value={aspectRatio} onChange={setAspectRatio} />
          ) : (
            <div className="field">
              <label>Custom size</label>
              <div className="custom-size-grid">
                <label className="size-input">
                  <span>Width</span>
                  <input
                    className="input"
                    min={256}
                    max={4096}
                    step={8}
                    type="number"
                    value={customWidth}
                    onChange={(event) => setCustomWidth(clampDimension(event.target.value, 1920))}
                  />
                </label>
                <label className="size-input">
                  <span>Height</span>
                  <input
                    className="input"
                    min={256}
                    max={4096}
                    step={8}
                    type="number"
                    value={customHeight}
                    onChange={(event) => setCustomHeight(clampDimension(event.target.value, 1080))}
                  />
                </label>
              </div>
              <div className="muted small-note">Custom size is sent to Gemini as creative direction and saved with the generation.</div>
            </div>
          )}
          <SegmentedControl label="Variations" options={variationOptions} value={variations} onChange={setVariations} />
          <SegmentedControl label="Mode" options={modes} value={mode} onChange={setMode} />

          {loading ? (
            <div className="progress-list">
              {(["limit", "prompt", "generate", "save"] as ProgressStep[]).map((step) => (
                <div className={progress === step ? "progress-step active" : "progress-step"} key={step}>
                  <span />
                  {progressLabels[step]}
                </div>
              ))}
            </div>
          ) : null}

          {error ? <div className="error">{error}</div> : null}
          <button className="primary-button generate-button" disabled={loading} type="submit">
            <WandSparkles size={18} />
            {loading ? "Generating..." : "Generate"}
          </button>
        </form>

        <section className="results-panel">
          <div className="results-toolbar">
            <div>
              <h2>Results</h2>
              <div className="muted">
                {generation ? `Generation ${shortId(generation.id)} · ${generation.mode} · ${generation.aspect_ratio} · estimated $${cost}` : "Generated images will appear here."}
              </div>
            </div>
            {generation?.enhanced_prompt ? (
              <button className="secondary-button" onClick={copyEnhancedPrompt} type="button">
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy prompt"}
              </button>
            ) : null}
          </div>

          {images.length ? (
            <div className="image-grid gallery-grid">
              {images.map((image) => (
                <article className="image-card gallery-card" key={image.id}>
                  <button className="image-preview-button" onClick={() => setSelectedImage(image)} type="button">
                    <img alt="Generated output" crossOrigin="anonymous" src={image.image_url} />
                  </button>
                  <div className="image-card-footer">
                    <div>
                      <strong>{shortId(image.id)}</strong>
                      <div className="muted">{image.downloaded_count || 0} downloads</div>
                    </div>
                    <button className="icon-button" title="Preview" onClick={() => setSelectedImage(image)} type="button">
                      <Expand size={18} />
                    </button>
                  </div>
                  <ImageActions image={image} onAction={imageAction} onDownload={downloadImage} onRefine={openRefine} />
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state results-empty">
              <div>
                <strong>No images yet</strong>
                <p>Write a prompt, choose a preset ratio or custom size, then generate one to four variations.</p>
              </div>
            </div>
          )}
        </section>
      </section>

      {selectedImage ? (
        <div className="modal-backdrop" onClick={() => setSelectedImage(null)}>
          <section className="image-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-image-wrap">
              <img alt="Selected generated output" crossOrigin="anonymous" src={selectedImage.image_url} />
            </div>
            <aside className="modal-side">
              <div>
                <h2>Review image</h2>
                <p className="muted">Save, favorite, export, or generate a refined version from this image.</p>
              </div>
              <ImageActions image={selectedImage} onAction={imageAction} onDownload={downloadImage} onRefine={openRefine} />
              <form className="form" onSubmit={refineSelected}>
                <div className="field">
                  <label htmlFor="refinement">Refine this image</label>
                  <textarea
                    className="textarea refine-textarea"
                    id="refinement"
                    ref={refinementRef}
                    value={refinementPrompt}
                    onChange={(event) => setRefinementPrompt(event.target.value)}
                    placeholder="Adjust lighting, remove clutter, change mood, improve composition..."
                    required
                  />
                </div>
                <button className="primary-button" disabled={refining} type="submit">
                  <RefreshCw size={18} />
                  {refining ? "Refining..." : "Refine"}
                </button>
              </form>
              <button className="secondary-button" onClick={() => setSelectedImage(null)} type="button">Close</button>
            </aside>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}

function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="segmented-control">
        {options.map((option) => (
          <button className={option === value ? "segment active" : "segment"} key={option} onClick={() => onChange(option)} type="button">
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function ImageActions({
  image,
  onAction,
  onDownload,
  onRefine
}: {
  image: GeneratedImage;
  onAction: (image: GeneratedImage, actionType: "download_image" | "save_image" | "favorite_image") => Promise<void>;
  onDownload: (image: GeneratedImage, format: DownloadFormat) => Promise<void>;
  onRefine: (image: GeneratedImage) => void;
}) {
  const [format, setFormat] = useState<DownloadFormat>("png");

  return (
    <div className="image-actions image-actions-expanded">
      <button className={image.is_saved ? "action-button active" : "action-button"} onClick={() => onAction(image, "save_image")} type="button">
        <Save size={17} />
        Save
      </button>
      <button className={image.is_favorite ? "action-button active" : "action-button"} onClick={() => onAction(image, "favorite_image")} type="button">
        <Heart size={17} />
        Favorite
      </button>
      <button className="action-button" onClick={() => onRefine(image)} type="button">
        <RefreshCw size={17} />
        Refine
      </button>
      <div className="download-control">
        <select className="format-select" value={format} onChange={(event) => setFormat(event.target.value as DownloadFormat)}>
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
        <button className="action-button" onClick={() => onDownload(image, format)} type="button">
          <Download size={17} />
          Download
        </button>
      </div>
    </div>
  );
}

function pause(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clampDimension(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(4096, Math.max(256, Math.round(parsed)));
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
