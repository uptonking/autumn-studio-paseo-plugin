export interface NormalizedBox {
  page: number;
  col: number;
  colCount: number;
  sidebar?: number;
  text: string;
  x1: number;
  x2: number;
  topY: number;
  h: number;
}

export interface RowGroup {
  cells: NormalizedBox[];
  x1: number;
  x2: number;
  topY: number;
  h: number;
}

const JS_RESERVED_WORDS = new Set([
  'abstract',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'double',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'function',
  'goto',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'int',
  'interface',
  'long',
  'native',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'volatile',
  'while',
  'with',
]);

export function normalizeCjkOcrText(text: string): string {
  let out = text
    .trim()
    .replace(/[⋯…]+[•·.]*|[•·.]+[⋯…]+/g, '……')
    .replace(/看书瑣记/g, '看书琐记')
    .replace(/東缚/g, '束缚')
    .replace(/嚼看各种离蛋/g, '嚼着各种禽蛋')
    .replace(/码乌蛋/g, '鲕鸟蛋')
    .replace(/驼乌蛋/g, '鸵鸟蛋')
    .replace(/握佳/g, '握住')
    .replace(/毒溜/g, '毒瘤')
    .replace(/插人/g, '插入')
    .replace(/载人/g, '载入')
    .replace(/唤损/g, '缺损')
    .replace(/它昀容量/g, '它的容量')
    .replace(/上还步骤/g, '上述步骤')
    .replace(/待修复韵那/g, '待修复的那')
    .replace(/所耗所时间/g, '所耗的时间')
    .replace(/\bdrawo\s*方法/g, 'draw() 方法')
    .replace(/\bdrawDiscBackground[（(]\s*方法/g, 'drawDiscBackground() 方法')
    .replace(/([^鱼竿饵钩垂])钓/g, '$1的')
    .replace(/Prince of Ijre/g, 'Prince of Tyre')
    .replace(/Semicoion insertion/gi, 'Semicolon Insertion')
    .replace(/把（放在上一/g, '把 { 放在上一')
    .replace(/参数睡！/g, '参数[译注1]')
    .replace(/平面辛\s*2\s*/g, '平面[译注2]')
    .replace(/被引\.号/g, '被引号')
    .replace(/int\/1ong\/float/g, 'int/long/float')
    .replace(/wikipedia\.org\/wikil\s*/g, 'wikipedia.org/wiki/')
    .replace(/）—(?![—])/g, '）——')
    .replace(/\b([a-zA-Z_][\w.]*)\s*（\s*）/g, '$1()')
    .replace(/\bxand\s+y\b/gi, 'x and y')
    .replace(/\bxory\b/gi, 'x or y')
    .replace(/([\u4e00-\u9fff])\s*×\s*([\u4e00-\u9fffA-Za-z])/g, '$1 x $2');
  for (let pass = 0; pass < 2; pass++) {
    out = out.replace(
      /([\u4e00-\u9fff《》“”‘’（）、，。！？；：])\s+([\u4e00-\u9fff《》“”‘’（）、，。！？；：])/g,
      '$1$2',
    );
  }
  out = out
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9()%])([\u4e00-\u9fff])/g, '$1 $2')
    .replace(/\]\s+([，。！？；：])/g, ']$1')
    .replace(/http:\s*\/\//g, 'http://')
    .replace(/https:\s*\/\//g, 'https://')
    .replace(/(https?:\/\/[A-Za-z0-9._/-]+)\s+([\u4e00-\u9fff])/g, '$1$2');
  if (out.startsWith('《') && out.includes('》')) {
    out = out
      .replace(/•/g, '·')
      .replace(/^《([^》]+?)[。．]([^》]+)》/, '《$1·$2》')
      .replace(/＜/g, '〈')
      .replace(/＞/g, '〉');
  }
  return out;
}

export function groupBoxesIntoRows(boxes: readonly NormalizedBox[], yTol = 0.012): RowGroup[] {
  const sorted = [...boxes].sort((a, b) =>
    Math.abs(a.topY - b.topY) > yTol ? a.topY - b.topY : a.x1 - b.x1,
  );
  const rows: RowGroup[] = [];
  for (const box of sorted) {
    const last = rows[rows.length - 1];
    const overlapsHorizontally =
      last?.cells.some((c) => Math.min(c.x2, box.x2) - Math.max(c.x1, box.x1) > 0.02) ?? false;
    if (last && !overlapsHorizontally && Math.abs(box.topY - last.topY) <= yTol) {
      last.cells.push(box);
      last.cells.sort((a, b) => a.x1 - b.x1);
      last.x1 = Math.min(last.x1, box.x1);
      last.x2 = Math.max(last.x2, box.x2);
      last.h = Math.max(last.h, box.h);
    } else {
      rows.push({
        cells: [box],
        x1: box.x1,
        x2: box.x2,
        topY: box.topY,
        h: box.h,
      });
    }
  }
  return rows;
}

function normalizeCodeAsciiPunctuation(raw: string): string {
  return raw
    .replace(/｛/g, '{')
    .replace(/｝/g, '}')
    .replace(/［/g, '[')
    .replace(/］/g, ']')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/；/g, ';')
    .replace(/：/g, ':')
    .replace(/，/g, ',')
    .replace(/•••/g, '...')
    .replace(/ー/g, '-');
}

function isJsKeywordListRow(rawJoined: string): boolean {
  const tokens = rawJoined.trim().split(/\s+/);
  return tokens.length >= 6 && tokens.every((t) => JS_RESERVED_WORDS.has(t));
}

export function detectCodeRowKind(row: RowGroup): 'python' | 'javascript' | null {
  const rawJoined = normalizeCodeAsciiPunctuation(
    row.cells.map((c) => c.text.trim()).join(' '),
  ).trim();
  if (!rawJoined) return null;
  const nonCommentPart = rawJoined.replace(/(?:\/\/|11|1\/).*$/, '').replace(/非\s*三?法\s*$/, '');
  if (/[\u4e00-\u9fff]/.test(nonCommentPart)) return null;
  if (isJsKeywordListRow(rawJoined)) return 'javascript';
  if (
    /^(?:function|Eunction)\s+\w+/i.test(rawJoined) ||
    /^(?:var|let|const)\s+[a-zA-Z_$]/i.test(rawJoined) ||
    /^for\s*\(/.test(rawJoined) ||
    rawJoined.startsWith('//') ||
    /^(?:\.\.\.|\{|\};|\}i|\})$/.test(rawJoined) ||
    /^window\.\s*[a-zA-Z_$]/.test(rawJoined) ||
    /^return(?:\s*[{1])?$/.test(rawJoined) ||
    /^status\s*:\s*true\b/.test(rawJoined) ||
    /^object(?:\.|\[|l'|\s*=)/.test(rawJoined) ||
    /^(?:context|offscreen|oftscreen|ottscreen|requestNext|drawDisc|eraseBack|drawBack)/i.test(
      rawJoined,
    ) ||
    /^[a-zA-Z_$][\w$.]*\s*=\s*value[;i]?$/.test(rawJoined) ||
    /^(?:disc\.radius|X-r|0,\s*0,\s*offscreen)/i.test(rawJoined) ||
    /^[a-zA-Z_$]\w*\s*[;,]$/.test(rawJoined)
  ) {
    return 'javascript';
  }
  if (/[\u4e00-\u9fff]/.test(rawJoined)) return null;
  if (row.cells.some((c) => /^#[A-Za-z]/.test(c.text.trim()))) return 'python';
  if (/^bool\s*\(/i.test(rawJoined) || /^\d+\s*[<>!=]=?\s*\d+/.test(rawJoined)) {
    return 'python';
  }
  if (/^[a-zA-Z_][\w.]*\s*=\s*\S+/.test(rawJoined)) {
    return /[;,]|\b(?:disc|canvas|getContext|createElement)\b/i.test(rawJoined)
      ? 'javascript'
      : 'python';
  }
  return null;
}

function normalizePythonOcrCodeRow(row: RowGroup): string {
  return row.cells
    .map((c) => c.text.trim())
    .join('  ')
    .replace(/\bbooL\b/g, 'bool')
    .replace(/#FaLse\b/g, '#False')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/［1\)/g, '[])')
    .replace(/\(''\)|'\)/g, "('')")
    .replace(/bool\s+\(/g, 'bool(')
    .replace(/(\d)\s*([<>])\s*(\d)0r(\d)\s*([<>])\s*(\d)/g, '$1 $2 $3 or $4 $5 $6')
    .replace(/(\d)\s*([<>])\s*(\d)/g, '$1 $2 $3');
}

export function normalizeJsOcrCodeRow(row: RowGroup, baseX1: number): string {
  const indentSteps = Math.min(3, Math.max(0, Math.round((row.x1 - baseX1) / 0.036)));
  const indent = '    '.repeat(indentSteps);
  let line = normalizeCodeAsciiPunctuation(row.cells.map((c) => c.text.trim()).join(' '));
  line = line
    .replace(/^Eunction\b/, 'function')
    .replace(/^Var\b/, 'var')
    .replace(/\baisc\./g, 'disc.')
    .replace(/^W\s*=\s*r\*2/, 'w = r*2')
    .replace(/^for\s*\(\s*i-0;/, 'for (i=0;')
    .replace(/^(function\s+\w+\s*\([^)]*\))\s*[({1]$/, '$1 {')
    .replace(/\s+\(\s*;/g, '();')
    .replace(/\s+\(\s*\)/g, '()')
    .replace(/^context\.$/, 'context.save();')
    .replace(/^context\s+are\s*\(\s*X_\s*Y,/, 'context.arc(x, y,')
    .replace(/\beraseBackaround\b/g, 'eraseBackground')
    .replace(/\bdrawBackqround\b/g, 'drawBackground')
    .replace(/X-r,\s*y-K,\s*w,\s*h,\s*x-I,\s*y-r,\s*w,\s*h/g, 'x-r, y-r, w, h, x-r, y-r, w, h')
    .replace(/canvas,\s*width/g, 'canvas.width')
    .replace(/canvas,\s*height/g, 'canvas.height')
    .replace(/\b(?:oftscreen|ottscreen)Canvas\b/g, 'offscreenCanvas')
    .replace(/\b(?:oftscreen|ottscreen)Context\b/g, 'offscreenContext')
    .replace(/\boffscreenContext\s+w\s+/g, 'offscreenContext = ')
    .replace(
      /\boffscreenCanvas\.width\s*-\s*canvas\.width[;i]?/g,
      'offscreenCanvas.width = canvas.width;',
    )
    .replace(/\bgetcontext\b/g, 'getContext')
    .replace(/'2a'/g, "'2d'")
    .replace(/createElement\('canvas'\s*$/, "createElement('canvas'),")
    .replace(/\bi1lustration\b/g, 'illustration')
    .replace(/\boftscreen\b/g, 'offscreen')
    .replace(/\brequestNextanimationFrame\b/g, 'requestNextAnimationFrame')
    .replace(/\)\s*:\s*\/\//g, '); //')
    .replace(/^return\s+1$/, 'return {')
    .replace(/^\}\s*i$/, '};')
    .replace(/\}\s*i\b/g, '};')
    .replace(/\bwindow\.\s+/g, 'window.')
    .replace(/\bfoo\.=\s*/g, 'foo = ')
    .replace(/\bobject\s*=\s*/g, 'object = ')
    .replace(/\]\s*=\s*/g, '] = ')
    .replace(/\{\s*([a-zA-Z_']\w*'?)\s*:\s*value\s*\}/g, '{$1: value}')
    .replace(/\b(value|method|class)i\b/g, '$1;')
    .replace(/=\s*I([a-zA-Z_]\w*\s*:)/g, '= {$1')
    .replace(/\bobjectl'/g, "object['")
    .replace(/\s+(?:\/\/|11|1\/)\s*[oO][kK]\b/g, ' // ok')
    .replace(/\s+(?:\/\/|11|1\/)?\s*非\s*三?法/g, ' // 非法')
    .replace(/(object\.box\s*=\s*value;)\s+11$/, '$1 // ok')
    .replace(/(object\.case\s*=\s*value;)\s+11$/, '$1 // 非法');
  return `${indent}${line}`;
}

function isWatermarkOrMarginBox(b: NormalizedBox): boolean {
  const t = b.text.trim();
  if ((b.x2 <= 0.102 || b.x1 >= 0.885) && /^[〈<]?\d{1,4}[〉>]?$/.test(t)) return true;
  if (
    b.topY > 0.82 &&
    b.x1 < 0.045 &&
    (b.h >= 0.018 || b.x2 <= 0.1 || /拼|吾爱|01051|pin51/i.test(t))
  ) {
    return true;
  }
  return false;
}

function isHeaderOrFooterRow(row: RowGroup, idx: number, totalRows: number): boolean {
  const text = row.cells
    .map((c) => c.text.trim())
    .join(' ')
    .trim();
  if (row.topY < 0.065) {
    if (/^\d{1,4}$/.test(text)) return true;
    if (/^\d{1,4}\s+第\s*\d+\s*章$/.test(text) || /^第\s*\d+\s*章\s+\d{1,4}$/.test(text))
      return true;
    if (/^动\s*画\s+\d{1,4}$/.test(text) || /^\d{1,4}\s+动\s*画$/.test(text)) return true;
  }
  if (row.topY <= 0.84 && idx < totalRows - 1) return false;
  if (/^\d{1,4}$/.test(text) && row.topY > 0.84) return true;
  if (/^\d{1,4}\s*[|｜❘]\s*\S+/.test(text) && row.topY > 0.84) return true;
  if (/^\S+\s+\d{1,4}$/.test(text) && row.topY > 0.84 && (row.x1 > 0.68 || row.x2 < 0.35)) {
    return true;
  }
  return false;
}

export function formatSingleColumnVisionPage(
  pageBoxes: readonly NormalizedBox[],
  cleanCodeBlocks: readonly string[],
  codeBlockIdxRef: { index: number },
): string[] {
  const blocks: string[] = [];
  const contentBoxes = pageBoxes.filter((b) => !isWatermarkOrMarginBox(b));
  const allRows = groupBoxesIntoRows(contentBoxes, 0.011);
  const rows = allRows.filter((r, idx) => !isHeaderOrFooterRow(r, idx, allRows.length));

  const proseX1s = rows
    .filter((r) => detectCodeRowKind(r) === null && r.x2 > 0.7)
    .map((r) => r.x1)
    .sort((a, b) => a - b);
  const bodyLeftMargin = proseX1s[0] ?? 0.11;

  let currentParagraph = '';
  let prevProseRow: RowGroup | null = null;
  const flushPara = () => {
    const trimmed = currentParagraph.trim();
    if (trimmed) {
      const fnMatch = trimmed.match(/^(译注\s*\d+)\s*[：:]\s*([\s\S]+)$/);
      blocks.push(fnMatch?.[1] && fnMatch[2] ? `> **${fnMatch[1]}**：${fnMatch[2]}` : trimmed);
      currentParagraph = '';
    }
    prevProseRow = null;
  };

  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    const inFootnote = /^(?:译注|注)\s*\d*\s*[：:]/.test(currentParagraph);
    const codeKind = detectCodeRowKind(row);

    if (codeKind && !(inFootnote && row.x1 >= 0.19)) {
      flushPara();
      const codeRows: RowGroup[] = [];
      let blockKind = codeKind;
      while (i < rows.length) {
        const k = detectCodeRowKind(rows[i]);
        if (!k) break;
        if (k === 'javascript') blockKind = 'javascript';
        codeRows.push(rows[i++]);
      }
      if (blockKind === 'python') {
        const cleanBlock = cleanCodeBlocks[codeBlockIdxRef.index];
        if (cleanBlock) {
          codeBlockIdxRef.index++;
          blocks.push(`\`\`\`python\n${cleanBlock}\n\`\`\``);
        } else {
          blocks.push(
            `\`\`\`python\n${codeRows.map(normalizePythonOcrCodeRow).join('\n')}\n\`\`\``,
          );
        }
      } else {
        const baseX1 = Math.min(...codeRows.map((r) => r.x1));
        const jsLines = codeRows.map((r) => normalizeJsOcrCodeRow(r, baseX1));
        let openBraces = 0;
        for (const l of jsLines) {
          for (const ch of l) {
            if (ch === '{') openBraces++;
            else if (ch === '}') openBraces = Math.max(0, openBraces - 1);
          }
        }
        if (openBraces > 0 && jsLines.some((l) => /^function\s+/.test(l.trim()))) {
          jsLines.push('}');
        }
        blocks.push(`\`\`\`javascript\n${jsLines.join('\n')}\n\`\`\``);
      }
      continue;
    }

    if (
      !inFootnote &&
      row.cells.length === 2 &&
      row.cells[1].x1 - row.cells[0].x2 >= 0.04 &&
      row.cells.every((c) => c.text.length <= 24)
    ) {
      const colSplitX = (row.cells[0].x2 + row.cells[1].x1) / 2;
      const leftCells: NormalizedBox[] = [];
      const rightCells: NormalizedBox[] = [];
      let cursor = i + 1;
      let lastTableY = row.topY;
      while (cursor < rows.length) {
        const nextRow = rows[cursor];
        if (detectCodeRowKind(nextRow) !== null || nextRow.topY - lastTableY > 0.065) break;
        if (nextRow.cells.some((c) => c.x1 < colSplitX - 0.015 && c.x2 > colSplitX + 0.015)) break;
        for (const cell of nextRow.cells) {
          if (cell.x2 <= colSplitX + 0.015) leftCells.push(cell);
          else if (cell.x1 >= colSplitX - 0.015) rightCells.push(cell);
        }
        lastTableY = nextRow.topY;
        cursor++;
      }
      if (leftCells.length >= 1 && rightCells.length >= 1) {
        flushPara();
        const h0 = normalizeCjkOcrText(row.cells[0].text);
        const h1 = normalizeCjkOcrText(row.cells[1].text);
        const groupedRight = leftCells.map(() => [] as string[]);
        for (const rc of rightCells) {
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let li = 0; li < leftCells.length; li++) {
            const dist = Math.abs(rc.topY - leftCells[li].topY);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = li;
            }
          }
          groupedRight[bestIdx].push(normalizeCjkOcrText(rc.text));
        }
        const tableLines = [`| ${h0} | ${h1} |`, '| --- | --- |'];
        for (let li = 0; li < leftCells.length; li++) {
          tableLines.push(
            `| ${normalizeCjkOcrText(leftCells[li].text)} | ${normalizeCjkOcrText(groupedRight[li].join(''))} |`,
          );
        }
        blocks.push(tableLines.join('\n'));
        i = cursor;
        continue;
      }
    }

    const text =
      inFootnote && codeKind === 'javascript'
        ? ` \`${normalizeJsOcrCodeRow(row, row.x1).replace(/[:;]$/, '')}\` `
        : normalizeCjkOcrText(row.cells.map((c) => c.text).join(' '));
    const gapAbove = i > 0 ? row.topY - (rows[i - 1].topY + rows[i - 1].h) : 0.05;
    const gapBelow = i + 1 < rows.length ? rows[i + 1].topY - (row.topY + row.h) : 0.05;

    if (/^\d+\.\d+(?:\.\d+)?\s+\S+/.test(text) && !/[。！？；]$/.test(text)) {
      flushPara();
      blocks.push(`## ${text}`);
      i++;
      continue;
    }

    if (
      (/^(?:图|表|程序清单)\s*\d+[-.]\d+\s+\S+/.test(text) &&
        !/^(?:图|表|程序清单)\s*\d+[-.]\d+\s*所示/.test(text) &&
        !/[。！？；：:]$/.test(text)) ||
      /^小技巧[：:]\s*\S+/.test(text)
    ) {
      flushPara();
      blocks.push(`### ${text.replace(/_+$/, '').trim()}`);
      i++;
      continue;
    }

    const nextRow = rows[i + 1];
    if (
      nextRow &&
      /[\u4e00-\u9fff]/.test(text) &&
      text.length >= 2 &&
      text.length <= 24 &&
      !/[。！？；，、.,;:：]$/.test(text) &&
      (i <= 1 || gapAbove >= 0.018)
    ) {
      const nextText = normalizeCjkOcrText(nextRow.cells.map((c) => c.text.trim()).join(' '));
      const gapToNext = nextRow.topY - (row.topY + row.h);
      const alignedLeft =
        row.x2 < 0.55 && nextRow.x2 < 0.55 && Math.abs(nextRow.x1 - row.x1) <= 0.025;
      const alignedRight = row.topY < 0.2 && Math.abs(nextRow.x2 - row.x2) <= 0.025;
      if (
        /^[A-Z][A-Za-z0-9\s-]+$/.test(nextText) &&
        (alignedLeft || alignedRight) &&
        gapToNext <= 0.025 &&
        detectCodeRowKind(nextRow) === null
      ) {
        flushPara();
        blocks.push(`## ${text} (${nextText})`);
        i += 2;
        continue;
      }
    }

    const isTopTitle =
      i === 0 &&
      text.length <= 36 &&
      (row.x1 > 0.22 || row.h > 0.023 || /^附录\s*[A-Z0-9]+/.test(text)) &&
      !/[。！？；，、.,;:：]$/.test(text);
    const isSectionHeading =
      text.length >= 4 &&
      text.length <= 38 &&
      row.x2 < 0.65 &&
      gapAbove >= 0.018 &&
      gapBelow >= 0.018 &&
      !/[。！？；，、.,;:：]$/.test(text);

    if (isTopTitle || isSectionHeading) {
      flushPara();
      blocks.push(`## ${text}`);
      i++;
      continue;
    }

    if (/^《[^》]+》([（(][^）)]+[）)])?$/.test(text) || (row.x1 > 0.28 && text.startsWith('《'))) {
      flushPara();
      blocks.push(`> — ${text}`);
      i++;
      continue;
    }

    const nextRowRaw = rows[i + 1]?.cells.map((c) => c.text.trim()).join(' ') ?? '';
    if (
      (row.x1 > 0.45 && row.x2 > 0.72 && /^[—―-]+/.test(nextRowRaw)) ||
      (row.x1 > 0.22 && /^[—―-]+/.test(text))
    ) {
      flushPara();
      const quoteLines: string[] = [];
      while (i < rows.length) {
        const qr = rows[i];
        const qt = normalizeCjkOcrText(qr.cells.map((c) => c.text).join(' '))
          .replace(/•/g, '·')
          .replace(/^[—―-]+\s*/, '——');
        if (
          (qr.x1 > 0.45 && qr.x2 > 0.72 && qt.length <= 36) ||
          (qr.x1 > 0.22 && qr.x2 > 0.72 && qt.startsWith('——'))
        ) {
          quoteLines.push(`> ${qt}`);
          i++;
        } else {
          break;
        }
      }
      if (quoteLines.length > 0) {
        blocks.push(quoteLines.join('\n'));
        continue;
      }
    }

    if (!currentParagraph || !prevProseRow) {
      currentParagraph = text;
      prevProseRow = row;
      i++;
      continue;
    }

    const verticalGap = row.topY - (prevProseRow.topY + prevProseRow.h);
    const isFootnoteContinuation =
      inFootnote && !/^(?:译注|注)\s*\d*\s*[：:]/.test(text) && verticalGap <= 0.03;
    const isNewFootnote = /^(?:译注|注)\s*\d*\s*[：:]/.test(text);
    const isNumberedStep = /^[（(]\d+[）)]/.test(text);
    const isIndentedNewPara =
      !isFootnoteContinuation &&
      (isNewFootnote || isNumberedStep || (row.x1 > bodyLeftMargin + 0.022 && row.x1 > 0.105));

    if (
      (verticalGap > 0.025 && !isFootnoteContinuation) ||
      isIndentedNewPara ||
      (prevProseRow.x2 < 0.72 && !isFootnoteContinuation)
    ) {
      flushPara();
      currentParagraph = text;
    } else {
      const needsSpace = /[A-Za-z0-9]$/.test(currentParagraph) && /^[A-Za-z0-9]/.test(text);
      currentParagraph = normalizeCjkOcrText(`${currentParagraph}${needsSpace ? ' ' : ''}${text}`);
    }
    prevProseRow = row;
    i++;
  }
  flushPara();
  return blocks;
}
