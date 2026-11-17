#!/usr/bin/env python3
"""Managed long-lived KorvaTTS JSON-Lines IPC worker for Virtual Expo Backend.

Security & Lifecycle Guarantees:
- Opens ZERO network ports (communicates strictly over parent-child stdin/stdout pipes).
- Redirects incidental library stdout/progress output to stderr so stdout only emits pure JSON lines.
- Loads ONNX sessions once at startup and reuses them across requests.
- Encodes 44.1 kHz 16-bit PCM mono RIFF WAV in memory (zero temporary WAV files on disk).
- Exits cleanly on {"type": "shutdown"} or stdin EOF.
"""

from __future__ import annotations

import base64
import contextlib
import io
import json
import os
import sys
import time
import wave
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")


def _emit(ipc_out, payload: dict) -> None:
    ipc_out.write(json.dumps(payload, ensure_ascii=False) + "\n")
    ipc_out.flush()


def _encode_pcm16_wav_bytes(samples, sample_rate: int) -> bytes:
    import numpy as np

    arr = np.asarray(samples, dtype=np.float32).reshape(-1)
    clipped = np.clip(arr, -1.0, 1.0)
    pcm16 = (clipped * 32767.0).astype("<i2")

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(int(sample_rate))
        wf.writeframes(pcm16.tobytes())
    return buf.getvalue()


def main() -> int:
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    # Reserve real stdout exclusively for JSON-Lines IPC; route library prints to stderr
    ipc_out = sys.stdout
    sys.stdout = sys.stderr

    assets_dir_env = (os.environ.get("KORVATTS_ASSETS_DIR") or "").strip() or None
    auto_download = (os.environ.get("KORVATTS_AUTO_DOWNLOAD", "true").strip().lower() != "false")
    num_threads_raw = (os.environ.get("KORVATTS_NUM_THREADS") or "").strip()
    num_threads = int(num_threads_raw) if num_threads_raw.isdigit() and int(num_threads_raw) > 0 else None

    try:
        t0 = time.perf_counter()
        with contextlib.redirect_stdout(sys.stderr):
            import korvatts
            from korvatts import TTS

            tts = TTS(
                assets_dir=assets_dir_env,
                device="cpu",
                auto_download=auto_download,
                num_threads=num_threads,
            )
        init_ms = round((time.perf_counter() - t0) * 1000.0, 1)
        korva_ver = getattr(korvatts, "__version__", "0.1.3")
        assets_path = Path(str(getattr(tts, "assets_dir", "")))
        checkpoint_id = assets_path.name if assets_path.name else "default"
        voices = tts.list_voices()

        _emit(
            ipc_out,
            {
                "type": "ready",
                "korvaVersion": korva_ver,
                "checkpoint": checkpoint_id,
                "sampleRate": int(tts.sample_rate),
                "voices": voices,
                "initMs": init_ms,
            },
        )
    except Exception as exc:
        _emit(
            ipc_out,
            {
                "type": "init_error",
                "code": "TTS_MODEL_LOAD_FAILED",
                "message": f"{type(exc).__name__}: {exc}",
            },
        )
        return 2

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except Exception:
            continue

        msg_type = msg.get("type")
        req_id = str(msg.get("id") or "")

        if msg_type == "shutdown":
            _emit(ipc_out, {"type": "shutdown_ack", "id": req_id})
            return 0

        if msg_type == "ping":
            _emit(ipc_out, {"type": "pong", "id": req_id})
            continue

        if msg_type != "synthesize":
            _emit(
                ipc_out,
                {
                    "type": "result",
                    "id": req_id,
                    "ok": False,
                    "code": "TTS_SYNTHESIS_FAILED",
                    "message": "Unsupported worker command",
                },
            )
            continue

        text = str(msg.get("text") or "").strip()
        voice = str(msg.get("voice") or "phuong_linh").strip()
        lang = str(msg.get("lang") or "vi").strip()
        steps = max(1, min(32, int(msg.get("steps") or 32)))
        speed = max(0.5, min(2.0, float(msg.get("speed") or 1.05)))
        seed = msg.get("seed", 42)
        seed_val = int(seed) if isinstance(seed, (int, float)) else 42

        try:
            t_syn0 = time.perf_counter()
            with contextlib.redirect_stdout(sys.stderr):
                wav_samples, duration_sec = tts.synthesize(
                    text,
                    voice=voice,
                    lang=lang,
                    total_steps=steps,
                    speed=speed,
                    seed=seed_val,
                )
            wav_bytes = _encode_pcm16_wav_bytes(wav_samples, int(tts.sample_rate))
            synth_ms = round((time.perf_counter() - t_syn0) * 1000.0, 1)

            if len(wav_bytes) <= 44:
                raise RuntimeError("Generated WAV buffer is empty")

            _emit(
                ipc_out,
                {
                    "type": "result",
                    "id": req_id,
                    "ok": True,
                    "mimeType": "audio/wav",
                    "sampleRate": int(tts.sample_rate),
                    "durationSec": round(float(duration_sec), 3),
                    "synthMs": synth_ms,
                    "audioBase64": base64.b64encode(wav_bytes).decode("ascii"),
                },
            )
        except Exception as exc:
            _emit(
                ipc_out,
                {
                    "type": "result",
                    "id": req_id,
                    "ok": False,
                    "code": "TTS_SYNTHESIS_FAILED",
                    "message": f"{type(exc).__name__}: {exc}",
                },
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
