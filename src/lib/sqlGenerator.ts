export type DatabaseDialect = 'PostgreSQL' | 'MySQL' | 'SQL Server' | 'Oracle';

export interface ColumnSchema {
  originalName: string;
  newName: string;
  type: string;
  nullable?: boolean;
}

export const COMMON_SQL_TYPES: Record<DatabaseDialect, string[]> = {
  'PostgreSQL': ['VARCHAR(255)', 'TEXT', 'INTEGER', 'BIGINT', 'NUMERIC(10,2)', 'BOOLEAN', 'TIMESTAMP', 'DATE'],
  'MySQL': ['VARCHAR(255)', 'TEXT', 'INT', 'BIGINT', 'DECIMAL(10,2)', 'TINYINT(1)', 'DATETIME', 'DATE'],
  'SQL Server': ['VARCHAR(255)', 'NVARCHAR(MAX)', 'INT', 'BIGINT', 'DECIMAL(10,2)', 'BIT', 'DATETIME', 'DATE'],
  'Oracle': ['VARCHAR2(255)', 'CLOB', 'NUMBER', 'NUMBER(10,2)', 'DATE', 'TIMESTAMP']
};

export type InsertMode = 'bulk' | 'individual';

export interface SQLGenerationOptions {
  tableName: string;
  dialect: DatabaseDialect;
  primaryKey?: string;
  createTable: boolean;
  schema: ColumnSchema[];
  insertMode: InsertMode;
}

function escapeIdentifier(identifier: string, dialect: DatabaseDialect): string {
  switch (dialect) {
    case 'MySQL':
      return `\`${identifier}\``;
    case 'PostgreSQL':
    case 'Oracle':
      return `"${identifier}"`;
    case 'SQL Server':
      return `[${identifier}]`;
    default:
      return identifier;
  }
}

function escapeValue(value: any): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  
  // Escape single quotes for SQL string literals
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}

export function guessSQLType(values: any[], dialect: DatabaseDialect): string {
  let isNumber = true;
  let isBoolean = true;
  let isDate = true;
  let maxLength = 0;

  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    
    const str = String(v).trim();
    if (str.length > maxLength) maxLength = str.length;

    if (isNaN(Number(v))) isNumber = false;
    if (str.toLowerCase() !== 'true' && str.toLowerCase() !== 'false') isBoolean = false;
    if (isNaN(Date.parse(str))) isDate = false;
  }

  if (isBoolean) return dialect === 'PostgreSQL' ? 'BOOLEAN' : (dialect === 'SQL Server' ? 'BIT' : 'TINYINT(1)');
  if (isNumber) return dialect === 'Oracle' ? 'NUMBER' : 'NUMERIC';
  if (isDate) return dialect === 'Oracle' ? 'DATE' : (dialect === 'SQL Server' ? 'DATETIME' : 'TIMESTAMP');

  if (maxLength > 255) {
     if (dialect === 'PostgreSQL' || dialect === 'MySQL') return 'TEXT';
     if (dialect === 'SQL Server') return 'NVARCHAR(MAX)';
     if (dialect === 'Oracle') return 'CLOB';
  }

  return dialect === 'Oracle' ? 'VARCHAR2(255)' : 'VARCHAR(255)';
}

function generateBulkInsert(
  rows: Record<string, any>[],
  schema: ColumnSchema[],
  safeTableName: string,
  dialect: DatabaseDialect
): string {
  const safeHeaders = schema.map(col => escapeIdentifier(col.newName, dialect)).join(', ');
  let sql = '';

  if (dialect === 'Oracle') {
    sql += `INSERT ALL\n`;
    rows.forEach(row => {
      const values = schema.map(col => escapeValue(row[col.originalName])).join(', ');
      sql += `  INTO ${safeTableName} (${safeHeaders}) VALUES (${values})\n`;
    });
    sql += `SELECT 1 FROM DUAL;\n`;
  } else {
    sql += `INSERT INTO ${safeTableName} (${safeHeaders}) VALUES\n`;
    const valueStrings = rows.map(row => {
      return `  (${schema.map(col => escapeValue(row[col.originalName])).join(', ')})`;
    });
    sql += valueStrings.join(',\n') + ';\n';
  }

  return sql;
}

function generateIndividualInserts(
  rows: Record<string, any>[],
  schema: ColumnSchema[],
  safeTableName: string,
  dialect: DatabaseDialect
): string {
  let sql = '';

  rows.forEach(row => {
    // For each row, only include columns that have non-null values
    const activeCols = schema.filter(col => {
      const val = row[col.originalName];
      return val !== null && val !== undefined;
    });

    // If somehow all columns are null, still generate with all columns
    const cols = activeCols.length > 0 ? activeCols : schema;

    const headers = cols.map(col => escapeIdentifier(col.newName, dialect)).join(', ');
    const values = cols.map(col => escapeValue(row[col.originalName])).join(', ');

    if (dialect === 'Oracle') {
      sql += `INSERT INTO ${safeTableName} (${headers}) VALUES (${values});\n`;
    } else {
      sql += `INSERT INTO ${safeTableName} (${headers}) VALUES (${values});\n`;
    }
  });

  return sql;
}

export function generateCreateTableSQL(options: SQLGenerationOptions): string {
  const { tableName, dialect, primaryKey, schema } = options;
  const safeTableName = escapeIdentifier(tableName, dialect);

  let sql = `CREATE TABLE ${safeTableName} (\n`;
  const colDefs = schema.map(col => {
    let def = `  ${escapeIdentifier(col.newName, dialect)} ${col.type}`;
    if (!col.nullable) def += ` NOT NULL`;
    if (primaryKey === col.newName) def += ' PRIMARY KEY';
    return def;
  });
  sql += colDefs.join(',\n');
  sql += '\n);\n';
  return sql;
}

export function generateInsertsSQL(
  rows: Record<string, any>[],
  options: SQLGenerationOptions
): string {
  const { tableName, dialect, schema, insertMode } = options;
  const safeTableName = escapeIdentifier(tableName, dialect);

  if (insertMode === 'individual') {
    return generateIndividualInserts(rows, schema, safeTableName, dialect);
  } else {
    return generateBulkInsert(rows, schema, safeTableName, dialect);
  }
}

export function generateSQL(
  rows: Record<string, any>[],
  options: SQLGenerationOptions
): string {
  const { tableName, dialect, primaryKey, createTable, schema, insertMode } = options;
  if (!schema || schema.length === 0 || !rows || rows.length === 0) {
    return '-- No data to generate SQL.';
  }

  const safeTableName = escapeIdentifier(tableName, dialect);
  
  let sql = '';

  if (createTable) {
    sql += `CREATE TABLE ${safeTableName} (\n`;
    const colDefs = schema.map(col => {
      let def = `  ${escapeIdentifier(col.newName, dialect)} ${col.type}`;
      
      if (!col.nullable) {
         def += ` NOT NULL`;
      }
      
      if (primaryKey === col.newName) {
        def += ' PRIMARY KEY';
      }
      
      return def;
    });
    sql += colDefs.join(',\n');
    sql += '\n);\n\n';
  }

  if (insertMode === 'individual') {
    sql += generateIndividualInserts(rows, schema, safeTableName, dialect);
  } else {
    sql += generateBulkInsert(rows, schema, safeTableName, dialect);
  }

  return sql;
}
