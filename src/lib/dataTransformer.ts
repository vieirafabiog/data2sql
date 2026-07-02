export function transformValue(value: any, targetType: string): any {
  if (value === null || value === undefined || value === '') return null;

  const type = targetType.toUpperCase();

  // Handle Strings (VARCHAR, TEXT, CLOB, NVARCHAR)
  if (type.includes('VARCHAR') || type.includes('TEXT') || type.includes('CLOB') || type.includes('CHAR')) {
    return String(value);
  }

  // Handle Numbers (INT, INTEGER, BIGINT, NUMERIC, DECIMAL, NUMBER)
  if (type.includes('INT') || type.includes('NUMERIC') || type.includes('DECIMAL') || type.includes('NUMBER')) {
    const num = Number(String(value).replace(/,/g, '.')); // handle European comma decimals roughly
    if (isNaN(num)) return null; // Invalid values become NULL
    
    // If integer type, floor it
    if (type.includes('INT')) return Math.floor(num);
    return num;
  }

  // Handle Booleans (BOOLEAN, BIT, TINYINT(1))
  if (type.includes('BOOL') || type.includes('BIT') || type.includes('TINYINT(1)')) {
    if (typeof value === 'boolean') return value;
    const str = String(value).toLowerCase().trim();
    if (['true', '1', 'yes', 'y', 'sim', 's', 'ativo'].includes(str)) return true;
    if (['false', '0', 'no', 'n', 'nao', 'não', 'inativo'].includes(str)) return false;
    return null; // Mixed or unrecognized -> null
  }

  // Handle Dates (DATE, DATETIME, TIMESTAMP)
  if (type.includes('DATE') || type.includes('TIME')) {
    // Basic date parsing
    const str = String(value);
    
    // Check if it's already a valid date
    let date = new Date(str);
    
    // Handle DD/MM/YYYY
    if (isNaN(date.getTime()) && str.includes('/')) {
       const parts = str.split(/[ /:-]/);
       if (parts.length >= 3) {
          // Assuming DD/MM/YYYY
          const d = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const y = parseInt(parts[2], 10);
          date = new Date(y, m, d);
          
          if (parts.length >= 5) {
             date.setHours(parseInt(parts[3], 10) || 0);
             date.setMinutes(parseInt(parts[4], 10) || 0);
          }
       }
    }
    
    if (isNaN(date.getTime())) return null;
    
    // Return ISO format string (without Z if we want local time, but standard ISO is fine)
    // SQL usually wants YYYY-MM-DD HH:MM:SS
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    
    if (type === 'DATE') {
       return `${yyyy}-${mm}-${dd}`;
    } else {
       const hh = pad(date.getHours());
       const min = pad(date.getMinutes());
       const ss = pad(date.getSeconds());
       return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
    }
  }

  // Fallback
  return value;
}

export function transformColumn(
  data: Record<string, any>[], 
  columnName: string, 
  targetType: string
): Record<string, any>[] {
  return data.map(row => ({
    ...row,
    [columnName]: transformValue(row[columnName], targetType)
  }));
}
