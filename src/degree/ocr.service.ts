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

 
  validateGpaMetric(extractedText: string): 'PASSED' | 'REJECTED' | 'UNREADABLE' {
 
    let text = extractedText.toUpperCase();
    text = text.replace(/[£¢€]/g, ''); 
    text = text.replace(/CEA/g, 'CGPA'); 

    let extractedGpa = 0.0;


    const primaryGpaRegex = /(?:CGPA|GPA|CUMULATIVE)[\s\D]*([0-4]\.\d{1,2})/i;
    const primaryMatch = text.match(primaryGpaRegex);

    if (primaryMatch && primaryMatch[1]) {
      extractedGpa = parseFloat(primaryMatch[1]);
      this.logger.log(`[OCR SUCCESS] Found standard decimal GPA: ${extractedGpa}`);
    } 
   
    else {
      const brokenDecimalRegex = /(?:CGPA|GPA|CUMULATIVE|CEA)[\s\D]*([0-4])\s*(\d{2})/i;
      const brokenMatch = text.match(brokenDecimalRegex);

      if (brokenMatch && brokenMatch[1] && brokenMatch[2]) {
       
        extractedGpa = parseFloat(`${brokenMatch[1]}.${brokenMatch[2]}`);
        this.logger.log(`[OCR RECONSTRUCTION] Fixed missing decimal typo: ${extractedGpa}`);
      }
    }

   
    if (extractedGpa === 0.0) {
      const genericDigits = text.match(/\b([2-4])(\d{2})\b/g);
      if (genericDigits && genericDigits.length > 0) {
        const targetToken = genericDigits[genericDigits.length - 1]; // Grabs trailing summary block
        extractedGpa = parseFloat(`${targetToken.charAt(0)}.${targetToken.substring(1)}`);
        this.logger.log(`[OCR FALLBACK] Inferred standalone values sequence: ${extractedGpa}`);
      }
    }


    if (extractedGpa === 0.0) {
      this.logger.warn('[OCR AGENT] Failed to pull numeric indicators out of document layout.');
      return 'UNREADABLE';
    }

    this.logger.log(`[OCR AGENT PROCESSED] Computed Value: ${extractedGpa} | Benchmark Threshold State: ${extractedGpa >= 2.5 ? 'PASSED' : 'REJECTED'}`);

    return extractedGpa >= 2.5 ? 'PASSED' : 'REJECTED';
  }
}