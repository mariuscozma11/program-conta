export interface ANAFInvoiceRecord {
  nrFactur: string;        // Nr. factur
  dataEmitere: string;     // Data emitere  
  denumireEmitent: string; // Denumire emitent
  cifEmitent: string;      // CIF emitent (without RO prefix)
  cotaTVA: string;         // Cota TVA
  baza: string;            // Baza (VAT base amount)
}

export class CSVParser {
  
  static async parseCSV(csvFile: File): Promise<ANAFInvoiceRecord[]> {
    try {
      const csvText = await this.fileToText(csvFile);
      const records = this.parseCSVContent(csvText);
      return records;
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
  
  private static parseCSVContent(csvText: string): ANAFInvoiceRecord[] {
    const records: ANAFInvoiceRecord[] = [];
    
    // Split into lines
    const lines = csvText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    if (lines.length === 0) return records;
    
    // Parse header to get column mapping
    const headers = this.parseCSVLine(lines[0]);
    let columnMapping: { [key: string]: number } = {};
    
    // Map our required fields to column indices based on ANAF CSV format
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toLowerCase().trim();
      // ANAF CSV has specific column names
      if (header === 'nr_factura') {
        columnMapping['nrFactur'] = i;
      } else if (header === 'data_emitere') {
        columnMapping['dataEmitere'] = i;
      } else if (header === 'den_vanzator') {
        columnMapping['denumireEmitent'] = i;
      } else if (header === 'vanz_cui') {
        columnMapping['cifEmitent'] = i;
      } else if (header === 'cota_tva') {
        columnMapping['cotaTVA'] = i;
      } else if (header === 'baza_calcul') {
        columnMapping['baza'] = i;
      }
    }
    
    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.length === 0) continue;
      
      try {
        const columns = this.parseCSVLine(line);
        
        if (columns.length >= Math.max(...Object.values(columnMapping))) {
          const record: ANAFInvoiceRecord = {
            nrFactur: columns[columnMapping['nrFactur']] || '',
            dataEmitere: columns[columnMapping['dataEmitere']] || '',
            denumireEmitent: columns[columnMapping['denumireEmitent']] || '',
            cifEmitent: columns[columnMapping['cifEmitent']] || '',
            cotaTVA: columns[columnMapping['cotaTVA']] || '',
            baza: columns[columnMapping['baza']] || ''
          };
          
          // Clean up CIF (remove RO prefix if present)
          if (record.cifEmitent.startsWith('RO')) {
            record.cifEmitent = record.cifEmitent.substring(2);
          }
          
          // Clean up amounts (convert comma to dot)
          record.baza = record.baza.replace(',', '.');
          
          // Only add records with valid data
          if (record.nrFactur && record.dataEmitere && record.cifEmitent) {
            records.push(record);
          }
        }
      } catch (error) {
        // Skip invalid lines silently
        continue;
      }
    }
    
    return records;
  }
  
  private static parseCSVLine(line: string): string[] {
    // ANAF CSV uses pipe (|) as delimiter, much simpler parsing
    return line.split('|').map(field => field.trim());
  }
}