import { useCallback, useEffect, useRef, useState } from "react";

const DURATION_SECONDS = 15;
const FPS = 60;

export default function Home() {
  const canvasRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [status, setStatus] = useState("Idle");
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const audioOutRef = useRef(null);
  const startTimeRef = useRef(0);
  const rafRef = useRef(0);

  const setupAudio = useCallback(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();
    const destination = audioCtx.createMediaStreamDestination();
    audioCtxRef.current = audioCtx;
    audioOutRef.current = destination;
    return { audioCtx, destination };
  }, []);

  const scheduleBeat = useCallback((audioCtx) => {
    const bpm = 112; // industrial, restrained
    const beatInterval = 60 / bpm; // quarter note in seconds
    const startAt = audioCtx.currentTime;
    const endAt = startAt + DURATION_SECONDS + 0.25;

    function kick(time) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.16);
      gain.gain.setValueAtTime(0.9, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
      osc.connect(gain).connect(audioOutRef.current);
      osc.start(time);
      osc.stop(time + 0.2);
    }

    function hat(time) {
      const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.1, audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuffer;
      const hp = audioCtx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 8000;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.18, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
      noise.connect(hp).connect(gain).connect(audioOutRef.current);
      noise.start(time);
      noise.stop(time + 0.08);
    }

    function click(time) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(800, time);
      gain.gain.setValueAtTime(0.1, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
      osc.connect(gain).connect(audioOutRef.current);
      osc.start(time);
      osc.stop(time + 0.04);
    }

    let bar = 0;
    for (let t = startAt; t < endAt; t += beatInterval / 2) {
      const beatIndex = Math.round((t - startAt) / beatInterval);
      const posInBar = beatIndex % 4;
      if (posInBar === 0) kick(t);
      if (posInBar === 2) click(t);
      hat(t);
      if (posInBar === 0) bar++;
    }

    // very subtle pad
    const pad = audioCtx.createOscillator();
    pad.type = "triangle";
    pad.frequency.value = 220;
    const padGain = audioCtx.createGain();
    padGain.gain.setValueAtTime(0.02, startAt + 0.2);
    padGain.gain.linearRampToValueAtTime(0.0, startAt + DURATION_SECONDS);
    pad.connect(padGain).connect(audioOutRef.current);
    pad.start(startAt + 0.2);
    pad.stop(startAt + DURATION_SECONDS + 0.2);
  }, []);

  const drawFrame = useCallback((ctx, w, h, t) => {
    ctx.clearRect(0, 0, w, h);

    // background grid (scaffolding)
    ctx.save();
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 1;
    const cols = 16;
    const rows = 9;
    const margin = 36;
    const gw = w - margin * 2;
    const gh = h - margin * 2;

    // animate reveal
    const reveal = Math.min(1, t / 3);

    for (let i = 0; i <= cols; i++) {
      const x = margin + (i / cols) * gw;
      const yEnd = margin + gh * reveal;
      ctx.beginPath();
      ctx.moveTo(x, margin);
      ctx.lineTo(x, yEnd);
      ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const y = margin + (j / rows) * gh;
      const xEnd = margin + gw * reveal;
      ctx.beginPath();
      ctx.moveTo(margin, y);
      ctx.lineTo(xEnd, y);
      ctx.stroke();
    }

    // nodes
    ctx.fillStyle = "#111827";
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        const x = margin + (i / cols) * gw;
        const y = margin + (j / rows) * gh;
        const pulsate = 0.8 + 0.2 * Math.sin((t * 2 + (i + j) * 0.3));
        const r = 1.2 * pulsate;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // central mark: minimal TS monogram built from bars
    const logoReveal = Math.max(0, Math.min(1, (t - 1.0) / 2.0));
    const cx = w / 2;
    const cy = h / 2;
    const size = Math.min(w, h) * 0.2;

    ctx.lineWidth = 6;
    ctx.lineCap = "butt";
    ctx.strokeStyle = "#a3e635"; // accent

    // T horizontal
    ctx.globalAlpha = 0.7 * logoReveal;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.6, cy - size * 0.55);
    ctx.lineTo(cx + size * 0.6, cy - size * 0.55);
    ctx.stroke();

    // T vertical
    if (logoReveal > 0.2) {
      const p = (logoReveal - 0.2) / 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy - size * 0.55);
      ctx.lineTo(cx, cy - size * 0.55 + p * size);
      ctx.stroke();
    }

    // S shape using two arcs
    if (logoReveal > 0.35) {
      const p = Math.min(1, (logoReveal - 0.35) / 0.65);
      ctx.strokeStyle = "#cbd5e1";
      ctx.beginPath();
      const r = size * 0.38;
      ctx.arc(cx - r * 0.4, cy - r * 0.1, r, Math.PI * 0.05, Math.PI * (1.05 * p));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + r * 0.4, cy + r * 0.1, r, Math.PI * (1.05 - 0.9 * p), Math.PI * 1.95);
      ctx.stroke();
    }

    // vignette
    const grad = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.2, w/2, h/2, Math.max(w,h)*0.7);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.restore();
  }, []);

  const start = useCallback(async () => {
    if (isPlaying) return;
    setStatus("Preparing...");
    setDownloadUrl("");

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const { audioCtx, destination } = setupAudio();

    const stream = canvas.captureStream(FPS);
    // merge audio
    const mixed = new MediaStream([
      ...stream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);

    const recorder = new MediaRecorder(mixed, { mimeType: "video/webm;codecs=vp9,opus" });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setIsRecording(false);
      setStatus("Ready ? 15s render complete");
    };

    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setIsPlaying(true);

    scheduleBeat(audioCtx);

    const w = canvas.width;
    const h = canvas.height;
    const startMs = performance.now();
    startTimeRef.current = startMs;

    recorder.start();
    setStatus("Recording 15s...");

    const tick = () => {
      const now = performance.now();
      const t = (now - startMs) / 1000; // seconds
      drawFrame(ctx, w, h, t);
      if (t < DURATION_SECONDS) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(rafRef.current);
        setIsPlaying(false);
        audioCtxRef.current?.close();
        mediaRecorderRef.current?.stop();
      }
    };

    tick();
  }, [drawFrame, isPlaying, scheduleBeat, setupAudio]);

  const stop = useCallback(() => {
    if (!isPlaying) return;
    setStatus("Stopping...");
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close();
    mediaRecorderRef.current && mediaRecorderRef.current.state === "recording" && mediaRecorderRef.current.stop();
    setIsPlaying(false);
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="container">
      <div className="stage">
        <div className="canvasWrap">
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
          <div className="brand">
            <div style={{ textAlign: "center", transform: "translateY(-6px)" }}>
              <h1>Tehran Soft</h1>
              <div className="sub">Industrial ? Minimal ? Modern</div>
            </div>
          </div>
        </div>
      </div>
      <div className="controls">
        <button className="primary" onClick={start} disabled={isPlaying}>Play & Render 15s</button>
        <button onClick={stop} disabled={!isPlaying}>Stop</button>
        <span className="badge" style={{ minWidth: 180, textAlign: "center" }}>{status}</span>
        {downloadUrl && (
          <a className="link" href={downloadUrl} download="tehran-soft-motion.webm">Download WebM</a>
        )}
      </div>
    </div>
  );
}
