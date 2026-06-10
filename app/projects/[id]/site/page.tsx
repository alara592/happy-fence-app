"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { useCached, load } from "@/lib/cache";
import { compressImage } from "@/lib/image";

interface Photo {
  id: string;
  caption: string | null;
  url: string | null;
  created_at: string;
}
interface Bundle {
  project: { client: string; address: string | null; notes: string | null };
  photos: Photo[];
}

/** Screen — Site: internal photos + job notes for a project (Direction B). */
export default function SitePage() {
  const { id } = useParams<{ id: string }>();
  const bundleKey = `/api/projects/${id}`;
  const { data: b, error: loadError } = useCached<Bundle>(bundleKey);
  const reload = () => load<Bundle>(bundleKey).catch(() => {});

  const [notes, setNotes] = useState("");
  const [notesSeeded, setNotesSeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [viewer, setViewer] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Seed the notes box once from the bundle (don't clobber in-progress typing on revalidate).
  useEffect(() => {
    if (b && !notesSeeded) {
      setNotes(b.project.notes ?? "");
      setNotesSeeded(true);
    }
  }, [b, notesSeeded]);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 1600);
  }

  async function saveNotes() {
    if (!b || (b.project.notes ?? "") === notes) return;
    try {
      await api(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ notes }) });
      await reload();
      flash("Saved ✓");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const dataUrl = await compressImage(file);
      await api(`/api/projects/${id}/photos`, { method: "POST", body: JSON.stringify({ dataUrl }) });
      await reload();
      flash("Photo added ✓");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCaption(photoId: string, caption: string) {
    try {
      await api(`/api/projects/${id}/photos/${photoId}`, {
        method: "PATCH",
        body: JSON.stringify({ caption }),
      });
      setViewer(null);
      await reload();
      flash("Caption saved ✓");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deletePhoto(photoId: string) {
    try {
      await api(`/api/projects/${id}/photos/${photoId}`, { method: "DELETE" });
      setViewer(null);
      await reload();
      flash("Photo deleted");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loadError && !b)
    return (
      <>
        <p><Link href={`/projects/${id}`}>‹ Project</Link></p>
        <p className="error">{loadError.message}</p>
      </>
    );
  if (!b) return <p className="muted">Loading…</p>;

  const photos = b.photos;

  return (
    <>
      {toast && <div className="toast">{toast}</div>}

      <div className="site-head">
        <Link href={`/projects/${id}`} aria-label="Back to project">
          <button className="back-chip">‹</button>
        </Link>
        <div style={{ flex: 1 }}>
          <div className="site-ttl">Site — {b.project.client}</div>
          {b.project.address && <div className="muted">{b.project.address}</div>}
        </div>
      </div>

      <label htmlFor="site-notes">Job notes</label>
      <textarea
        id="site-notes"
        value={notes}
        placeholder="Old fence to remove, gate location, slopes, utilities, access…"
        onChange={(e) => setNotes(e.target.value)}
        onBlur={saveNotes}
        style={{ minHeight: 90 }}
      />

      <h2 style={{ marginTop: 18 }}>Photos ({photos.length})</h2>
      {error && <p className="error">{error}</p>}
      {photos.length === 0 && <p className="muted">No photos yet — tap “Add Photo”.</p>}

      <div className="gal">
        {photos.map((ph, i) => (
          <button key={ph.id} className="g" onClick={() => setViewer(i)}>
            {ph.url ? <img src={ph.url} alt={ph.caption ?? "Site photo"} /> : <span className="muted">…</span>}
            {ph.caption && <span className="cap">{ph.caption}</span>}
          </button>
        ))}
      </div>

      <div style={{ height: 84 }} />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onPick}
      />
      <button className="fab" onClick={() => fileRef.current?.click()} disabled={busy}>
        <span className="ic">📷</span>
        {busy ? "Uploading…" : "Add Photo"}
      </button>

      {viewer !== null && photos[viewer] && (
        <PhotoViewer
          key={photos[viewer].id}
          photo={photos[viewer]}
          index={viewer}
          count={photos.length}
          onClose={() => setViewer(null)}
          onSaveCaption={(c) => saveCaption(photos[viewer].id, c)}
          onDelete={() => deletePhoto(photos[viewer].id)}
        />
      )}
    </>
  );
}

function PhotoViewer({
  photo,
  index,
  count,
  onClose,
  onSaveCaption,
  onDelete,
}: {
  photo: Photo;
  index: number;
  count: number;
  onClose: () => void;
  onSaveCaption: (caption: string) => void;
  onDelete: () => void;
}) {
  const [caption, setCaption] = useState(photo.caption ?? "");

  return (
    <div className="viewer">
      <div className="v-top">
        <button className="x" onClick={onClose} aria-label="Close">✕</button>
        <span className="count">{index + 1} / {count}</span>
        <span style={{ width: 20 }} />
      </div>
      <div className="v-img">
        {photo.url && <img src={photo.url} alt={photo.caption ?? "Site photo"} />}
      </div>
      <div className="v-bottom">
        <div className="clab">Caption</div>
        <textarea
          value={caption}
          placeholder="Describe this photo…"
          onChange={(e) => setCaption(e.target.value)}
        />
        <div className="v-actions">
          <button className="del" onClick={onDelete}>Delete</button>
          <button className="save" onClick={() => onSaveCaption(caption)}>Save caption</button>
        </div>
      </div>
    </div>
  );
}
