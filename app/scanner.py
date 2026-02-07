"""
Gemini 3.0 Flash bill scanner with Kosovo-specific extraction.
Uses structured outputs to ensure valid JSON matching Pydantic schemas.
"""

import base64
import os
from io import BytesIO
from typing import Optional

from google import genai
from google.genai import types
from PIL import Image

from app.schemas import ATKCode, ExtractedBillData, ExtractedLineItem


class BillScanner:
    """
    AI-powered bill scanner using Gemini 3.0 Flash.
    Configured for Kosovo market with high-accuracy extraction.
    """

    def __init__(self):
        self.api_key = os.getenv("GOOGLE_AI_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_AI_API_KEY environment variable not set")
        
        # Initialize Gemini client
        self.client = genai.Client(api_key=self.api_key)
        self.model_name = "gemini-2.0-flash-exp"  # Latest Flash model in 2026
        
        # Kosovo-specific extraction prompt
        self.system_prompt = """You are an expert OCR and data extraction AI specialized in Kosovo business documents.

**CRITICAL REQUIREMENTS:**

1. **NUI (Business Tax Number)**: Kosovo business tax numbers start with "81". Extract carefully.

2. **VAT Rates**: Kosovo uses two VAT rates:
   - 8% VAT (reduced rate for essential goods)
   - 18% VAT (standard rate)
   Split the VAT amounts clearly.

3. **ATK 665 Expense Codes**: Classify each item using Kosovo tax form codes:
   - 665-04: Food and beverages
   - 665-09: Fuel and lubricants  
   - 665-11: Professional services
   - 665-12: Office supplies
   - 665-13: Utilities (electricity, water, gas)
   - 665-14: Transportation
   - 665-15: Maintenance and repairs
   - 665-99: Other expenses

4. **Currency**: Kosovo uses EUR (Euro).

5. **Date Format**: Accept DD/MM/YYYY or YYYY-MM-DD. Convert to YYYY-MM-DD.

6. **Thermal Receipts**: Many Kosovo receipts are thermal prints. Use high resolution processing.

**EXTRACTION RULES:**
- Extract ALL line items with prices
- Calculate totals carefully
- If text is unclear, mark confidence_score < 0.9
- Never hallucinate data - use null if uncertain
- Preserve original bill number format

Extract all information from the bill/receipt image."""

    async def extract_from_image(
        self,
        image_data: bytes,
        mime_type: str = "image/jpeg"
    ) -> ExtractedBillData:
        """
        Extract structured data from bill image using Gemini 3.0 Flash.
        
        Args:
            image_data: Raw image bytes
            mime_type: Image MIME type
            
        Returns:
            ExtractedBillData with all extracted fields
        """
        try:
            # Encode image for API
            image_base64 = base64.b64encode(image_data).decode("utf-8")
            
            # Configure generation with high accuracy settings
            config = types.GenerateContentConfig(
                temperature=0.1,  # Low temperature for deterministic extraction
                top_p=0.95,
                top_k=40,
                max_output_tokens=2048,
                response_mime_type="application/json",
                response_schema=ExtractedBillData,  # Structured output
                # High thinking level for complex receipts
                thinking_config=types.ThinkingConfig(
                    thinking_level="high"
                )
            )
            
            # Build request with high-resolution image
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[
                    types.Content(
                        role="user",
                        parts=[
                            types.Part(
                                text=self.system_prompt
                            ),
                            types.Part(
                                inline_data=types.Blob(
                                    mime_type=mime_type,
                                    data=image_base64
                                )
                            )
                        ]
                    )
                ],
                config=config
            )
            
            # Parse structured response
            if response.text:
                # Gemini returns valid JSON matching ExtractedBillData schema
                extracted = ExtractedBillData.model_validate_json(response.text)
                return extracted
            else:
                raise ValueError("Empty response from Gemini API")
                
        except Exception as e:
            # Return minimal valid response on error
            return ExtractedBillData(
                vendor_name="Extraction Failed",
                total_amount=0.0,
                currency="EUR",
                confidence_score=0.0,
                line_items=[]
            )

    def generate_text_for_embedding(self, extracted_data: ExtractedBillData) -> str:
        """
        Generate a text representation of extracted data for vector embedding.
        Used for duplicate detection via semantic similarity.
        
        Args:
            extracted_data: Extracted bill information
            
        Returns:
            Concatenated text string for embedding generation
        """
        parts = [
            f"Vendor: {extracted_data.vendor_name}",
            f"NUI: {extracted_data.vendor_tax_number or 'N/A'}",
            f"Bill: {extracted_data.bill_number or 'N/A'}",
            f"Date: {extracted_data.bill_date or 'N/A'}",
            f"Total: {extracted_data.total_amount} {extracted_data.currency}",
        ]
        
        # Add line items
        for item in extracted_data.line_items:
            parts.append(
                f"Item: {item.description} x{item.quantity} = {item.total_price}"
            )
        
        return " | ".join(parts)

    async def generate_embedding(self, text: str) -> list[float]:
        """
        Generate 768-dimensional embedding using Gemini embedding model.
        
        Args:
            text: Text to embed
            
        Returns:
            768-dimensional vector
        """
        try:
            result = self.client.models.embed_content(
                model="text-embedding-004",  # Latest embedding model (768-dim)
                contents=text
            )
            
            # Return the embedding vector
            if result.embeddings and len(result.embeddings) > 0:
                return result.embeddings[0].values
            else:
                # Return zero vector on failure
                return [0.0] * 768
                
        except Exception as e:
            print(f"Embedding generation failed: {e}")
            return [0.0] * 768


# Global scanner instance
scanner = BillScanner()
