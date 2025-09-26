import * as XLSX from 'xlsx';

export interface ExcelRecord {
  [key: string]: string;   // Dynamic record with any column names
}

export interface ExcelParseResult {
  headers: string[];       // Column headers
  records: ExcelRecord[];  // Data records
}

export class ExcelParser {
  
  static async parseExcel(excelFile: File): Promise<ExcelParseResult> {
    try {
      // Read file as ArrayBuffer for XLS/XLSX support
      const arrayBuffer = await this.fileToArrayBuffer(excelFile);
      
      // Parse the Excel file
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // Get the first worksheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON array with header row
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as (string | number | Date)[][];
      
      const result = this.parseExcelData(jsonData);
      return result;
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
  
  private static parseExcelData(jsonData: (string | number | Date)[][]): ExcelParseResult {
    const records: ExcelRecord[] = [];
    
    if (jsonData.length === 0) return { headers: [], records: [] };
    
    // Get headers from first row
    const headers = jsonData[0].map((header, index) => {
      const headerStr = String(header || '').trim();
      return headerStr || `Column_${index + 1}`;
    });
    
    // Parse data rows (skip header)
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) continue;
      
      try {
        const record: ExcelRecord = {};
        
        // Map each column to its header
        for (let j = 0; j < Math.max(headers.length, row.length); j++) {
          const header = headers[j] || `Column_${j + 1}`;
          const value = row[j];
          
          // Convert value to string and handle different types
          if (value === null || value === undefined) {
            record[header] = '';
          } else if (value instanceof Date) {
            // Format dates as YYYY-MM-DD
            record[header] = this.formatDateToString(value);
          } else {
            record[header] = String(value).trim();
          }
        }
        
        records.push(record);
      } catch {
        // Skip invalid rows silently
        continue;
      }
    }
    
    return { headers, records };
  }

  private static formatDateToString(date: Date): string {
    try {
      if (!date || isNaN(date.getTime()) || date.getFullYear() < 1900 || date.getFullYear() > 2100) {
        return '';
      }
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  }
}