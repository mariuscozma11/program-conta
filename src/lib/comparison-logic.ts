import { ExcelInvoiceRecord } from './excel-parser';
import { ANAFInvoiceRecord } from './csv-parser';

export interface ComparisonResult {
  missingFromCSV: ExcelInvoiceRecord[];     // Yellow - in Excel but not in CSV/ANAF
  missingFromExcel: ANAFInvoiceRecord[];     // Orange - in CSV/ANAF but not in Excel
  valueDifferences: MatchedRecord[];        // Orange - present in both but values differ
  transactionDifferences: MatchedRecord[];  // Blue - only company/CIF differences (likely transaction counterparty)
  perfectMatches: MatchedRecord[];          // Green - perfect matches
}

export interface MatchedRecord {
  excelRecord: ExcelInvoiceRecord;
  csvRecord: ANAFInvoiceRecord;
  differences: string[];
  matchType: 'exact' | 'invoice-only'; // Type of matching used
}

export class ComparisonLogic {
  
  static compareRecords(excelRecords: ExcelInvoiceRecord[], csvRecords: ANAFInvoiceRecord[]): ComparisonResult {
    const result: ComparisonResult = {
      missingFromCSV: [],
      missingFromExcel: [],
      valueDifferences: [],
      transactionDifferences: [],
      perfectMatches: []
    };

    // Create lookup maps for efficient comparison
    const csvExactMap = new Map<string, ANAFInvoiceRecord>();
    const csvInvoiceMap = new Map<string, ANAFInvoiceRecord[]>();
    const excelExactMap = new Map<string, ExcelInvoiceRecord>();
    const excelInvoiceMap = new Map<string, ExcelInvoiceRecord[]>();
    
    // Build CSV lookup maps
    csvRecords.forEach(record => {
      // Exact match map (CIF + Invoice)
      const exactKey = this.createRecordKey(record.cifEmitent, record.nrFactur);
      csvExactMap.set(exactKey, record);
      
      // Invoice-only map  
      const invoiceKey = this.normalizeInvoiceNumber(record.nrFactur);
      if (!csvInvoiceMap.has(invoiceKey)) {
        csvInvoiceMap.set(invoiceKey, []);
      }
      csvInvoiceMap.get(invoiceKey)!.push(record);
    });
    
    // Build Excel lookup maps
    excelRecords.forEach(record => {
      // Exact match map (CIF + Invoice)
      const exactKey = this.createRecordKey(record.cifEmitent, record.nrFactur);
      excelExactMap.set(exactKey, record);
      
      // Invoice-only map
      const invoiceKey = this.normalizeInvoiceNumber(record.nrFactur);
      if (!excelInvoiceMap.has(invoiceKey)) {
        excelInvoiceMap.set(invoiceKey, []);
      }
      excelInvoiceMap.get(invoiceKey)!.push(record);
    });

    const processedExcel = new Set<ExcelInvoiceRecord>();
    const processedCSV = new Set<ANAFInvoiceRecord>();

    // Phase 1: Exact matches (CIF + Invoice)
    excelRecords.forEach(excelRecord => {
      const exactKey = this.createRecordKey(excelRecord.cifEmitent, excelRecord.nrFactur);
      const csvRecord = csvExactMap.get(exactKey);
      
      if (csvRecord) {
        processedExcel.add(excelRecord);
        processedCSV.add(csvRecord);
        
        const differences = this.findDifferences(excelRecord, csvRecord);
        
        if (differences.length === 0) {
          result.perfectMatches.push({
            excelRecord,
            csvRecord,
            differences: [],
            matchType: 'exact'
          });
        } else {
          // Check if it's a transaction difference (only company/CIF differences)
          if (this.isTransactionDifference(differences)) {
            result.transactionDifferences.push({
              excelRecord,
              csvRecord,
              differences,
              matchType: 'exact'
            });
          } else {
            result.valueDifferences.push({
              excelRecord,
              csvRecord,
              differences,
              matchType: 'exact'
            });
          }
        }
      }
    });

    // Phase 2: Invoice-only matches for remaining records
    excelRecords.forEach(excelRecord => {
      if (processedExcel.has(excelRecord)) return;
      
      const invoiceKey = this.normalizeInvoiceNumber(excelRecord.nrFactur);
      const csvCandidates = csvInvoiceMap.get(invoiceKey) || [];
      
      // Find best CSV match (unprocessed and closest date/amount)
      let bestMatch: ANAFInvoiceRecord | null = null;
      let bestScore = -1;
      
      csvCandidates.forEach(csvRecord => {
        if (processedCSV.has(csvRecord)) return;
        
        const score = this.calculateMatchScore(excelRecord, csvRecord);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = csvRecord;
        }
      });
      
      if (bestMatch && bestScore > 0.5) { // Minimum confidence threshold
        processedExcel.add(excelRecord);
        processedCSV.add(bestMatch);
        
        const differences = this.findDifferences(excelRecord, bestMatch);
        
        if (differences.length === 0) {
          result.perfectMatches.push({
            excelRecord,
            csvRecord: bestMatch,
            differences: [],
            matchType: 'invoice-only'
          });
        } else {
          // Check if it's a transaction difference (only company/CIF differences)
          if (this.isTransactionDifference(differences)) {
            result.transactionDifferences.push({
              excelRecord,
              csvRecord: bestMatch,
              differences,
              matchType: 'invoice-only'
            });
          } else {
            result.valueDifferences.push({
              excelRecord,
              csvRecord: bestMatch,
              differences,
              matchType: 'invoice-only'
            });
          }
        }
      }
    });

    // Phase 3: Add unmatched records
    excelRecords.forEach(record => {
      if (!processedExcel.has(record)) {
        result.missingFromCSV.push(record);
      }
    });

    csvRecords.forEach(record => {
      if (!processedCSV.has(record)) {
        result.missingFromExcel.push(record);
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
    
    // Compare CIF (case insensitive, trimmed)
    if (!this.cifsMatch(excelRecord.cifEmitent, csvRecord.cifEmitent)) {
      differences.push(`CIF: Excel="${excelRecord.cifEmitent}" vs ANAF="${csvRecord.cifEmitent}"`);
    }
    
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
    
    // First try exact match
    if (normalized1 === normalized2) {
      return true;
    }
    
    // Then try flexible matching - check if one contains key words of the other
    return this.flexibleCompanyMatch(normalized1, normalized2);
  }

  private static cifsMatch(cif1: string, cif2: string): boolean {
    const normalized1 = this.normalizeCIF(cif1);
    const normalized2 = this.normalizeCIF(cif2);
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

  private static isTransactionDifference(differences: string[]): boolean {
    // Check if differences only involve company name and/or CIF
    const isOnlyCompanyDifferences = differences.every(diff => 
      diff.toLowerCase().includes('cif:') || 
      diff.toLowerCase().includes('denumire:')
    );
    
    return isOnlyCompanyDifferences && differences.length > 0;
  }

  private static flexibleCompanyMatch(name1: string, name2: string): boolean {
    // Remove common legal forms and stop words
    const stopWords = ['srl', 'sa', 's.a.', 's.r.l.', 'impex', 'com', 'prod', 'serv', 'grup', 'group', 'companie', 'company', 'institut', 'institutul', 'national', 'nazionale', 'de', 'pentru', 'si', 'cu', 'in', 'la', 'pe', 'din', 'prin', 'dezvoltare', 'cercetare', '-'];
    
    const extractKeyWords = (name: string): string[] => {
      return name
        .split(/[\s\-]+/)
        .filter(word => word.length > 2) // Keep words longer than 2 characters
        .filter(word => !stopWords.includes(word))
        .filter(word => word !== '');
    };

    const words1 = extractKeyWords(name1);
    const words2 = extractKeyWords(name2);
    
    if (words1.length === 0 || words2.length === 0) {
      return false;
    }

    // Check if the shorter name's words are all contained in the longer name
    const [shorter, longer] = words1.length <= words2.length ? [words1, words2] : [words2, words1];
    
    // At least 70% of shorter name words should be found in longer name
    const minMatches = Math.max(1, Math.ceil(shorter.length * 0.7));
    let matches = 0;
    
    for (const word of shorter) {
      if (longer.some(longerWord => longerWord.includes(word) || word.includes(longerWord))) {
        matches++;
      }
    }
    
    return matches >= minMatches;
  }

  private static normalizeCIF(cif: string): string {
    // Remove all spaces and convert to uppercase for CIF comparison
    return cif
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ''); // Remove all spaces
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

  private static normalizeInvoiceNumber(invoice: string): string {
    // Remove spaces and convert to uppercase for invoice-only matching
    return invoice.trim().toUpperCase().replace(/\s+/g, '');
  }

  private static calculateMatchScore(excelRecord: ExcelInvoiceRecord, csvRecord: ANAFInvoiceRecord): number {
    let score = 0;
    
    // Date similarity (0-0.4 points)
    if (this.datesMatch(excelRecord.dataEmitere, csvRecord.dataEmitere)) {
      score += 0.4;
    } else {
      // Partial score for close dates
      const excelDate = new Date(this.normalizeDate(excelRecord.dataEmitere));
      const csvDate = new Date(this.normalizeDate(csvRecord.dataEmitere));
      const daysDiff = Math.abs(excelDate.getTime() - csvDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff <= 7) score += 0.2; // Within a week
    }
    
    // Amount similarity (0-0.4 points)  
    if (this.numbersMatch(excelRecord.baza, csvRecord.baza)) {
      score += 0.4;
    } else {
      // Partial score for close amounts
      const excelAmount = this.normalizeNumber(excelRecord.baza);
      const csvAmount = this.normalizeNumber(csvRecord.baza);
      const percentDiff = Math.abs(excelAmount - csvAmount) / Math.max(excelAmount, csvAmount);
      if (percentDiff <= 0.05) score += 0.2; // Within 5%
    }
    
    // VAT rate similarity (0-0.2 points)
    if (this.numbersMatch(excelRecord.cotaTVA, csvRecord.cotaTVA)) {
      score += 0.2;
    }
    
    return score;
  }
}