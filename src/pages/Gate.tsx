"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Container,
  ScanLine,
  CheckCircle2,
  XCircle,
  Upload,
  Search,
  Trash2,
  AlertTriangle,
  Clock,
  ChevronDown,
  ImageIcon,
  TableProperties,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

type DetectStatus = "FOUND" | "PARTIAL" | "NOT_FOUND" | "ERROR";

interface DetectResult {
  status: DetectStatus;
  full_number: string;
  owner_code: string;
  serial_number: string;
  check_digit: string;
  confidence: number;
  orientation: string;
  raw_ocr_text: string;
  bbox: number[] | null;
  processing_time_ms: number;
  annotated_image?: string;
}

interface ScanLogEntry {
  id: number;
  status: DetectStatus;
  full_number: string;
  owner_code: string;
  serial_number: string;
  check_digit: string;
  source: string;       // filename / sample name
  time_ms: number;
  timestamp: string;    // HH:MM:SS
}

// ── Config ───────────────────────────────────────────────────────────

const API_URL = "https://Ckothuw-ContainerNumberDetection.hf.space";

/**
 * Sample images — đặt các file .jpg vào /public/samples/
 * Tên label hiện trong dropdown, value là path tương đối từ /public
 */
const SAMPLE_IMAGES = [
  { label: "Container 01 — MSCU", value: "/samples/sample_01.jpg" },
  { label: "Container 02 — TCKU", value: "/samples/sample_02.jpg" },
  { label: "Container 03 — HDMU", value: "/samples/sample_03.jpg" },
  { label: "Container 04 — BMOU", value: "/samples/sample_04.jpg" },
  { label: "Container 05 — BMOU", value: "/samples/sample_05.jpg" }
];

// ── Helpers ──────────────────────────────────────────────────────────

function statusDecision(status: DetectStatus | null) {
  switch (status) {
    case "FOUND": return { label: "FOUND", sub: "Container number detected successfully.", color: "found" };
    case "PARTIAL": return { label: "PARTIAL", sub: "Detected but number could not be fully parsed.", color: "partial" };
    case "NOT_FOUND": return { label: "NOT FOUND", sub: "No container region detected in image.", color: "not_found" };
    case "ERROR": return { label: "ERROR", sub: "API request failed.", color: "error" };
    default: return { label: "IDLE", sub: "Waiting for detection.", color: "idle" };
  }
}

const statusGradient: Record<string, string> = {
  found: "from-emerald-800 to-emerald-950",
  partial: "from-amber-800 to-amber-950",
  not_found: "from-red-800 to-red-950",
  error: "from-red-800 to-red-950",
  idle: "from-slate-800 to-slate-950",
};

const statusShadow: Record<string, string> = {
  found: "shadow-[0_6px_28px_rgba(52,211,153,0.18)]",
  partial: "shadow-[0_6px_28px_rgba(251,191,36,0.18)]",
  not_found: "shadow-[0_6px_28px_rgba(248,113,113,0.18)]",
  error: "shadow-[0_6px_28px_rgba(248,113,113,0.18)]",
  idle: "",
};

function nowHHMMSS() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function StatusBadge({ status }: { status: DetectStatus }) {
  const map = {
    FOUND: "bg-success/10 text-success",
    PARTIAL: "bg-warning/10 text-warning",
    NOT_FOUND: "bg-destructive/10 text-destructive",
    ERROR: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono tracking-wide ${map[status]}`}>
      {status}
    </span>
  );
}

function StatusIcon({ status }: { status: DetectStatus | null }) {
  if (status === "FOUND") return <CheckCircle2 className="h-6 w-6 text-white" strokeWidth={2.5} />;
  if (status === "PARTIAL") return <AlertTriangle className="h-6 w-6 text-white" strokeWidth={2.5} />;
  if (status === "NOT_FOUND" || status === "ERROR")
    return <XCircle className="h-6 w-6 text-white" strokeWidth={2.5} />;
  return <Search className="h-6 w-6 text-white/40" strokeWidth={2} />;
}

function ScanOverlay() {
  return (
    <div className="absolute inset-3.5 border border-sky-400/20 rounded-md pointer-events-none">
      {(["tl", "tr", "bl", "br"] as const).map((c) => (
        <div key={c} className={`absolute w-3.5 h-3.5 border-amber-400 border-solid
          ${c === "tl" ? "top-0 left-0 border-t-2 border-l-2" : ""}
          ${c === "tr" ? "top-0 right-0 border-t-2 border-r-2" : ""}
          ${c === "bl" ? "bottom-0 left-0 border-b-2 border-l-2" : ""}
          ${c === "br" ? "bottom-0 right-0 border-b-2 border-r-2" : ""}
        `} />
      ))}
    </div>
  );
}


// ── LoadingOverlay on result panel ───────────────────────────────────

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm pointer-events-none z-10">
      {/* animated scan frame */}
      <div className="relative w-28 h-20">
        {(["tl", "tr", "bl", "br"] as const).map((c) => (
          <div key={c} className={`absolute w-5 h-5 border-primary border-solid
            ${c === "tl" ? "top-0 left-0 border-t-2 border-l-2" : ""}
            ${c === "tr" ? "top-0 right-0 border-t-2 border-r-2" : ""}
            ${c === "bl" ? "bottom-0 left-0 border-b-2 border-l-2" : ""}
            ${c === "br" ? "bottom-0 right-0 border-b-2 border-r-2" : ""}
          `} />
        ))}
        {/* scan line */}
        <div className="absolute inset-x-0 h-0.5 bg-primary shadow-[0_0_12px_rgba(56,189,248,0.8)] animate-scan" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2.5">
          <div className="h-3.5 w-3.5 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
          <span className="text-xs font-mono text-white/70 tracking-widest uppercase">Scanning…</span>
        </div>
        <span className="text-[10px] text-white/35 font-mono">YOLOv11n + PaddleOCR</span>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────

export default function Gate() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // image state
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [annotatedUrl, setAnnotatedUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string>("");

  // detection state
  const [result, setResult] = useState<DetectResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [conf, setConf] = useState(25);
  const [procTime, setProcTime] = useState<string>("—");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // scan log (full history table)
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  const [scanCounter, setScanCounter] = useState(1);

  // dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedSample, setSelectedSample] = useState<string>("");
  const [autoDetect, setAutoDetect] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = () => setDropdownOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // ── Load file from File object ──────────────────────────────────

  const loadFile = useCallback((file: File) => {
    setCurrentFile(file);
    setSourceName(file.name);
    setAnnotatedUrl(null);
    setResult(null);
    setProcTime("—");
    setErrMsg(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  // ── Load from URL (sample images) ──────────────────────────────

  const loadFromUrl = useCallback(async (url: string, label: string) => {
    setAnnotatedUrl(null);
    setResult(null);
    setProcTime("—");
    setErrMsg(null);
    setCurrentFile(null);
    setSourceName(label);
    setPreviewUrl(url);          // show preview immediately

    if (autoDetect) {
      // slight delay so preview renders first
      setTimeout(() => runDetectFromUrl(url, label), 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDetect]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) loadFile(f);
  };

  const handleSampleSelect = (sample: { label: string; value: string }) => {
    setSelectedSample(sample.value);
    setDropdownOpen(false);
    loadFromUrl(sample.value, sample.label);
  };

  // ── Core detect (from File) ─────────────────────────────────────

  const runDetect = async () => {
    if (!currentFile && !previewUrl) return;
    if (currentFile) {
      await runDetectFromFile(currentFile, sourceName);
    } else if (previewUrl) {
      await runDetectFromUrl(previewUrl, sourceName);
    }
  };

  const runDetectFromFile = async (file: File, name: string) => {
    setLoading(true);
    setProcTime("Processing…");
    setErrMsg(null);
    const fd = new FormData();
    fd.append("file", file, file.name);
    await _callAPI(fd, name);
  };

  const runDetectFromUrl = async (url: string, label: string) => {
    setLoading(true);
    setProcTime("Processing…");
    setErrMsg(null);
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error(`Sample image not found (${resp.status}). Hãy đặt file vào /public/samples/`);
      }

      const rawBlob = await resp.blob();
      const filename = url.split("/").pop() || "sample.jpg";

      // Validate: ảnh thật phải có magic bytes JPEG (FF D8) hoặc PNG (89 50)
      const headerBytes = await rawBlob.slice(0, 4).arrayBuffer();
      const header = new Uint8Array(headerBytes);
      const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
      const isPng = header[0] === 0x89 && header[1] === 0x50;

      if (!isJpeg && !isPng) {
        throw new Error(
          `File "${filename}" không phải ảnh hợp lệ. ` +
          `Kiểm tra lại file trong /public/samples/ — có thể bị 404 trả về HTML.`
        );
      }

      const mimeType = isPng ? "image/png" : "image/jpeg";
      const blob = new Blob([rawBlob], { type: mimeType });
      const fd = new FormData();
      fd.append("file", blob, filename);
      await _callAPI(fd, label);
    } catch (err: any) {
      setProcTime("Error");
      setErrMsg(err.message || "Failed to load sample image");
      setLoading(false);
    }
  };

  const _callAPI = async (fd: FormData, name: string) => {
    try {
      const res = await fetch(`${API_URL}/detect/both?conf=${(conf / 100).toFixed(2)}`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || res.statusText);
      }
      const data: DetectResult = await res.json();
      const elapsed = data.processing_time_ms
        ? `${(data.processing_time_ms / 1000).toFixed(2)}s`
        : "—";

      setProcTime(`Processed in ${elapsed}`);
      setResult(data);
      if (data.annotated_image) {
        setAnnotatedUrl(`data:image/jpeg;base64,${data.annotated_image}`);
      }

      // Append to scan log
      setScanLog((prev) => [
        {
          id: scanCounter,
          status: data.status,
          full_number: data.full_number || "—",
          owner_code: data.owner_code || "—",
          serial_number: data.serial_number || "—",
          check_digit: data.check_digit || "—",
          source: name,
          time_ms: data.processing_time_ms,
          timestamp: nowHHMMSS(),
        },
        ...prev,
      ]);
      setScanCounter((c) => c + 1);
    } catch (err: any) {
      setProcTime("Error");
      setErrMsg(err.message || "Unknown error");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setCurrentFile(null);
    setPreviewUrl(null);
    setAnnotatedUrl(null);
    setResult(null);
    setProcTime("—");
    setErrMsg(null);
    setSourceName("");
    setSelectedSample("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Derived ────────────────────────────────────────────────────

  const decision = statusDecision(errMsg ? "ERROR" : result?.status ?? null);
  const canRun = (!!currentFile || !!previewUrl) && !loading;

  const resultLabel = result?.status === "FOUND"
    ? (result.full_number || "FOUND")
    : result?.status === "PARTIAL" ? "PARTIAL"
      : result ? "NOT FOUND" : "Result";

  const resultLabelColor = result?.status === "FOUND"
    ? "bg-emerald-500/90 text-slate-900"
    : result?.status === "PARTIAL"
      ? "bg-amber-400/90 text-slate-900"
      : result ? "bg-red-500/90 text-white"
        : "bg-sky-400/90 text-slate-900";

  // ── Render ──────────────────────────────────────────────────────

  return (
    <>
      <PageHeader
        eyebrow="Vision Edge Gate · AI Module"
        title="Container Number Detection"
        description="Upload an image or choose a sample to detect ISO 6346 container numbers. YOLOv11n + PaddleOCR 3.x."
      />

      {/* ── Top action bar ── */}
      <div className="flex items-center gap-3 flex-wrap mb-5">

        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-card border border-border/60 hover:bg-muted/10 transition-colors"
        >
          <Upload className="h-4 w-4 opacity-70" />
          Upload Image
        </button>

        {/* Sample dropdown */}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-card border border-border/60 hover:bg-muted/10 transition-colors min-w-[180px] justify-between"
          >
            <span className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 opacity-70" />
              {selectedSample
                ? SAMPLE_IMAGES.find((s) => s.value === selectedSample)?.label.split("—")[0].trim()
                : "Sample Images"}
            </span>
            <ChevronDown className={`h-4 w-4 opacity-50 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-72 bg-card border border-border/60 rounded-xl shadow-lg overflow-hidden z-50">
              {/* Auto-detect toggle */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 bg-muted/5">
                <span className="text-xs text-muted-foreground">Auto-detect on select</span>
                <button
                  onClick={() => setAutoDetect((v) => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${autoDetect ? "bg-primary" : "bg-muted/30"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${autoDetect ? "left-4.5" : "left-0.5"}`} />
                </button>
              </div>

              {/* Sample list */}
              {SAMPLE_IMAGES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => handleSampleSelect(s)}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-muted/10 transition-colors flex items-center gap-3 border-b border-border/30 last:border-0 ${selectedSample === s.value ? "bg-primary/8 text-primary" : ""}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-muted/20 overflow-hidden flex-shrink-0 border border-border/40">
                    <img src={s.value} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                  <span className="leading-tight">{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Run detect */}
        <button
          onClick={runDetect}
          disabled={!canRun}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <Search className="h-4 w-4" />
          {loading ? "Processing…" : "Run Detection"}
        </button>

        {/* Clear */}
        <button
          onClick={clearAll}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-card border border-border/60 hover:bg-muted/10 transition-colors"
        >
          <Trash2 className="h-4 w-4 opacity-70" />
          Clear
        </button>

        {/* Conf slider */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground ml-1">
          <span>Conf</span>
          <input
            type="range" min={10} max={90} value={conf}
            onChange={(e) => setConf(Number(e.target.value))}
            className="w-20 accent-primary"
          />
          <span className="text-primary font-mono">{conf}%</span>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <div className="h-3.5 w-3.5 border-2 border-border border-t-primary rounded-full animate-spin" />
            Processing…
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/bmp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">

          {/* ── Scanner view ── */}
          <div className="bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Container className="h-4 w-4 opacity-60" />
                Scanner View
              </div>
              <span className="text-xs text-muted-foreground font-mono truncate max-w-[240px]">
                {sourceName || "No image loaded"}
              </span>
            </div>

            <div className="grid grid-cols-2">
              {/* Input */}
              <div
                className={`relative aspect-video bg-gradient-to-br from-primary-deep to-foreground overflow-hidden cursor-pointer border-r border-border/60 transition-all ${isDragging ? "ring-2 ring-primary ring-inset" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
                  <defs><pattern id="grid-input" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="0.3" /></pattern></defs>
                  <rect width="100%" height="100%" fill="url(#grid-input)" />
                </svg>

                {previewUrl ? (
                  <img src={previewUrl} alt="Input" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                    <Upload className="h-8 w-8 text-white/20" strokeWidth={1.2} />
                    <p className="text-xs text-white/40"><span className="text-primary">Click to upload</span></p>
                    <p className="text-[11px] text-white/25">JPG · PNG · WEBP</p>
                  </div>
                )}
                <ScanOverlay />
                <div className="absolute top-2.5 left-2.5 bg-sky-400/85 text-slate-900 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">
                  Input
                </div>
              </div>

              {/* Result */}
              <div className="relative aspect-video bg-gradient-to-br from-primary-deep to-foreground overflow-hidden">
                <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
                  <defs><pattern id="grid-result" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="0.3" /></pattern></defs>
                  <rect width="100%" height="100%" fill="url(#grid-result)" />
                </svg>
                {annotatedUrl ? (
                  <img src={annotatedUrl} alt="Result" className="absolute inset-0 w-full h-full object-cover" />
                ) : !loading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                    <Search className="h-8 w-8 text-white/20" strokeWidth={1.2} />
                    <p className="text-[11px] text-white/30">Result appears here</p>
                  </div>
                ) : null}
                {/* Loading overlay */}
                {loading && <LoadingOverlay />}
                <div className={`absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider font-mono ${resultLabelColor}`}>
                  {loading ? "SCANNING" : resultLabel}
                </div>
              </div>
            </div>
          </div>

          {/* ── Verification Matrix ── */}
          <div className="bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden">
            <div className="p-5 border-b border-border/60 flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 opacity-60" />
                Verification Matrix
              </h3>
              <div className="text-xs text-muted-foreground font-mono">{procTime}</div>
            </div>
            <div className="divide-y divide-border/40">
              {errMsg ? (
                <div className="px-5 py-8 text-center text-sm text-destructive">⚠ {errMsg}</div>
              ) : result ? (
                [
                  { field: "Status", val: result.status || "—", hi: result.status === "FOUND" },
                  { field: "Full Number", val: result.full_number || "—", hi: !!result.full_number },
                  { field: "Owner Code", val: result.owner_code || "—", hi: false },
                  { field: "Serial Number", val: result.serial_number || "—", hi: false },
                  { field: "Check Digit", val: result.check_digit || "—", hi: false },
                ].map((r) => (
                  <div key={r.field} className="grid grid-cols-12 px-5 py-3.5 text-sm items-center hover:bg-muted/5 transition-colors">
                    <div className="col-span-4 text-xs text-muted-foreground font-medium">{r.field}</div>
                    <div className={`col-span-7 font-mono text-xs ${r.hi ? "text-success font-bold" : "text-muted-foreground"}`}>{r.val}</div>
                    <div className="col-span-1 flex justify-end">
                      {r.hi
                        ? <CheckCircle2 className="h-4 w-4 text-success" />
                        : <XCircle className="h-4 w-4 text-muted-foreground/20" />}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Run detection to see results.
                </div>
              )}
            </div>
          </div>

          {/* ── Scan Log Table ── */}
          <div className="bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden">
            <div className="p-5 border-b border-border/60 flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <TableProperties className="h-4 w-4 opacity-60" />
                Scan Log
              </h3>
              <div className="flex items-center gap-3">
                {scanLog.length > 0 && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {scanLog.length} scan{scanLog.length > 1 ? "s" : ""}
                  </span>
                )}
                {scanLog.length > 0 && (
                  <button
                    onClick={() => { setScanLog([]); setScanCounter(1); }}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Clear log
                  </button>
                )}
              </div>
            </div>

            {scanLog.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No scans recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/40">
                      {["ID", "Status", "Container ID", "Owner", "Serial", "Check", "Time", "Source"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {scanLog.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/5 transition-colors">
                        <td className="px-4 py-3 font-mono text-muted-foreground">#{row.id}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className={`px-4 py-3 font-mono font-bold tracking-wide ${row.full_number !== "—" ? "text-success" : "text-muted-foreground"}`}>
                          {row.full_number}
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">{row.owner_code}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">{row.serial_number}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">{row.check_digit}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                          {row.time_ms ? `${(row.time_ms / 1000).toFixed(2)}s` : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground truncate max-w-[140px]" title={row.source}>
                          {row.source.length > 20 ? row.source.slice(0, 18) + "…" : row.source}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-5">

          {/* Status card */}
          <div className={`bg-gradient-to-br ${statusGradient[decision.color]} rounded-2xl p-6 text-white relative overflow-hidden ${statusShadow[decision.color]} ${decision.color === "idle" ? "border border-border/60" : ""}`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,white,transparent_60%)] opacity-[0.06] pointer-events-none" />
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-white/12 flex items-center justify-center flex-shrink-0">
                <StatusIcon status={errMsg ? "ERROR" : result?.status ?? null} />
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.22em] opacity-60 font-mono mb-0.5">Decision</div>
                <div className="text-2xl font-black tracking-tight leading-none">
                  {errMsg ? "ERROR" : decision.label}
                </div>
              </div>
            </div>
            <p className="text-xs opacity-75 leading-relaxed mb-4">
              {errMsg || (result?.status === "FOUND" ? `${result.full_number} detected.` : decision.sub)}
            </p>
            <div className="inline-flex items-center gap-2.5 bg-white/10 rounded-lg px-3 py-2">
              <Clock className="h-3.5 w-3.5 opacity-60" />
              <div>
                <div className="text-[9px] uppercase tracking-[0.15em] opacity-60 font-mono">Time</div>
                <div className="font-mono text-lg font-bold leading-none">
                  {result?.processing_time_ms ? `${(result.processing_time_ms / 1000).toFixed(2)}s` : "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Recent detections (last 6) */}
          <div className="bg-card rounded-2xl p-5 border border-border/60 shadow-card">
            <div className="flex items-center gap-2 text-sm font-semibold mb-3">
              <ScanLine className="h-4 w-4 text-primary" />
              Recent Detections
            </div>
            {scanLog.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No detections yet.</p>
            ) : (
              <div className="space-y-2.5">
                {scanLog.slice(0, 6).map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground truncate">{h.full_number}</span>
                    <StatusBadge status={h.status} />
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}