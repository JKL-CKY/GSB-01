/**
 * 极简 CSV 工具（只依赖 Node 内置能力）
 * - parse: 支持双引号包裹、转义双引号、\r\n
 * - stringify: 自动加引号；导出时由调用方补 BOM（﻿）保证中文不乱码
 */

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, ''); // 去掉可能存在的 BOM

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (ch === '\r') {
      // 跳过，等 \n 处理
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

function escapeCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(headers, dataRows) {
  const lines = [headers.map(escapeCell).join(',')];
  for (const r of dataRows) lines.push(r.map(escapeCell).join(','));
  return '﻿' + lines.join('\r\n'); // UTF-8 BOM
}

module.exports = { parseCSV, toCSV };
