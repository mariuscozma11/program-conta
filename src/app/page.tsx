'use client';

import { useState, useRef } from 'react';
import { CSVParser, CSVParseResult } from '@/lib/csv-parser';
import { ExcelParser, ExcelParseResult } from '@/lib/excel-parser';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Typography,
  TextField,
  IconButton,
  Modal,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  LinearProgress,
  Grid,
  Divider,
  Tooltip,
  Badge,
  Stack
} from '@mui/material';
import {
  Close,
  CompareArrows,
  Delete,
  Visibility,
  Check,
  Warning,
  Upload,
  TableChart,
  Analytics,
  Error as ErrorIcon,
  Download,
  SwapHoriz
} from '@mui/icons-material';

interface FileState {
  excelFile: File | null;
  csvFile: File | null;
}

interface ColumnMapping {
  excel: string;
  csv: string;
  color: string;
}

interface ColumnSelection {
  excel: string[];
  csv: string[];
  mappings: ColumnMapping[];
}

interface ComparisonResult {
  matches: Array<{
    rowIndex: number;
    csvRowIndex: number;
    excelRow: {[key: string]: string};
    csvRow: {[key: string]: string};
    differences: string[];
  }>;
  onlyInExcel: Array<{
    rowIndex: number;
    row: {[key: string]: string};
  }>;
  onlyInCsv: Array<{
    rowIndex: number;
    row: {[key: string]: string};
  }>;
}

export default function Home() {
  const [fileState, setFileState] = useState<FileState>({
    excelFile: null,
    csvFile: null
  });
  
  const [excelData, setExcelData] = useState<ExcelParseResult | null>(null);
  const [csvData, setCsvData] = useState<CSVParseResult | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<ColumnSelection>({
    excel: [],
    csv: [],
    mappings: []
  });
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState<{excel: boolean; csv: boolean; comparing: boolean}>({
    excel: false,
    csv: false,
    comparing: false
  });
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [availableColors] = useState<string[]>([
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', 
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ]);

  const excelInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>, type: 'excel' | 'csv') => {
    const file = event.target.files?.[0];
    
    if (file) {
      setFileState(prev => ({
        ...prev,
        [type === 'excel' ? 'excelFile' : 'csvFile']: file
      }));
      
      // Parse file immediately when selected
      setLoading(prev => ({ ...prev, [type]: true }));
      setErrorMessage('');
      
      try {
        if (type === 'excel') {
          const result = await ExcelParser.parseExcel(file);
          setExcelData(result);
          setSelectedColumns(prev => ({ ...prev, excel: [], mappings: [] }));
        } else {
          const result = await CSVParser.parseCSV(file);
          setCsvData(result);
          setSelectedColumns(prev => ({ ...prev, csv: [], mappings: [] }));
        }
        setComparisonResult(null);
      } catch (error) {
        console.error(`Error parsing ${type} file:`, error);
        setErrorMessage(`Eroare la procesarea fișierului ${type.toUpperCase()}: ${error instanceof Error ? error.message : 'Eroare necunoscută'}`);
        if (type === 'excel') {
          setExcelData(null);
        } else {
          setCsvData(null);
        }
      } finally {
        setLoading(prev => ({ ...prev, [type]: false }));
      }
    } else {
      setFileState(prev => ({
        ...prev,
        [type === 'excel' ? 'excelFile' : 'csvFile']: null
      }));
      if (type === 'excel') {
        setExcelData(null);
        setSelectedColumns(prev => ({ ...prev, excel: [] }));
      } else {
        setCsvData(null);
        setSelectedColumns(prev => ({ ...prev, csv: [] }));
      }
      setComparisonResult(null);
    }
  };

  const clearFile = (type: 'excel' | 'csv') => {
    if (type === 'excel') {
      setFileState(prev => ({ ...prev, excelFile: null }));
      setExcelData(null);
      setSelectedColumns(prev => ({ ...prev, excel: [] }));
      if (excelInputRef.current) {
        excelInputRef.current.value = '';
      }
    } else {
      setFileState(prev => ({ ...prev, csvFile: null }));
      setCsvData(null);
      setSelectedColumns(prev => ({ ...prev, csv: [] }));
      if (csvInputRef.current) {
        csvInputRef.current.value = '';
      }
    }
    setComparisonResult(null);
  };


  const compareSelectedColumns = () => {
    if (!excelData || !csvData || selectedColumns.mappings.length === 0) {
      setErrorMessage('Vă rugăm să mapați cel puțin o pereche de coloane pentru comparare.');
      return;
    }

    setLoading(prev => ({ ...prev, comparing: true }));
    setErrorMessage('');

    try {
      const result = performComparison(
        excelData,
        csvData,
        selectedColumns
      );
      setComparisonResult(result);
    } catch (error) {
      console.error('Error comparing columns:', error);
      setErrorMessage(`Eroare în timpul comparării: ${error instanceof Error ? error.message : 'Eroare necunoscută'}`);
    } finally {
      setLoading(prev => ({ ...prev, comparing: false }));
    }
  };

  // Helper function to normalize strings for comparison
  const normalizeString = (str: string): string => {
    return str.trim().toLowerCase().replace(/\s+/g, ' ');
  };

  // Helper function to check if two values match using various criteria
  const valuesMatch = (val1: string, val2: string): boolean => {
    if (!val1 && !val2) return true; // Both empty
    if (!val1 || !val2) return false; // One empty
    
    const norm1 = normalizeString(val1);
    const norm2 = normalizeString(val2);
    
    // Exact match
    if (norm1 === norm2) return true;
    
    // Partial match (one contains the other)
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
    
    // Numeric match
    const num1 = parseFloat(norm1);
    const num2 = parseFloat(norm2);
    if (!isNaN(num1) && !isNaN(num2) && num1 === num2) return true;
    
    // Similarity match for text (80% threshold)
    if (norm1.length > 3 && norm2.length > 3) {
      const similarity = calculateSimilarity(norm1, norm2);
      if (similarity > 0.8) return true;
    }
    
    return false;
  };

  const performComparison = (
    excel: ExcelParseResult,
    csv: CSVParseResult,
    columns: ColumnSelection
  ): ComparisonResult => {
    const matches: ComparisonResult['matches'] = [];
    const onlyInExcel: ComparisonResult['onlyInExcel'] = [];
    const onlyInCsv: ComparisonResult['onlyInCsv'] = [];

    console.log('=== COMPARISON DEBUG ===');
    console.log('Excel records:', excel.records.length);
    console.log('CSV records:', csv.records.length);
    console.log('Mappings:', columns.mappings);

    if (columns.mappings.length === 0) {
      console.log('No mappings defined');
      return { matches, onlyInExcel, onlyInCsv };
    }

    const usedCsvIndices = new Set<number>();
    
    excel.records.forEach((excelRow, excelIndex) => {
      console.log(`\n--- Excel row ${excelIndex} ---`);
      
      let bestMatch: {
        csvIndex: number;
        differences: string[];
        excelData: {[key: string]: string};
        csvData: {[key: string]: string};
        score: number;
      } | null = null;
      
      csv.records.forEach((csvRow, csvIndex) => {
        if (usedCsvIndices.has(csvIndex)) return;
        
        const differences: string[] = [];
        const excelData: {[key: string]: string} = {};
        const csvData: {[key: string]: string} = {};
        let matchingFields = 0;
        
        // Compare each mapped column
        columns.mappings.forEach(mapping => {
          const excelVal = excelRow[mapping.excel] || '';
          const csvVal = csvRow[mapping.csv] || '';
          
          excelData[mapping.excel] = excelVal;
          csvData[mapping.csv] = csvVal;
          
          console.log(`Comparing: "${excelVal}" <-> "${csvVal}"`);
          
          if (valuesMatch(excelVal, csvVal)) {
            matchingFields++;
            console.log('✓ Match');
          } else {
            differences.push(`${mapping.excel} (${excelVal}) ≠ ${mapping.csv} (${csvVal})`);
            console.log('✗ No match');
          }
        });
        
        // Calculate match score (higher is better)
        const score = matchingFields / columns.mappings.length;
        console.log(`CSV row ${csvIndex}: ${matchingFields}/${columns.mappings.length} fields match (${(score * 100).toFixed(1)}%)`);
        
        // Accept matches with at least 50% of fields matching
        if (score >= 0.5 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = {
            csvIndex,
            differences,
            excelData,
            csvData,
            score
          };
        }
      });
      
      if (bestMatch) {
        const match = bestMatch as {csvIndex: number, differences: string[], excelData: {[key: string]: string}, csvData: {[key: string]: string}, score: number};
        console.log(`Best match: CSV row ${match.csvIndex} with ${(match.score * 100).toFixed(1)}% match`);
        usedCsvIndices.add(match.csvIndex);
        matches.push({
          rowIndex: excelIndex,
          csvRowIndex: match.csvIndex,
          excelRow: match.excelData,
          csvRow: match.csvData,
          differences: match.differences
        });
      } else {
        console.log('No match found');
        const excelData: {[key: string]: string} = {};
        columns.mappings.forEach(mapping => {
          excelData[mapping.excel] = excelRow[mapping.excel] || '';
        });
        onlyInExcel.push({ rowIndex: excelIndex, row: excelData });
      }
    });
    
    // Find unmatched CSV rows
    csv.records.forEach((csvRow, csvIndex) => {
      if (!usedCsvIndices.has(csvIndex)) {
        const csvData: {[key: string]: string} = {};
        columns.mappings.forEach(mapping => {
          csvData[mapping.csv] = csvRow[mapping.csv] || '';
        });
        onlyInCsv.push({ rowIndex: csvIndex, row: csvData });
      }
    });

    console.log(`\n=== RESULTS ===`);
    console.log(`Matches: ${matches.length}`);
    console.log(`Only in Excel: ${onlyInExcel.length}`);
    console.log(`Only in CSV: ${onlyInCsv.length}`);

    return { matches, onlyInExcel, onlyInCsv };
  };

  // Calculate string similarity using Levenshtein distance
  const calculateSimilarity = (str1: string, str2: string): number => {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;
    
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    const maxLength = Math.max(str1.length, str2.length);
    return (maxLength - matrix[str2.length][str1.length]) / maxLength;
  };

  // Excel export function
  const downloadComparisonReport = () => {
    if (!comparisonResult || !selectedColumns.mappings.length) return;

    const workbook = XLSX.utils.book_new();
    
    // Create summary sheet
    const summaryData = [
      ['Raport de Comparare - Sumar'],
      [''],
      ['Tipul rezultatului', 'Numărul de rânduri'],
      ['Comparări totale', comparisonResult.matches.length],
      ['Potriviri perfecte', comparisonResult.matches.filter(m => m.differences.length === 0).length],
      ['Cu diferențe', comparisonResult.matches.filter(m => m.differences.length > 0).length],
      ['Doar în Excel', comparisonResult.onlyInExcel.length],
      ['Doar în CSV', comparisonResult.onlyInCsv.length],
      [''],
      ['Raport generat pe:', new Date().toLocaleString('ro-RO')]
    ];
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Sumar');

    // Create detailed comparison sheet
    if (comparisonResult.matches.length > 0) {
      const headers = [
        'Rând Excel',
        'Rând CSV', 
        'Status',
        ...selectedColumns.mappings.map(m => `Excel - ${m.excel}`),
        ...selectedColumns.mappings.map(m => `CSV - ${m.csv}`),
        'Diferențe'
      ];

      const comparisonData = [headers];
      
      comparisonResult.matches.forEach(match => {
        const row = [
          (match.rowIndex + 1).toString(),
          (match.csvRowIndex + 1).toString(),
          match.differences.length === 0 ? 'Potrivire perfectă' : 'Cu diferențe',
          ...selectedColumns.mappings.map(m => match.excelRow[m.excel] || ''),
          ...selectedColumns.mappings.map(m => match.csvRow[m.csv] || ''),
          match.differences.join('; ')
        ];
        comparisonData.push(row);
      });

      const comparisonSheet = XLSX.utils.aoa_to_sheet(comparisonData);
      XLSX.utils.book_append_sheet(workbook, comparisonSheet, 'Comparări Detaliate');
    }

    // Create "Only in Excel" sheet
    if (comparisonResult.onlyInExcel.length > 0) {
      const excelOnlyHeaders = [
        'Rând Excel',
        ...selectedColumns.mappings.map(m => `Excel - ${m.excel}`)
      ];
      
      const excelOnlyData = [excelOnlyHeaders];
      
      comparisonResult.onlyInExcel.forEach(item => {
        const row = [
          (item.rowIndex + 1).toString(),
          ...selectedColumns.mappings.map(m => item.row[m.excel] || '')
        ];
        excelOnlyData.push(row);
      });

      const excelOnlySheet = XLSX.utils.aoa_to_sheet(excelOnlyData);
      XLSX.utils.book_append_sheet(workbook, excelOnlySheet, 'Doar în Excel');
    }

    // Create "Only in CSV" sheet
    if (comparisonResult.onlyInCsv.length > 0) {
      const csvOnlyHeaders = [
        'Rând CSV',
        ...selectedColumns.mappings.map(m => `CSV - ${m.csv}`)
      ];
      
      const csvOnlyData = [csvOnlyHeaders];
      
      comparisonResult.onlyInCsv.forEach(item => {
        const row = [
          (item.rowIndex + 1).toString(),
          ...selectedColumns.mappings.map(m => item.row[m.csv] || '')
        ];
        csvOnlyData.push(row);
      });

      const csvOnlySheet = XLSX.utils.aoa_to_sheet(csvOnlyData);
      XLSX.utils.book_append_sheet(workbook, csvOnlySheet, 'Doar în CSV');
    }

    // Generate file and download
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileName = `Raport_Comparare_${new Date().toISOString().split('T')[0]}.xlsx`;
    saveAs(data, fileName);
  };

  // CSV to XLS conversion and download function
  const downloadCsvAsXls = () => {
    if (!csvData) return;

    const workbook = XLSX.utils.book_new();
    
    // Convert CSV data to Excel format
    const csvDataForExcel = [csvData.headers];
    csvData.records.forEach(record => {
      const row = csvData.headers.map(header => record[header] || '');
      csvDataForExcel.push(row);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(csvDataForExcel);
    
    // Auto-size columns (basic implementation)
    const colWidths = csvData.headers.map(header => {
      const maxLength = Math.max(
        header.length,
        ...csvData.records.map(record => (record[header] || '').toString().length)
      );
      return { wch: Math.min(maxLength + 2, 50) }; // Cap at 50 characters
    });
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'CSV Data');

    // Generate file and download
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileName = `CSV_converted_${new Date().toISOString().split('T')[0]}.xlsx`;
    saveAs(data, fileName);
  };

  const canCompare = excelData && csvData && selectedColumns.mappings.length > 0;

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom align="center" color="primary">
          Instrument de Comparare Coloane Excel și CSV
        </Typography>
        <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 4 }}>
          Încărcați fișiere Excel și CSV, selectați coloanele de comparat și vizualizați diferențele
        </Typography>
      </Box>
      
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card elevation={3}>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" component="h2" color="primary">
                  <TableChart sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Fișier Excel
                </Typography>
                <input
                  type="file"
                  id="excel-file"
                  accept=".xls,.xlsx"
                  ref={excelInputRef}
                  onChange={(e) => handleFileInput(e, 'excel')}
                  disabled={loading.excel}
                  style={{ display: 'none' }}
                />
                <label htmlFor="excel-file">
                  <Button
                    variant="outlined"
                    component="span"
                    startIcon={<Upload />}
                    disabled={loading.excel}
                    fullWidth
                    size="large"
                  >
                    Selectați fișierul Excel
                  </Button>
                </label>
                {loading.excel && <LinearProgress />}
                {fileState.excelFile && (
                  <Alert 
                    severity="success" 
                    action={
                      <IconButton 
                        color="inherit" 
                        size="small" 
                        onClick={() => clearFile('excel')}
                        disabled={loading.excel}
                      >
                        <Close fontSize="inherit" />
                      </IconButton>
                    }
                  >
                    {fileState.excelFile.name}
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid size={{ xs: 12, md: 6 }}>
          <Card elevation={3}>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" component="h2" color="primary">
                  <Analytics sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Fișier CSV
                </Typography>
                <input
                  type="file"
                  id="csv-file"
                  accept=".csv"
                  ref={csvInputRef}
                  onChange={(e) => handleFileInput(e, 'csv')}
                  disabled={loading.csv}
                  style={{ display: 'none' }}
                />
                <label htmlFor="csv-file">
                  <Button
                    variant="outlined"
                    component="span"
                    startIcon={<Upload />}
                    disabled={loading.csv}
                    fullWidth
                    size="large"
                  >
                    Selectați fișierul CSV
                  </Button>
                </label>
                {loading.csv && <LinearProgress />}
                {fileState.csvFile && (
                  <Alert 
                    severity="success" 
                    action={
                      <IconButton 
                        color="inherit" 
                        size="small" 
                        onClick={() => clearFile('csv')}
                        disabled={loading.csv}
                      >
                        <Close fontSize="inherit" />
                      </IconButton>
                    }
                  >
                    {fileState.csvFile.name}
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {errorMessage && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMessage}
        </Alert>
      )}

      {(excelData || csvData) && (
        <>
          <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h5" component="h3" gutterBottom color="primary">
              Maparea Coloanelor
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Selectați coloanele din Excel și CSV care trebuie comparate. Folosiți aceeași culoare pentru a mapa coloanele care se compară între ele.
            </Typography>
            
            <ColumnMappingInterface 
              excelData={excelData}
              csvData={csvData}
              selectedColumns={selectedColumns}
              setSelectedColumns={setSelectedColumns}
              availableColors={availableColors}
            />
            
            {(excelData || csvData) && (
              <Box sx={{ mt: 3, textAlign: 'center' }}>
                <Button
                  variant="outlined"
                  startIcon={<Visibility />}
                  onClick={() => setIsModalOpen(true)}
                  size="large"
                >
                  Vezi Tabelele Complete
                </Button>
              </Box>
            )}
          </Paper>
          
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Button
              variant="contained"
              startIcon={<CompareArrows />}
              onClick={compareSelectedColumns}
              disabled={!canCompare || loading.comparing}
              size="large"
              sx={{ minWidth: 250 }}
            >
              {loading.comparing ? 'Se compară...' : 'Compară Coloanele Selectate'}
            </Button>
          </Box>
        </>
      )}

      {comparisonResult && (
        <div className="comparison-results">
          <h2>Rezultatele Comparării</h2>
          
          <div className="comparison-summary">
            <div className="summary-item matches">
              <span className="count">{comparisonResult.matches.length}</span>
              <span className="label">Comparări Totale</span>
            </div>
                    <div className="summary-item perfect-matches">
              <span className="count">{comparisonResult.matches.filter(m => m.differences.length === 0).length}</span>
                      <span className="label">Potriviri Perfecte</span>
                    </div>
            <div className="summary-item differences">
              <span className="count">{comparisonResult.matches.filter(m => m.differences.length > 0).length}</span>
              <span className="label">Cu Diferențe</span>
                    </div>
            <div className="summary-item only-excel">
              <span className="count">{comparisonResult.onlyInExcel.length}</span>
              <span className="label">Doar în Excel</span>
                    </div>
            <div className="summary-item only-csv">
              <span className="count">{comparisonResult.onlyInCsv.length}</span>
              <span className="label">Doar în CSV</span>
                </div>
              </div>
              
          <ComparisonResultsTable 
                  result={comparisonResult}
            mappings={selectedColumns.mappings}
          />
          
          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
              <Button
                variant="contained"
                color="success"
                size="large"
                startIcon={<Download />}
                onClick={downloadComparisonReport}
                sx={{ 
                  minWidth: 280,
                  py: 1.5,
                  fontSize: '1.1rem',
                  fontWeight: 600
                }}
              >
                Descarcă Raport Comparare
              </Button>
              
              {csvData && (
                <Button
                  variant="outlined"
                  color="primary"
                  size="large"
                  startIcon={<SwapHoriz />}
                  onClick={downloadCsvAsXls}
                  sx={{ 
                    minWidth: 250,
                    py: 1.5,
                    fontSize: '1.1rem',
                    fontWeight: 600
                  }}
                >
                  Descarcă CSV ca XLS
                </Button>
              )}
            </Stack>
          </Box>
        </div>
      )}

      {/* Fullscreen Modal for Tables */}
      {isModalOpen && (
        <FullscreenTableModal
          excelData={excelData}
          csvData={csvData}
          selectedColumns={selectedColumns}
          setSelectedColumns={setSelectedColumns}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </Container>
  );
}

// Column Mapping Interface Component
interface ColumnMappingInterfaceProps {
  excelData: ExcelParseResult | null;
  csvData: CSVParseResult | null;
  selectedColumns: ColumnSelection;
  setSelectedColumns: React.Dispatch<React.SetStateAction<ColumnSelection>>;
  availableColors: string[];
}

function ColumnMappingInterface({ excelData, csvData, selectedColumns, setSelectedColumns, availableColors }: ColumnMappingInterfaceProps) {
  const addMapping = () => {
    if (excelData && csvData) {
      const nextColor = availableColors[selectedColumns.mappings.length % availableColors.length];
      const newMapping: ColumnMapping = {
        excel: excelData.headers[0] || '',
        csv: csvData.headers[0] || '',
        color: nextColor
      };
      
      setSelectedColumns(prev => ({
        ...prev,
        mappings: [...prev.mappings, newMapping]
      }));
    }
  };

  const removeMapping = (index: number) => {
    setSelectedColumns(prev => ({
      ...prev,
      mappings: prev.mappings.filter((_, i) => i !== index)
    }));
  };

  const updateMapping = (index: number, field: 'excel' | 'csv', value: string) => {
    setSelectedColumns(prev => ({
      ...prev,
      mappings: prev.mappings.map((mapping, i) => 
        i === index ? { ...mapping, [field]: value } : mapping
      )
    }));
  };

  return (
    <Box>
      <Box sx={{ mb: 3, textAlign: 'center' }}>
        <Button 
          variant="contained"
          onClick={addMapping}
          disabled={!excelData || !csvData}
          startIcon={<CompareArrows />}
          size="large"
        >
          Adaugă Mapare
        </Button>
      </Box>
      
      <Stack spacing={2}>
        {selectedColumns.mappings.map((mapping, index) => (
          <Paper 
            key={index} 
            elevation={2} 
            sx={{ 
              p: 2, 
              borderLeft: `4px solid ${mapping.color}`,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap'
            }}
          >
            <FormControl sx={{ minWidth: 200, flex: 1 }}>
              <InputLabel>Coloana Excel</InputLabel>
              <Select
                value={mapping.excel}
                onChange={(e) => updateMapping(index, 'excel', e.target.value)}
                label="Coloana Excel"
              >
                <MenuItem value="">
                  <em>Selectați coloana Excel...</em>
                </MenuItem>
                {excelData?.headers.map(header => (
                  <MenuItem key={header} value={header}>{header}</MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <CompareArrows color="primary" />
            
            <FormControl sx={{ minWidth: 200, flex: 1 }}>
              <InputLabel>Coloana CSV</InputLabel>
              <Select
                value={mapping.csv}
                onChange={(e) => updateMapping(index, 'csv', e.target.value)}
                label="Coloana CSV"
              >
                <MenuItem value="">
                  <em>Selectați coloana CSV...</em>
                </MenuItem>
                {csvData?.headers.map(header => (
                  <MenuItem key={header} value={header}>{header}</MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <Tooltip title="Șterge maparea">
              <IconButton 
                color="error"
                onClick={() => removeMapping(index)}
                size="large"
              >
                <Delete />
              </IconButton>
            </Tooltip>
          </Paper>
        ))}
      </Stack>
      
      {selectedColumns.mappings.length === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Nu există mapări de coloane. Adăugați cel puțin o mapare pentru a compara fișierele.
        </Alert>
      )}
    </Box>
  );
}

// Data Table Component for preview
interface DataTableProps {
  headers: string[];
  records: { [key: string]: string }[];
}

function DataTable({ headers, records }: DataTableProps) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th className="row-number">#</th>
          {headers.map((header) => (
            <th key={header}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {records.map((record, index) => (
          <tr key={index}>
            <td className="row-number">{index + 1}</td>
            {headers.map((header) => (
              <td key={header}>{record[header] || ''}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Comparison Results Table Component
interface ComparisonResultsTableProps {
  result: ComparisonResult;
  mappings: ColumnMapping[];
}

function ComparisonResultsTable({ result, mappings }: ComparisonResultsTableProps) {
  return (
    <div className="comparison-tables">
      {result.matches.length > 0 && (
        <div className="comparison-table-section">
          <h3>Comparări Rânduri ({result.matches.length} rânduri)</h3>
        <div className="table-container">
            <table className="comparison-table">
            <thead>
              <tr>
                  <th className="row-number">Rând Excel</th>
                  <th className="status-col">Status</th>
                  <th className="file-section-header excel-section" colSpan={mappings.length}>
                    Excel Data
                  </th>
                  <th className="row-number separator-col">Rând CSV</th>
                  <th className="file-section-header csv-section" colSpan={mappings.length}>
                    CSV Data
                  </th>
                  <th className="differences-col">Diferențe</th>
              </tr>
              <tr>
                  <th className="row-number"></th>
                  <th className="status-col"></th>
                  {mappings.map((mapping) => (
                    <th key={`excel-${mapping.excel}`} className="excel-col" style={{ backgroundColor: mapping.color + '20' }}>
                      {mapping.excel}
                    </th>
                  ))}
                  <th className="row-number separator-col"></th>
                  {mappings.map((mapping) => (
                    <th key={`csv-${mapping.csv}`} className="csv-col" style={{ backgroundColor: mapping.color + '20' }}>
                      {mapping.csv}
                    </th>
                  ))}
                  <th className="differences-col"></th>
              </tr>
            </thead>
            <tbody>
                {result.matches.map((match, index) => (
                  <tr key={index} className={match.differences.length === 0 ? 'perfect-match' : 'has-differences'}>
                    <td className="row-number">{match.rowIndex + 1}</td>
                    <td className="status-col">
                      <span className={`status-indicator ${match.differences.length === 0 ? 'match' : 'diff'}`}>
                        {match.differences.length === 0 ? 
                          <><Check sx={{ mr: 1 }} /> Potrivire</> : 
                          <><ErrorIcon sx={{ mr: 1 }} /> Diferență</>
                        }
                      </span>
                    </td>
                    {mappings.map((mapping) => (
                      <td key={`excel-${mapping.excel}`} className="excel-cell" style={{ backgroundColor: mapping.color + '10' }}>
                        {match.excelRow[mapping.excel] || ''}
                      </td>
                    ))}
                    <td className="row-number separator-col">{match.csvRowIndex + 1}</td>
                    {mappings.map((mapping) => (
                      <td key={`csv-${mapping.csv}`} className="csv-cell" style={{ backgroundColor: mapping.color + '10' }}>
                        {match.csvRow[mapping.csv] || ''}
                      </td>
                    ))}
                    <td className="differences-col">
                      {match.differences.length > 0 && (
                        <ul className="differences-list">
                          {match.differences.map((diff, i) => (
                            <li key={i}>{diff}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
      
      {result.onlyInExcel.length > 0 && (
        <div className="comparison-table-section">
          <h3>Doar în Excel ({result.onlyInExcel.length} rânduri)</h3>
        <div className="table-container">
            <table className="comparison-table">
            <thead>
              <tr>
                  <th className="row-number">Rând</th>
                  {mappings.map((mapping) => (
                    <th key={mapping.excel} className="excel-col" style={{ backgroundColor: mapping.color + '20' }}>
                      {mapping.excel}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
                {result.onlyInExcel.map((item, index) => (
                  <tr key={index} className="only-excel">
                    <td className="row-number">{item.rowIndex + 1}</td>
                    {mappings.map((mapping) => (
                      <td key={mapping.excel} className="excel-cell" style={{ backgroundColor: mapping.color + '10' }}>
                        {item.row[mapping.excel] || ''}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {result.onlyInCsv.length > 0 && (
        <div className="comparison-table-section">
          <h3>Doar în CSV ({result.onlyInCsv.length} rânduri)</h3>
          <div className="table-container">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th className="row-number">Rând</th>
                  {mappings.map((mapping) => (
                    <th key={mapping.csv} className="csv-col" style={{ backgroundColor: mapping.color + '20' }}>
                      {mapping.csv}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.onlyInCsv.map((item, index) => (
                  <tr key={index} className="only-csv">
                    <td className="row-number">{item.rowIndex + 1}</td>
                    {mappings.map((mapping) => (
                      <td key={mapping.csv} className="csv-cell" style={{ backgroundColor: mapping.color + '10' }}>
                        {item.row[mapping.csv] || ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Fullscreen Table Modal Component
interface FullscreenTableModalProps {
  excelData: ExcelParseResult | null;
  csvData: CSVParseResult | null;
  selectedColumns: ColumnSelection;
  setSelectedColumns: React.Dispatch<React.SetStateAction<ColumnSelection>>;
  onClose: () => void;
}

function FullscreenTableModal({ excelData, csvData, selectedColumns, setSelectedColumns, onClose }: FullscreenTableModalProps) {
  const [modalMappings, setModalMappings] = useState<ColumnMapping[]>(selectedColumns.mappings);
  const [selectedExcelColumn, setSelectedExcelColumn] = useState<string | null>(null);
  const [selectedCsvColumn, setSelectedCsvColumn] = useState<string | null>(null);
  const [availableColors] = useState<string[]>([
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', 
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ]);

  const handleExcelColumnClick = (columnName: string) => {
    if (selectedCsvColumn) {
      // Create mapping
      const nextColor = availableColors[modalMappings.length % availableColors.length];
      const newMapping: ColumnMapping = {
        excel: columnName,
        csv: selectedCsvColumn,
        color: nextColor
      };
      setModalMappings(prev => [...prev, newMapping]);
      setSelectedExcelColumn(null);
      setSelectedCsvColumn(null);
    } else {
      setSelectedExcelColumn(columnName);
    }
  };

  const handleCsvColumnClick = (columnName: string) => {
    if (selectedExcelColumn) {
      // Create mapping
      const nextColor = availableColors[modalMappings.length % availableColors.length];
      const newMapping: ColumnMapping = {
        excel: selectedExcelColumn,
        csv: columnName,
        color: nextColor
      };
      setModalMappings(prev => [...prev, newMapping]);
      setSelectedExcelColumn(null);
      setSelectedCsvColumn(null);
    } else {
      setSelectedCsvColumn(columnName);
    }
  };

  const removeMapping = (index: number) => {
    setModalMappings(prev => prev.filter((_, i) => i !== index));
  };

  const clearSelection = () => {
    setSelectedExcelColumn(null);
    setSelectedCsvColumn(null);
  };

  const handleClose = () => {
    // Update the main page mappings with modal mappings
    setSelectedColumns(prev => ({
      ...prev,
      mappings: modalMappings
    }));
    onClose();
  };

  return (
    <div className="fullscreen-modal-overlay" onClick={handleClose}>
      <div className="fullscreen-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Tabelele Complete</h2>
          <IconButton 
            onClick={handleClose} 
            sx={{ 
              backgroundColor: '#4caf50',
              color: 'white',
              borderRadius: '50%',
              padding: '8px',
              '&:hover': {
                backgroundColor: '#45a049'
              }
            }}
          >
            <Check />
          </IconButton>
        </div>
        
        <div className="modal-mapping-controls">
          <div className="mapping-instructions">
            <p>Click pe o coloană Excel, apoi pe o coloană CSV pentru a le mapa. Click pe o mapare pentru a o șterge.</p>
            {(selectedExcelColumn || selectedCsvColumn) && (
              <div className="selection-status">
                <span>Selectat: {selectedExcelColumn || selectedCsvColumn}</span>
                <button className="clear-selection-btn" onClick={clearSelection}>Anulează</button>
              </div>
            )}
          </div>
          
          {modalMappings.length > 0 && (
            <div className="modal-mappings-display">
              <h4>Mapări Active:</h4>
              <div className="mappings-list">
                {modalMappings.map((mapping, index) => (
                  <div 
                    key={index} 
                    className="mapping-item" 
                    style={{ borderLeft: `4px solid ${mapping.color}` }}
                    onClick={() => removeMapping(index)}
                  >
                    <span className="mapping-text">
                      {mapping.excel} <CompareArrows sx={{ mx: 1, fontSize: 12 }} /> {mapping.csv}
                    </span>
                    <Check sx={{ fontSize: 14, color: 'green' }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-tables-container">
          {excelData && (
            <div className="modal-table-section">
              <h3>Excel Data ({excelData.records.length} rânduri)</h3>
              <div className="modal-table-container">
                <ModalDataTable 
                  headers={excelData.headers} 
                  records={excelData.records} 
                  mappings={modalMappings}
                  selectedColumn={selectedExcelColumn}
                  onColumnClick={handleExcelColumnClick}
                  type="excel"
                />
              </div>
            </div>
          )}
          
          {csvData && (
            <div className="modal-table-section">
              <h3>CSV Data ({csvData.records.length} rânduri)</h3>
              <div className="modal-table-container">
                <ModalDataTable 
                  headers={csvData.headers} 
                  records={csvData.records} 
                  mappings={modalMappings}
                  selectedColumn={selectedCsvColumn}
                  onColumnClick={handleCsvColumnClick}
                  type="csv"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Modal Data Table Component with clickable headers
interface ModalDataTableProps {
  headers: string[];
  records: { [key: string]: string }[];
  mappings: ColumnMapping[];
  selectedColumn: string | null;
  onColumnClick: (columnName: string) => void;
  type: 'excel' | 'csv';
}

function ModalDataTable({ headers, records, mappings, selectedColumn, onColumnClick, type }: ModalDataTableProps) {
  const getColumnColor = (columnName: string) => {
    const mapping = mappings.find(m => 
      type === 'excel' ? m.excel === columnName : m.csv === columnName
    );
    return mapping ? mapping.color : null;
  };

  const isColumnMapped = (columnName: string) => {
    return mappings.some(m => 
      type === 'excel' ? m.excel === columnName : m.csv === columnName
    );
  };

  return (
    <table className="data-table modal-data-table">
      <thead>
        <tr>
          <th className="row-number">#</th>
          {headers.map((header) => {
            const color = getColumnColor(header);
            const isMapped = isColumnMapped(header);
            const isSelected = selectedColumn === header;
            
            return (
              <th 
                key={header} 
                className={`clickable-header ${isMapped ? 'mapped' : ''} ${isSelected ? 'selected' : ''}`}
                style={{ 
                  backgroundColor: color ? `${color}20` : undefined,
                  borderLeft: color ? `4px solid ${color}` : undefined,
                  cursor: 'pointer'
                }}
                onClick={() => onColumnClick(header)}
                title={isMapped ? `Mapat cu ${type === 'excel' ? mappings.find(m => m.excel === header)?.csv : mappings.find(m => m.csv === header)?.excel}` : 'Click pentru a selecta'}
              >
                {header}
                {isMapped && <Check sx={{ fontSize: 12 }} className="mapping-indicator" />}
                {isSelected && <Visibility sx={{ fontSize: 12 }} className="selection-indicator" />}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {records.map((record, index) => (
          <tr key={index}>
            <td className="row-number">{index + 1}</td>
            {headers.map((header) => {
              const color = getColumnColor(header);
              return (
                <td 
                  key={header}
                  style={{ 
                    backgroundColor: color ? `${color}10` : undefined
                  }}
                >
                  {record[header] || ''}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}