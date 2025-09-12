import { ExcelInvoiceRecord } from './excel-parser';
import { ANAFInvoiceRecord } from './csv-parser';

export interface ComparisonResult {
  missingFromCSV: ExcelInvoiceRecord[];     // Yellow - in Excel but not in CSV/ANAF
  missingFromExcel: ANAFInvoiceRecord[];     // Orange - in CSV/ANAF but not in Excel
  valueDifferences: MatchedRecord[];        // Different color - present in both but values differ
  perfectMatches: MatchedRecord[];          // Green - perfect matches
}

export interface MatchedRecord {
  excelRecord: ExcelInvoiceRecord;
  csvRecord: ANAFInvoiceRecord;
  differences: string[];
}

export class ComparisonLogic {
  
  static compareRecords(excelRecords: ExcelInvoiceRecord[], csvRecords: ANAFInvoiceRecord[]): ComparisonResult {
    const result: ComparisonResult = {
      missingFromCSV: [],
      missingFromExcel: [],
      valueDifferences: [],
      perfectMatches: []
    };

    // Create lookup maps for efficient comparison
    const csvMap = new Map<string, ANAFInvoiceRecord>();
    const excelMap = new Map<string, ExcelInvoiceRecord>();
    
    // Build CSV lookup map using CIF + Invoice Number as key
    csvRecords.forEach(record => {
      const key = this.createRecordKey(record.cifEmitent, record.nrFactur);
      csvMap.set(key, record);
    });
    
    // Build Excel lookup map
    excelRecords.forEach(record => {
      const key = this.createRecordKey(record.cifEmitent, record.nrFactur);
      excelMap.set(key, record);
    });

    // Check each Excel record against CSV
    excelRecords.forEach(excelRecord => {
      const key = this.createRecordKey(excelRecord.cifEmitent, excelRecord.nrFactur);
      const csvRecord = csvMap.get(key);
      
      if (!csvRecord) {
        // Case 1: Missing from CSV (ANAF) - YELLOW
        result.missingFromCSV.push(excelRecord);
      } else {
        // Record exists in both - check for differences
        const differences = this.findDifferences(excelRecord, csvRecord);
        
        if (differences.length === 0) {
          // Case 4: Perfect Match - GREEN
          result.perfectMatches.push({
            excelRecord,
            csvRecord,
            differences: []
          });
        } else {
          // Case 3: Value Differences - ANOTHER COLOR
          result.valueDifferences.push({
            excelRecord,
            csvRecord,
            differences
          });
        }
      }
    });

    // Check each CSV record to find ones missing from Excel
    csvRecords.forEach(csvRecord => {
      const key = this.createRecordKey(csvRecord.cifEmitent, csvRecord.nrFactur);
      const excelRecord = excelMap.get(key);
      
      if (!excelRecord) {
        // Case 2: Missing from Excel - ORANGE
        result.missingFromExcel.push(csvRecord);
      }
    });

    return result;
  }

  private static createRecordKey(cif: string, nrFactur: string): string {
    // Normalize CIF (remove spaces, convert to uppercase)
    const normalizedCif = cif.trim().toUpperCase();
    // Normalize invoice number (remove spaces, convert to uppercase)
    const normalizedNr = nrFactur.trim().toUpperCase();
    return `${normalizedCif}|${normalizedNr}`;
  }

  private static findDifferences(excelRecord: ExcelInvoiceRecord, csvRecord: ANAFInvoiceRecord): string[] {
    const differences: string[] = [];
    
    // Compare dates (normalize format)
    if (!this.datesMatch(excelRecord.dataEmitere, csvRecord.dataEmitere)) {
      differences.push(`Data emitere: Excel="${excelRecord.dataEmitere}" vs ANAF="${csvRecord.dataEmitere}"`);
    }
    
    // Compare company names (case insensitive, trimmed)
    if (!this.stringsMatch(excelRecord.denumireEmitent, csvRecord.denumireEmitent)) {
      differences.push(`Denumire: Excel="${excelRecord.denumireEmitent}" vs ANAF="${csvRecord.denumireEmitent}"`);
    }
    
    // Compare VAT rates (normalize numbers)
    if (!this.numbersMatch(excelRecord.cotaTVA, csvRecord.cotaTVA)) {
      differences.push(`Cota TVA: Excel="${excelRecord.cotaTVA}" vs ANAF="${csvRecord.cotaTVA}"`);
    }
    
    // Compare VAT base amounts (normalize numbers)
    if (!this.numbersMatch(excelRecord.baza, csvRecord.baza)) {
      differences.push(`Baza TVA: Excel="${excelRecord.baza}" vs ANAF="${csvRecord.baza}"`);
    }
    
    return differences;
  }

  private static datesMatch(date1: string, date2: string): boolean {
    // Normalize date formats and compare
    const normalizedDate1 = this.normalizeDate(date1);
    const normalizedDate2 = this.normalizeDate(date2);
    return normalizedDate1 === normalizedDate2;
  }

  private static normalizeDate(dateStr: string): string {
    if (!dateStr) return '';
    
    // Try to parse different date formats and return YYYY-MM-DD
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        // Try DD/MM/YYYY or DD.MM.YYYY format
        const parts = dateStr.split(/[\/\.-]/);
        if (parts.length === 3) {
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          const year = parts[2];
          return `${year}-${month}-${day}`;
        }
        return dateStr.trim();
      }
      return date.toISOString().split('T')[0];
    } catch {
      return dateStr.trim();
    }
  }

  private static stringsMatch(str1: string, str2: string): boolean {
    const normalized1 = this.normalizeCompanyName(str1);
    const normalized2 = this.normalizeCompanyName(str2);
    return normalized1 === normalized2;
  }

  private static normalizeCompanyName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/\./g, '')  // Remove all dots
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .trim();
  }

  private static numbersMatch(num1: string, num2: string): boolean {
    const normalized1 = this.normalizeNumber(num1);
    const normalized2 = this.normalizeNumber(num2);
    return Math.abs(normalized1 - normalized2) < 0.01; // Allow small floating point differences
  }

  private static normalizeNumber(numStr: string): number {
    if (!numStr) return 0;
    
    // Remove spaces, replace comma with dot for decimal separator
    const cleaned = numStr.toString().trim().replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
}