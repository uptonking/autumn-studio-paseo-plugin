import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { extractLocalDocumentWithOcr } from '../server/ai-text/local-ocr-extractor.ts';

describe('ai-text: real office-docs PDF corpus extraction', () => {
  it('extracts all 10 real PDFs from office-docs with layout, OCR, tables, sidebars, and code blocks', async () => {
    const pdfTablePath = '/Users/yaoo/Documents/repos/tests/office-docs/pdf/pro-js-1page-table.pdf';
    const pdfOcrPath =
      '/Users/yaoo/Documents/repos/tests/office-docs/pdf/红楼梦研究资料选辑_1974_鲁迅_page1.pdf';

    let hasOfficeDocs = false;
    try {
      await access(pdfTablePath);
      await access(pdfOcrPath);
      hasOfficeDocs = true;
    } catch {
      hasOfficeDocs = false;
    }
    if (!hasOfficeDocs) return;

    const tableRes = await extractLocalDocumentWithOcr({
      filePath: pdfTablePath,
      fileName: 'pro-js-1page-table.pdf',
      buffer: await readFile(pdfTablePath),
      enableOcr: true,
      enableTable: true,
    });
    assert.equal(tableRes.routeUsed, 'local-pdftotext');
    assert.ok(tableRes.markdown.includes('| BROWSER | ECMASCRIPT COMPLIANCE |'));
    assert.ok(tableRes.markdown.includes('| Netscape Navigator 4.06–4.79 | Edition 1 |'));
    assert.ok(tableRes.markdown.includes('| Opera 36+ | Edition 6 |'));

    const ocrRes = await extractLocalDocumentWithOcr({
      filePath: pdfOcrPath,
      fileName: '红楼梦研究资料选辑_1974_鲁迅_page1.pdf',
      buffer: await readFile(pdfOcrPath),
      enableOcr: true,
      enableTable: true,
    });
    assert.equal(ocrRes.routeUsed, 'local-vision-ocr');
    assert.ok(ocrRes.markdown.includes('## 鲁迅论《红楼梦》'));
    assert.ok(ocrRes.markdown.includes('贾府上的焦大，也不爱林妹妹'));
    assert.ok(ocrRes.markdown.includes('> — 《花边文学·看书琐记》'));

    const pdfPythonBoolPath =
      '/Users/yaoo/Documents/repos/tests/office-docs/pdf/编程小白的第一本 Python 入门书_page1_bool.pdf';
    const pythonBoolRes = await extractLocalDocumentWithOcr({
      filePath: pdfPythonBoolPath,
      fileName: '编程小白的第一本 Python 入门书_page1_bool.pdf',
      buffer: await readFile(pdfPythonBoolPath),
      enableOcr: true,
      enableTable: true,
    });
    assert.equal(pythonBoolRes.routeUsed, 'local-vision-ocr');
    assert.ok(pythonBoolRes.markdown.includes('其实在 Python 中任何对象都可判断其布尔值'));
    assert.ok(pythonBoolRes.markdown.includes('```python\nbool(0)       #False'));
    assert.ok(pythonBoolRes.markdown.includes('```python\na_thing = None\n```'));
    assert.ok(pythonBoolRes.markdown.includes('## 布尔运算符（Boolean Operators）'));
    assert.ok(pythonBoolRes.markdown.includes('| 运算符 | 描述 |'));
    assert.ok(
      pythonBoolRes.markdown.includes('| not x | 如果 x 是 True，则返回 False，否则返回 True。 |'),
    );
    assert.ok(
      pythonBoolRes.markdown.includes(
        '| x and y | and 表示“并且”，如果 x 和 y 都是 True，则返回 True；如果 x 和 y 有一个是 False，则返回 False。 |',
      ),
    );
    assert.ok(pythonBoolRes.markdown.includes('```python\n1 < 3 and 2 < 5    #True'));

    const pdfTwoColScannedPath =
      '/Users/yaoo/Documents/repos/tests/office-docs/pdf/Japanese Army Of World War II_Philip Warner_1973_2col_text_scanned.pdf';
    const twoColRes = await extractLocalDocumentWithOcr({
      filePath: pdfTwoColScannedPath,
      fileName: 'Japanese Army Of World War II_Philip Warner_1973_2col_text_scanned.pdf',
      buffer: await readFile(pdfTwoColScannedPath),
      enableOcr: true,
      enableTable: true,
    });
    assert.equal(twoColRes.routeUsed, 'local-vision-ocr');
    assert.ok(twoColRes.markdown.includes('## THE PACIFIC ISLANDS'));
    assert.ok(twoColRes.markdown.includes('## MALAYA'));
    assert.ok(
      twoColRes.markdown.includes(
        'an area stretching the length of the distance between Canada and Berlin and extending as far south as Cairo.',
      ),
    );
    assert.ok(twoColRes.markdown.includes('PEARL HARBOR. Initially they had enormous success.'));

    const pdfCrdtPath =
      '/Users/yaoo/Documents/repos/tests/office-docs/pdf/The Only Undoable CRDTs are Counters _2006_page1.pdf';
    const crdtRes = await extractLocalDocumentWithOcr({
      filePath: pdfCrdtPath,
      fileName: 'The Only Undoable CRDTs are Counters _2006_page1.pdf',
      buffer: await readFile(pdfCrdtPath),
      enableOcr: true,
      enableTable: true,
    });
    assert.equal(crdtRes.routeUsed, 'local-pdftotext');
    assert.ok(crdtRes.markdown.includes('## The Only Undoable CRDTs are Counters'));
    assert.ok(crdtRes.markdown.includes('Stephen Dolan · stedolan@stedolan.net · OCaml Labs'));
    assert.ok(crdtRes.markdown.includes('> arXiv:2006.10494v1 [cs.DC] 18 Jun 2020'));
    assert.ok(crdtRes.markdown.includes('## ABSTRACT'));
    assert.ok(crdtRes.markdown.includes('## 1 INTRODUCTION'));
    assert.ok(crdtRes.markdown.includes('### 1.1 The counter CRDT'));
    assert.ok(crdtRes.markdown.includes('### 1.2 The G-Set CRDT'));
    assert.ok(crdtRes.markdown.includes('> **Figure 1: Example of undoing remove**'));
    assert.ok(crdtRes.markdown.includes('### 1.3 Sets with removal: the OR-Set'));

    const pdfEggPath =
      '/Users/yaoo/Documents/repos/tests/office-docs/pdf/食物信息图-看得见味道的食物百科_egg_1pic.pdf';
    const eggRes = await extractLocalDocumentWithOcr({
      filePath: pdfEggPath,
      fileName: '食物信息图-看得见味道的食物百科_egg_1pic.pdf',
      buffer: await readFile(pdfEggPath),
      enableOcr: true,
      enableTable: true,
    });
    assert.equal(eggRes.routeUsed, 'local-vision-ocr');
    assert.ok(eggRes.markdown.includes('- **46%**：现在英国人吃的所有鸡蛋中，有 46% 来自散养鸡'));
    assert.ok(
      eggRes.markdown.includes('- **£9.86 亿**：英国人每年花在鸡蛋上的费用高达 9.86 亿英镑'),
    );
    assert.ok(
      eggRes.markdown.includes(
        '- **6g 蛋白质 / 70 大卡**：一枚中等大小的鸡蛋中含有 6 克蛋白质和 70 大卡的热量',
      ),
    );
    assert.ok(eggRes.markdown.includes('## OFF THE FARM'));
    assert.ok(eggRes.markdown.includes('### 鸡蛋：酱汁之源'));
    assert.ok(
      eggRes.markdown.includes(
        '鸡蛋可以煮着吃（陈鸡蛋最好；因为容易剥皮），与黄油一起搅拌（慢搅）',
      ),
    );

    const pdfJsGoodPartsPath =
      '/Users/yaoo/Documents/repos/tests/office-docs/pdf/JavaScript语言精粹-3pages.pdf';
    const jsGoodRes = await extractLocalDocumentWithOcr({
      filePath: pdfJsGoodPartsPath,
      fileName: 'JavaScript语言精粹-3pages.pdf',
      buffer: await readFile(pdfJsGoodPartsPath),
      enableOcr: true,
      enableTable: true,
    });
    assert.equal(jsGoodRes.routeUsed, 'local-vision-ocr');
    assert.ok(jsGoodRes.markdown.includes('## 附录 A'));
    assert.ok(jsGoodRes.markdown.includes('## 毒瘤 (Awful Parts)'));
    assert.ok(jsGoodRes.markdown.includes('Pericles, Prince of Tyre'));
    assert.ok(jsGoodRes.markdown.includes('## 全局变量 (Global Variables)'));
    assert.ok(jsGoodRes.markdown.includes('```javascript\nvar foo = value;\n```'));
    assert.ok(jsGoodRes.markdown.includes('```javascript\nwindow.foo = value;\n```'));
    assert.ok(jsGoodRes.markdown.includes('```javascript\nfoo = value;\n```'));
    assert.ok(jsGoodRes.markdown.includes('## 作用域 (Scope)'));
    assert.ok(jsGoodRes.markdown.includes('## 自动插入分号 (Semicolon Insertion)'));
    assert.ok(jsGoodRes.markdown.includes('```javascript\nreturn {\n    status: true\n};\n```'));
    assert.ok(jsGoodRes.markdown.includes('## 保留字 (Reserved Words)'));
    assert.ok(
      jsGoodRes.markdown.includes(
        "object = {box: value}; // ok\nobject = {case: value}; // 非法\nobject = {'case': value}; // ok\nobject.box = value; // ok\nobject.case = value; // 非法\nobject['case'] = value; // ok",
      ),
    );
    assert.ok(jsGoodRes.markdown.includes('## Unicode'));
    assert.ok(jsGoodRes.markdown.includes('> **译注 1**：各个浏览器在对保留字的使用限制上'));
    assert.ok(
      jsGoodRes.markdown.includes('> **译注 2**：基本多文种平面（Basic Multilingual Plane,BMP）'),
    );

    const pdfProJs3Path = '/Users/yaoo/Documents/repos/tests/office-docs/pdf/pro-js-3pages.pdf';
    const proJs3Res = await extractLocalDocumentWithOcr({
      filePath: pdfProJs3Path,
      fileName: 'pro-js-3pages.pdf',
      buffer: await readFile(pdfProJs3Path),
      enableOcr: true,
      enableTable: true,
    });
    assert.equal(proJs3Res.routeUsed, 'local-pdftotext');
    assert.ok(proJs3Res.markdown.includes('## Why the DOM Is Necessary'));
    assert.ok(proJs3Res.markdown.includes('## DOM Levels'));
    assert.ok(
      proJs3Res.markdown.includes(
        '> **FIGURE 1-2**: `html → head → title → Sample Page → body → p → Hello World!`',
      ),
    );
    assert.ok(proJs3Res.markdown.includes('mouse and user-interface events'));
    assert.ok(
      proJs3Res.markdown.includes(
        '- DOM views—Describes interfaces to keep track of the various views of a document (the document before and after CSS styling, for example)\n- DOM events—Describes interfaces for events and event handling',
      ),
    );
    assert.ok(proJs3Res.markdown.includes('## Other DOMs'));
    assert.ok(
      proJs3Res.markdown.includes(
        '- Scalable Vector Graphics (SVG) 1.0\n- Mathematical Markup Language (MathML) 1.0\n- Synchronized Multimedia Integration Language (SMIL)',
      ),
    );
    assert.ok(proJs3Res.markdown.includes('## DOM Support in Web Browsers'));
    assert.ok(proJs3Res.markdown.includes('| BROWSER | DOM COMPLIANCE |'));
    assert.ok(proJs3Res.markdown.includes('## The Browser Object Model'));

    const pdfJourneyPath =
      '/Users/yaoo/Documents/repos/tests/office-docs/pdf/Journey-to-the-West---Dominoes-2pages-pic.pdf';
    const journeyRes = await extractLocalDocumentWithOcr({
      filePath: pdfJourneyPath,
      fileName: 'Journey-to-the-West---Dominoes-2pages-pic.pdf',
      buffer: await readFile(pdfJourneyPath),
      enableOcr: true,
      enableTable: true,
    });
    assert.equal(journeyRes.routeUsed, 'local-vision-ocr');
    assert.ok(
      journeyRes.markdown.includes(
        "'The headband then becomes very tight. Of course, the wearer is going to listen very carefully to you after that.'",
      ),
    );
    assert.ok(
      journeyRes.markdown.includes(
        "'Well, I'm not going to need the headband,' said Tripitaka. But he put it in his bag.",
      ),
    );
    assert.ok(
      journeyRes.markdown.includes(
        'The Emperor of Heaven put him under that mountain five hundred years ago.',
      ),
    );
    assert.ok(
      journeyRes.markdown.includes(
        'So Tripitaka, the white horse, and Monkey began their journey.',
      ),
    );
    assert.ok(journeyRes.markdown.includes('> **Vocabulary**'));
    assert.ok(journeyRes.markdown.includes('> - **become (past became)**: to begin to be'));
    assert.ok(journeyRes.markdown.includes('> - **tight**: little for the wearer of it'));
    assert.ok(
      journeyRes.markdown.includes('> - **master**: you call the man that you work for this'),
    );
    assert.ok(
      journeyRes.markdown.includes(
        '> - **jump**: to move suddenly from one place to a different place',
      ),
    );
    assert.ok(journeyRes.markdown.includes('> - **travel**: to go to different places'));
    assert.ok(
      journeyRes.markdown.includes(
        '> - **monster**: a person or animal that is very bad to look at, and does very bad things',
      ),
    );

    const pdfHtml5CanvasPath =
      '/Users/yaoo/Documents/repos/tests/office-docs/pdf/html5canvas3pages-pic.pdf';
    const html5CanvasRes = await extractLocalDocumentWithOcr({
      filePath: pdfHtml5CanvasPath,
      fileName: 'html5canvas3pages-pic.pdf',
      buffer: await readFile(pdfHtml5CanvasPath),
      enableOcr: true,
      enableTable: true,
    });
    assert.equal(html5CanvasRes.routeUsed, 'local-vision-ocr');
    assert.ok(html5CanvasRes.markdown.includes('（2）通过调用 beginPath() 来开始一段新路径。'));
    assert.ok(html5CanvasRes.markdown.includes('### 图 5-4 利用剪辑区域技术来恢复动画背景'));
    assert.ok(
      html5CanvasRes.markdown.includes(
        'drawDiscBackground() 方法在绘制圆盘上一帧所据位置的背景图时',
      ),
    );
    assert.ok(html5CanvasRes.markdown.includes('function drawDiscBackground (disc) {'));
    assert.ok(
      html5CanvasRes.markdown.includes('### 小技巧：利用剪辑区域有时能提高绘制速度，有时则不能'),
    );
    assert.ok(html5CanvasRes.markdown.includes('## 5.4.2 利用图块复制技术来处理动画背景'));
    assert.ok(html5CanvasRes.markdown.includes('function drawDiscBackground(context,disc) {'));
    assert.ok(html5CanvasRes.markdown.includes('### 小技巧：剪辑区域和图块复制技术优点与缺点'));
    assert.ok(html5CanvasRes.markdown.includes('## 5.5 利用双缓冲技术绘制动画'));
    assert.ok(html5CanvasRes.markdown.includes('### 程序清单 5-13 利用双缓冲技术绘制动画'));
    assert.ok(
      html5CanvasRes.markdown.includes("offscreenContext = offscreenCanvas.getContext('2d'),"),
    );
    assert.ok(!html5CanvasRes.markdown.includes('吾爱'), 'watermark text should be stripped');
  });

  it('propagates cancellation instead of producing fallback text', async () => {
    const controller = new AbortController();
    controller.abort(new Error('stop now'));
    await assert.rejects(
      extractLocalDocumentWithOcr({
        fileName: 'document.pdf',
        buffer: Buffer.from('%PDF-1.4'),
        signal: controller.signal,
      }),
      /stop now/,
    );
  });
});
