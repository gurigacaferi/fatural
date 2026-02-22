/**
 * Gemini 3 Flash – OCR & structured bill extraction.
 * Kosovo-market-specific prompt with full Albanian category support.
 */
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------
export interface ExtractedExpense {
  name: string;
  category: string;
  amount: number;
  date: string;
  merchant: string | null;
  tvsh_percentage: number;
  vat_code: string;
  nui: string | null;
  nr_fiskal: string | null;
  numri_i_tvsh_se: string | null;
  description: string | null;
  sasia: number;
  njesia: string;
  pageNumber: number;
}

export interface GeminiExtractionResult {
  vendor_name: string;
  vendor_tax_number: string | null;
  bill_number: string | null;
  bill_date: string | null;
  subtotal: number | null;
  vat_8_amount: number | null;
  vat_18_amount: number | null;
  total_vat: number | null;
  total_amount: number;
  currency: string;
  payment_method: string | null;
  confidence_score: number;
  expenses: ExtractedExpense[];
}

// ---------------------------------------------------------------------------
// System prompt — Kosovo accounting specialist
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are an expert accountant AI specialised in Kosovo business receipts and invoices.

**CRITICAL INSTRUCTIONS:**
1. **EXTRACT EVERY SINGLE LINE ITEM.** If a table has 50 rows, return 50 items.
2. **ACCURATE NUMBER PARSING:** Decimal separator may be '.' or ','. Parse "12,20" → 12.2, "1.234,56" → 1234.56.
3. **PAGE NUMBERING:** Images arrive in order. First image = page 1.

**MANDATORY CATEGORY LIST (Albanian sub-categories):**
Select one for EVERY item. Default to "690-09 Te tjera".
[
  "660-01 Paga bruto","660-02 Sigurimi shendetesor","660-03 Kontributi pensional",
  "665-01 Shpenzimet e qirase","665-02 Material harxhues","665-03 Pastrimi","665-04 Ushqim dhe pije","665-05 Shpenzime te IT-se","665-06 Shpenzimt e perfaqesimit","665-07 Asete nen 1000 euro","665-09 Te tjera",
  "667-01 Sherbimet e kontabilitetit","667-02 Sherbime ligjore","667-03 Sherbime konsulente","667-04 Sherbime auditimi",
  "668-01 Akomodimi","668-02 Meditja","668-03 Transporti",
  "669-01 Shpenzimet e karburantit","669-02 Mirembajtje e riparim",
  "675-01 Interneti","675-02 Telefon mobil","675-03 Dergesa postare","675-04 Telefon fiks",
  "683-01 Sigurimi i automjeteve","683-02 Sigurimi i nderteses",
  "686-01 Energjia elektrike","686-02 Ujesjellesi","686-03 Pastrimi","686-04 Shpenzimet e ngrohjes",
  "690-01 Shpenzimet e anetaresimit","690-02 Shpenzimet e perkthimit","690-03 Provizion bankar","690-04 Mirembajtje e webfaqes","690-05 Taksa komunale","690-06 Mirembajtje e llogarise bankare","690-09 Te tjera"
]

**MANDATORY VAT CODES (Kosovo):**
Select one per item. Default to "No VAT".
[
  "[31] Blerjet dhe importet pa TVSH",
  "[32] Blerjet dhe importet investive pa TVSH",
  "[33] Blerjet dhe importet me TVSH jo të zbritshme",
  "[34] Blerjet dhe importet investive me TVSH jo të zbritshme",
  "[35] Importet 18%",
  "[37] Importet 8%",
  "[39] Importet investive 18%",
  "[41] Importet investive 8%",
  "[43] Blerjet vendore 18%",
  "No VAT",
  "[45] Blerjet vendore 8%",
  "[47] Blerjet investive vendore 18%",
  "[49] Blerjet investive vendore 8%",
  "[65] E drejta e kreditimit të TVSH-së në lidhje me Ngarkesën e Kundërt 18%",
  "[28] Blerjet që i nënshtrohen ngarkesës së kundërt 18%"
]

**FIELDS PER ITEM:**
name, category, amount, date (YYYY-MM-DD), merchant, tvsh_percentage, vat_code,
pageNumber, nui, nr_fiskal, numri_i_tvsh_se, description, sasia (default 1), njesia (default "cope").

**TOP-LEVEL FIELDS:**
vendor_name, vendor_tax_number, bill_number, bill_date, subtotal, vat_8_amount,
vat_18_amount, total_vat, total_amount, currency (default EUR), payment_method, confidence_score (0-1).

Return JSON with keys: { ...top_level_fields, expenses: [...] }.`;

// ---------------------------------------------------------------------------
// Gemini service
// ---------------------------------------------------------------------------
class GeminiService {
  private client: GoogleGenerativeAI | null = null;
  private modelName = "gemini-3-flash-preview";

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
    }
  }

  /**
   * Extract structured expense data from one or more receipt images.
   */
  async extractFromImages(
    imageBuffers: { data: Buffer; mimeType: string }[]
  ): Promise<GeminiExtractionResult> {
    if (!this.client) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const model = this.client.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: 0.1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    // Build multimodal parts
    const parts: any[] = [{ text: SYSTEM_PROMPT }];

    for (const img of imageBuffers) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data.toString("base64"),
        },
      });
    }

    parts.push({
      text: "Extract all expense data from the receipt image(s) above.",
    });

    const result = await model.generateContent({ contents: [{ role: "user", parts }] });
    const text = result.response.text();

    if (!text) throw new Error("Empty response from Gemini");

    const parsed = JSON.parse(text) as GeminiExtractionResult;

    // Enforce category fallback
    const VALID_CATEGORIES = [
      "660-01 Paga bruto","660-02 Sigurimi shendetesor","660-03 Kontributi pensional",
      "665-01 Shpenzimet e qirase","665-02 Material harxhues","665-03 Pastrimi","665-04 Ushqim dhe pije","665-05 Shpenzime te IT-se","665-06 Shpenzimt e perfaqesimit","665-07 Asete nen 1000 euro","665-09 Te tjera",
      "667-01 Sherbimet e kontabilitetit","667-02 Sherbime ligjore","667-03 Sherbime konsulente","667-04 Sherbime auditimi",
      "668-01 Akomodimi","668-02 Meditja","668-03 Transporti",
      "669-01 Shpenzimet e karburantit","669-02 Mirembajtje e riparim",
      "675-01 Interneti","675-02 Telefon mobil","675-03 Dergesa postare","675-04 Telefon fiks",
      "683-01 Sigurimi i automjeteve","683-02 Sigurimi i nderteses",
      "686-01 Energjia elektrike","686-02 Ujesjellesi","686-03 Pastrimi","686-04 Shpenzimet e ngrohjes",
      "690-01 Shpenzimet e anetaresimit","690-02 Shpenzimet e perkthimit","690-03 Provizion bankar","690-04 Mirembajtje e webfaqes","690-05 Taksa komunale","690-06 Mirembajtje e llogarise bankare","690-09 Te tjera",
    ];

    if (parsed.expenses && Array.isArray(parsed.expenses)) {
      parsed.expenses = parsed.expenses.map((exp) => ({
        ...exp,
        category: VALID_CATEGORIES.includes(exp.category?.trim())
          ? exp.category.trim()
          : "690-09 Te tjera",
        sasia: exp.sasia ?? 1,
        njesia: exp.njesia ?? "cope",
        vat_code: exp.vat_code ?? "No VAT",
      }));
    }

    return parsed;
  }

  /**
   * Generate text for embedding (used in duplicate detection).
   */
  buildEmbeddingText(data: GeminiExtractionResult): string {
    const parts = [
      `Vendor: ${data.vendor_name}`,
      `NUI: ${data.vendor_tax_number || "N/A"}`,
      `Bill: ${data.bill_number || "N/A"}`,
      `Date: ${data.bill_date || "N/A"}`,
      `Total: ${data.total_amount} ${data.currency}`,
    ];
    for (const item of data.expenses || []) {
      parts.push(`Item: ${item.name} x${item.sasia} = ${item.amount}`);
    }
    return parts.join(" | ");
  }

  /**
   * Generate a 768-dim embedding via Gemini embedding model.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.client) throw new Error("GEMINI_API_KEY not configured");

    const model = this.client.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(text);
    return result.embedding.values;
  }
}

export const geminiService = new GeminiService();
