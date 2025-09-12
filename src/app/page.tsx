'use client';

import { useState, useRef } from 'react';
import { CSVParser, ANAFInvoiceRecord } from '@/lib/csv-parser';
import { ExcelParser, ExcelInvoiceRecord } from '@/lib/excel-parser';
import { ComparisonLogic, ComparisonResult } from '@/lib/comparison-logic';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';

interface FileState {
  excelFile: File | null;
  csvFile: File | null;
}

export default function Home() {
  const [fileState, setFileState] = useState<FileState>({
    excelFile: null,
    csvFile: null
  });
  
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedDifference, setSelectedDifference] = useState<{excelRecord: ExcelInvoiceRecord; csvRecord: ANAFInvoiceRecord; differences: string[]} | null>(null);
  const [highlightedMatchKey, setHighlightedMatchKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const excelInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>, type: 'excel' | 'csv') => {
    const file = event.target.files?.[0];
    
    if (file) {
      setFileState(prev => ({
        ...prev,
        [type === 'excel' ? 'excelFile' : 'csvFile']: file
      }));
    } else {
      setFileState(prev => ({
        ...prev,
        [type === 'excel' ? 'excelFile' : 'csvFile']: null
      }));
    }
    setErrorMessage('');
  };

  const compareFiles = async () => {
    if (!fileState.excelFile || !fileState.csvFile) {
      return;
    }

    setLoading(true);
    setShowResults(false);
    setErrorMessage('');

    try {
      const csvRecords = await CSVParser.parseCSV(fileState.csvFile);
      const excelRecords = await ExcelParser.parseExcel(fileState.excelFile);
      
      const result = ComparisonLogic.compareRecords(excelRecords, csvRecords);
      setComparisonResult(result);
      setShowResults(true);
      
    } catch (error) {
      console.error('Error parsing files:', error);
      setErrorMessage(`Eroare la procesarea fișierelor: ${error instanceof Error ? error.message : 'Eroare necunoscută'}`);
      setShowResults(true);
    } finally {
      setLoading(false);
    }
  };

  const createMatchKey = (cif: string, nrFactur: string): string => {
    return `${cif.trim().toUpperCase()}|${nrFactur.trim().toUpperCase()}`;
  };

  const formatAmount = (amount: string): string => {
    const num = parseFloat(amount);
    return isNaN(num) ? amount : num.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleRowClick = (matchKey: string) => {
    if (!comparisonResult) return;
    
    const valueDifference = comparisonResult.valueDifferences.find(diff => {
      const diffKey = createMatchKey(diff.excelRecord.cifEmitent, diff.excelRecord.nrFactur);
      return diffKey === matchKey;
    });

    if (valueDifference) {
      setSelectedDifference(valueDifference);
      setShowModal(true);
    }
  };

  const hideModal = () => {
    setShowModal(false);
    setSelectedDifference(null);
  };

  const getFieldClass = (fieldName: string, differences: string[]): string => {
    const isDifferent = differences.some(diff => diff.toLowerCase().includes(fieldName.toLowerCase()));
    return isDifferent ? ' different' : ' matching';
  };

  const downloadComparisonReport = async () => {
    if (!comparisonResult) {
      alert('Nu există rezultate de comparare pentru export!');
      return;
    }

    try {
      const workbook = XLSX.utils.book_new();
      
      // Add detailed comparison sheet
      addDetailedComparisonSheet(workbook, comparisonResult);
      
      // Add summary sheet
      addSummarySheet(workbook, comparisonResult);
      
      const currentDate = new Date().toISOString().split('T')[0];
      const filename = `Raport_Comparare_${currentDate}.xlsx`;
      
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, filename);
      
    } catch (error) {
      console.error('Error generating Excel report:', error);
      alert('Eroare la generarea raportului Excel!');
    }
  };

  const addSummarySheet = (workbook: XLSX.WorkBook, result: ComparisonResult) => {
    const summaryData = [
      ['Raport Comparare Contabilitate'],
      [''],
      ['Fișiere Comparate:'],
      ['Excel:', fileState.excelFile?.name || 'N/A'],
      ['CSV ANAF:', fileState.csvFile?.name || 'N/A'],
      [''],
      ['Rezultate Comparare:'],
      ['Potriviri Perfecte:', result.perfectMatches.length],
      ['Diferențe de Valori:', result.valueDifferences.length],
      ['Lipsă din ANAF:', result.missingFromCSV.length],
      ['Lipsă din Excel:', result.missingFromExcel.length],
      [''],
      ['Data Generare:', new Date().toLocaleString('ro-RO')]
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sumar');
  };

  const addDetailedComparisonSheet = (workbook: XLSX.WorkBook, result: ComparisonResult) => {
    const data: (string | number)[][] = [];
    let totalBazaTVA = 0;
    
    data.push([
      'Status', 'Nr. Factură', 'Sursă', 'Data Emitere', 'Denumire Emitent', 
      'CIF Emitent', 'Cota TVA', 'Bază TVA', 'Diferențe'
    ]);
    
    result.perfectMatches.forEach(match => {
      const bazaValue = parseFloat(match.excelRecord.baza.toString().replace(',', '.')) || 0;
      totalBazaTVA += bazaValue;
      
      data.push([
        'POTRIVIRE PERFECTĂ',
        match.excelRecord.nrFactur,
        'Excel & ANAF',
        match.excelRecord.dataEmitere,
        match.excelRecord.denumireEmitent,
        match.excelRecord.cifEmitent,
        match.excelRecord.cotaTVA,
        match.excelRecord.baza,
        'Toate câmpurile se potrivesc'
      ]);
    });
    
    result.valueDifferences.forEach(diff => {
      const excelBazaValue = parseFloat(diff.excelRecord.baza.toString().replace(',', '.')) || 0;
      totalBazaTVA += excelBazaValue;
      
      data.push([
        'DIFERENȚE VALORI',
        diff.excelRecord.nrFactur,
        'Excel',
        diff.excelRecord.dataEmitere,
        diff.excelRecord.denumireEmitent,
        diff.excelRecord.cifEmitent,
        diff.excelRecord.cotaTVA,
        diff.excelRecord.baza,
        diff.differences.join('; ')
      ]);
      
      data.push([
        '',
        diff.csvRecord.nrFactur,
        'ANAF',
        diff.csvRecord.dataEmitere,
        diff.csvRecord.denumireEmitent,
        diff.csvRecord.cifEmitent,
        diff.csvRecord.cotaTVA,
        diff.csvRecord.baza,
        ''
      ]);
      
      data.push(['', '', '', '', '', '', '', '', '']);
    });
    
    result.missingFromCSV.forEach(record => {
      const bazaValue = parseFloat(record.baza.toString().replace(',', '.')) || 0;
      totalBazaTVA += bazaValue;
      
      data.push([
        'LIPSĂ DIN ANAF',
        record.nrFactur,
        'Doar în Excel',
        record.dataEmitere,
        record.denumireEmitent,
        record.cifEmitent,
        record.cotaTVA,
        record.baza,
        'Nu există în fișierul ANAF'
      ]);
    });
    
    result.missingFromExcel.forEach(record => {
      data.push([
        'LIPSĂ DIN EXCEL',
        record.nrFactur,
        'Doar în ANAF',
        record.dataEmitere,
        record.denumireEmitent,
        record.cifEmitent,
        record.cotaTVA,
        record.baza,
        'Nu există în fișierul Excel'
      ]);
    });
    
    // Add autosum row
    data.push(['', '', '', '', '', '', '', '', '']);
    data.push([
      'TOTAL BAZĂ TVA',
      '',
      '',
      '',
      '',
      '',
      '',
      totalBazaTVA.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      'Suma totală a bazelor TVA din Excel'
    ]);
    
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    
    worksheet['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, 
      { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 40 }
    ];
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Comparare Detaliată');
  };

  const canCompare = fileState.excelFile !== null && fileState.csvFile !== null;

  return (
    <div className="container">
      <h1>Program Comparare Contabilitate</h1>
      <p>Compară fișierele Excel (contabilitate) cu CSV (ANAF)</p>
      
      <div className="file-input-section">
        <div className="input-group">
          <label htmlFor="excel-file">Excel Contabilitate:</label>
          <input 
            type="file" 
            id="excel-file" 
            accept=".xls,.xlsx,.csv" 
            ref={excelInputRef}
            onChange={(e) => handleFileInput(e, 'excel')}
          />
          <span className="filename-display" style={{ color: fileState.excelFile ? '#27ae60' : '#666' }}>
            {fileState.excelFile ? `Fișier selectat: ${fileState.excelFile.name}` : ''}
          </span>
        </div>
        
        <div className="input-group">
          <label htmlFor="csv-file">CSV Document ANAF:</label>
          <input 
            type="file" 
            id="csv-file" 
            accept=".csv" 
            ref={csvInputRef}
            onChange={(e) => handleFileInput(e, 'csv')}
          />
          <span className="filename-display" style={{ color: fileState.csvFile ? '#27ae60' : '#666' }}>
            {fileState.csvFile ? `Fișier selectat: ${fileState.csvFile.name}` : ''}
          </span>
        </div>
      </div>
      
      <div className="action-section">
        <button 
          className="compare-btn" 
          disabled={!canCompare || loading}
          onClick={compareFiles}
        >
          Compară Fișierele
        </button>
      </div>
      
      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Se procesează fișierele...</p>
        </div>
      )}

      {showResults && (
        <div className="results-section">
          <h2>Rezultate Comparare</h2>
          
          {errorMessage && (
            <div className="summary">
              <p className="error">{errorMessage}</p>
            </div>
          )}

          {comparisonResult && (
            <>
              <div className="summary">
                <div className="comparison-header">
                  <h3>Rezultate Comparare Contabilitate</h3>
                  <div className="file-info">
                    <span><strong>Excel:</strong> {fileState.excelFile!.name}</span>
                    <span><strong>CSV ANAF:</strong> {fileState.csvFile!.name}</span>
                  </div>
                  <div className="comparison-summary">
                    <div className="summary-item perfect-matches">
                      <span className="count">{comparisonResult.perfectMatches.length}</span>
                      <span className="label">Potriviri Perfecte</span>
                    </div>
                    <div className="summary-item value-differences">
                      <span className="count">{comparisonResult.valueDifferences.length}</span>
                      <span className="label">Diferențe Valori</span>
                    </div>
                    <div className="summary-item missing-from-csv">
                      <span className="count">{comparisonResult.missingFromCSV.length}</span>
                      <span className="label">Lipsă din ANAF</span>
                    </div>
                    <div className="summary-item missing-from-excel">
                      <span className="count">{comparisonResult.missingFromExcel.length}</span>
                      <span className="label">Lipsă din Excel</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="details">
                {/* Side-by-side comparison will go here */}
                <SideBySideComparison 
                  result={comparisonResult}
                  onRowClick={handleRowClick}
                  highlightedMatchKey={highlightedMatchKey}
                  setHighlightedMatchKey={setHighlightedMatchKey}
                  formatAmount={formatAmount}
                  createMatchKey={createMatchKey}
                />
              </div>

              <div className="download-section">
                <button className="download-btn" onClick={downloadComparisonReport}>
                  Descarcă Raport Excel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Comparison Modal */}
      {showModal && selectedDifference && (
        <ComparisonModal 
          difference={selectedDifference}
          onClose={hideModal}
          getFieldClass={getFieldClass}
          formatAmount={formatAmount}
        />
      )}
    </div>
  );
}

// Side-by-side comparison component
interface SideBySideComparisonProps {
  result: ComparisonResult;
  onRowClick: (matchKey: string) => void;
  highlightedMatchKey: string | null;
  setHighlightedMatchKey: (key: string | null) => void;
  formatAmount: (amount: string) => string;
  createMatchKey: (cif: string, nrFactur: string) => string;
}

function SideBySideComparison({ 
  result, 
  onRowClick, 
  highlightedMatchKey, 
  setHighlightedMatchKey,
  formatAmount,
  createMatchKey 
}: SideBySideComparisonProps) {
  
  const prepareRecordsForComparison = () => {
    // Create separate arrays for each column - only include records that actually exist in that source
    const excelRecords: Array<{record: ExcelInvoiceRecord; status: string; statusLabel: string; sortPriority: number; matchKey: string; differences?: string[]}> = [];
    const anafRecords: Array<{record: ANAFInvoiceRecord; status: string; statusLabel: string; sortPriority: number; matchKey: string; differences?: string[]}> = [];
    
    // Add perfect matches - these exist in both files
    result.perfectMatches.forEach(match => {
      const matchKey = createMatchKey(match.excelRecord.cifEmitent, match.excelRecord.nrFactur);
      
      excelRecords.push({
        record: match.excelRecord,
        status: 'perfect-match',
        statusLabel: '✓ Potrivire',
        sortPriority: 4,
        matchKey: matchKey
      });
      anafRecords.push({
        record: match.csvRecord,
        status: 'perfect-match',
        statusLabel: '✓ Potrivire',
        sortPriority: 4,
        matchKey: matchKey
      });
    });
    
    // Add value differences - these exist in both files but with different values
    result.valueDifferences.forEach(diff => {
      const matchKey = createMatchKey(diff.excelRecord.cifEmitent, diff.excelRecord.nrFactur);
      
      excelRecords.push({
        record: diff.excelRecord,
        status: 'value-difference',
        statusLabel: '⚠ Diferențe',
        sortPriority: 2,
        differences: diff.differences,
        matchKey: matchKey
      });
      anafRecords.push({
        record: diff.csvRecord,
        status: 'value-difference',
        statusLabel: '⚠ Diferențe',
        sortPriority: 2,
        differences: diff.differences,
        matchKey: matchKey
      });
    });
    
    // Add missing from CSV/ANAF - these exist ONLY in Excel
    result.missingFromCSV.forEach(record => {
      excelRecords.push({
        record: record,
        status: 'missing-from-csv',
        statusLabel: '⚠ Lipsă ANAF',
        sortPriority: 1,
        matchKey: createMatchKey(record.cifEmitent, record.nrFactur)
      });
      // Note: Do NOT add these to anafRecords since they don't exist in ANAF
    });
    
    // Add missing from Excel - these exist ONLY in ANAF  
    result.missingFromExcel.forEach(record => {
      anafRecords.push({
        record: record,
        status: 'missing-from-excel',
        statusLabel: '⚠ Lipsă Excel',
        sortPriority: 1,
        matchKey: createMatchKey(record.cifEmitent, record.nrFactur)
      });
      // Note: Do NOT add these to excelRecords since they don't exist in Excel
    });
    
    // Sort by priority (errors first), then by date, then by invoice number
    const sortRecords = <T extends {record: {dataEmitere: string; nrFactur: string}; sortPriority: number}>(records: T[]) => {
      return records.sort((a, b) => {
        if (a.sortPriority !== b.sortPriority) {
          return a.sortPriority - b.sortPriority;
        }
        const dateA = new Date(a.record.dataEmitere);
        const dateB = new Date(b.record.dataEmitere);
        if (dateB.getTime() !== dateA.getTime()) {
          return dateB.getTime() - dateA.getTime();
        }
        return a.record.nrFactur.localeCompare(b.record.nrFactur);
      });
    };
    
    return {
      excelRecords: sortRecords(excelRecords),
      anafRecords: sortRecords(anafRecords)
    };
  };

  const { excelRecords, anafRecords } = prepareRecordsForComparison();

  const renderTableRow = (item: {record: ExcelInvoiceRecord | ANAFInvoiceRecord; status: string; statusLabel: string; matchKey: string; differences?: string[]}, index: number, type: 'excel' | 'anaf') => {
    const record = item.record;
    const statusClass = item.status;
    const rowClass = `record-row ${statusClass} ${highlightedMatchKey === item.matchKey ? 'highlighted-match' : ''}`;
    const isClickable = statusClass === 'value-difference';
    
    return (
      <tr 
        key={`${type}-${index}`}
        className={rowClass}
        data-match-key={item.matchKey}
        data-index={index}
        onClick={isClickable ? () => onRowClick(item.matchKey) : undefined}
        onMouseEnter={() => setHighlightedMatchKey(item.matchKey)}
        onMouseLeave={() => setHighlightedMatchKey(null)}
        style={{ cursor: isClickable ? 'pointer' : 'default' }}
      >
        <td className="status-cell">
          <span className={`status-indicator ${statusClass}`} title={item.differences ? item.differences.join('\n') : ''}>
            {item.statusLabel}
          </span>
        </td>
        <td title={record.nrFactur}>{record.nrFactur}</td>
        <td>{record.dataEmitere}</td>
        <td title={record.denumireEmitent}>{record.denumireEmitent}</td>
        <td>{record.cifEmitent}</td>
        <td>{record.cotaTVA}%</td>
        <td className="amount">{formatAmount(record.baza)}</td>
      </tr>
    );
  };

  return (
    <div className="side-by-side-comparison">
      <div className="left-panel">
        <h4>Excel Contabilitate ({excelRecords.length} înregistrări)</h4>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Nr. Factură</th>
                <th>Data Emitere</th>
                <th>Denumire Emitent</th>
                <th>CIF Emitent</th>
                <th>Cota TVA</th>
                <th>Bază TVA</th>
              </tr>
            </thead>
            <tbody>
              {excelRecords.map((item, index) => renderTableRow(item, index, 'excel'))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="right-panel">
        <h4>ANAF CSV ({anafRecords.length} înregistrări)</h4>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Nr. Factură</th>
                <th>Data Emitere</th>
                <th>Denumire Emitent</th>
                <th>CIF Emitent</th>
                <th>Cota TVA</th>
                <th>Bază TVA</th>
              </tr>
            </thead>
            <tbody>
              {anafRecords.map((item, index) => renderTableRow(item, index, 'anaf'))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Comparison Modal component
interface ComparisonModalProps {
  difference: {excelRecord: ExcelInvoiceRecord; csvRecord: ANAFInvoiceRecord; differences: string[]};
  onClose: () => void;
  getFieldClass: (fieldName: string, differences: string[]) => string;
  formatAmount: (amount: string) => string;
}

function ComparisonModal({ difference, onClose, getFieldClass, formatAmount }: ComparisonModalProps) {
  const { excelRecord, csvRecord, differences } = difference;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Comparare Detaliată</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="modal-differences-summary">
            <h4>Diferențe Identificate ({differences.length})</h4>
            <ul className="modal-differences-list">
              {differences.map((diff: string, index: number) => (
                <li key={index}>{diff}</li>
              ))}
            </ul>
          </div>

          <div className="modal-comparison-row">
            <div className="modal-record-card excel-record">
              <h4>Excel Contabilitate</h4>
              <div className="modal-field">
                <span className="modal-field-label">Nr. Factură:</span>
                <span className={`modal-field-value${getFieldClass('nrFactur', differences)}`}>{excelRecord.nrFactur}</span>
              </div>
              <div className="modal-field">
                <span className="modal-field-label">Data Emitere:</span>
                <span className={`modal-field-value${getFieldClass('Data emitere', differences)}`}>{excelRecord.dataEmitere}</span>
              </div>
              <div className="modal-field">
                <span className="modal-field-label">Denumire:</span>
                <span className={`modal-field-value${getFieldClass('Denumire', differences)}`}>{excelRecord.denumireEmitent}</span>
              </div>
              <div className="modal-field">
                <span className="modal-field-label">CIF Emitent:</span>
                <span className={`modal-field-value${getFieldClass('CIF', differences)}`}>{excelRecord.cifEmitent}</span>
              </div>
              <div className="modal-field">
                <span className="modal-field-label">Cota TVA:</span>
                <span className={`modal-field-value${getFieldClass('Cota TVA', differences)}`}>{excelRecord.cotaTVA}%</span>
              </div>
              <div className="modal-field">
                <span className="modal-field-label">Bază TVA:</span>
                <span className={`modal-field-value${getFieldClass('Baza TVA', differences)}`}>{formatAmount(excelRecord.baza)}</span>
              </div>
            </div>

            <div className="modal-record-card anaf-record">
              <h4>ANAF CSV</h4>
              <div className="modal-field">
                <span className="modal-field-label">Nr. Factură:</span>
                <span className={`modal-field-value${getFieldClass('nrFactur', differences)}`}>{csvRecord.nrFactur}</span>
              </div>
              <div className="modal-field">
                <span className="modal-field-label">Data Emitere:</span>
                <span className={`modal-field-value${getFieldClass('Data emitere', differences)}`}>{csvRecord.dataEmitere}</span>
              </div>
              <div className="modal-field">
                <span className="modal-field-label">Denumire:</span>
                <span className={`modal-field-value${getFieldClass('Denumire', differences)}`}>{csvRecord.denumireEmitent}</span>
              </div>
              <div className="modal-field">
                <span className="modal-field-label">CIF Emitent:</span>
                <span className={`modal-field-value${getFieldClass('CIF', differences)}`}>{csvRecord.cifEmitent}</span>
              </div>
              <div className="modal-field">
                <span className="modal-field-label">Cota TVA:</span>
                <span className={`modal-field-value${getFieldClass('Cota TVA', differences)}`}>{csvRecord.cotaTVA}%</span>
              </div>
              <div className="modal-field">
                <span className="modal-field-label">Bază TVA:</span>
                <span className={`modal-field-value${getFieldClass('Baza TVA', differences)}`}>{formatAmount(csvRecord.baza)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}