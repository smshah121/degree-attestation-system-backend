/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import * as Tesseract from 'tesseract.js';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  async extractText(fileBuffer: Buffer): Promise<string> {
    try {
      const { data: { text } } = await Tesseract.recognize(fileBuffer, 'eng');
      return text;
    } catch (error) {
      return '';
    }
  }

  verifyMatch(extractedText: string, exactValue: string): boolean {
    if (!extractedText || !exactValue) return false;
    const cleanOcr = extractedText.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanValue = exactValue.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanOcr.includes(cleanValue);
  }

  /**
   * Target Evaluation Rule: Highly robust university GPA processing engine
   */
  validateGpaMetric(extractedText: string): 'PASSED' | 'REJECTED' | 'UNREADABLE' {
    // 1. Clean common OCR symbol glitches to fix misread text patterns
    let text = extractedText.toUpperCase();
    text = text.replace(/[£¢€]/g, ''); // Strips out misread currency symbols like £
    text = text.replace(/CEA/g, 'CGPA'); // Fixes Tesseract's CEA typo match explicitly

    let extractedGpa = 0.0;

    // Pattern A: Primary Match (e.g., "CGPA 2.37" or "CGPA) 2.37")
    const primaryGpaRegex = /(?:CGPA|GPA|CUMULATIVE)[\s\D]*([0-4]\.\d{1,2})/i;
    const primaryMatch = text.match(primaryGpaRegex);

    if (primaryMatch && primaryMatch[1]) {
      extractedGpa = parseFloat(primaryMatch[1]);
      this.logger.log(`[OCR SUCCESS] Found standard decimal GPA: ${extractedGpa}`);
    } 
    // Pattern B: Hard Typo Match (e.g., "CEA) 237" or "CGPA 237" where the decimal point is missing)
    else {
      const brokenDecimalRegex = /(?:CGPA|GPA|CUMULATIVE|CEA)[\s\D]*([0-4])\s*(\d{2})/i;
      const brokenMatch = text.match(brokenDecimalRegex);

      if (brokenMatch && brokenMatch[1] && brokenMatch[2]) {
        // Reconstruct "2" and "37" back into "2.37" safely
        extractedGpa = parseFloat(`${brokenMatch[1]}.${brokenMatch[2]}`);
        this.logger.log(`[OCR RECONSTRUCTION] Fixed missing decimal typo: ${extractedGpa}`);
      }
    }

    // Fallback C: Scan for any lone 3-digit sequence starting with 2, 3, or 4 if text context is muddy
    if (extractedGpa === 0.0) {
      const genericDigits = text.match(/\b([2-4])(\d{2})\b/g);
      if (genericDigits && genericDigits.length > 0) {
        const targetToken = genericDigits[genericDigits.length - 1]; // Grabs trailing summary block
        extractedGpa = parseFloat(`${targetToken.charAt(0)}.${targetToken.substring(1)}`);
        this.logger.log(`[OCR FALLBACK] Inferred standalone values sequence: ${extractedGpa}`);
      }
    }

    // Safety check if document text layers are completely empty
    if (extractedGpa === 0.0) {
      this.logger.warn('[OCR AGENT] Failed to pull numeric indicators out of document layout.');
      return 'UNREADABLE';
    }

    this.logger.log(`[OCR AGENT PROCESSED] Computed Value: ${extractedGpa} | Benchmark Threshold State: ${extractedGpa >= 2.5 ? 'PASSED' : 'REJECTED'}`);

    return extractedGpa >= 2.5 ? 'PASSED' : 'REJECTED';
  }
}