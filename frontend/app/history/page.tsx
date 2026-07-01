"use client";

import { FormEvent, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { api, GeneratedImage, Generation } from "@/lib/api";

export default function HistoryPage() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refiningId, setRefiningId] = useState("");
  const [refinementPrompt, setRefinementPrompt] = useState("");

  async function load() {
    setLoading(true);
    try {
      const result = await api.history();
      setGenerations(result.generations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function action(image: GeneratedImage) {
    await api.imageAction(image.id, "download_image");
    window.open(image.image_url, "_blank", "noopener,noreferrer");
    await load();
  }

  async function refine(event: FormEvent, generation: Generation) {
    event.preventDefault();
    const firstImage = generation.generated_images?.[0];
    setRefiningId(generation.id);
    try {
      await api.refine({
        parent_generation_id: generation.id,
        parent_image_id: firstImage?.id,
        prompt: generation.original_prompt,
        refinement_prompt: refinementPrompt,
        aspect_ratio: generation.aspect_ratio,
        variations: generation.number_of_variations,
        mode: generation.mode
      });
      setRefinementPrompt("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refinement failed");
    } finally {
      setRefiningId("");
    }
  }

  return (
    <AppShell>
      <header className="page-header">
        <div>
          <h1 className="page-title">History</h1>
          <div className="muted">Review past generations and create refinements.</div>
        </div>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {loading ? <div className="empty-state">Loading history...</div> : null}
      {!loading && !generations.length ? <div className="empty-state">No generations yet.</div> : null}
      <section className="history-list">
        {generations.map((generation) => (
          <article className="history-item" key={generation.id}>
            <div className="history-top">
              <div>
                <strong>{generation.original_prompt}</strong>
                <div className="muted">{new Date(generation.created_at).toLocaleString()}</div>
              </div>
              <span className="badge">{generation.status}</span>
            </div>
            <div className="image-grid">
              {(generation.generated_images || []).map((image) => (
                <div className="image-card" key={image.id}>
                  <img alt="Generated output" src={image.image_url} />
                  <div className="image-actions">
                    <button className="icon-button" title="Download" onClick={() => action(image)} type="button"><Download size={18} /></button>
                  </div>
                </div>
              ))}
            </div>
            <form className="form" onSubmit={(event) => refine(event, generation)} style={{ marginTop: 14 }}>
              <div className="field">
                <label htmlFor={`refine-${generation.id}`}>Refine prompt</label>
                <input
                  className="input"
                  id={`refine-${generation.id}`}
                  value={refiningId === generation.id ? refinementPrompt : refinementPrompt}
                  onChange={(event) => setRefinementPrompt(event.target.value)}
                  placeholder="Adjust lighting, composition, style, or subject details"
                  required
                />
              </div>
              <button className="secondary-button" disabled={Boolean(refiningId)} type="submit">
                <RefreshCw size={18} />
                {refiningId === generation.id ? "Refining..." : "Refine"}
              </button>
            </form>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
