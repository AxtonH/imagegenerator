import base64
from google import genai
from google.genai import types
from fastapi import Depends
from .config import Settings, get_settings


MODE_PREFIX = {
    "Fast": "Create a clean, on-brand marketing image quickly.",
    "Premium": "Create a highly polished, presentation-ready visual with strong art direction.",
    "Realistic": "Create a photorealistic image with natural lighting and credible materials.",
    "Illustration": "Create a refined editorial illustration with clear composition and style.",
}


class GeminiImageClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = genai.Client(api_key=settings.gemini_api_key)

    def model_for_mode(self, mode: str) -> str:
        return {
            "Fast": self.settings.gemini_model_fast,
            "Premium": self.settings.gemini_model_premium,
            "Realistic": self.settings.gemini_model_realistic,
            "Illustration": self.settings.gemini_model_illustration,
        }[mode]

    def enhance_prompt(self, prompt: str, mode: str, aspect_ratio: str) -> str:
        return (
            f"{MODE_PREFIX[mode]} Aspect ratio: {aspect_ratio}. "
            "Do not include confidential client information, logos, or private data unless explicitly supplied and approved. "
            f"User prompt: {prompt}"
        )

    def generate(self, prompt: str, mode: str, aspect_ratio: str, variations: int) -> tuple[str, list[bytes]]:
        model = self.model_for_mode(mode)
        enhanced = self.enhance_prompt(prompt, mode, aspect_ratio)
        images: list[bytes] = []

        for index in range(variations):
            response = self.client.models.generate_content(
                model=model,
                contents=f"{enhanced}\nVariation {index + 1} of {variations}.",
                config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
            )
            for candidate in response.candidates or []:
                for part in candidate.content.parts or []:
                    if getattr(part, "inline_data", None) and part.inline_data.data:
                        data = part.inline_data.data
                        images.append(base64.b64decode(data) if isinstance(data, str) else data)
                        break
                if len(images) > index:
                    break

        if not images:
            raise RuntimeError("Gemini did not return image data")

        return enhanced, images


def get_gemini_client(settings: Settings = Depends(get_settings)) -> GeminiImageClient:
    return GeminiImageClient(settings)
