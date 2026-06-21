import json
import logging
import warnings
with warnings.catch_warnings():
    warnings.filterwarnings("ignore", category=FutureWarning)
    import google.generativeai as genai
from fastapi import HTTPException
from backend.app.schemas import UtilityExtractionResponse
from backend.app.config import settings

logger = logging.getLogger("uvicorn.error")

class LLMParserService:
    """
    Service to interface with Gemini 1.5 Flash to extract 
    consumption metrics from utility bills while maintaining data security.
    """
    def __init__(self):
        # Configure Gemini API client
        api_key = settings.GEMINI_API_KEY
        if api_key:
            genai.configure(api_key=api_key)
            logger.info("Gemini API client configured successfully.")
        else:
            logger.warning("GEMINI_API_KEY not found in settings. API calls will fail unless configured via environment variables.")

    async def parse_bill(self, file_bytes: bytes, mime_type: str) -> UtilityExtractionResponse:
        """
        Sends the utility bill bytes to Gemini 1.5 Flash and enforces
        the structured output matching UtilityExtractionResponse.
        """
        # Ensure API key is configured
        if not settings.GEMINI_API_KEY and not genai.get_api_key():
            raise HTTPException(
                status_code=500,
                detail="Gemini API Key is not configured. Please set GEMINI_API_KEY in the backend .env file."
            )

        try:
            # Initialize model
            model = genai.GenerativeModel("gemini-1.5-flash")

            # Format file part for Gemini API
            file_part = {
                "mime_type": mime_type,
                "data": file_bytes
            }

            # Instructions focusing strictly on consumption data and PII redaction
            prompt = (
                "Analyze the attached utility bill document and extract consumption metrics.\n\n"
                "Strict Data Constraints:\n"
                "1. Identify the utility type: electricity, gas, or water.\n"
                "2. Extract the consumption value (must be a positive number).\n"
                "3. Extract the unit of measurement (e.g. kWh, therms, gallons, m3).\n"
                "4. Extract the billing period start and end dates (format as YYYY-MM-DD). "
                "If either date is missing, return an empty string.\n"
                "5. DATA MINIMIZATION/SECURITY: DO NOT extract any PII. Do not extract names, "
                "addresses, account numbers, phone numbers, or invoice amounts in currency. "
                "Only extract consumption volume and dates."
            )

            # Request generation with structured JSON schema
            response = await model.generate_content_async(
                contents=[file_part, prompt],
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    response_schema=UtilityExtractionResponse,
                    temperature=0.1
                )
            )

            if not response.text:
                raise ValueError("Received empty response text from Gemini API.")

            # Load response content and parse with Pydantic schema
            extracted_data = json.loads(response.text)
            return UtilityExtractionResponse(**extracted_data)

        except Exception as e:
            logger.error(f"Error parsing bill: {str(e)}")
            raise HTTPException(
                status_code=502,
                detail=f"Error parsing bill via LLM pipeline: {str(e)}"
            )
