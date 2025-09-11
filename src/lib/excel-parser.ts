import * as XLSX from 'xlsx';

export interface ExcelInvoiceRecord {
  nrFactur: string;        // Nr factur (column C - nr)
  dataEmitere: string;     // Data emitere (column B - data)  
  denumireEmitent: string; // Denumire emitent (column D - denumire)
  cifEmitent: string;      // CIF emitent (column E - cod_fisc, with RO prefix)
  cotaTVA: string;         // Cota TVA (column F - tva_art)
  baza: string;            // Baza (column H - baza_tva)
}

export class ExcelParser {
  
  static async parseExcel(excelFile: File): Promise<ExcelInvoiceRecord[]> {
    try {
      // Read file as ArrayBuffer for XLS/XLSX support
      const arrayBuffer = await this.fileToArrayBuffer(excelFile);
      
      // Parse the Excel file
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // Get the first worksheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON array with header row, let XLSX format dates
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as (string | number | Date)[][];
      
      const records = this.parseExcelData(jsonData);
      return records;
    } catch (error) {
      console.error('Error parsing Excel:', error);
      throw new Error(`Failed to parse Excel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  private static async fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as ArrayBuffer'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
  
  private static parseExcelData(jsonData: (string | number | Date)[][]): ExcelInvoiceRecord[] {
    const records: ExcelInvoiceRecord[] = [];
    
    if (jsonData.length === 0) return records;
    
    // Find header row and create column mapping
    const headers = jsonData[0];
    const columnMapping: { [key: string]: number } = {};
    
    // Map Excel columns based on the structure from CLAUDE.md
    // Column B (data): Date, Column C (nr): Invoice Number, etc.
    for (let i = 0; i < headers.length; i++) {
      const header = String(headers[i] || '').toLowerCase().trim();
      
      // Map based on column positions (B=1, C=2, D=3, E=4, F=5, H=7)
      if (header === 'data' || i === 1) { // Column B
        columnMapping['dataEmitere'] = i;
      } else if (header === 'nr' || i === 2) { // Column C
        columnMapping['nrFactur'] = i;
      } else if (header === 'denumire' || i === 3) { // Column D
        columnMapping['denumireEmitent'] = i;
      } else if (header === 'cod_fisc' || i === 4) { // Column E
        columnMapping['cifEmitent'] = i;
      } else if (header === 'tva_art' || i === 5) { // Column F
        columnMapping['cotaTVA'] = i;
      } else if (header === 'baza_tva' || i === 7) { // Column H
        columnMapping['baza'] = i;
      }
    }
    
    // Parse data rows (skip header)
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) continue;
      
      try {
        let cifEmitent = String(row[columnMapping['cifEmitent']] || '').trim();
        
        // Remove RO prefix if present (as per CLAUDE.md requirements)
        if (cifEmitent.toUpperCase().startsWith('RO')) {
          cifEmitent = cifEmitent.substring(2);
        }
        
        const record: ExcelInvoiceRecord = {
          nrFactur: String(row[columnMapping['nrFactur']] || '').trim(),
          dataEmitere: this.formatDateToANAFFormat(row[columnMapping['dataEmitere']]),
          denumireEmitent: String(row[columnMapping['denumireEmitent']] || '').trim(),
          cifEmitent: cifEmitent,
          cotaTVA: String(row[columnMapping['cotaTVA']] || '').trim(),
          baza: String(row[columnMapping['baza']] || '').trim()
        };
        
        // Clean up amounts (convert comma to dot if needed)
        record.baza = record.baza.replace(',', '.');
        
        // Only add records with valid data
        if (record.nrFactur && record.dataEmitere && record.cifEmitent) {
          records.push(record);
        }
      } catch {
        // Skip invalid rows silently
        continue;
      }
    }
    
    return records;
  }

  private static formatDateToANAFFormat(dateValue: string | number | Date | null | undefined): string {
    if (!dateValue && dateValue !== 0) return '';
    
    try {
      let date: Date | null = null;
      
      // Handle different types of date values from Excel
      if (typeof dateValue === 'number') {
        // Excel serial date number - use XLSX utility to convert
        if (XLSX.SSF && XLSX.SSF.parse_date_code) {
          date = XLSX.SSF.parse_date_code(dateValue);
        }
        
        // If XLSX utility not available or failed, use simple conversion
        if (!date || isNaN(date.getTime())) {
          // Simple Excel date conversion: Excel day 1 = January 1, 1900
          // But Excel incorrectly treats 1900 as a leap year, so adjust
          const daysToAdd = dateValue > 59 ? dateValue - 2 : dateValue - 1;
          date = new Date(1900, 0, 1);
          date.setDate(date.getDate() + daysToAdd);
        }
      } else if (dateValue instanceof Date) {
        date = dateValue;
      } else {
        // Try to parse string date
        const dateStr = String(dateValue).trim();
        date = new Date(dateStr);
        
        // If invalid, try DD/MM/YYYY format
        if (isNaN(date.getTime())) {
          const parts = dateStr.split(/[\/\.-]/);
          if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            date = new Date(year, month, day);
          }
        }
      }
      
      // Format as YYYY-MM-DD (ANAF format)
      if (date && !isNaN(date.getTime()) && date.getFullYear() > 1900 && date.getFullYear() < 2100) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      
      // If all parsing fails, return empty string
      return '';
      
    } catch (error) {
      console.warn('Date parsing error for value:', dateValue, error);
      return '';
    }
  }
}