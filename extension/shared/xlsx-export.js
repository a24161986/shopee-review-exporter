(function attachXlsxExport(global) {
  const exportApi = typeof require === 'function'
    ? require('./export-format.js')
    : global.ShopeeReviewExporter;

  const EXCEL_HEADERS = [
    '商品链接',
    '站点',
    '店铺ID',
    '商品ID',
    '评论人',
    '评分',
    '评论内容',
    '规格/变体',
    '评论时间',
    '图片链接',
    '视频链接'
  ];

  function excelDataUrl(rows, zipApi = global.fflate) {
    if (!zipApi?.zipSync || !zipApi?.strToU8) {
      throw new Error('XLSX zip library is unavailable');
    }

    const rowsForExcel = exportApi.toExcelRows(rows);
    const headers = rowsForExcel.length ? Object.keys(rowsForExcel[0]) : EXCEL_HEADERS;
    const sheetRows = [
      headers,
      ...rowsForExcel.map((row) => headers.map((header) => row[header] ?? ''))
    ];
    const files = buildXlsxFiles(sheetRows, zipApi);
    const zipped = zipApi.zipSync(files);
    const base64 = uint8ToBase64(zipped);

    return `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
  }

  function buildXlsxFiles(sheetRows, zipApi = global.fflate) {
    if (!zipApi?.strToU8) {
      throw new Error('XLSX zip library is unavailable');
    }

    return {
      '[Content_Types].xml': zipApi.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
      '_rels/.rels': zipApi.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
      'xl/_rels/workbook.xml.rels': zipApi.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
      'xl/workbook.xml': zipApi.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Reviews" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`),
      'xl/styles.xml': zipApi.strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`),
      'xl/worksheets/sheet1.xml': zipApi.strToU8(buildWorksheetXml(sheetRows))
    };
  }

  function buildWorksheetXml(rows) {
    const columnWidths = [36, 14, 14, 14, 18, 8, 48, 24, 20, 48, 48]
      .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
      .join('');
    const rowXml = rows.map((row, rowIndex) => {
      const cells = row.map((value, columnIndex) => {
        const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
        return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
      }).join('');

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${columnWidths}</cols>
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
  }

  function columnName(number) {
    let name = '';
    while (number > 0) {
      const modulo = (number - 1) % 26;
      name = String.fromCharCode(65 + modulo) + name;
      number = Math.floor((number - modulo) / 26);
    }
    return name;
  }

  function escapeXml(value) {
    return String(value ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function uint8ToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  const api = { buildWorksheetXml, excelDataUrl, escapeXml };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ShopeeReviewExporter = Object.assign(global.ShopeeReviewExporter || {}, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
