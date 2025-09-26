export interface CSVRecord {
  [key: string]: string;   // Dynamic record with any column names
}

export interface CSVParseResult {
  headers: string[];       // Column headers
  records: CSVRecord[];    // Data records
}

export class CSVParser {
  
  static async parseCSV(csvFile: File): Promise<CSVParseResult> {
    try {
      const csvText = await this.fileToText(csvFile);
      const result = this.parseCSVContent(csvText);
      return result;
    } catch (error) {
      console.error('Error parsing CSV:', error);
      throw new Error(`Failed to parse CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  private static async fileToText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to read file as text'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file, 'utf-8');
    });
  }
  
  private static parseCSVContent(csvText: string): CSVParseResult {
    const records: CSVRecord[] = [];
    
    // Split into lines
    const lines = csvText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length === 0) return { headers: [], records: [] };
    
    // Parse header to get column names
    const headers = this.parseCSVLine(lines[0]);
    
    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.length === 0) continue;
      
      try {
        const columns = this.parseCSVLine(line);
        
        if (columns.length > 0) {
          const record: CSVRecord = {};
          
          // Map each column to its header
          for (let j = 0; j < Math.max(headers.length, columns.length); j++) {
            const header = headers[j] || `Column_${j + 1}`;
            const value = columns[j] || '';
            record[header] = value.trim();
          }
          
          records.push(record);
        }
      } catch {
        // Skip invalid lines silently
        continue;
      }
    }
    
    return { headers, records };
  }
  
  private static parseCSVLine(line: string): string[] {
    // Try to detect delimiter (comma, semicolon, pipe, tab)
    const delimiters = [',', ';', '|', '\t'];
    let bestDelimiter = ',';
    let maxFields = 0;
    
    for (const delimiter of delimiters) {
      const fields = line.split(delimiter);
      if (fields.length > maxFields) {
        maxFields = fields.length;
        bestDelimiter = delimiter;
      }
    }
    
    // Parse CSV line with proper quote handling
    const fields: string[] = [];
    const chars = line.split('');
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < chars.length) {
      const char = chars[i];
      
      if (char === '"') {
        if (inQuotes && chars[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === bestDelimiter && !inQuotes) {
        // Field separator
        fields.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    // Add the last field
    fields.push(current.trim());
    
    return fields.map(field => field.replace(/^"(.*)"$/, '$1')); // Remove surrounding quotes
  }
}