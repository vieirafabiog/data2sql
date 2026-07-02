import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { XMLParser } from 'fast-xml-parser';

export interface ParseResult {
  headers: string[];
  rows: Record<string, any>[];
  error?: string;
  sheets?: string[];
}

export interface FileParser {
  name: string;
  accepts: string[];
  parse(file: File, options?: { sheetName?: string }): Promise<ParseResult>;
}

export const CSVParser: FileParser = {
  name: 'CSV',
  accepts: ['.csv', 'text/csv'],
  parse: (file: File) => {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0 && results.data.length === 0) {
            resolve({ headers: [], rows: [], error: results.errors[0].message });
            return;
          }
          const rows = results.data as Record<string, any>[];
          const headers = results.meta.fields || (rows.length > 0 ? Object.keys(rows[0]) : []);
          resolve({ headers, rows });
        },
        error: (error) => {
          resolve({ headers: [], rows: [], error: error.message });
        }
      });
    });
  }
};

export const JSONParser: FileParser = {
  name: 'JSON',
  accepts: ['.json', 'application/json'],
  parse: (file: File) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          let data = JSON.parse(content);
          
          if (!Array.isArray(data)) {
             // If it's a single object, wrap it in array
             data = [data];
          }
          
          if (data.length === 0) {
            resolve({ headers: [], rows: [] });
            return;
          }
          
          const headers = Object.keys(data[0]);
          resolve({ headers, rows: data });
        } catch (error: any) {
          resolve({ headers: [], rows: [], error: 'Invalid JSON file: ' + error.message });
        }
      };
      reader.onerror = () => resolve({ headers: [], rows: [], error: 'Failed to read file' });
      reader.readAsText(file);
    });
  }
};

export const ExcelParser: FileParser = {
  name: 'Excel',
  accepts: ['.xlsx', '.xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
  parse: (file: File, options?: { sheetName?: string }) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          if (workbook.SheetNames.length === 0) {
            resolve({ headers: [], rows: [], error: 'Excel file is empty' });
            return;
          }
          
          const targetSheetName = options?.sheetName && workbook.SheetNames.includes(options.sheetName) 
            ? options.sheetName 
            : workbook.SheetNames[0];
            
          const targetSheet = workbook.Sheets[targetSheetName];
          const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(targetSheet);
          
          if (rows.length === 0) {
            resolve({ headers: [], rows: [], sheets: workbook.SheetNames });
            return;
          }
          
          const headers = Object.keys(rows[0]);
          resolve({ headers, rows, sheets: workbook.SheetNames });
        } catch (error: any) {
          resolve({ headers: [], rows: [], error: 'Failed to parse Excel file: ' + error.message });
        }
      };
      reader.onerror = () => resolve({ headers: [], rows: [], error: 'Failed to read file' });
      reader.readAsArrayBuffer(file);
    });
  }
};

export const XMLParserImpl: FileParser = {
  name: 'XML',
  accepts: ['.xml', 'application/xml', 'text/xml'],
  parse: (file: File) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parser = new XMLParser({ ignoreAttributes: false });
          const result = parser.parse(content);
          
          // XML to JSON is tricky because the root node can be anything.
          // Let's try to find the first array in the parsed object.
          let rows: Record<string, any>[] = [];
          
          const findArray = (obj: any) => {
            if (Array.isArray(obj)) {
              rows = obj;
              return true;
            }
            if (obj && typeof obj === 'object') {
              for (const key of Object.keys(obj)) {
                if (findArray(obj[key])) return true;
              }
            }
            return false;
          };
          
          findArray(result);
          
          if (rows.length === 0) {
             // Fallback: If it's a single object (e.g., <root><item>val</item></root>), wrap the children.
             const rootKeys = Object.keys(result);
             if (rootKeys.length === 1) {
               const root = result[rootKeys[0]];
               const itemKeys = Object.keys(root);
               if (itemKeys.length === 1 && Array.isArray(root[itemKeys[0]])) {
                  rows = root[itemKeys[0]];
               } else {
                  rows = [root];
               }
             }
          }
          
          if (rows.length === 0) {
            resolve({ headers: [], rows: [], error: 'Could not find a valid table structure in XML' });
            return;
          }
          
          const headers = Object.keys(rows[0]);
          resolve({ headers, rows });
        } catch (error: any) {
          resolve({ headers: [], rows: [], error: 'Failed to parse XML file: ' + error.message });
        }
      };
      reader.onerror = () => resolve({ headers: [], rows: [], error: 'Failed to read file' });
      reader.readAsText(file);
    });
  }
};

export const Parsers = [CSVParser, ExcelParser, JSONParser, XMLParserImpl];

export function getParserForFile(file: File): FileParser | undefined {
  return Parsers.find(p => p.accepts.some(ext => file.name.toLowerCase().endsWith(ext) || file.type === ext));
}
