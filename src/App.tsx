import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { RotateCcw, Database, Upload, Copy, CheckCircle2, FileType2, Download, TableProperties } from 'lucide-react';
import { motion } from 'framer-motion';
import Prism from 'prismjs';
import 'prismjs/components/prism-sql';
import 'prismjs/themes/prism-tomorrow.css';
import { Logo } from './components/Logo';
import { getParserForFile } from './lib/parsers';
import type { ParseResult } from './lib/parsers';
import { generateSQL, guessSQLType, COMMON_SQL_TYPES } from './lib/sqlGenerator';
import type { DatabaseDialect, SQLGenerationOptions, ColumnSchema, InsertMode } from './lib/sqlGenerator';
import { transformColumn } from './lib/dataTransformer';

type TabType = 'preview' | 'sql';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [tableData, setTableData] = useState<Record<string, any>[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('preview');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Settings state
  const [tableName, setTableName] = useState('imported_data');
  const [primaryKey, setPrimaryKey] = useState<string>('');
  const [dialect, setDialect] = useState<DatabaseDialect>('PostgreSQL');
  const [createTable, setCreateTable] = useState(true);
  const [schema, setSchema] = useState<ColumnSchema[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [colWidths, setColWidths] = useState<Record<number, number>>({});
  const [insertMode, setInsertMode] = useState<InsertMode>('bulk');
  
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  const initSchemaAndData = (result: ParseResult, dbDialect: DatabaseDialect) => {
    const newSchema = result.headers.map(h => {
      const sampleValues = result.rows.slice(0, 50).map(r => r[h]);
      const type = guessSQLType(sampleValues, dbDialect);
      
      const hasNulls = result.rows.some(r => {
        const val = r[h];
        if (val === null || val === undefined) return true;
        if (typeof val === 'string' && val.trim() === '') return true;
        return false;
      });
      
      return {
        originalName: h,
        newName: h,
        type,
        nullable: hasNulls
      };
    });
    setSchema(newSchema);
    setTableData(result.rows);
    
    if (newSchema.length > 0 && !primaryKey) {
      setPrimaryKey(newSchema[0].newName);
    }
  };

  const processFileAsync = async (selectedFile: File, sheetName?: string) => {
    setIsProcessing(true);
    setFile(selectedFile);
    
    // Slight timeout to allow React to render the loading state before synchronous heavy parsing
    setTimeout(async () => {
      try {
        const parser = getParserForFile(selectedFile);
        
        if (!parser) {
          alert('Unsupported file type. Please upload a CSV, JSON, Excel, or XML file.');
          setIsProcessing(false);
          return;
        }

        const result = await parser.parse(selectedFile, { sheetName });
        setParseResult(result);
        
        if (result.sheets && result.sheets.length > 0 && !sheetName) {
          setSelectedSheet(result.sheets[0]);
        }
        
        initSchemaAndData(result, dialect);
        
        if (!sheetName) {
          const nameWithoutExt = selectedFile.name.split('.').slice(0, -1).join('_').replace(/[^a-zA-Z0-9_]/g, '_');
          if (nameWithoutExt) setTableName(nameWithoutExt);
        }
        
        setActiveTab('preview');
      } catch (err) {
        console.error(err);
      } finally {
        setIsProcessing(false);
      }
    }, 50);
  };

  const handleFile = (selectedFile: File) => {
    processFileAsync(selectedFile);
  };

  useEffect(() => {
    if (parseResult && schema.length === 0) {
      initSchemaAndData(parseResult, dialect);
    }
  }, [parseResult, dialect]);

  const handleDialectChange = (newDialect: DatabaseDialect) => {
    setDialect(newDialect);
    if (parseResult) {
       initSchemaAndData(parseResult, newDialect);
    }
  };

  const handleSheetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sheet = e.target.value;
    setSelectedSheet(sheet);
    if (file) {
      processFileAsync(file, sheet);
    }
  };

  const handleSchemaChange = (index: number, field: keyof ColumnSchema, value: string | boolean) => {
    const newSchema = [...schema];
    const col = newSchema[index];
    
    if (field === 'newName' && primaryKey === col.newName) {
       setPrimaryKey(value as string);
    }
    
    newSchema[index] = { ...col, [field]: value };
    setSchema(newSchema);

    if (field === 'type') {
       const transformedData = transformColumn(tableData, col.originalName, value as string);
       setTableData(transformedData);
    }
  };

  const handleRevertColumn = (index: number) => {
    if (!parseResult) return;
    const col = schema[index];
    const originalName = col.originalName;
    
    const sampleValues = parseResult.rows.slice(0, 50).map(r => r[originalName]);
    const originalType = guessSQLType(sampleValues, dialect);
    
    const newSchema = [...schema];
    newSchema[index] = { ...col, type: originalType };
    setSchema(newSchema);
    
    const revertedData = tableData.map((row, i) => ({
      ...row,
      [originalName]: parseResult.rows[i]?.[originalName]
    }));
    setTableData(revertedData);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Column Resizer Logic
  const handleMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    const startX = e.clientX;
    const startWidth = colWidths[index] || 180; // default min width

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(120, startWidth + (moveEvent.clientX - startX));
      setColWidths(prev => ({ ...prev, [index]: newWidth }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [colWidths]);

  const sqlOptions: SQLGenerationOptions = useMemo(() => ({
    tableName,
    dialect,
    primaryKey,
    createTable,
    schema,
    insertMode
  }), [tableName, dialect, primaryKey, createTable, schema, insertMode]);

  const generateFullSQL = () => {
    if (!tableData || tableData.length === 0) return '';
    return generateSQL(tableData, sqlOptions);
  };

  const previewSQL = useMemo(() => {
    if (!tableData || tableData.length === 0) return '';
    const MAX_PREVIEW_ROWS = 1000;
    const truncatedRows = tableData.slice(0, MAX_PREVIEW_ROWS);
    let sql = generateSQL(truncatedRows, sqlOptions);
    if (tableData.length > MAX_PREVIEW_ROWS) {
       sql += `\n\n-- Preview truncated. Download the SQL to get all ${tableData.length} rows.`;
    }
    return sql;
  }, [tableData, sqlOptions]);

  useEffect(() => {
    if (activeTab === 'sql' && previewSQL) {
      // Small timeout to allow render to finish before highlighting
      setTimeout(() => Prism.highlightAll(), 0);
    }
  }, [previewSQL, activeTab]);

  const handleCopy = () => {
    navigator.clipboard.writeText(previewSQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const fullSQL = generateFullSQL();
    const blob = new Blob([fullSQL], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tableName}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Render Initial Full Screen State
  if (!parseResult && !isProcessing) {
    return (
      <div className="hero-container">
        <div className="hero-brand">
          <Logo size={56} />
          <span>Data2SQL</span>
        </div>
        <div 
          className="hero-dropzone"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => heroFileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={heroFileInputRef} 
            onChange={(e) => e.target.files && handleFile(e.target.files[0])} 
            style={{ display: 'none' }}
            accept=".csv,.json,.xlsx,.xls,.xml"
          />
          <Upload size={48} className="upload-icon" style={{ marginBottom: 0 }} />
          <h2>Drag & drop your file here</h2>
          <p className="upload-text" style={{ color: 'var(--text-muted)' }}>or click to browse from your computer</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <span style={{background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', color: '#8b929c'}}>CSV</span>
            <span style={{background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', color: '#8b929c'}}>Excel</span>
            <span style={{background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', color: '#8b929c'}}>JSON</span>
            <span style={{background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', color: '#8b929c'}}>XML</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="brand" onClick={() => window.location.reload()} style={{cursor: 'pointer'}}>
          <Logo size={36} />
          <span>Data2SQL</span>
        </div>

        <div 
          className="upload-zone"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => e.target.files && handleFile(e.target.files[0])} 
            style={{ display: 'none' }}
            accept=".csv,.json,.xlsx,.xls,.xml"
          />
          <Upload size={32} className="upload-icon" />
          <p className="upload-text">Upload another file</p>
        </div>

        {file && !isProcessing && (
          <div className="file-info" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
              <FileType2 size={20} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {file.name}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
              {tableData.length.toLocaleString()} rows processed
            </div>
          </div>
        )}

        {parseResult && !parseResult.error && !isProcessing && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '4px' }}
          >
            {parseResult.sheets && parseResult.sheets.length > 1 && (
               <div className="form-group">
                 <label className="form-label">Select Sheet</label>
                 <select 
                   className="form-select"
                   value={selectedSheet}
                   onChange={handleSheetChange}
                 >
                   {parseResult.sheets.map(s => (
                     <option key={s} value={s}>{s}</option>
                   ))}
                 </select>
               </div>
            )}

            <div className="form-group">
              <label className="form-label">Table Name</label>
              <input 
                type="text" 
                className="form-input" 
                value={tableName}
                onChange={e => setTableName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Database Dialect</label>
              <select 
                className="form-select"
                value={dialect}
                onChange={e => handleDialectChange(e.target.value as DatabaseDialect)}
              >
                <option value="PostgreSQL">PostgreSQL</option>
                <option value="MySQL">MySQL</option>
                <option value="SQL Server">SQL Server</option>
                <option value="Oracle">Oracle</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Primary Key</label>
              <select 
                className="form-select"
                value={primaryKey}
                onChange={e => setPrimaryKey(e.target.value)}
              >
                <option value="">-- None --</option>
                {schema.map(col => (
                  <option key={col.newName} value={col.newName}>{col.newName}</option>
                ))}
              </select>
            </div>

            <label className="checkbox-group">
              <input 
                type="checkbox" 
                checked={createTable} 
                onChange={e => setCreateTable(e.target.checked)} 
              />
              <span className="form-label" style={{ margin: 0 }}>Include CREATE TABLE</span>
            </label>

            <div className="form-group">
              <label className="form-label">Insert Mode</label>
              <select 
                className="form-select"
                value={insertMode}
                onChange={e => setInsertMode(e.target.value as InsertMode)}
              >
                <option value="bulk">Bulk (single INSERT, all rows)</option>
                <option value="individual">Individual (one INSERT per row)</option>
              </select>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {insertMode === 'individual' 
                  ? 'NULL columns are automatically omitted from each INSERT.' 
                  : 'All rows in a single INSERT statement with all columns.'}
              </span>
            </div>

            <button 
              className="btn btn-primary"
              onClick={() => setActiveTab('sql')}
              style={{ marginTop: '12px' }}
            >
              <Database size={18} />
              Generate SQL
            </button>
          </motion.div>
        )}

        {parseResult?.error && !isProcessing && (
          <div style={{ color: '#ff4a4a', fontSize: '0.875rem', marginTop: '12px' }}>
            Error: {parseResult.error}
          </div>
        )}
      </div>

      {/* Main Area */}
      <div className="main-area">
        {isProcessing ? (
           <div className="empty-state">
              <div className="hero-spinner"></div>
              <h2>Processing File...</h2>
              <p>Reading rows and identifying data types.</p>
           </div>
        ) : (
          <>
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'preview' ? 'active' : ''}`}
                onClick={() => setActiveTab('preview')}
              >
                <TableProperties size={16} /> Data Preview & Transform
                {activeTab === 'preview' && <motion.div layoutId="indicator" className="tab-indicator" />}
              </button>
              <button 
                className={`tab ${activeTab === 'sql' ? 'active' : ''}`}
                onClick={() => setActiveTab('sql')}
                disabled={!parseResult || !!parseResult.error}
              >
                <Database size={16} /> SQL Output
                {activeTab === 'sql' && <motion.div layoutId="indicator" className="tab-indicator" />}
              </button>
            </div>

            <div className="view-container">
              {parseResult && !parseResult.error && activeTab === 'preview' && (
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="table-wrapper"
                >
                  <table className="preview-table interactive">
                    <thead>
                      <tr>
                        {schema.map((col, i) => {
                           const typeOptions = Array.from(new Set([...COMMON_SQL_TYPES[dialect], col.type]));
                           const width = colWidths[i] || 200; // default column width
                           return (
                             <th key={i} style={{ width, minWidth: width, maxWidth: width }}>
                               <div className="th-content" style={{ width: '100%' }}>
                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                   <span className="th-label" style={{overflow: 'hidden', textOverflow: 'ellipsis'}}>Col: {col.originalName}</span>
                                   <button 
                                     className="btn-icon" 
                                     onClick={() => handleRevertColumn(i)}
                                     title="Revert transformations and reset type"
                                     style={{ padding: 2, flexShrink: 0 }}
                                   >
                                     <RotateCcw size={14} />
                                   </button>
                                 </div>
                                 <input 
                                   type="text" 
                                   className="schema-input rename-input" 
                                   value={col.newName}
                                   onChange={e => handleSchemaChange(i, 'newName', e.target.value)}
                                   title="Rename SQL Column"
                                 />
                                 <select 
                                   className="schema-input type-input" 
                                   value={col.type}
                                   onChange={e => handleSchemaChange(i, 'type', e.target.value)}
                                   title="SQL Data Type (transforms data on change)"
                                 >
                                   {typeOptions.map(t => (
                                     <option key={t} value={t}>{t}</option>
                                   ))}
                                 </select>
                                 <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'pointer', marginTop: '2px' }}>
                                   <input 
                                     type="checkbox" 
                                     checked={col.nullable || false}
                                     onChange={e => handleSchemaChange(i, 'nullable', e.target.checked)}
                                     style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                                   />
                                   Allow Nulls
                                 </label>
                               </div>
                               <div 
                                 className="resizer" 
                                 onMouseDown={(e) => handleMouseDown(e, i)}
                               />
                             </th>
                           );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.slice(0, 100).map((row, idx) => (
                        <tr key={idx}>
                          {schema.map((col, i) => {
                             const width = colWidths[i] || 200;
                             return (
                               <td key={i} style={{ width, minWidth: width, maxWidth: width }} title={String(row[col.originalName] || '')}>
                                 {row[col.originalName] === null 
                                   ? <span style={{color: '#64748b', fontStyle: 'italic'}}>NULL</span>
                                   : String(row[col.originalName])}
                               </td>
                             );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}

              {parseResult && !parseResult.error && activeTab === 'sql' && (
                <motion.div 
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="code-viewer-wrapper"
                >
                  <div className="code-header">
                    <span className="code-title">{tableName}.sql {tableData.length > 1000 && '(Preview Truncated)'}</span>
                    <div className="code-actions">
                      <button className="btn-icon" onClick={handleCopy}>
                        {copied ? <CheckCircle2 size={16} color="#4f46e5" /> : <Copy size={16} />}
                        {copied ? 'Copied!' : 'Copy Preview'}
                      </button>
                      <button className="btn-primary-small" onClick={handleDownload}>
                        <Download size={16} />
                        Download Full SQL
                      </button>
                    </div>
                  </div>
                  <pre className="code-content language-sql" style={{ margin: 0, borderRadius: 0 }}>
                    <code className="language-sql">{previewSQL}</code>
                  </pre>
                </motion.div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
