(() => {
  'use strict';

  const OFFICE_MIME = Object.freeze({
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  });
  const MAX_LOCAL_TEXT = 120000;

  function codedError(code, message) { const error = new Error(message); error.code = code; return error; }
  function ext(name = '') { return String(name).toLowerCase().split('.').pop() || ''; }
  function mimeFor(file) {
    if (file.type) return file.type;
    const e = ext(file.name);
    if (e === 'pdf') return 'application/pdf';
    if (e === 'docx') return OFFICE_MIME.docx;
    if (e === 'pptx') return OFFICE_MIME.pptx;
    if (['png','jpg','jpeg','webp','gif','avif'].includes(e)) return e === 'jpg' ? 'image/jpeg' : `image/${e}`;
    if (['mp3','wav','m4a','ogg','aac','flac'].includes(e)) return `audio/${e === 'm4a' ? 'mp4' : e}`;
    if (['mp4','webm','mov','mpeg','mpg'].includes(e)) return e === 'mov' ? 'video/quicktime' : `video/${e === 'mpg' ? 'mpeg' : e}`;
    return 'application/octet-stream';
  }

  function decodeUtf8(bytes) { return new TextDecoder('utf-8').decode(bytes); }
  function u16(view, offset) { return view.getUint16(offset, true); }
  function u32(view, offset) { return view.getUint32(offset, true); }

  async function inflateRaw(bytes) {
    if (!globalThis.DecompressionStream) throw codedError('ZIP_DEFLATE_UNAVAILABLE', 'This browser cannot decompress DOCX/PPTX files locally.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzipSelected(arrayBuffer, predicate) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
      if (u32(view, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw codedError('ZIP_INVALID', 'DOCX/PPTX ZIP directory was not found.');
    const count = u16(view, eocd + 10);
    let cursor = u32(view, eocd + 16);
    const result = new Map();
    for (let index = 0; index < count; index += 1) {
      if (u32(view, cursor) !== 0x02014b50) throw codedError('ZIP_INVALID', 'DOCX/PPTX central directory is invalid.');
      const method = u16(view, cursor + 10);
      const compressedSize = u32(view, cursor + 20);
      const nameLen = u16(view, cursor + 28);
      const extraLen = u16(view, cursor + 30);
      const commentLen = u16(view, cursor + 32);
      const localOffset = u32(view, cursor + 42);
      const name = decodeUtf8(bytes.slice(cursor + 46, cursor + 46 + nameLen));
      if (predicate(name)) {
        if (u32(view, localOffset) !== 0x04034b50) throw codedError('ZIP_INVALID', `Invalid local entry ${name}`);
        const localNameLen = u16(view, localOffset + 26);
        const localExtraLen = u16(view, localOffset + 28);
        const start = localOffset + 30 + localNameLen + localExtraLen;
        const compressed = bytes.slice(start, start + compressedSize);
        let data;
        if (method === 0) data = compressed;
        else if (method === 8) data = await inflateRaw(compressed);
        else throw codedError('ZIP_METHOD_UNSUPPORTED', `Unsupported compression method ${method}.`);
        result.set(name, data);
      }
      cursor += 46 + nameLen + extraLen + commentLen;
    }
    return result;
  }

  function decodeXmlEntities(text) {
    return String(text || '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
  }

  function xmlText(xml, textLocalName, paragraphLocalName = null) {
    const source = String(xml || '');
    const textRe = new RegExp(`<(?:[A-Za-z0-9_]+:)?${textLocalName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${textLocalName}>`, 'gi');
    const collect = part => [...part.matchAll(textRe)].map(match => decodeXmlEntities(match[1].replace(/<[^>]+>/g,''))).join('');
    if (!paragraphLocalName) return [...source.matchAll(textRe)].map(match => decodeXmlEntities(match[1].replace(/<[^>]+>/g,''))).join(' ').replace(/\s+/g,' ').trim();
    const paragraphRe = new RegExp(`<(?:[A-Za-z0-9_]+:)?${paragraphLocalName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${paragraphLocalName}>`, 'gi');
    return [...source.matchAll(paragraphRe)].map(match => collect(match[1])).filter(Boolean).join('\n');
  }

  async function extractDocx(file) {
    const entries = await unzipSelected(await file.arrayBuffer(), name => name === 'word/document.xml' || /^word\/(?:header|footer)\d+\.xml$/.test(name));
    const ordered = [...entries.entries()].sort(([a], [b]) => a.localeCompare(b));
    const text = ordered.map(([, data]) => xmlText(decodeUtf8(data), 't', 'p')).filter(Boolean).join('\n\n');
    if (!text.trim()) throw codedError('DOCX_EMPTY', 'No readable text was found in this DOCX file.');
    return text.slice(0, MAX_LOCAL_TEXT);
  }

  async function extractPptx(file) {
    const entries = await unzipSelected(await file.arrayBuffer(), name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    const ordered = [...entries.entries()].sort(([a], [b]) => Number(a.match(/slide(\d+)/)?.[1] || 0) - Number(b.match(/slide(\d+)/)?.[1] || 0));
    const slides = ordered.map(([name, data], i) => {
      const text = xmlText(decodeUtf8(data), 't');
      return text ? `Slide ${i + 1}\n${text}` : '';
    }).filter(Boolean);
    if (!slides.length) throw codedError('PPTX_EMPTY', 'No readable text was found in this PPTX file.');
    return slides.join('\n\n').slice(0, MAX_LOCAL_TEXT);
  }

  async function extractLocalText(file) {
    const e = ext(file.name);
    const mime = mimeFor(file);
    if (mime.startsWith('text/') || ['json','md','csv','html','htm','xml','srt','vtt'].includes(e)) return (await file.text()).slice(0, MAX_LOCAL_TEXT);
    if (e === 'docx' || mime === OFFICE_MIME.docx) return extractDocx(file);
    if (e === 'pptx' || mime === OFFICE_MIME.pptx) return extractPptx(file);
    return null;
  }

  async function geminiUpload(file) {
    const { geminiApiKey = '' } = await chrome.storage.local.get({ geminiApiKey: '' });
    if (!geminiApiKey.trim()) throw codedError('AI_KEY_MISSING', 'Gemini API key is required for this file type.');
    const mimeType = mimeFor(file);
    const start = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
      method: 'POST',
      headers: {
        'x-goog-api-key': geminiApiKey,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(file.size),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file: { display_name: file.name || 'RayLingo upload' } }),
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
    });
    if (!start.ok) throw codedError('AI_UPLOAD_START_FAILED', `Gemini upload start failed (HTTP ${start.status}).`);
    const uploadUrl = start.headers.get('x-goog-upload-url');
    if (!uploadUrl) throw codedError('AI_UPLOAD_URL_MISSING', 'Gemini upload URL was not returned.');
    const upload = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize', 'Content-Type': mimeType },
      body: file,
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
    });
    const data = await upload.json().catch(() => ({}));
    if (!upload.ok || !data?.file?.uri) throw codedError('AI_UPLOAD_FAILED', data?.error?.message || `Gemini upload failed (HTTP ${upload.status}).`);
    return { fileUri: data.file.uri, fileName: data.file.name || null, mimeType: data.file.mimeType || mimeType, name: file.name, size: file.size };
  }

  async function process(file, { provider = 'gemini', targetLanguage = 'zh-Hant', task = 'extract_translate' } = {}) {
    if (!(file instanceof File)) throw codedError('FILE_REQUIRED', 'Choose a file first.');
    const localText = await extractLocalText(file);
    if (localText != null) return { kind: 'text', text: localText, fileName: file.name, mimeType: mimeFor(file), providerCompatible: ['gemini', 'deepseek'] };
    if (provider !== 'gemini') throw codedError('AI_MULTIMODAL_PROVIDER_REQUIRED', 'Images, PDF, audio and video currently require Gemini.');
    const uploaded = await geminiUpload(file);
    const response = await RayLingoAI.processMedia({ ...uploaded, targetLanguage, provider: 'gemini', task, displayName: file.name });
    return {
      kind: 'media-result',
      text: response.text,
      transcript: response.transcript || '',
      translation: response.translation || response.text,
      fileName: file.name,
      mimeType: uploaded.mimeType,
      provider: response.provider
    };
  }

  globalThis.RayLingoMultimodal = Object.freeze({ mimeFor, extractLocalText, geminiUpload, process, officeMime: OFFICE_MIME });
})();
