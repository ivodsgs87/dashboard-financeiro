// Separador "Notas": cadernos → secções → páginas, como o OneNote. Só é descarregado quando se abre.
// O índice (cadernos, secções, títulos, tags) vem do OrcamentoApp; o conteúdo de cada página lê-se e grava-se
// à parte (um documento por página). As secções protegidas são cifradas no próprio browser (AES-GCM),
// com uma palavra-passe que nunca sai do dispositivo.
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

const nId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const agora = () => new Date().toISOString();
const NOTAS_VAZIO = { v: 1, cadernos: [], seccoes: [], paginas: [] };
const CORES = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#64748b'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dataLonga = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`; };
const horaTxt = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const haQuanto = iso => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!isFinite(s)) return '';
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `há ${Math.floor(s / 86400)} dia${s < 86400 * 2 ? '' : 's'}`;
  const d = new Date(iso); return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
};
const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ── HTML seguro: só as etiquetas e atributos que o editor usa ──
const PERMITIDAS = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'A', 'IMG', 'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'SPAN', 'MARK']);
const PROIBIDAS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'META', 'LINK', 'TITLE', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'NOSCRIPT', 'TEMPLATE', 'VIDEO', 'AUDIO', 'CANVAS']);
const limparHtml = (html, { semBlob = false } = {}) => {
  if (!html) return '';
  const d = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const raiz = d.body.firstChild;
  if (!raiz) return '';
  const andar = el => {
    Array.from(el.childNodes).forEach(n => {
      if (n.nodeType === 3) return;
      if (n.nodeType !== 1) { n.remove(); return; }
      const tag = n.tagName;
      if (PROIBIDAS.has(tag)) { n.remove(); return; }
      andar(n);
      if (!PERMITIDAS.has(tag)) { n.replaceWith(...Array.from(n.childNodes)); return; }
      Array.from(n.attributes).forEach(a => {
        const k = a.name.toLowerCase();
        const ok = (tag === 'A' && k === 'href') || (tag === 'IMG' && (k === 'src' || k === 'alt'))
          || (tag === 'LI' && k === 'data-ok') || (tag === 'UL' && k === 'data-chk')
          || (tag === 'SPAN' && (k === 'data-tipo' || k === 'data-id' || k === 'class'));
        if (!ok) n.removeAttribute(a.name);
      });
      if (tag === 'A') {
        const h = n.getAttribute('href') || '';
        if (!/^(https?:|mailto:)/i.test(h)) n.removeAttribute('href');
        else { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); }
      }
      if (tag === 'IMG') {
        const s = n.getAttribute('src') || '';
        if (!/^(https:|data:image\/(png|jpe?g|gif|webp);)/i.test(s) && !(!semBlob && /^blob:/i.test(s))) n.remove();
      }
      if (tag === 'SPAN') {
        if (n.getAttribute('class') !== 'ntag') n.replaceWith(...Array.from(n.childNodes));
        else n.setAttribute('contenteditable', 'false');
      }
    });
  };
  andar(raiz);
  return raiz.innerHTML;
};
const textoDe = html => { const d = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html'); d.querySelectorAll('li,p,div,h1,h2,h3,br').forEach(x => x.append(' ')); return (d.body.textContent || '').replace(/\s+/g, ' ').trim(); };
const tagsDe = html => {
  const d = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const vistos = new Set(); const out = [];
  d.querySelectorAll('span.ntag').forEach(s => { const t = s.getAttribute('data-tipo'), id = s.getAttribute('data-id'); const k = `${t}:${id}`; if (t && id && !vistos.has(k)) { vistos.add(k); out.push({ t, id, n: (s.textContent || '').replace(/^@/, '') }); } });
  return out;
};
const escHtml = x => String(x || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tagHtml = (tipo, id, nome) => `<span class="ntag" data-tipo="${escHtml(tipo)}" data-id="${escHtml(id)}" contenteditable="false">@${escHtml(nome)}</span>`;

// ── Cifra das secções protegidas (WebCrypto: PBKDF2 → AES-GCM 256) ──
const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const derivarChave = async (senha, salt) => {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
};
const cifrar = async (chave, texto) => { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, new TextEncoder().encode(texto)); return { iv: b64(iv), ct: b64(ct) }; };
const decifrar = async (chave, c) => new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(c.iv) }, chave, deB64(c.ct)));
const TEM_CRIPTO = typeof crypto !== 'undefined' && !!crypto.subtle;

// ── Modelos de página ──
const MODELOS = [
  { id: 'branco', nome: 'Página em branco', titulo: '', html: '' },
  { id: 'reuniao', nome: 'Reunião', titulo: () => `Reunião ${dataLonga(agora())}`, html: () => `<p><b>Data:</b> ${dataLonga(agora())}, ${horaTxt(agora())}</p><p><b>Com:</b> </p><h2>Notas</h2><ul><li><br></li></ul><h2>Próximos passos</h2><ul data-chk="1"><li data-ok="0"><br></li></ul>` },
  { id: 'brief', nome: 'Brief de criativo', titulo: 'Brief', html: '<h2>Objetivo</h2><p><br></p><h2>Público</h2><p><br></p><h2>Formatos</h2><ul data-chk="1"><li data-ok="0">9:16</li><li data-ok="0">4:5</li><li data-ok="0">16:9</li></ul><h2>Referências</h2><p><br></p><h2>Prazo</h2><p><br></p>' },
  { id: 'todo', nome: 'Lista de tarefas', titulo: () => { const d = new Date(); return `${MESES[d.getMonth()].replace(/^./, x => x.toUpperCase())} ${String(d.getFullYear()).slice(2)}`; }, html: '<ul data-chk="1"><li data-ok="0"><br></li></ul>' },
];
const valorDe = (x, ...a) => (typeof x === 'function' ? x(...a) : x);

// ── Estilos do editor (uma vez) ──
const CSS_NOTAS = `
.nota-ed{outline:none;font-size:16px;line-height:1.65;word-wrap:break-word;overflow-wrap:anywhere;min-height:40vh;padding-bottom:30vh}
.nota-ed:empty::before{content:attr(data-ph);opacity:.4;pointer-events:none}
.nota-ed h1{font-size:1.55em;font-weight:700;line-height:1.25;margin:.7em 0 .3em}
.nota-ed h2{font-size:1.25em;font-weight:650;line-height:1.3;margin:.8em 0 .25em}
.nota-ed h3{font-size:1.08em;font-weight:600;margin:.7em 0 .2em}
.nota-ed p,.nota-ed div{margin:.12em 0}
.nota-ed ul{list-style:disc;padding-left:1.5em;margin:.25em 0}
.nota-ed ol{list-style:decimal;padding-left:1.6em;margin:.25em 0}
.nota-ed ul[data-chk]{list-style:none;padding-left:.15em}
.nota-ed ul[data-chk]>li{position:relative;padding-left:1.85em;margin:.15em 0}
.nota-ed ul[data-chk]>li::before{content:'';position:absolute;left:0;top:.3em;width:1.1em;height:1.1em;border:1.6px solid currentColor;opacity:.5;border-radius:5px;cursor:pointer;box-sizing:border-box}
.nota-ed ul[data-chk]>li[data-ok="1"]{text-decoration:line-through;opacity:.55}
.nota-ed ul[data-chk]>li[data-ok="1"]::before{content:'✓';background:#10b981;border-color:#10b981;opacity:1;color:#fff;font-size:.75em;line-height:1.45em;text-align:center;width:1.45em;height:1.45em;top:.32em}
.nota-ed a{color:#60a5fa;text-decoration:underline}
.nota-ed img{max-width:100%;height:auto;border-radius:8px;margin:.4em 0;display:block}
.nota-ed blockquote{border-left:3px solid rgba(148,163,184,.6);padding-left:.8em;margin:.4em 0;opacity:.85}
.nota-ed pre,.nota-ed code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:rgba(148,163,184,.14);border-radius:6px;padding:.1em .35em}
.nota-ed pre{padding:.6em .8em;white-space:pre-wrap}
.nota-ed mark{background:rgba(250,204,21,.38);color:inherit;border-radius:3px;padding:0 .1em}
.nota-ed hr{border:0;border-top:1px solid rgba(148,163,184,.35);margin:.9em 0}
.nota-ed .ntag{display:inline-block;padding:0 .4em;border-radius:6px;background:rgba(59,130,246,.15);color:#3b82f6;font-weight:500;cursor:pointer;white-space:nowrap;line-height:1.5}
.dark-notas .nota-ed .ntag{color:#93c5fd}
.nota-ed .ntag[data-tipo="jogo"]{background:rgba(16,185,129,.15);color:#059669}
.dark-notas .nota-ed .ntag[data-tipo="jogo"]{color:#6ee7b7}
.nota-ed .ntag[data-tipo="freelancer"]{background:rgba(139,92,246,.15);color:#7c3aed}
.dark-notas .nota-ed .ntag[data-tipo="freelancer"]{color:#c4b5fd}
.nota-ed .ntag[data-tipo="tarefa"]{background:rgba(245,158,11,.15);color:#b45309}
.dark-notas .nota-ed .ntag[data-tipo="tarefa"]{color:#fcd34d}
.notas-scroll::-webkit-scrollbar{height:0;width:6px}
`;
const ROTULO_TIPO = { cliente: 'Cliente', jogo: 'Jogo', freelancer: 'Freelancer', tarefa: 'Tarefa', pasta: 'Lista' };

// ── Ícones de linha ──
const IC = {
  voltar: '<path d="M15 18l-6-6 6-6"/>', mais: '<path d="M12 5v14M5 12h14"/>', procurar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  caderno: '<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h11"/><path d="M9 4v12"/>',
  cadeado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', aberto: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  estrela: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  lixo: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', mais_v: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  negrito: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>', italico: '<path d="M14 5h-4M14 19h-4M14 5l-4 14"/>', sublinhado: '<path d="M7 5v6a5 5 0 0 0 10 0V5M5 20h14"/>', riscado: '<path d="M5 12h14M16 7a4 3 0 0 0-8 1M8 17a4 3 0 0 0 8-1"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  numerada: '<path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1V9M3.5 13.5a1.5 1.5 0 1 1 2.5 1.2L3.5 17H6"/>',
  check: '<rect x="3" y="4" width="7" height="7" rx="1.5"/><path d="M4.8 7.5l1.4 1.4 2.4-2.6M13 7.5h8M3 14h7v7H3zM13 17.5h8"/>',
  marcador: '<path d="M9 3l7 7-6 6H6v-4z"/><path d="M4 21h16"/>', citacao: '<path d="M6 7h4v5H5v-1a4 4 0 0 1 1-4zM15 7h4v5h-5v-1a4 4 0 0 1 1-4z"/><path d="M6 12v2a3 3 0 0 1-2 3M15 12v2a3 3 0 0 1-2 3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  imagem: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>', arroba: '<circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8"/>',
  linha: '<path d="M4 12h16"/>', limpar: '<path d="M6 19h8M10 5h8M14 5l-4 14M4 4l16 16"/>', desfazer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', refazer: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  editar: '<path d="M14.5 4.5l5 5L9 20H4v-5z"/>', mover: '<path d="M5 12h14M13 6l6 6-6 6"/>', copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  seta: '<path d="M9 6l6 6-6 6"/>', tag: '<path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.25"/>',
};
const Ic = ({ n, className = 'w-4 h-4' }) => <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: IC[n] || '' }} />;

// ── Caixa de diálogo simples (pedir texto / palavra-passe) ──
const Pedir = ({ titulo, texto, campos, ok, onFechar, claro, perigo }) => {
  const [vals, setVals] = useState(() => Object.fromEntries(campos.map(c => [c.k, c.valor || ''])));
  const [erro, setErro] = useState('');
  const [aguarde, setAguarde] = useState(false);
  const enviar = async e => {
    e.preventDefault();
    setErro(''); setAguarde(true);
    try { const r = await ok(vals); if (r) setErro(r); } catch (err) { setErro(String(err && err.message || err)); }
    setAguarde(false);
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-4 pt-[12vh] sm:pt-4 bg-black/55 animate-backdropIn" onMouseDown={e => { if (e.target === e.currentTarget && !aguarde) onFechar(); }}>
      <form onSubmit={enviar} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onFechar(); } }} className={`w-full max-w-sm rounded-2xl border p-4 shadow-2xl animate-modalIn space-y-3 ${claro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'}`}>
        <p className="font-semibold">{titulo}</p>
        {texto && <p className={`text-sm ${claro ? 'text-slate-600' : 'text-slate-300'}`}>{texto}</p>}
        {campos.map((c, i) => (
          <input key={c.k} autoFocus={i === 0} type={c.tipo || 'text'} value={vals[c.k]} placeholder={c.ph || ''} autoComplete={c.tipo === 'password' ? 'new-password' : 'off'}
            onChange={e => setVals({ ...vals, [c.k]: e.target.value })}
            className={`w-full rounded-lg border px-3 py-2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-blue-500 ${claro ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-600'}`} />
        ))}
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onFechar} disabled={aguarde} className={`px-3 py-2 text-sm rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>Cancelar</button>
          <button type="submit" disabled={aguarde} className={`px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-60 ${perigo ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}>{aguarde ? 'Um momento…' : 'OK'}</button>
        </div>
      </form>
    </div>
  );
};

// ── Menu pequeno (⋯) ──
const Menu = ({ itens, claro, alinhar = 'right' }) => {
  // O menu abre por cima de tudo (portal no <body>), para não ficar cortado dentro das colunas com scroll
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const menuRef = useRef(null);
  const lista = itens.filter(Boolean);
  const abrir = () => {
    const r = ref.current.getBoundingClientRect();
    const alt = Math.min(lista.reduce((a, it) => a + (it === '-' ? 9 : 38), 10), window.innerHeight - 16);
    const larg = 240;
    const cabeEmBaixo = r.bottom + alt + 8 <= window.innerHeight;
    const top = cabeEmBaixo ? r.bottom + 4 : Math.max(8, r.top - alt - 4);
    const left = alinhar === 'right' ? Math.max(8, Math.min(r.right - larg, window.innerWidth - larg - 8)) : Math.max(8, Math.min(r.left, window.innerWidth - larg - 8));
    setPos({ top, left, larg, alt });
  };
  useEffect(() => {
    if (!pos) return undefined;
    const fora = e => { if (ref.current && ref.current.contains(e.target)) return; if (menuRef.current && menuRef.current.contains(e.target)) return; setPos(null); };
    const fechar = e => { if (menuRef.current && e && e.target && menuRef.current.contains(e.target)) return; setPos(null); };
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); setPos(null); } };
    document.addEventListener('mousedown', fora); document.addEventListener('touchstart', fora);
    window.addEventListener('scroll', fechar, true); window.addEventListener('resize', fechar); window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('touchstart', fora); window.removeEventListener('scroll', fechar, true); window.removeEventListener('resize', fechar); window.removeEventListener('keydown', esc, true); };
  }, [pos]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={e => { e.stopPropagation(); if (pos) setPos(null); else abrir(); }} aria-expanded={!!pos} className={`w-8 h-8 inline-flex items-center justify-center rounded-lg ${claro ? 'text-slate-500 hover:bg-slate-200/70' : 'text-slate-400 hover:bg-white/10'}`} aria-label="Mais opções"><Ic n="mais_v" /></button>
      {pos && createPortal(
        <div ref={menuRef} role="menu" style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.larg, maxHeight: pos.alt + 2 }} className={`z-[80] overflow-y-auto rounded-xl border shadow-xl py-1 animate-modalIn ${claro ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-800 border-slate-700 text-slate-100'}`}>
          {lista.map((it, i) => it === '-' ? <div key={i} className={`my-1 border-t ${claro ? 'border-slate-100' : 'border-slate-700'}`} /> : (
            <button key={i} type="button" role="menuitem" onClick={e => { e.stopPropagation(); setPos(null); it.fn(); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left ${it.perigo ? 'text-red-400' : ''} ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
              {it.ic && <Ic n={it.ic} />}<span className="truncate">{it.txt}</span>
            </button>
          ))}
        </div>, document.body)}
    </div>
  );
};

// Botão da barra do editor (fora do Editor para não ser recriado a cada tecla)
const BotaoFerr = ({ ic, on, fn, titulo, claro }) => (
  <button type="button" title={titulo} aria-label={titulo} aria-pressed={!!on} onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} onClick={fn}
    className={`w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg ${on ? (claro ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-300') : claro ? 'text-slate-600 hover:bg-slate-200/70' : 'text-slate-300 hover:bg-white/10'}`}>
    {ic.length <= 3 ? <span className="text-[13px] font-bold">{ic}</span> : <Ic n={ic} />}
  </button>
);
// ── Editor de uma página (contentEditable com barra de ferramentas) ──
const Editor = ({ html, onMudar, claro, entidades, onIrEntidade, onEnviarImagem, protegida, showToast, placeholder }) => {
  const ref = useRef(null);
  const [mencao, setMencao] = useState(null); // { q, node, ini, fim, x, y }
  const [ativa, setAtiva] = useState(0);
  const [tagMenu, setTagMenu] = useState(null); // { tipo, id, nome, x, y }
  const [estados, setEstados] = useState({});
  const mudarRef = useRef(onMudar); mudarRef.current = onMudar;
  useEffect(() => { if (ref.current) ref.current.innerHTML = html || ''; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Guarda onde estava o cursor: no telemóvel, tocar na barra tira o foco ao texto
  const ultimaSel = useRef(null);
  useEffect(() => {
    const guardar = () => { const s = window.getSelection(); if (s && s.rangeCount && ref.current && ref.current.contains(s.getRangeAt(0).startContainer)) ultimaSel.current = s.getRangeAt(0).cloneRange(); };
    document.addEventListener('selectionchange', guardar);
    return () => document.removeEventListener('selectionchange', guardar);
  }, []);
  const prep = () => {
    const el = ref.current; if (!el) return;
    const s = window.getSelection();
    const dentro = s && s.rangeCount && el.contains(s.getRangeAt(0).startContainer);
    if (document.activeElement !== el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
    if (!dentro && ultimaSel.current && el.contains(ultimaSel.current.startContainer)) { s.removeAllRanges(); s.addRange(ultimaSel.current); }
  };
  const avisar = () => mudarRef.current(ref.current ? ref.current.innerHTML : '');
  // Listas e títulos: o Chrome às vezes põe o cursor no início da linha; um marcador invisível mantém-no no sítio
  const comMarcador = fn => {
    const s = window.getSelection();
    let m = null;
    if (s && s.rangeCount && s.isCollapsed && ref.current && ref.current.contains(s.getRangeAt(0).startContainer)) {
      m = document.createElement('span'); m.setAttribute('data-cursor', '1'); m.appendChild(document.createTextNode('\u200b'));
      const r = s.getRangeAt(0); r.insertNode(m); r.setStartAfter(m); r.collapse(true); s.removeAllRanges(); s.addRange(r);
    }
    fn();
    const el = ref.current && ref.current.querySelector('span[data-cursor]');
    if (el) {
      const r = document.createRange(); r.setStartAfter(el); r.collapse(true);
      const pai = el.parentNode; el.remove(); if (pai) pai.normalize();
      const s2 = window.getSelection(); s2.removeAllRanges();
      try { s2.addRange(r); } catch (e) { /* posição já não existe */ }
    }
  };
  const LISTAS = new Set(['insertUnorderedList', 'insertOrderedList', 'formatBlock']);
  const cmd = (c, v = null) => { prep(); const f = () => { try { document.execCommand(c, false, v); } catch (e) { /* comando não suportado */ } }; if (LISTAS.has(c)) comMarcador(f); else f(); avisar(); atualizarEstados(); };
  const atualizarEstados = () => {
    try {
      const bloco = (document.queryCommandValue('formatBlock') || '').toLowerCase();
      setEstados({ b: document.queryCommandState('bold'), i: document.queryCommandState('italic'), u: document.queryCommandState('underline'), s: document.queryCommandState('strikeThrough'), ul: document.queryCommandState('insertUnorderedList') && !dentroDe('ul[data-chk]'), ol: document.queryCommandState('insertOrderedList'), h1: bloco === 'h1', h2: bloco === 'h2', chk: !!dentroDe('ul[data-chk]'), q: bloco === 'blockquote', mark: !!dentroDe('mark') });
    } catch (e) { /* sem estado */ }
  };
  const dentroDe = sel => {
    const s = window.getSelection(); if (!s || !s.rangeCount) return null;
    let n = s.getRangeAt(0).startContainer; if (n.nodeType === 3) n = n.parentNode;
    const el = n && n.closest ? n.closest(sel) : null;
    return el && ref.current && ref.current.contains(el) ? el : null;
  };
  const bloco = tag => { prep(); const atual = (document.queryCommandValue('formatBlock') || '').toLowerCase(); cmd('formatBlock', atual === tag ? 'p' : tag); };
  const checklist = () => {
    prep();
    const ul = dentroDe('ul[data-chk]');
    if (ul) { ul.removeAttribute('data-chk'); Array.from(ul.children).forEach(li => li.removeAttribute('data-ok')); cmd('insertUnorderedList'); return; }
    if (!dentroDe('ul')) cmd('insertUnorderedList');
    const novo = dentroDe('ul');
    if (novo) { novo.setAttribute('data-chk', '1'); Array.from(novo.children).forEach(li => { if (!li.getAttribute('data-ok')) li.setAttribute('data-ok', '0'); }); }
    avisar(); atualizarEstados();
  };
  const destacar = () => {
    prep();
    const m = dentroDe('mark');
    if (m) { m.replaceWith(...Array.from(m.childNodes)); avisar(); atualizarEstados(); return; }
    const s = window.getSelection(); if (!s || !s.rangeCount || s.isCollapsed) { if (showToast) showToast('Seleciona o texto que queres destacar.', 'info'); return; }
    const r = s.getRangeAt(0); const caixa = document.createElement('div'); caixa.appendChild(r.cloneContents());
    cmd('insertHTML', `<mark>${caixa.innerHTML}</mark>`);
  };
  const juntarLink = () => {
    prep();
    const s = window.getSelection(); const temTexto = s && !s.isCollapsed;
    const guardada = ultimaSel.current;
    const url = window.prompt('Endereço do link (https://…)');
    if (!url) return;
    if (guardada) ultimaSel.current = guardada;
    const u = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
    if (temTexto) cmd('createLink', u); else cmd('insertHTML', `<a href="${escHtml(u)}" target="_blank" rel="noopener noreferrer">${escHtml(u)}</a>&nbsp;`);
  };
  const inserirFicheiros = fs => {
    const lista = Array.from(fs || []);
    if (!lista.length) return;
    if (protegida) { if (showToast) showToast('Nas páginas protegidas não se juntam imagens nem ficheiros (não ficariam cifrados).', 'error'); return; }
    if (!onEnviarImagem) { if (showToast) showToast('Falta ligar o Storage na Firebase para juntar imagens.', 'error'); return; }
    lista.forEach(f => {
      const id = nId();
      const imagem = /^image\//.test(f.type);
      if (imagem) cmd('insertHTML', `<img src="${URL.createObjectURL(f)}" alt="${escHtml(f.name || 'imagem')}" data-up="${id}"><p><br></p>`);
      onEnviarImagem(`${id}-${(f.name || 'colado.png').replace(/[^\w.\-]+/g, '_')}`, f)
        .then(r => {
          const el = ref.current;
          if (!el) return;
          if (imagem) { const img = el.querySelector(`img[data-up="${id}"]`); if (img) { img.src = r.url; img.removeAttribute('data-up'); } }
          else { el.focus(); document.execCommand('insertHTML', false, `<a href="${escHtml(r.url)}" target="_blank" rel="noopener noreferrer">📎 ${escHtml(f.name)}</a>&nbsp;`); }
          avisar();
        })
        .catch(() => { const img = ref.current && ref.current.querySelector(`img[data-up="${id}"]`); if (img) img.remove(); avisar(); if (showToast) showToast('Não consegui guardar o ficheiro: falta ligar o Storage na Firebase.', 'error'); });
    });
  };
  // @menções
  const opcoes = useMemo(() => {
    if (!mencao) return [];
    const q = norm(mencao.q.trim());
    const todas = entidades || [];
    const f = q ? todas.filter(e => norm(e.nome).includes(q) || (e.t !== 'tarefa' && e.extra && norm(e.extra).includes(q))) : todas.filter(e => e.t !== 'tarefa');
    const ordem = { cliente: 0, jogo: 1, freelancer: 2, pasta: 3, tarefa: 4 };
    return f.slice().sort((a, b) => (ordem[a.t] - ordem[b.t]) || (q ? norm(a.nome).indexOf(q) - norm(b.nome).indexOf(q) : 0)).slice(0, 8);
  }, [mencao, entidades]);
  const verMencao = () => {
    const s = window.getSelection();
    if (!s || !s.rangeCount || !s.isCollapsed) { setMencao(null); return; }
    const r = s.getRangeAt(0); const n = r.startContainer;
    if (n.nodeType !== 3 || !ref.current.contains(n)) { setMencao(null); return; }
    const antes = n.textContent.slice(0, r.startOffset);
    const m = /(?:^|[\s( ])@([^@\n]{0,30})$/.exec(antes);
    if (!m || /\s{2,}$/.test(m[1])) { setMencao(null); return; }
    const rc = r.getBoundingClientRect();
    setMencao({ q: m[1], node: n, ini: r.startOffset - m[1].length - 1, fim: r.startOffset, x: rc.left, y: rc.bottom, topo: rc.top });
    setAtiva(0);
  };
  const escolher = e => {
    if (!mencao || !mencao.node.isConnected) { setMencao(null); return; }
    const r = document.createRange(); r.setStart(mencao.node, Math.max(0, mencao.ini)); r.setEnd(mencao.node, mencao.fim);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('insertHTML', false, `${tagHtml(e.t, e.id, e.nome)}&nbsp;`);
    setMencao(null); avisar();
  };
  const tecla = e => {
    if (mencao && opcoes.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAtiva(a => (a + 1) % opcoes.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAtiva(a => (a - 1 + opcoes.length) % opcoes.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); escolher(opcoes[Math.min(ativa, opcoes.length - 1)]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMencao(null); return; }
    }
    if (e.key === 'Escape') e.stopPropagation();
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); juntarLink(); }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Numa checklist, o item novo começa por marcar
      if (dentroDe('ul[data-chk]')) setTimeout(() => { const li = dentroDe('li'); if (li && li.parentElement && li.parentElement.hasAttribute('data-chk')) { li.setAttribute('data-ok', '0'); avisar(); } }, 0);
    }
  };
  const clique = e => {
    const tag = e.target.closest && e.target.closest('.ntag');
    if (tag) { const rc = tag.getBoundingClientRect(); setTagMenu({ tipo: tag.getAttribute('data-tipo'), id: tag.getAttribute('data-id'), nome: tag.textContent.replace(/^@/, ''), x: rc.left, y: rc.bottom }); return; }
    setTagMenu(null);
    const li = e.target.closest && e.target.closest('li');
    if (li && li.parentElement && li.parentElement.hasAttribute('data-chk')) {
      const rc = li.getBoundingClientRect();
      if (e.clientX - rc.left < 26) { e.preventDefault(); li.setAttribute('data-ok', li.getAttribute('data-ok') === '1' ? '0' : '1'); avisar(); }
    }
  };
  const colar = e => {
    const cd = e.clipboardData; if (!cd) return;
    const fs = Array.from(cd.files || []);
    if (fs.length) { e.preventDefault(); inserirFicheiros(fs); return; }
    const h = cd.getData('text/html');
    if (h) { e.preventDefault(); document.execCommand('insertHTML', false, limparHtml(h, { semBlob: true })); avisar(); return; }
    const t = cd.getData('text/plain');
    if (t) { e.preventDefault(); document.execCommand('insertText', false, t); avisar(); }
  };
  const fichRef = useRef(null);
  const sep = <span className={`w-px h-5 mx-0.5 shrink-0 ${claro ? 'bg-slate-200' : 'bg-slate-700'}`} />;
  const larg = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const altVis = typeof window !== 'undefined' ? (window.visualViewport ? window.visualViewport.height : window.innerHeight) : 800;
  return (
    <div className="relative">
      <div className={`sticky top-0 z-20 -mx-4 sm:-mx-6 px-3 sm:px-5 py-1.5 border-b backdrop-blur ${claro ? 'bg-white/90 border-slate-200' : 'bg-slate-900/90 border-slate-700/70'}`}>
        <div className="flex items-center gap-0.5 overflow-x-auto notas-scroll">
          <BotaoFerr claro={claro} ic="desfazer" titulo="Desfazer" fn={() => cmd('undo')} />
          <BotaoFerr claro={claro} ic="refazer" titulo="Refazer" fn={() => cmd('redo')} />
          {sep}
          <BotaoFerr claro={claro} ic="H1" titulo="Título" on={estados.h1} fn={() => bloco('h1')} />
          <BotaoFerr claro={claro} ic="H2" titulo="Subtítulo" on={estados.h2} fn={() => bloco('h2')} />
          <BotaoFerr claro={claro} ic="negrito" titulo="Negrito (Ctrl+B)" on={estados.b} fn={() => cmd('bold')} />
          <BotaoFerr claro={claro} ic="italico" titulo="Itálico (Ctrl+I)" on={estados.i} fn={() => cmd('italic')} />
          <BotaoFerr claro={claro} ic="sublinhado" titulo="Sublinhado (Ctrl+U)" on={estados.u} fn={() => cmd('underline')} />
          <BotaoFerr claro={claro} ic="riscado" titulo="Riscado" on={estados.s} fn={() => cmd('strikeThrough')} />
          <BotaoFerr claro={claro} ic="marcador" titulo="Destacar" on={estados.mark} fn={destacar} />
          {sep}
          <BotaoFerr claro={claro} ic="check" titulo="Checklist" on={estados.chk} fn={checklist} />
          <BotaoFerr claro={claro} ic="lista" titulo="Lista" on={estados.ul} fn={() => cmd('insertUnorderedList')} />
          <BotaoFerr claro={claro} ic="numerada" titulo="Lista numerada" on={estados.ol} fn={() => cmd('insertOrderedList')} />
          <BotaoFerr claro={claro} ic="citacao" titulo="Citação" on={estados.q} fn={() => bloco('blockquote')} />
          {sep}
          <BotaoFerr claro={claro} ic="arroba" titulo="Marcar cliente, jogo, freelancer ou tarefa (@)" fn={() => { cmd('insertText', '@'); setTimeout(verMencao, 0); }} />
          <BotaoFerr claro={claro} ic="link" titulo="Link (Ctrl+K)" fn={juntarLink} />
          <BotaoFerr claro={claro} ic="imagem" titulo="Imagem ou ficheiro" fn={() => fichRef.current && fichRef.current.click()} />
          <BotaoFerr claro={claro} ic="linha" titulo="Linha" fn={() => cmd('insertHorizontalRule')} />
          <BotaoFerr claro={claro} ic="limpar" titulo="Limpar formatação" fn={() => { cmd('removeFormat'); cmd('formatBlock', 'p'); }} />
          <input ref={fichRef} type="file" multiple className="hidden" onChange={e => { inserirFicheiros(e.target.files); e.target.value = ''; }} />
        </div>
      </div>
      <div ref={ref} className="nota-ed pt-4" contentEditable suppressContentEditableWarning data-ph={placeholder || 'Escreve aqui… usa @ para marcar um cliente, jogo ou tarefa'}
        spellCheck autoCorrect="on" autoCapitalize="sentences"
        onInput={() => { avisar(); verMencao(); }} onKeyDown={tecla} onKeyUp={() => { atualizarEstados(); if (!mencao) verMencao(); }}
        onMouseUp={atualizarEstados} onClick={clique} onPaste={colar}
        onDragOver={e => { if (Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); }}
        onDrop={e => { if (e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); inserirFicheiros(e.dataTransfer.files); } }}
        onBlur={() => setTimeout(() => setMencao(null), 200)} />
      {mencao && opcoes.length > 0 && (() => {
        const w = Math.min(320, larg - 24);
        const x = Math.max(12, Math.min(mencao.x, larg - w - 12));
        const h = Math.min(opcoes.length, 8) * 44 + 8;
        const y = mencao.y + 6 + h > altVis - 8 ? Math.max(8, mencao.topo - h - 6) : mencao.y + 6;
        return (
          <div className={`fixed z-50 rounded-xl border shadow-2xl py-1 overflow-hidden ${claro ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'}`} style={{ left: x, top: y, width: w }} role="listbox">
            {opcoes.map((o, i) => (
              <button key={`${o.t}:${o.id}`} type="button" role="option" aria-selected={i === ativa} onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} onClick={() => escolher(o)} onMouseEnter={() => setAtiva(i)}
                className={`w-full flex items-center gap-2.5 px-3 h-11 text-left ${i === ativa ? (claro ? 'bg-blue-50' : 'bg-blue-500/15') : ''}`}>
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: o.cor || '#64748b' }} />
                <span className="flex-1 min-w-0"><span className="block text-sm truncate">{o.nome}</span>{o.extra && <span className={`block text-[11px] truncate ${claro ? 'text-slate-500' : 'text-slate-400'}`}>{o.extra}</span>}</span>
                <span className={`text-[10px] uppercase tracking-wide ${claro ? 'text-slate-400' : 'text-slate-500'}`}>{ROTULO_TIPO[o.t] || o.t}</span>
              </button>
            ))}
          </div>
        );
      })()}
      {tagMenu && (
        <div className={`fixed z-50 rounded-xl border shadow-xl p-1 ${claro ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'}`} style={{ left: Math.max(12, Math.min(tagMenu.x, larg - 230)), top: tagMenu.y + 6 }}>
          <button type="button" onClick={() => { const t = tagMenu; setTagMenu(null); onIrEntidade && onIrEntidade(t.tipo, t.id); }} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>
            Abrir {ROTULO_TIPO[tagMenu.tipo] ? ROTULO_TIPO[tagMenu.tipo].toLowerCase() : ''} <strong className="truncate max-w-[120px]">{tagMenu.nome}</strong> <Ic n="seta" className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

// ── Uma página aberta: título, data, editor; grava sozinha ──
const PaginaAberta = ({ meta, seccao, claro, sub, onVoltar, lerPagina, guardarPagina, mudarIndice, entidades, onIrEntidade, enviarImagem, chave, pedirDesbloquear, showToast, menuItens, onAtividade }) => {
  const [conteudo, setConteudo] = useState(undefined); // undefined = a carregar; null = erro
  const [estado, setEstado] = useState('');
  const protegida = !!(seccao && seccao.protegida);
  const htmlRef = useRef(''); const timer = useRef(null); const sujo = useRef(false);
  const tituloRef = useRef(meta.titulo || '');
  useEffect(() => {
    let vivo = true;
    setConteudo(undefined);
    (async () => {
      try {
        const d = await lerPagina(meta.id);
        let html = '';
        if (d && d.cifrado) {
          if (!chave) { if (vivo) setConteudo('__trancada'); return; }
          html = JSON.parse(await decifrar(chave, d.cifrado)).html || '';
        } else html = (d && d.html) || '';
        if (vivo) { htmlRef.current = limparHtml(html); setConteudo(htmlRef.current); }
      } catch (e) { console.error('Nota:', e); if (vivo) setConteudo(null); }
    })();
    return () => { vivo = false; };
  }, [meta.id, !!chave]); // eslint-disable-line react-hooks/exhaustive-deps
  const gravar = useCallback(async () => {
    if (!sujo.current) return;
    sujo.current = false;
    const html = limparHtml(htmlRef.current, { semBlob: true });
    const txt = textoDe(html);
    setEstado('A gravar…');
    try {
      if (protegida) {
        if (!chave) { setEstado('Trancada — não gravei'); return; }
        await guardarPagina(meta.id, { cifrado: await cifrar(chave, JSON.stringify({ html })), editada: agora() });
        const tituloC = await cifrar(chave, tituloRef.current || '');
        mudarIndice(ix => ({ ...ix, paginas: ix.paginas.map(p => (p.id === meta.id ? { ...p, titulo: '', tituloC, txt: '', tags: [], editada: agora() } : p)) }));
      } else {
        await guardarPagina(meta.id, { html, editada: agora() });
        mudarIndice(ix => ({ ...ix, paginas: ix.paginas.map(p => (p.id === meta.id ? { ...p, titulo: tituloRef.current, txt: txt.slice(0, 600), tags: tagsDe(html), editada: agora() } : p)) }));
      }
      setEstado('Gravado');
    } catch (e) { console.error('Nota:', e); sujo.current = true; setEstado('Não consegui gravar — tento outra vez'); clearTimeout(timer.current); timer.current = setTimeout(gravar, 4000); }
  }, [meta.id, protegida, chave, guardarPagina, mudarIndice]);
  const agendar = () => { sujo.current = true; setEstado('…'); if (onAtividade) onAtividade(); clearTimeout(timer.current); timer.current = setTimeout(gravar, 800); };
  useEffect(() => () => { clearTimeout(timer.current); if (sujo.current) gravar(); }, [gravar]);
  useEffect(() => {
    const sair = () => { if (sujo.current) gravar(); };
    window.addEventListener('pagehide', sair); document.addEventListener('visibilitychange', sair);
    return () => { window.removeEventListener('pagehide', sair); document.removeEventListener('visibilitychange', sair); };
  }, [gravar]);
  const tags = protegida ? [] : (meta.tags || []);
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-2">
        {onVoltar && <button type="button" onClick={onVoltar} className={`lg:hidden -ml-2 w-9 h-9 inline-flex items-center justify-center rounded-lg ${claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'}`} aria-label="Voltar"><Ic n="voltar" className="w-5 h-5" /></button>}
        <span className={`text-xs truncate ${sub}`}>{seccao ? seccao.nome : ''}{protegida && <span className="inline-flex items-center gap-1 ml-2 text-amber-400"><Ic n="cadeado" className="w-3.5 h-3.5" /> protegida</span>}</span>
        <span className="flex-1" />
        <span className={`text-xs ${sub}`} aria-live="polite">{estado}</span>
        <button type="button" onClick={() => mudarIndice(i => ({ ...i, paginas: i.paginas.map(x => (x.id === meta.id ? { ...x, fav: !x.fav } : x)) }))} aria-pressed={!!meta.fav}
          className={`w-8 h-8 inline-flex items-center justify-center rounded-lg ${meta.fav ? 'text-amber-400' : claro ? 'text-slate-400 hover:text-amber-500 hover:bg-slate-200/70' : 'text-slate-500 hover:text-amber-400 hover:bg-white/10'}`}
          title={meta.fav ? 'Tirar dos favoritos' : 'Pôr nos favoritos'} aria-label={meta.fav ? 'Tirar dos favoritos' : 'Pôr nos favoritos'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={meta.fav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>
        </button>
        {menuItens && <Menu claro={claro} itens={menuItens} />}
      </div>
      {conteudo === '__trancada' ? (
        <div className={`rounded-xl border p-6 text-center space-y-3 ${claro ? 'border-slate-200' : 'border-slate-700'}`}>
          <Ic n="cadeado" className="w-8 h-8 mx-auto text-amber-400" />
          <p className="text-sm">Esta página está numa secção protegida.</p>
          <button type="button" onClick={pedirDesbloquear} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white">Desbloquear</button>
        </div>
      ) : conteudo === undefined ? <p className={`py-10 text-center text-sm ${sub}`}>A abrir…</p>
        : conteudo === null ? <p className="py-10 text-center text-sm text-red-400">Não consegui abrir esta página.</p> : (
          <>
            <input key={meta.id + 't'} defaultValue={meta.titulo || ''} placeholder="Título"
              onChange={e => { tituloRef.current = e.target.value; agendar(); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const ed = e.currentTarget.parentElement.querySelector('.nota-ed'); if (ed) ed.focus(); } }}
              className={`w-full bg-transparent text-2xl sm:text-3xl font-semibold outline-none border-b pb-1 ${claro ? 'border-slate-200 placeholder-slate-300' : 'border-slate-700 placeholder-slate-600'}`} />
            <p className={`mt-1.5 text-xs ${sub}`}>{dataLonga(meta.criada)} · {horaTxt(meta.criada)}{meta.editada && meta.editada !== meta.criada ? ` · editada ${haQuanto(meta.editada)}` : ''}</p>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map(t => <button key={`${t.t}:${t.id}`} type="button" onClick={() => onIrEntidade && onIrEntidade(t.t, t.id)} className={`px-2 py-0.5 rounded-md text-xs ${claro ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/5 hover:bg-white/10 text-slate-300'}`}>@{t.n}</button>)}
              </div>
            )}
            <div className="px-4 sm:px-6 -mx-4 sm:-mx-6 mt-2">
              <Editor key={meta.id} html={conteudo} claro={claro} entidades={protegida ? [] : entidades} onIrEntidade={onIrEntidade} protegida={protegida}
                onEnviarImagem={enviarImagem ? (nome, f) => enviarImagem(`notas/${meta.id}/${nome}`, f) : null} showToast={showToast}
                onMudar={h => { htmlRef.current = h; agendar(); }} />
            </div>
          </>
        )}
    </div>
  );
};

// ── Ecrã das Notas ──
const Notas = ({ navSub, onNavEmpurrar, onNavSubstituir, indice, mudarIndice, modo, theme, lerPagina, guardarPagina, apagarPagina, enviarImagem, entidades, onIrEntidade, abrir, onAberto, showToast }) => {
  const claro = theme === 'light';
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const ix = indice || NOTAS_VAZIO;
  const [secId, setSecId] = useState(() => { try { return localStorage.getItem('notas-sec') || null; } catch (e) { return null; } });
  const [pagId, setPagId] = useState(() => { try { return localStorage.getItem('notas-pag') || null; } catch (e) { return null; } });
  const [vista, setVista] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 1024 ? 'arvore' : 'pagina')); // telemóvel: 'arvore' | 'paginas' | 'pagina'
  const [filtro, setFiltro] = useState(null); // null | 'recentes' | 'favoritos' | { tag }
  const [procura, setProcura] = useState('');
  // Recuar/avançar da app: cada secção, página ou lista aberta fica no histórico
  const navN = useRef({ primeiro: true, deFora: false, ult: null, desde: Date.now() });
  useEffect(() => {
    const r = navN.current; const sub = { secId, pagId, filtro, vista }; const k = JSON.stringify(sub);
    if (r.primeiro) { r.primeiro = false; r.ult = k; const tm = setTimeout(() => { if (onNavSubstituir) onNavSubstituir(sub); }, 0); return () => clearTimeout(tm); }
    if (k === r.ult) return undefined;
    r.ult = k;
    if (r.deFora) { r.deFora = false; return undefined; }
    // Escolhas automáticas logo ao abrir não contam como um ecrã novo
    if (Date.now() - r.desde < 1200) { if (onNavSubstituir) onNavSubstituir(sub); return undefined; }
    if (onNavEmpurrar) onNavEmpurrar(sub);
    return undefined;
  }, [secId, pagId, filtro, vista]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!navSub || !navSub.sub) return;
    const s = navSub.sub;
    const alvo = { secId: s.secId ?? null, pagId: s.pagId ?? null, filtro: s.filtro ?? null, vista: s.vista || vista };
    if (JSON.stringify(alvo) === navN.current.ult) return;
    navN.current.deFora = true;
    setSecId(alvo.secId); setPagId(alvo.pagId); setFiltro(alvo.filtro); setVista(alvo.vista); setProcura('');
  }, [navSub]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ordem, setOrdem] = useState(() => { try { return localStorage.getItem('notas-ordem') || 'editada'; } catch (e) { return 'editada'; } });
  const [fechados, setFechados] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('notas-fechados')) || []); } catch (e) { return new Set(); } });
  const [pedir, setPedir] = useState(null);
  const [chave, setChave] = useState(null);
  const [titulosC, setTitulosC] = useState({});
  const [larguraTelemovel, setLarguraTelemovel] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  // As colunas da esquerda ficam presas logo abaixo da barra de cima da app (e não por baixo dela)
  const [topo, setTopo] = useState(16);
  useEffect(() => {
    const medir = () => { const cab = document.querySelector('div.sticky.top-0.z-50'); setTopo(cab ? Math.round(cab.getBoundingClientRect().height) + 12 : 16); };
    medir(); const t = setTimeout(medir, 400);
    window.addEventListener('resize', medir);
    return () => { clearTimeout(t); window.removeEventListener('resize', medir); };
  }, []);
  const ultimaAtividade = useRef(Date.now());
  useEffect(() => { const r = () => setLarguraTelemovel(window.innerWidth < 1024); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  useEffect(() => { try { if (secId) localStorage.setItem('notas-sec', secId); if (pagId) localStorage.setItem('notas-pag', pagId); else localStorage.removeItem('notas-pag'); } catch (e) { /* sem armazenamento */ } }, [secId, pagId]);
  const alternarCaderno = id => setFechados(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); try { localStorage.setItem('notas-fechados', JSON.stringify([...n])); } catch (e) { /* sem armazenamento */ } return n; });

  // Primeira vez: cria um caderno e uma secção
  useEffect(() => {
    if (modo === 'carregar' || !mudarIndice) return;
    if (!(ix.cadernos || []).length) {
      const c = { id: nId(), nome: 'As minhas notas', cor: CORES[0], ordem: 0 };
      const s1 = { id: nId(), cadernoId: c.id, nome: 'Geral', cor: CORES[1], ordem: 0 };
      const s2 = { id: nId(), cadernoId: c.id, nome: 'To do', cor: CORES[2], ordem: 1 };
      mudarIndice(i => ({ ...NOTAS_VAZIO, ...i, cadernos: [c], seccoes: [s1, s2], paginas: i.paginas || [] }));
      setSecId(s1.id);
    }
  }, [modo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trancar sozinho: 5 minutos sem mexer ou 1 minuto com a app em segundo plano
  useEffect(() => {
    if (!chave) return undefined;
    let escondida = null;
    const i = setInterval(() => { if (Date.now() - ultimaAtividade.current > 5 * 60000) trancar(); }, 15000);
    const vis = () => { if (document.hidden) escondida = setTimeout(trancar, 60000); else clearTimeout(escondida); };
    const mexer = () => { ultimaAtividade.current = Date.now(); };
    document.addEventListener('visibilitychange', vis); document.addEventListener('pointerdown', mexer); document.addEventListener('keydown', mexer);
    return () => { clearInterval(i); clearTimeout(escondida); document.removeEventListener('visibilitychange', vis); document.removeEventListener('pointerdown', mexer); document.removeEventListener('keydown', mexer); };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  const trancar = () => { setChave(null); setTitulosC({}); };
  // Títulos das páginas protegidas (só quando desbloqueado)
  useEffect(() => {
    if (!chave) { setTitulosC({}); return; }
    let vivo = true;
    (async () => {
      const out = {};
      for (const p of ix.paginas || []) { if (p.tituloC) { try { out[p.id] = await decifrar(chave, p.tituloC); } catch (e) { out[p.id] = '?'; } } }
      if (vivo) setTitulosC(out);
    })();
    return () => { vivo = false; };
  }, [chave, ix.paginas]);

  const seccoes = ix.seccoes || [];
  const secao = seccoes.find(s => s.id === secId) || null;
  const secDe = id => seccoes.find(s => s.id === id);
  const tituloDe = p => (p.tituloC ? (titulosC[p.id] != null ? (titulosC[p.id] || 'Sem título') : 'Página protegida') : (p.titulo || 'Sem título'));
  const pagina = (ix.paginas || []).find(p => p.id === pagId) || null;
  const secPagina = pagina ? secDe(pagina.seccaoId) : null;

  // Abrir uma página vinda de outro sítio da app (ex.: ficha do cliente)
  useEffect(() => {
    if (!abrir || modo === 'carregar') return;
    if (abrir.id) { const p = (ix.paginas || []).find(x => x.id === abrir.id); if (p) { setSecId(p.seccaoId); setPagId(p.id); setFiltro(null); setVista('pagina'); } }
    else if (abrir.nova) novaPagina('branco', abrir.nova);
    if (onAberto) onAberto();
  }, [abrir, modo]); // eslint-disable-line react-hooks/exhaustive-deps

  const ordenar = l => l.slice().sort((a, b) => (ordem === 'titulo' ? tituloDe(a).localeCompare(tituloDe(b), 'pt', { numeric: true }) : ordem === 'criada' ? String(b.criada).localeCompare(String(a.criada)) : String(b.editada || b.criada).localeCompare(String(a.editada || a.criada))));
  const q = norm(procura.trim());
  let lista = [];
  let tituloLista = '';
  if (q) { lista = (ix.paginas || []).filter(p => !p.tituloC && (norm(p.titulo).includes(q) || norm(p.txt).includes(q) || (p.tags || []).some(t => norm(t.n).includes(q)))); tituloLista = `Procurar “${procura.trim()}”`; }
  else if (filtro === 'recentes') { lista = (ix.paginas || []).slice().sort((a, b) => String(b.editada || b.criada).localeCompare(String(a.editada || a.criada))).slice(0, 30); tituloLista = 'Recentes'; }
  else if (filtro === 'favoritos') { lista = ordenar((ix.paginas || []).filter(p => p.fav)); tituloLista = 'Favoritos'; }
  else if (filtro && filtro.tag) { lista = ordenar((ix.paginas || []).filter(p => (p.tags || []).some(t => t.t === filtro.tag.t && String(t.id) === String(filtro.tag.id)))); tituloLista = `@${filtro.tag.n}`; }
  else if (secao) { lista = ordenar((ix.paginas || []).filter(p => p.seccaoId === secao.id)); tituloLista = secao.nome; }
  const mostrarSeccao = !!(q || filtro);

  // ── Operações ──
  const novaPagina = async (modeloId = 'branco', sobre = null) => {
    let sid = secao ? secao.id : (seccoes[0] && seccoes[0].id);
    if (sobre || !sid || (secDe(sid) && secDe(sid).protegida && !chave)) sid = (seccoes.find(s => !s.protegida) || {}).id;
    if (!sid) { if (showToast) showToast('Cria primeiro uma secção.', 'error'); return; }
    const m = MODELOS.find(x => x.id === modeloId) || MODELOS[0];
    const id = nId();
    let html = valorDe(m.html) || '';
    let titulo = valorDe(m.titulo) || '';
    if (sobre) { html = `<p>${tagHtml(sobre.tipo, sobre.id, sobre.nome)}&nbsp;</p><p><br></p>`; titulo = `${sobre.nome} — ${dataLonga(agora())}`; }
    const protegida = !!(secDe(sid) && secDe(sid).protegida);
    const meta = { id, seccaoId: sid, titulo: protegida ? '' : titulo, criada: agora(), editada: agora(), txt: protegida ? '' : textoDe(html).slice(0, 600), tags: protegida ? [] : tagsDe(html) };
    try {
      if (protegida) { meta.tituloC = await cifrar(chave, titulo); await guardarPagina(id, { cifrado: await cifrar(chave, JSON.stringify({ html })), editada: agora() }); }
      else await guardarPagina(id, { html, editada: agora() });
    } catch (e) { console.error('Nota:', e); if (showToast) showToast('Não consegui criar a página.', 'error'); return; }
    mudarIndice(i => ({ ...i, paginas: [...(i.paginas || []), meta] }));
    setSecId(sid); setFiltro(null); setProcura(''); setPagId(id); setVista('pagina');
    if (protegida) setTitulosC(t => ({ ...t, [id]: titulo }));
  };
  const apagarPaginaOp = p => {
    if (!window.confirm(`Apagar a página "${tituloDe(p)}"?`)) return;
    mudarIndice(i => ({ ...i, paginas: i.paginas.filter(x => x.id !== p.id) }));
    if (apagarPagina) apagarPagina(p.id).catch(() => {});
    if (pagId === p.id) { setPagId(null); setVista('paginas'); }
  };
  const duplicarPagina = async p => {
    try {
      const d = await lerPagina(p.id);
      const id = nId();
      await guardarPagina(id, { ...(d || {}), editada: agora() });
      mudarIndice(i => ({ ...i, paginas: [...i.paginas, { ...p, id, titulo: p.titulo ? `${p.titulo} (cópia)` : p.titulo, criada: agora(), editada: agora(), fav: false }] }));
      setPagId(id);
    } catch (e) { if (showToast) showToast('Não consegui duplicar.', 'error'); }
  };
  const moverPagina = (p, destino) => {
    const de = secDe(p.seccaoId), para = secDe(destino);
    if (!para || de === para) return;
    if (!!(de && de.protegida) !== !!para.protegida) {
      if (!chave) { pedirDesbloquear(() => moverPagina(p, destino)); return; }
      (async () => {
        try {
          const d = await lerPagina(p.id);
          let html = d && d.cifrado ? JSON.parse(await decifrar(chave, d.cifrado)).html : (d && d.html) || '';
          html = limparHtml(html, { semBlob: true });
          const titulo = tituloDe(p);
          if (para.protegida) {
            await guardarPagina(p.id, { cifrado: await cifrar(chave, JSON.stringify({ html })), editada: agora() });
            const tituloC = await cifrar(chave, titulo);
            mudarIndice(i => ({ ...i, paginas: i.paginas.map(x => (x.id === p.id ? { ...x, seccaoId: destino, titulo: '', tituloC, txt: '', tags: [] } : x)) }));
          } else {
            await guardarPagina(p.id, { html, editada: agora() });
            mudarIndice(i => ({ ...i, paginas: i.paginas.map(x => { if (x.id !== p.id) return x; const { tituloC, ...resto } = x; return { ...resto, seccaoId: destino, titulo, txt: textoDe(html).slice(0, 600), tags: tagsDe(html) }; }) }));
          }
        } catch (e) { if (showToast) showToast('Não consegui mover a página.', 'error'); }
      })();
      return;
    }
    mudarIndice(i => ({ ...i, paginas: i.paginas.map(x => (x.id === p.id ? { ...x, seccaoId: destino } : x)) }));
  };
  const novoCaderno = () => setPedir({ titulo: 'Novo caderno', campos: [{ k: 'n', ph: 'Nome (ex.: Clientes, Pessoal)' }], ok: v => { const n = v.n.trim(); if (!n) return 'Escreve um nome.'; const c = { id: nId(), nome: n, cor: CORES[(ix.cadernos || []).length % CORES.length], ordem: (ix.cadernos || []).length }; const s = { id: nId(), cadernoId: c.id, nome: 'Geral', cor: CORES[1], ordem: 0 }; mudarIndice(i => ({ ...i, cadernos: [...i.cadernos, c], seccoes: [...i.seccoes, s] })); setSecId(s.id); setFiltro(null); setPedir(null); return ''; } });
  const novaSeccao = cid => setPedir({ titulo: 'Nova secção', campos: [{ k: 'n', ph: 'Nome (ex.: To do, Reuniões)' }], ok: v => { const n = v.n.trim(); if (!n) return 'Escreve um nome.'; const doC = seccoes.filter(s => s.cadernoId === cid); const s = { id: nId(), cadernoId: cid, nome: n, cor: CORES[(doC.length + 1) % CORES.length], ordem: doC.length }; mudarIndice(i => ({ ...i, seccoes: [...i.seccoes, s] })); setSecId(s.id); setFiltro(null); setVista('paginas'); setPedir(null); return ''; } });
  const renomear = (tipo, x) => setPedir({ titulo: tipo === 'caderno' ? 'Mudar o nome do caderno' : 'Mudar o nome da secção', campos: [{ k: 'n', valor: x.nome }], ok: v => { const n = v.n.trim(); if (!n) return 'Escreve um nome.'; mudarIndice(i => (tipo === 'caderno' ? { ...i, cadernos: i.cadernos.map(c => (c.id === x.id ? { ...c, nome: n } : c)) } : { ...i, seccoes: i.seccoes.map(s => (s.id === x.id ? { ...s, nome: n } : s)) })); setPedir(null); return ''; } });
  const mudarCor = (tipo, x) => { const i0 = CORES.indexOf(x.cor); const cor = CORES[(i0 + 1) % CORES.length]; mudarIndice(i => (tipo === 'caderno' ? { ...i, cadernos: i.cadernos.map(c => (c.id === x.id ? { ...c, cor } : c)) } : { ...i, seccoes: i.seccoes.map(s => (s.id === x.id ? { ...s, cor } : s)) })); };
  const apagarSeccao = s => {
    const ps = (ix.paginas || []).filter(p => p.seccaoId === s.id);
    if (!window.confirm(`Apagar a secção "${s.nome}"${ps.length ? ` e as ${ps.length} página${ps.length === 1 ? '' : 's'} dela` : ''}?`)) return;
    mudarIndice(i => ({ ...i, seccoes: i.seccoes.filter(x => x.id !== s.id), paginas: i.paginas.filter(p => p.seccaoId !== s.id) }));
    ps.forEach(p => apagarPagina && apagarPagina(p.id).catch(() => {}));
    if (secId === s.id) setSecId(null);
  };
  const apagarCaderno = c => {
    const ss = seccoes.filter(s => s.cadernoId === c.id); const ids = new Set(ss.map(s => s.id));
    const ps = (ix.paginas || []).filter(p => ids.has(p.seccaoId));
    if (!window.confirm(`Apagar o caderno "${c.nome}" (${ss.length} secç${ss.length === 1 ? 'ão' : 'ões'}, ${ps.length} página${ps.length === 1 ? '' : 's'})?`)) return;
    mudarIndice(i => ({ ...i, cadernos: i.cadernos.filter(x => x.id !== c.id), seccoes: i.seccoes.filter(s => !ids.has(s.id)), paginas: i.paginas.filter(p => !ids.has(p.seccaoId)) }));
    ps.forEach(p => apagarPagina && apagarPagina(p.id).catch(() => {}));
  };

  // ── Cofre (secções protegidas) ──
  const pedirDesbloquear = (depois = null) => {
    if (!TEM_CRIPTO) { if (showToast) showToast('Este browser não tem cifra disponível.', 'error'); return; }
    if (!ix.cofre) { criarCofre(depois); return; }
    setPedir({
      titulo: 'Desbloquear notas protegidas', texto: 'Escreve a palavra-passe das notas protegidas.', campos: [{ k: 'p', tipo: 'password', ph: 'Palavra-passe' }],
      ok: async v => {
        try {
          const k = await derivarChave(v.p, deB64(ix.cofre.salt));
          const t = await decifrar(k, ix.cofre.verif);
          if (t !== 'cofre-ok') return 'Palavra-passe errada.';
          ultimaAtividade.current = Date.now(); setChave(k); setPedir(null); if (depois) setTimeout(depois, 0); return '';
        } catch (e) { return 'Palavra-passe errada.'; }
      },
    });
  };
  const criarCofre = (depois = null) => setPedir({
    titulo: 'Criar a palavra-passe das notas protegidas',
    texto: 'As secções protegidas ficam cifradas neste dispositivo antes de irem para a internet: nem a Firebase as consegue ler. Se te esqueceres da palavra-passe, não há forma de as recuperar.',
    campos: [{ k: 'p', tipo: 'password', ph: 'Palavra-passe (mín. 10 caracteres)' }, { k: 'p2', tipo: 'password', ph: 'Repetir' }],
    ok: async v => {
      if ((v.p || '').length < 10) return 'Usa pelo menos 10 caracteres (uma frase é o ideal).';
      if (v.p !== v.p2) return 'As duas não são iguais.';
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const k = await derivarChave(v.p, salt);
      const verif = await cifrar(k, 'cofre-ok');
      mudarIndice(i => ({ ...i, cofre: { salt: b64(salt), verif, criado: agora() } }));
      ultimaAtividade.current = Date.now(); setChave(k); setPedir(null); if (depois) setTimeout(() => depois(k), 0); return '';
    },
  });
  const protegerSeccao = s => {
    const fazer = async (k = chave) => {
      const ps = (ix.paginas || []).filter(p => p.seccaoId === s.id);
      try {
        const metas = {};
        for (const p of ps) {
          const d = await lerPagina(p.id);
          const html = limparHtml((d && d.html) || '', { semBlob: true });
          await guardarPagina(p.id, { cifrado: await cifrar(k, JSON.stringify({ html })), editada: agora() });
          metas[p.id] = await cifrar(k, p.titulo || '');
        }
        mudarIndice(i => ({ ...i, seccoes: i.seccoes.map(x => (x.id === s.id ? { ...x, protegida: true } : x)), paginas: i.paginas.map(p => (metas[p.id] ? { ...p, titulo: '', tituloC: metas[p.id], txt: '', tags: [] } : p)) }));
        if (showToast) showToast(`"${s.nome}" está protegida${ps.length ? ` (${ps.length} página${ps.length === 1 ? '' : 's'} cifrada${ps.length === 1 ? '' : 's'})` : ''}.`, 'success');
      } catch (e) { console.error(e); if (showToast) showToast('Não consegui proteger a secção.', 'error'); }
    };
    if (!chave) pedirDesbloquear(fazer); else fazer();
  };
  const desprotegerSeccao = s => {
    const fazer = async () => {
      if (!window.confirm(`Tirar a proteção de "${s.nome}"? As páginas voltam a ficar legíveis na base de dados.`)) return;
      const ps = (ix.paginas || []).filter(p => p.seccaoId === s.id);
      try {
        const metas = {};
        for (const p of ps) {
          const d = await lerPagina(p.id);
          const html = d && d.cifrado ? JSON.parse(await decifrar(chave, d.cifrado)).html : (d && d.html) || '';
          await guardarPagina(p.id, { html, editada: agora() });
          metas[p.id] = { titulo: p.tituloC ? await decifrar(chave, p.tituloC) : p.titulo, txt: textoDe(html).slice(0, 600), tags: tagsDe(html) };
        }
        mudarIndice(i => ({ ...i, seccoes: i.seccoes.map(x => (x.id === s.id ? { ...x, protegida: false } : x)), paginas: i.paginas.map(p => { if (!metas[p.id]) return p; const { tituloC, ...resto } = p; return { ...resto, ...metas[p.id] }; }) }));
      } catch (e) { if (showToast) showToast('Não consegui tirar a proteção.', 'error'); }
    };
    if (!chave) pedirDesbloquear(fazer); else fazer();
  };

  const abrirSeccao = s => {
    setSecId(s.id); setFiltro(null); setProcura('');
    const ps = ordenar((ix.paginas || []).filter(p => p.seccaoId === s.id));
    if (!larguraTelemovel && ps.length && !ps.some(p => p.id === pagId)) setPagId(ps[0].id);
    setVista('paginas');
    if (s.protegida && !chave) pedirDesbloquear();
  };
  const abrirPagina = p => { setPagId(p.id); if (!mostrarSeccao) setSecId(p.seccaoId); setVista('pagina'); };

  if (modo === 'carregar') return <div className="py-16 text-center text-slate-400 text-sm">A carregar as notas…</div>;

  const linhaBtn = ativo => `w-full flex items-center gap-2 px-2 py-2 lg:py-1.5 rounded-lg text-sm text-left ${ativo ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`;
  const painel = `rounded-2xl border ${claro ? 'bg-white/80 border-slate-200' : 'bg-slate-800/40 border-slate-700/50'}`;

  // Coluna 1: procura, atalhos, cadernos e secções
  const arvore = (
    <div className={`${painel} p-2 lg:p-3 space-y-3`}>
      <div className="relative">
        <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${sub}`}><Ic n="procurar" /></span>
        <input value={procura} onChange={e => { setProcura(e.target.value); if (e.target.value) setVista('paginas'); }} placeholder="Procurar nas notas…"
          className={`w-full rounded-lg border pl-8 pr-3 py-2 text-base lg:text-sm outline-none focus:ring-2 focus:ring-blue-500 ${claro ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-700'}`} />
      </div>
      <div className="space-y-0.5">
        <button type="button" onClick={() => { setFiltro('recentes'); setProcura(''); setVista('paginas'); }} className={linhaBtn(filtro === 'recentes')}><Ic n="relogio" className={`w-4 h-4 ${sub}`} /> Recentes</button>
        <button type="button" onClick={() => { setFiltro('favoritos'); setProcura(''); setVista('paginas'); }} className={linhaBtn(filtro === 'favoritos')}><Ic n="estrela" className={`w-4 h-4 ${sub}`} /> Favoritos <span className={`ml-auto text-xs ${sub}`}>{(ix.paginas || []).filter(p => p.fav).length || ''}</span></button>
        {/* As páginas favoritas ficam logo aqui, à mão (como os projetos favoritos no Trabalho) */}
        {(() => {
          const favs = (ix.paginas || []).filter(p => p.fav).sort((a, b) => String(tituloDe(a)).localeCompare(String(tituloDe(b)), 'pt'));
          if (!favs.length) return null;
          return (
            <div className="ml-4 pl-2 space-y-0.5">
              {favs.map(p => {
                const s = secDe(p.seccaoId);
                const ativa = pagId === p.id && !filtro && !q;
                return (
                  <button key={p.id} type="button" onClick={() => { setFiltro(null); setProcura(''); setSecId(p.seccaoId); setPagId(p.id); setVista('pagina'); }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 lg:py-1 rounded-lg text-sm text-left ${ativa ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`} title={s ? `${s.nome} › ${tituloDe(p)}` : tituloDe(p)}>
                    <span className="w-1 h-3.5 rounded-full shrink-0" style={{ background: s ? s.cor : '#94a3b8' }} />
                    <span className="truncate min-w-0">{tituloDe(p)}</span>
                    {p.tituloC && !chave && <Ic n="cadeado" className="w-3 h-3 text-amber-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>
      <div>
        <div className="flex items-center justify-between px-2 mb-1">
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${sub}`}>Cadernos</p>
          <button type="button" onClick={novoCaderno} className={`w-7 h-7 inline-flex items-center justify-center rounded-md ${sub} ${claro ? 'hover:bg-slate-200' : 'hover:bg-white/10'}`} aria-label="Novo caderno" title="Novo caderno"><Ic n="mais" /></button>
        </div>
        {(ix.cadernos || []).slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map(c => {
          const fechado = fechados.has(c.id);
          const ss = seccoes.filter(s => s.cadernoId === c.id).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
          return (
            <div key={c.id} className="mb-1">
              <div className={`group flex items-center gap-1 rounded-lg pr-1 ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
                <button type="button" onClick={() => alternarCaderno(c.id)} className="flex-1 min-w-0 flex items-center gap-2 px-2 py-2 lg:py-1.5 text-left">
                  <svg width="9" height="9" viewBox="0 0 10 10" className={sub} style={{ transform: fechado ? 'none' : 'rotate(90deg)', transition: 'transform .15s' }} aria-hidden="true"><path d="M3 1.5 7 5l-4 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                  <span className="w-5 h-5 rounded-md inline-flex items-center justify-center text-white shrink-0" style={{ background: c.cor }}><Ic n="caderno" className="w-3.5 h-3.5" /></span>
                  <span className="text-sm font-semibold break-words leading-snug min-w-0">{c.nome}</span>
                </button>
                <button type="button" onClick={() => novaSeccao(c.id)} className={`w-7 h-7 inline-flex items-center justify-center rounded-md lg:opacity-0 lg:group-hover:opacity-100 ${sub}`} aria-label={`Nova secção em ${c.nome}`} title="Nova secção"><Ic n="mais" className="w-3.5 h-3.5" /></button>
                <Menu claro={claro} itens={[{ txt: 'Mudar o nome', ic: 'editar', fn: () => renomear('caderno', c) }, { txt: 'Mudar a cor', fn: () => mudarCor('caderno', c) }, '-', { txt: 'Apagar caderno', ic: 'lixo', perigo: true, fn: () => apagarCaderno(c) }]} />
              </div>
              {!fechado && (
                <div className="ml-5 space-y-0.5">
                  {ss.map(s => {
                    const n = (ix.paginas || []).filter(p => p.seccaoId === s.id).length;
                    return (
                      <div key={s.id} className={`group flex items-center rounded-lg ${!filtro && !q && secId === s.id ? (claro ? 'bg-slate-200/70' : 'bg-white/10') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
                        <button type="button" onClick={() => abrirSeccao(s)} className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-2 lg:py-1.5 text-sm text-left ${!filtro && !q && secId === s.id ? 'font-semibold' : ''}`}>
                          <span className="w-1 h-4 rounded-full shrink-0" style={{ background: s.cor }} />
                          <span className="break-words leading-snug min-w-0">{s.nome}</span>
                          {s.protegida && <Ic n={chave ? 'aberto' : 'cadeado'} className="w-3.5 h-3.5 text-amber-400" />}
                          <span className={`ml-auto text-[11px] ${sub}`}>{n || ''}</span>
                        </button>
                        <Menu claro={claro} itens={[
                          { txt: 'Mudar o nome', ic: 'editar', fn: () => renomear('seccao', s) }, { txt: 'Mudar a cor', fn: () => mudarCor('seccao', s) },
                          s.protegida ? { txt: 'Tirar a proteção', ic: 'aberto', fn: () => desprotegerSeccao(s) } : { txt: 'Proteger com palavra-passe', ic: 'cadeado', fn: () => protegerSeccao(s) },
                          '-', { txt: 'Apagar secção', ic: 'lixo', perigo: true, fn: () => apagarSeccao(s) },
                        ]} />
                      </div>
                    );
                  })}
                  {!ss.length && <button type="button" onClick={() => novaSeccao(c.id)} className={`px-2 py-1.5 text-xs ${sub} hover:text-blue-400`}>+ Nova secção</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {chave && <button type="button" onClick={trancar} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg border border-amber-400/40 text-amber-400 hover:bg-amber-400/10"><Ic n="cadeado" className="w-3.5 h-3.5" /> Trancar as notas protegidas</button>}
      {modo === 'g' && <p className="px-2 text-[11px] text-amber-400">As notas estão a gravar no documento principal (falta a regra do Firestore). Funciona, mas o espaço é limitado.</p>}
    </div>
  );

  // Coluna 2: páginas
  const paginas = (
    <div className={`${painel} p-2 lg:p-3`}>
      <div className="flex items-center gap-1 mb-2">
        <button type="button" onClick={() => setVista('arvore')} className={`lg:hidden w-9 h-9 inline-flex items-center justify-center rounded-lg ${claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'}`} aria-label="Voltar"><Ic n="voltar" className="w-5 h-5" /></button>
        <p className="flex-1 min-w-0 px-1 font-semibold truncate flex items-center gap-1.5">{secao && !mostrarSeccao && <span className="w-1 h-4 rounded-full" style={{ background: secao.cor }} />}{tituloLista || 'Páginas'}{secao && !mostrarSeccao && secao.protegida && <Ic n={chave ? 'aberto' : 'cadeado'} className="w-3.5 h-3.5 text-amber-400" />}</p>
        <select value={ordem} onChange={e => { setOrdem(e.target.value); try { localStorage.setItem('notas-ordem', e.target.value); } catch (er) { /* sem armazenamento */ } }} aria-label="Ordenar" className={`text-xs rounded-md bg-transparent px-1 py-1 ${sub}`}>
          <option value="editada" className={claro ? '' : 'bg-slate-800'}>Recentes</option><option value="criada" className={claro ? '' : 'bg-slate-800'}>Criação</option><option value="titulo" className={claro ? '' : 'bg-slate-800'}>A–Z</option>
        </select>
      </div>
      {!mostrarSeccao && secao && (
        <div className="flex gap-1.5 mb-2">
          <button type="button" onClick={() => (secao.protegida && !chave ? pedirDesbloquear(() => novaPagina('branco')) : novaPagina('branco'))} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white"><Ic n="mais" /> Página</button>
          <Menu claro={claro} itens={MODELOS.filter(m => m.id !== 'branco').map(m => ({ txt: `Nova: ${m.nome}`, fn: () => (secao.protegida && !chave ? pedirDesbloquear(() => novaPagina(m.id)) : novaPagina(m.id)) }))} />
        </div>
      )}
      <div className="space-y-0.5">
        {lista.map(p => {
          const s = secDe(p.seccaoId);
          return (
            <button key={p.id} type="button" onClick={() => abrirPagina(p)} className={`w-full text-left px-2.5 py-2 rounded-lg ${pagId === p.id && !larguraTelemovel ? (claro ? 'bg-slate-200/70' : 'bg-white/10') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
              <span className="flex items-center gap-1.5">
                {p.fav && <span className="text-amber-400 text-xs">★</span>}
                {p.tituloC && !chave && <Ic n="cadeado" className="w-3.5 h-3.5 text-amber-400" />}
                <span className="text-sm font-medium truncate">{tituloDe(p)}</span>
              </span>
              <span className={`block text-xs truncate ${sub}`}>{mostrarSeccao && s ? `${s.nome} · ` : ''}{haQuanto(p.editada || p.criada)}{p.txt ? ` · ${p.txt.slice(0, 80)}` : ''}</span>
            </button>
          );
        })}
        {!lista.length && <p className={`px-2 py-6 text-center text-sm ${sub}`}>{q ? 'Nada encontrado.' : filtro ? 'Ainda nada aqui.' : secao ? 'Sem páginas. Cria a primeira.' : 'Escolhe uma secção.'}</p>}
      </div>
    </div>
  );

  // Coluna 3: página aberta
  const menuPagina = pagina ? [
    { txt: pagina.fav ? 'Tirar dos favoritos' : 'Pôr nos favoritos', ic: 'estrela', fn: () => mudarIndice(i => ({ ...i, paginas: i.paginas.map(x => (x.id === pagina.id ? { ...x, fav: !x.fav } : x)) })) },
    { txt: 'Duplicar', ic: 'copiar', fn: () => duplicarPagina(pagina) },
    '-',
    ...seccoes.filter(s => s.id !== pagina.seccaoId).map(s => ({ txt: `Mover para ${(ix.cadernos.find(c => c.id === s.cadernoId) || {}).nome || ''} › ${s.nome}`, ic: 'mover', fn: () => moverPagina(pagina, s.id) })),
    '-',
    { txt: 'Apagar página', ic: 'lixo', perigo: true, fn: () => apagarPaginaOp(pagina) },
  ] : null;
  const editor = pagina ? (
    <div className={`${painel} px-4 sm:px-6 py-3 sm:py-4 min-h-[60vh]`}>
      <PaginaAberta key={pagina.id + (chave ? 'k' : '')} meta={pagina} seccao={secPagina} claro={claro} sub={sub}
        onVoltar={() => setVista('paginas')} lerPagina={lerPagina} guardarPagina={guardarPagina} mudarIndice={mudarIndice}
        entidades={entidades} onIrEntidade={onIrEntidade} enviarImagem={enviarImagem} chave={secPagina && secPagina.protegida ? chave : null}
        pedirDesbloquear={() => pedirDesbloquear()} showToast={showToast} menuItens={menuPagina} onAtividade={() => { ultimaAtividade.current = Date.now(); }} />
    </div>
  ) : (
    <div className={`${painel} p-10 text-center ${sub} hidden lg:block`}>
      <Ic n="caderno" className="w-10 h-10 mx-auto mb-3 opacity-50" />
      <p className="text-sm">Escolhe uma página ou cria uma nova.</p>
    </div>
  );

  return (
    <div className={`${claro ? '' : 'dark-notas'}`}>
      <style>{CSS_NOTAS}</style>
      {larguraTelemovel ? (
        <div className="pb-24">
          {vista === 'arvore' && arvore}
          {vista === 'paginas' && paginas}
          {vista === 'pagina' && (pagina ? editor : paginas)}
        </div>
      ) : (
        <div className="grid grid-cols-[260px_280px_minmax(0,1fr)] gap-4 items-start">
          <div className="sticky overflow-y-auto" style={{ top: topo, maxHeight: `calc(100vh - ${topo + 16}px)` }}>{arvore}</div>
          <div className="sticky overflow-y-auto" style={{ top: topo, maxHeight: `calc(100vh - ${topo + 16}px)` }}>{paginas}</div>
          {editor}
        </div>
      )}
      {pedir && <Pedir {...pedir} claro={claro} onFechar={() => setPedir(null)} />}
    </div>
  );
};

export default Notas;
export { Notas, tagsDe, NOTAS_VAZIO };
