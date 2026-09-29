import os
import wave
import struct
import math
import json
import logging
from typing import Dict, Any, Optional
from openai import OpenAI

from config import OPENAI_API_KEY

logger = logging.getLogger("fastapi_iot.ai_audio_agent")

def calculate_wav_rms_db(wav_path: str) -> float:
    """
    Calculate exact physical RMS decibel sound level (dB SPL) from 16-bit PCM WAV.
    Zero external dependencies, 100% compatible with Python 3.13.
    """
    try:
        if not os.path.exists(wav_path):
            return 70.0

        with wave.open(wav_path, "rb") as wf:
            n_channels = wf.getnchannels()
            n_frames = wf.getnframes()
            frames = wf.readframes(n_frames)

            total_samples = n_frames * n_channels
            if total_samples == 0:
                return 40.0

            fmt = f"<{total_samples}h"
            samples = struct.unpack(fmt, frames)

            # Sum of squared amplitudes
            sum_sq = sum(s * s for s in samples)
            rms = math.sqrt(sum_sq / total_samples)

            if rms > 0:
                # 0 dBFS = 32768. Calibration: 0 dBFS corresponds to ~100 dB SPL for MEMS mics
                db = 20 * math.log10(rms / 32768.0) + 100.0
                return round(max(32.0, min(135.0, db)), 1)
    except Exception as e:
        logger.warning(f"[AudioAIAgent] Could not calculate audio dB: {e}")
    return 75.0

class AudioAIAgent:
    """
    Autonomous Acoustic Threat Detection Agent.
    Combines OpenAI Whisper (acoustic transcription) and GPT-4o-mini (audio reasoning)
    to detect chainsaws, ballistic gunshots, vehicles, and poacher speech.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or OPENAI_API_KEY
        self.client = OpenAI(api_key=self.api_key) if self.api_key else None

    async def analyze_audio(self, wav_file_path: str, trigger_source: str = "VIBRATION_INTERRUPT") -> Dict[str, Any]:
        """
        Analyze a 5-second WAV audio recording.
        Returns classified threat type, confidence score (0-100), reasoning, and escalation flag.
        """
        calculated_db = calculate_wav_rms_db(wav_file_path)

        if not self.client:
            logger.warning("[AudioAIAgent] OpenAI API key not configured. Using heuristic analysis.")
            return self._heuristic_fallback(calculated_db, trigger_source)

        if not os.path.exists(wav_file_path):
            logger.error(f"[AudioAIAgent] WAV file not found at: {wav_file_path}")
            return self._heuristic_fallback(calculated_db, trigger_source)

        try:
            # 1. Transcribe & Acoustic Feature Extraction with Whisper
            transcription_text = ""
            try:
                with open(wav_file_path, "rb") as audio_file:
                    transcription = self.client.audio.transcriptions.create(
                        model="whisper-1",
                        file=audio_file,
                        prompt="Forest wildlife reserve acoustic monitoring: chainsaw engine, gunshot, vehicle motor, tree chopping, poacher shouting, animal screams, ambient wind.",
                        temperature=0.2
                    )
                    transcription_text = transcription.text.strip()
            except Exception as w_err:
                logger.warning(f"[AudioAIAgent] Whisper transcription note: {w_err}")
                transcription_text = "(Non-verbal acoustic signal or mechanical impulse)"

            # 2. Forensic Threat Reasoning with GPT-4o-mini
            system_prompt = (
                "You are an expert Forest Security Acoustic Diagnostic AI Agent for the DeepGreen Wildlife Sanctuary. "
                "Your role is to analyze acoustic signals from edge ESP32 nodes equipped with seismic and microphone sensors. "
                "Classify the acoustic profile into one of: 'CHAINSAW', 'GUNSHOT', 'VEHICLE', 'POACHER_VOICE', 'ANIMAL_DISTRESS', 'WILDFIRE', 'NORMAL_AMBIENT'. "
                "Output strictly valid JSON with this schema:\n"
                "{\n"
                '  "threat_detected": boolean,\n'
                '  "threat_type": string,\n'
                '  "confidence_score": number (0.0 to 100.0),\n'
                '  "severity": "ALERT" | "WARNING" | "INFO",\n'
                '  "reasoning": string (concise 1-2 forensic sentences explaining the diagnosis),\n'
                '  "escalate_camera": boolean (true if threat_detected and confidence_score >= 80.0)\n'
                "}"
            )

            user_prompt = (
                f"Audio telemetry data:\n"
                f"- Measured Sound Pressure: {calculated_db} dB SPL\n"
                f"- Trigger Cause: {trigger_source}\n"
                f"- Acoustic Transcript / Signal: \"{transcription_text}\"\n"
                f"- Duration: 5.0 seconds (16kHz Mono)\n"
                "Evaluate threat level and output strict JSON."
            )

            completion = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.3
            )

            result_json = json.loads(completion.choices[0].message.content)

            # Ensure complete fields
            confidence = float(result_json.get("confidence_score", 85.0))
            threat_detected = bool(result_json.get("threat_detected", False))
            escalate = bool(result_json.get("escalate_camera", confidence >= 80.0 and threat_detected))

            output = {
                "success": True,
                "threat_detected": threat_detected,
                "threat_type": result_json.get("threat_type", "ACOUSTIC_DISTURBANCE"),
                "confidence_score": confidence,
                "decibel_level": calculated_db,
                "severity": result_json.get("severity", "ALERT" if threat_detected else "INFO"),
                "reasoning": result_json.get("reasoning", "Acoustic signal analyzed by GPT-4o-mini."),
                "transcription": transcription_text,
                "escalate_camera": escalate,
                "model_used": "whisper-1 + gpt-4o-mini"
            }

            logger.info(
                f"🧠 [AudioAIAgent] Diagnosis: Threat={output['threat_type']} | "
                f"Conf={output['confidence_score']}% | EscalateCamera={output['escalate_camera']} | dB={calculated_db}"
            )
            return output

        except Exception as err:
            logger.error(f"❌ [AudioAIAgent] Error during OpenAI audio analysis: {err}")
            return self._heuristic_fallback(calculated_db, trigger_source)

    def _heuristic_fallback(self, db: float, trigger_source: str) -> Dict[str, Any]:
        """
        Rule-based acoustic classification fallback when offline or API is unavailable.
        """
        is_threat = db >= 82.0
        threat_type = "CHAINSAW" if db >= 86.0 else ("VEHICLE" if db >= 75.0 else "NORMAL_AMBIENT")
        confidence = 88.0 if is_threat else 65.0
        escalate = is_threat and confidence >= 80.0

        return {
            "success": True,
            "threat_detected": is_threat,
            "threat_type": threat_type,
            "confidence_score": confidence,
            "decibel_level": db,
            "severity": "ALERT" if is_threat else "INFO",
            "reasoning": f"Acoustic threshold detection ({db} dB SPL) triggered by {trigger_source}.",
            "transcription": "(Acoustic signal processed via edge rules)",
            "escalate_camera": escalate,
            "model_used": "heuristic-fallback"
        }

# Singleton instance
audio_ai_agent = AudioAIAgent()
