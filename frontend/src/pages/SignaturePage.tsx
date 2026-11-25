import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '../api/client';
import { useToast } from '../components/ui';
import { useSession } from '../session';

/** Draws an image onto a white-free PNG no wider than 600 px and returns base64 (no data: prefix). */
function toPng(source: CanvasImageSource, w: number, h: number): string {
  const scale = Math.min(1, 600 / w, 200 / h);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext('2d')!;
  ctx.drawImage(source, 0, 0, c.width, c.height);
  // Make near-white pixels transparent so the signature sits cleanly on the form line.
  const img = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    if ((img.data[i] ?? 0) > 225 && (img.data[i + 1] ?? 0) > 225 && (img.data[i + 2] ?? 0) > 225) img.data[i + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png').split(',')[1] ?? '';
}

export function SignaturePage() {
  const { boot, refreshMe } = useSession();
  const toast = useToast();
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const drew = useRef(false);

  useEffect(() => {
    api('api_mySignature').then((r) => setCurrent(r.pngBase64), (e) => setErr(errorText(e)));
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.width = r.width * 2;
    c.height = r.height * 2;
    const ctx = c.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b1f5c';
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(...pos(e));
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d')!;
    ctx.lineTo(...pos(e));
    ctx.stroke();
    drew.current = true;
  };
  const up = () => {
    drawing.current = false;
    if (drew.current && canvas.current) setDraft(toPng(canvas.current, canvas.current.width, canvas.current.height));
  };
  const clear = () => {
    const c = canvas.current;
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    drew.current = false;
    setDraft(null);
  };
  const upload = (file: File) => {
    const img = new Image();
    img.onload = () => setDraft(toPng(img, img.naturalWidth, img.naturalHeight));
    img.onerror = () => setErr('That file is not an image we can read. Use PNG or JPG.');
    img.src = URL.createObjectURL(file);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My signature</h1>
          <p>Your specimen signature is used only when you click E-sign. It is kept in a restricted folder that only the system can read.</p>
        </div>
      </div>
      {!boot.settings.esignEnabled && <div className="notice">E-signing is not switched on yet. You can still prepare your signature now.</div>}
      {err && <div className="form-err">{err}</div>}
      <div className="detail-grid">
        <div className="card card-pad">
          <h3 style={{ marginBottom: 8 }}>Draw or upload</h3>
          <canvas
            ref={canvas}
            className="sig-pad"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            aria-label="Signature pad: draw your signature here"
          />
          <div className="actions" style={{ marginTop: 10 }}>
            <button className="btn" onClick={clear}>
              Clear
            </button>
            <label className="btn">
              Upload a scanned signature
              <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            For an upload, sign in dark ink on white paper and crop close to the signature.
          </p>
        </div>
        <div className="card card-pad">
          <h3 style={{ marginBottom: 8 }}>{draft ? 'New signature' : 'On file'}</h3>
          {draft ? (
            <img className="sig-preview" src={`data:image/png;base64,${draft}`} alt="New signature preview" />
          ) : current ? (
            <img className="sig-preview" src={`data:image/png;base64,${current}`} alt="Signature on file" />
          ) : (
            <p className="muted">{current === undefined ? 'Loading…' : 'No signature on file yet.'}</p>
          )}
          {draft && (
            <div style={{ marginTop: 12 }}>
              <button
                className="btn primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api('api_uploadSignature', { pngBase64: draft });
                    setCurrent(draft);
                    setDraft(null);
                    clear();
                    toast('Signature saved.');
                    refreshMe();
                  } catch (e) {
                    setErr(errorText(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Saving…' : 'Save as my signature'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
