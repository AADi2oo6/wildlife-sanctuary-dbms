import os
import base64
import json
import logging
from typing import Dict, Any, Optional, List
from openai import OpenAI

from config import OPENAI_API_KEY

logger = logging.getLogger("fastapi_iot.ai_vision_agent")

def encode_image_to_base64(image_path: str) -> Optional[str]:
    """
    Read JPEG image file and return base64 encoded string.
    """
    try:
        if not os.path.exists(image_path):
            return None
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode("utf-8")
    except Exception as e:
        logger.error(f"[VisionAIAgent] Failed to encode image: {e}")
        return None

class VisionAIAgent:
    """
    Autonomous Optical Computer Vision Threat Classification Agent.
    Uses OpenAI GPT-4o-mini Vision to detect armed poachers, firearms, chainsaws,
    unauthorized vehicles, wildfire smoke, and distressed endangered wildlife.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or OPENAI_API_KEY
        self.client = OpenAI(api_key=self.api_key) if self.api_key else None

    async def analyze_image(self, image_file_path: str, context: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze a captured JPEG snapshot from Device 2 (ESP32-CAM).
        Returns visual threat classification, confidence percentage, detected objects, and reasoning.
        """
        if not self.client:
            logger.warning("[VisionAIAgent] OpenAI API key not configured. Using fallback diagnosis.")
            return self._fallback_response("OpenAI client not configured")

        if not os.path.exists(image_file_path):
            logger.error(f"[VisionAIAgent] Snapshot file not found: {image_file_path}")
            return self._fallback_response("Snapshot file missing")

        b64_image = encode_image_to_base64(image_file_path)
        if not b64_image:
            return self._fallback_response("Failed to encode image to base64")

        try:
            system_prompt = (
                "You are an expert Optical Security & Wildlife Computer Vision Intelligence Agent deployed in DeepGreen Sanctuary. "
                "Your mission is to inspect optical snapshots captured by edge ESP32-CAM nodes triggered by acoustic anomalies. "
                "Classify visual threats with rigorous accuracy into: "
                "'ARMED_POACHER', 'ILLEGAL_CHAINSAW', 'UNAUTHORIZED_VEHICLE', 'WILDFIRE_SMOKE', 'DISTRESSED_ANIMAL', or 'NONE'. "
                "Output strictly valid JSON with this schema:\n"
                "{\n"
                '  "visual_threat": boolean,\n'
                '  "threat_type": string,\n'
                '  "vision_score": number (0.0 to 100.0),\n'
                '  "alert_level": "CRITICAL" | "HIGH ALERT" | "WARNING" | "INFO",\n'
                '  "detected_objects": array of strings (e.g. ["person", "chainsaw", "truck"]),\n'
                '  "reasoning": string (concise 1-2 sentence forensic visual diagnosis),\n'
                '  "action_recommendation": string\n'
                "}"
            )

            user_content = [
                {
                    "type": "text",
                    "text": (
                        "Analyze this perimeter surveillance frame from Device 2 (ESP32-CAM). "
                        f"Context: {context or 'Triggered by high acoustic anomaly.'} "
                        "Determine if visual evidence confirms a threat."
                    )
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{b64_image}",
                        "detail": "high"
                    }
                }
            ]

            completion = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                response_format={"type": "json_object"},
                max_tokens=350,
                temperature=0.2
            )

            result_json = json.loads(completion.choices[0].message.content)

            vision_score = float(result_json.get("vision_score", 0.0))
            visual_threat = bool(result_json.get("visual_threat", False))

            output = {
                "success": True,
                "visual_threat": visual_threat,
                "threat_type": result_json.get("threat_type", "NONE"),
                "vision_score": vision_score,
                "alert_level": result_json.get("alert_level", "HIGH ALERT" if visual_threat else "INFO"),
                "detected_objects": result_json.get("detected_objects", []),
                "reasoning": result_json.get("reasoning", "Optical frame analyzed by GPT-4o-mini Vision."),
                "action_recommendation": result_json.get("action_recommendation", "Log event."),
                "model_used": "gpt-4o-mini-vision"
            }

            logger.info(
                f"👁️ [VisionAIAgent] Diagnosis: Threat={output['threat_type']} | "
                f"VisualScore={output['vision_score']}% | AlertLevel={output['alert_level']}"
            )
            return output

        except Exception as err:
            logger.error(f"❌ [VisionAIAgent] Error during OpenAI vision analysis: {err}")
            return self._fallback_response(str(err))

    def _fallback_response(self, error_msg: str) -> Dict[str, Any]:
        return {
            "success": False,
            "visual_threat": False,
            "threat_type": "UNKNOWN",
            "vision_score": 0.0,
            "alert_level": "INFO",
            "detected_objects": [],
            "reasoning": f"Optical analysis unavailable ({error_msg}).",
            "action_recommendation": "Manual camera inspection recommended.",
            "model_used": "fallback"
        }

# Singleton instance
vision_ai_agent = VisionAIAgent()
