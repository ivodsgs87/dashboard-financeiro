// Separador "Notas": cadernos → secções → páginas, como o OneNote. Só é descarregado quando se abre.
// O índice (cadernos, secções, títulos, tags) vem do OrcamentoApp; o conteúdo de cada página lê-se e grava-se
// à parte (um documento por página). As secções protegidas são cifradas no próprio browser (AES-GCM),
// com uma palavra-passe que nunca sai do dispositivo.
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { auth } from './firebase';
import { confirmar } from './base';

const nId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const agora = () => new Date().toISOString();
const NOTAS_VAZIO = { v: 1, cadernos: [], seccoes: [], paginas: [] };
const CORES = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#64748b'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const isoDia = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const segundaDe = d => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
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
      if (PROIBIDAS.has(tag) || (tag === 'SPAN' && n.hasAttribute('data-prov'))) { n.remove(); return; } // data-prov: texto provisório do ditado ao vivo
      andar(n);
      if (!PERMITIDAS.has(tag)) { n.replaceWith(...Array.from(n.childNodes)); return; }
      Array.from(n.attributes).forEach(a => {
        const k = a.name.toLowerCase();
        const ok = (tag === 'A' && k === 'href') || (tag === 'IMG' && (k === 'src' || k === 'alt'))
          || (tag === 'LI' && k === 'data-ok') || (tag === 'UL' && k === 'data-chk')
          || (tag === 'DIV' && (k === 'data-cols' || k === 'data-col' || (k === 'data-semana' && /^\d{4}-\d{2}-\d{2}$/.test(a.value))))
          || (tag === 'SPAN' && (k === 'data-tipo' || k === 'data-id' || k === 'class'));
        if (!ok) n.removeAttribute(a.name);
      });
      if (tag === 'A') {
        const h = n.getAttribute('href') || '';
        if (!/^(https?:|mailto:)/i.test(h)) n.removeAttribute('href');
        else { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); }
      }
      if (tag === 'DIV' && n.hasAttribute('data-cols') && !/^[23]$/.test(n.getAttribute('data-cols'))) n.setAttribute('data-cols', '2');
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
// ── Biometria (Face ID / impressão digital) para abrir o cofre: uma passkey do dispositivo com a extensão PRF
//    dá um segredo que só sai com a biometria; esse segredo cifra a chave do cofre. Nada disto sai sem estar cifrado.
const BIO_LS = 'cofre-bio-id';
const bitsDaSenha = async (senha, salt) => {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, base, 256));
};
const chaveDosBits = bits => crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
const chaveDoPrf = async bytes => {
  const base = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('cofre-bio-v1'), info: new Uint8Array(0) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
};
const prfDaPasskey = async (idB64, salt) => {
  const r = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: deB64(idB64) }], userVerification: 'required', timeout: 60000, extensions: { prf: { eval: { first: salt } } } } });
  const x = r && r.getClientExtensionResults ? r.getClientExtensionResults() : {};
  const out = x && x.prf && x.prf.results && x.prf.results.first;
  if (!out) throw new Error('sem-prf');
  return new Uint8Array(out);
};
const nomeDispositivo = () => { const u = typeof navigator !== 'undefined' ? navigator.userAgent : ''; return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Este dispositivo'; };

// ── Modelos de página ──
const MODELOS = [
  { id: 'branco', nome: 'Página em branco', titulo: '', html: '' },
  { id: 'reuniao', nome: 'Reunião', titulo: () => `Reunião ${dataLonga(agora())}`, html: () => `<p><b>Data:</b> ${dataLonga(agora())}, ${horaTxt(agora())}</p><p><b>Com:</b> </p><h2>Notas</h2><ul><li><br></li></ul><h2>Próximos passos</h2><ul data-chk="1"><li data-ok="0"><br></li></ul>` },
  { id: 'brief', nome: 'Brief de criativo', titulo: 'Brief', html: '<h2>Objetivo</h2><p><br></p><h2>Público</h2><p><br></p><h2>Formatos</h2><ul data-chk="1"><li data-ok="0">9:16</li><li data-ok="0">4:5</li><li data-ok="0">16:9</li></ul><h2>Referências</h2><p><br></p><h2>Prazo</h2><p><br></p>' },
  { id: 'compras', nome: 'Lista de compras', tipo: 'compras', titulo: () => `Compras ${dataLonga(agora())}`, html: '<ul data-chk="1"><li data-ok="0"><br></li></ul>' },
  { id: 'todo', nome: 'Lista de tarefas', titulo: () => { const d = new Date(); return `${MESES[d.getMonth()].replace(/^./, x => x.toUpperCase())} ${String(d.getFullYear()).slice(2)}`; }, html: '<ul data-chk="1"><li data-ok="0"><br></li></ul>' },
];
const valorDe = (x, ...a) => (typeof x === 'function' ? x(...a) : x);

// ── Estilos do editor (uma vez) ──
const CSS_NOTAS = `
.nota-ed,.nota-ed *{font-family:'Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif}
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
.nota-ed span[data-prov]{opacity:.55;font-style:italic}
.nota-ed hr{border:0;border-top:1px solid rgba(148,163,184,.35);margin:.9em 0}
.nota-ed div[data-cols]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;margin:.5em 0}
.nota-ed div[data-cols="3"]{grid-template-columns:repeat(3,minmax(0,1fr))}
.nota-ed div[data-semana]{position:relative;margin:.6em 0;padding:.55em .9em .65em;border-radius:12px;border:1px solid rgba(148,163,184,.32)}
.nota-ed div[data-semana]:focus-within{border-color:rgba(96,165,250,.55)}
.nota-ed div[data-semana]>h3:first-child{margin:0 6.5rem .2em 0}
.nota-ed div[data-semana]::before{position:absolute;top:.75em;right:.9em;font-size:12px;line-height:1.6;font-weight:600;padding:0 .55em;border-radius:999px;pointer-events:none}
.nota-ed div[data-col]{min-width:0;min-height:2.2em;margin:0;padding:.3em .7em;border-radius:10px;border:1px dashed rgba(148,163,184,.28)}
.nota-ed div[data-col]:focus-within{border-color:rgba(96,165,250,.55)}
.nota-ed div[data-col]>:first-child{margin-top:0}
@media (max-width:640px){.nota-ed div[data-cols],.nota-ed div[data-cols="3"]{grid-template-columns:1fr;gap:.6rem}}
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
  carrinho: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L21.5 8H6"/>',
  visto: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/>',
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
  colunas: '<rect x="3" y="4" width="7.5" height="16" rx="1.5"/><rect x="13.5" y="4" width="7.5" height="16" rx="1.5"/>',
  semana: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7 14h2M11 14h2M15 14h2M7 17.5h2M11 17.5h2"/>',
  google: '<path d="M20.5 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.5z"/><path d="M12 21c2.4 0 4.5-.8 5.9-2.2L15 16.6c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.3A9 9 0 0 0 12 21z"/><path d="M7 13.8a5.4 5.4 0 0 1 0-3.5V8H4a9 9 0 0 0 0 8.1z"/><path d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 4 8l3 2.3c.7-2.1 2.7-3.7 5-3.7z"/>',
  micro: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  linha: '<path d="M4 12h16"/>', limpar: '<path d="M6 19h8M10 5h8M14 5l-4 14M4 4l16 16"/>', desfazer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', refazer: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  editar: '<path d="M14.5 4.5l5 5L9 20H4v-5z"/>', mover: '<path d="M5 12h14M13 6l6 6-6 6"/>', copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  seta: '<path d="M9 6l6 6-6 6"/>', pessoas: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.2a5 5 0 0 1 5.5 5.3"/>', tag: '<path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.25"/>',
};
const Ic = ({ n, className = 'w-4 h-4' }) => <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: IC[n] || '' }} />;

// ── Caixa de diálogo simples (pedir texto / palavra-passe) ──
const Pedir = ({ titulo, texto, campos, ok, onFechar, claro, perigo, extra }) => {
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
          <input key={c.k} autoFocus={i === 0} type={c.tipo || 'text'} value={vals[c.k]} placeholder={c.ph || ''} autoComplete={c.tipo === 'password' ? 'new-password' : c.codigo ? 'one-time-code' : 'off'} inputMode={c.codigo ? 'numeric' : undefined}
            onChange={e => setVals({ ...vals, [c.k]: e.target.value })}
            className={`w-full rounded-lg border px-3 py-2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-blue-500 ${claro ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-600'}`} />
        ))}
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          {extra && <button type="button" onClick={extra.fn} disabled={aguarde} className="mr-auto inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-blue-500/50 text-blue-400 hover:bg-blue-500/10">{extra.txt}</button>}
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

const DITAR_AO_ABRIR = { sim: false };
// Botão da barra do editor (fora do Editor para não ser recriado a cada tecla)
// ── Ditado "da app": grava o áudio aos bocados (corta nas pausas) e o servidor da app transcreve-o com o Gemini.
// Funciona em qualquer browser ou app do Windows (o reconhecimento de voz do browser só existe no Chrome e no Edge "a sério").
const FN_TRANSCREVER = 'https://us-central1-dashboard-financas-f2b55.cloudfunctions.net/transcrever';
const paraWav = (partes, n, taxa, alvo = 16000) => {
  const f = new Float32Array(n); let o = 0; partes.forEach(x => { f.set(x, o); o += x.length; });
  const r = taxa / alvo, m = Math.floor(n / r), pcm = new Int16Array(m);
  for (let i = 0; i < m; i++) { // média da janela (filtro simples antes de baixar a taxa)
    const a = Math.floor(i * r), b = Math.min(n, Math.floor((i + 1) * r)); let soma = 0; for (let k = a; k < b; k++) soma += f[k];
    const v = Math.max(-1, Math.min(1, soma / Math.max(1, b - a))); pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2), d = new DataView(buf);
  const txt = (o2, t) => { for (let i = 0; i < t.length; i++) d.setUint8(o2 + i, t.charCodeAt(i)); };
  txt(0, 'RIFF'); d.setUint32(4, 36 + pcm.length * 2, true); txt(8, 'WAVE'); txt(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, alvo, true); d.setUint32(28, alvo * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); txt(36, 'data'); d.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: 'audio/wav' });
};
const blobBase64 = b => new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => falha(r.error); r.readAsDataURL(b); });
// Se o Gemini estiver ocupado (503), tenta mais uma vez antes de avisar
const transcreverAudio = async (wav, lingua, previa) => {
  try { return await transcreverAudio1(wav, lingua, previa); }
  catch (e) { if (!e.ocupado || previa) throw e; await new Promise(ok => setTimeout(ok, 2500)); return transcreverAudio1(wav, lingua); }
};
const transcreverAudio1 = async (wav, lingua, previa) => {
  const u = auth && auth.currentUser;
  if (!u) throw new Error('Entra na app primeiro.');
  let r;
  try { r = await fetch(FN_TRANSCREVER, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` }, body: JSON.stringify({ audio: await blobBase64(wav), mime: 'audio/wav', lingua, duracao: Math.round((wav.size - 44) / 32000), previa: !!previa }) }); }
  catch (e) { const er = new Error('Não consegui falar com a função «transcrever» do servidor da app. Se ainda não fizeste o deploy dela (firebase deploy --only functions:transcrever), é isso; senão, vê a internet.'); er.status = 0; throw er; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(r.status === 404 ? 'A função «transcrever» ainda não está publicada — falta fazer o deploy das functions.' : (j.error && j.error.message) || `Erro ${r.status} a transcrever`); e.status = r.status; e.ocupado = !!(j.error && j.error.ocupado); throw e; }
  return limparTranscricao(j.texto);
};
// ── Ditado AO VIVO (Gemini Live, modelo de transcrição): o servidor da app dá um "bilhete" de uso único e a app
// fala diretamente com a Google por WebSocket, a mandar o som em bocadinhos de 0,1 s; o texto vem enquanto falas.
const pedirTokenVoz = async lingua => {
  const u = auth && auth.currentUser;
  if (!u) throw new Error('Entra na app primeiro.');
  let r;
  try { r = await fetch(FN_TRANSCREVER, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` }, body: JSON.stringify({ acao: 'token', lingua }) }); }
  catch (e) { throw new Error('Não consegui falar com o servidor da app.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new Error((j.error && j.error.message) || (r.status === 404 ? 'A função «transcrever» não está publicada.' : `Erro ${r.status}`));
  return j;
};
const WS_VIVO = [
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained',
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained',
];
const textoDaMsg = async d => (typeof d === 'string' ? d : d instanceof Blob ? d.text() : new TextDecoder().decode(d));
// Abre a ligação e espera pelo "setupComplete" (até 6 s). Devolve o WebSocket pronto, ou rebenta.
const ligarVivo = (url, token, setup) => new Promise((ok, falha) => {
  let ws; try { ws = new WebSocket(`${url}?access_token=${encodeURIComponent(token)}`); } catch (e) { falha(e); return; }
  ws.binaryType = 'arraybuffer';
  const tm = setTimeout(() => { try { ws.close(); } catch (e) { /* */ } falha(new Error('A Google não respondeu a tempo.')); }, 6000);
  ws.onopen = () => ws.send(JSON.stringify({ setup }));
  ws.onmessage = async ev => { let m = null; try { m = JSON.parse(await textoDaMsg(ev.data)); } catch (e) { return; } if (m && m.setupComplete) { clearTimeout(tm); ws.onmessage = null; ws.onerror = null; ws.onclose = null; ok(ws); } };
  ws.onerror = () => { clearTimeout(tm); falha(new Error('A ligação ao Gemini falhou.')); };
  ws.onclose = ev => { clearTimeout(tm); falha(new Error(ev.reason || `A Google fechou a ligação (${ev.code}).`)); };
});
const pcmBase64 = i16 => { const b = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
// Tira o que o modelo às vezes junta sem ser fala: marcas de tempo, "(som de respiração)", "[música]" e frases repetidas em ciclo
const limparTranscricao = t => {
  let x = String(t || '')
    .replace(/\[?\(?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\s*(?:-->|→|–|-)\s*\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\)?\]?/g, ' ')
    .replace(/\b0{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\b/g, ' ')
    .replace(/[([](?:som|sons|música|musica|ruído|ruido|respiração|respiracao|risos?|silêncio|silencio|inaudível|inaudivel|sound|music|noise|breathing|laughs?|silence|inaudible)[^)\]]{0,40}[)\]]/gi, ' ')
    .replace(/\s{2,}/g, ' ').trim();
  const frases = x.match(/[^.!?…]+[.!?…]*/g) || [];
  const vistas = {}; const out = [];
  frases.forEach(f => { const k = f.trim().toLowerCase(); if (!k) return; vistas[k] = (vistas[k] || 0) + 1; if (vistas[k] <= 1 || k.length < 4) out.push(f.trim()); });
  return out.join(' ').replace(/\s{2,}/g, ' ').trim();
};
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
      // Linha vazia (ex.: item novo de lista): precisa de um <br>, senão o cursor salta para outro sítio
      if (pai && pai.nodeType === 1 && !pai.firstChild) { pai.appendChild(document.createElement('br')); r.setStart(pai, 0); r.collapse(true); }
      const s2 = window.getSelection(); s2.removeAllRanges();
      try { s2.addRange(r); } catch (e) { /* posição já não existe */ }
    }
  };
  const LISTAS = new Set(['insertUnorderedList', 'insertOrderedList', 'formatBlock']);
  const cmd = (c, v = null) => { prep(); const f = () => { try { document.execCommand(c, false, v); } catch (e) { /* comando não suportado */ } }; if (LISTAS.has(c)) comMarcador(f); else f(); avisar(); atualizarEstados(); };
  const atualizarEstados = () => {
    try {
      const bloco = (document.queryCommandValue('formatBlock') || '').toLowerCase();
      setEstados({ b: document.queryCommandState('bold'), i: document.queryCommandState('italic'), u: document.queryCommandState('underline'), s: document.queryCommandState('strikeThrough'), ul: document.queryCommandState('insertUnorderedList') && !dentroDe('ul[data-chk]'), ol: document.queryCommandState('insertOrderedList'), h1: bloco === 'h1', h2: bloco === 'h2', chk: !!dentroDe('ul[data-chk]'), q: bloco === 'blockquote', mark: !!dentroDe('mark'), cols: !!dentroDe('div[data-cols]') });
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
  // Duas colunas lado a lado (no telemóvel ficam uma por baixo da outra). Carregar outra vez, dentro delas, desfaz as colunas.
  const [menuCols, setMenuCols] = useState(null); // { x, y } — menu do botão das colunas
  useEffect(() => {
    if (!menuCols) return undefined;
    const fechar = e => { if (!(e.target.closest && e.target.closest('[data-menu-cols]'))) setMenuCols(null); };
    const esc = e => { if (e.key === 'Escape') setMenuCols(null); };
    document.addEventListener('mousedown', fechar); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fechar); document.removeEventListener('keydown', esc); };
  }, [menuCols]);
  const cursorNoFim = no => { const r = document.createRange(); r.selectNodeContents(no); r.collapse(false); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); };
  const colunaVazia = () => { const c = document.createElement('div'); c.setAttribute('data-col', '1'); c.innerHTML = '<div><br></div>'; return c; };
  // n = 2 ou 3 colunas lado a lado (no telemóvel ficam umas por baixo das outras); n = 0 tira as colunas
  const colunas = n => {
    setMenuCols(null);
    prep();
    const el = ref.current; if (!el) return;
    const atual = dentroDe('div[data-cols]');
    if (atual) {
      const cols = Array.from(atual.children);
      if (!n) {
        const partes = []; cols.forEach(c => partes.push(...Array.from(c.childNodes)));
        const ultimo = partes[partes.length - 1];
        atual.replaceWith(...partes);
        if (ultimo) cursorNoFim(ultimo);
      } else if (n > cols.length) {
        for (let i = cols.length; i < n; i++) atual.appendChild(colunaVazia());
        atual.setAttribute('data-cols', String(n));
        const nova = atual.lastChild.firstChild; const r = document.createRange(); r.setStart(nova, 0); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      } else if (n < cols.length) {
        // O texto das colunas a mais passa para a última que fica (nada se perde)
        const fica = cols[n - 1];
        cols.slice(n).forEach(c => { if (c.textContent.trim() || c.querySelector('img,span.ntag,hr')) fica.append(...Array.from(c.childNodes)); c.remove(); });
        atual.setAttribute('data-cols', String(n));
        cursorNoFim(fica);
      }
      avisar(); atualizarEstados(); return;
    }
    if (!n) return;
    // O bloco de topo onde está o cursor
    const s = window.getSelection();
    let no = s && s.rangeCount ? s.getRangeAt(0).startContainer : null;
    while (no && no.parentNode !== el) no = no.parentNode;
    const novo = document.createElement('div'); novo.setAttribute('data-cols', String(n));
    for (let i = 0; i < n; i++) novo.appendChild(colunaVazia());
    const vazio = no && no.nodeType === 1 && !no.textContent.trim() && !no.querySelector('img,span.ntag') && !/^(UL|OL)$/.test(no.tagName);
    if (!no) el.appendChild(novo);
    else if (vazio) no.replaceWith(novo);
    else no.after(novo);
    if (!novo.nextSibling) { const p = document.createElement('div'); p.innerHTML = '<br>'; novo.after(p); }
    const r = document.createRange(); r.setStart(novo.querySelector('div[data-col] > div'), 0); r.collapse(true);
    s.removeAllRanges(); s.addRange(r);
    avisar(); atualizarEstados();
  };
  const nColunas = () => { const b = dentroDe('div[data-cols]'); return b ? b.children.length : 0; };
  // ── Semana: uma caixa com as datas da semana e uma checklist para o que há a fazer.
  // A semana em curso fica marcada "Esta semana" (pelo estilo, não fica escrito, por isso nunca fica errado).
  // Se a página já tiver esta semana, faz a seguinte.
  const novaSemana = () => {
    setMenuCols(null);
    prep();
    const el = ref.current; if (!el) return;
    const seg = segundaDe(new Date());
    while (el.querySelector(`div[data-semana="${isoDia(seg)}"]`)) seg.setDate(seg.getDate() + 7);
    const dom = new Date(seg); dom.setDate(seg.getDate() + 6);
    const ano = dom.getFullYear() !== new Date().getFullYear() ? ` de ${dom.getFullYear()}` : '';
    const titulo = seg.getMonth() === dom.getMonth()
      ? `Semana de ${seg.getDate()} a ${dom.getDate()} de ${MESES[seg.getMonth()]}${ano}`
      : `Semana de ${seg.getDate()} de ${MESES[seg.getMonth()]} a ${dom.getDate()} de ${MESES[dom.getMonth()]}${ano}`;
    const caixa = document.createElement('div'); caixa.setAttribute('data-semana', isoDia(seg));
    caixa.innerHTML = `<h3>${escHtml(titulo)}</h3><ul data-chk="1"><li data-ok="0"><br></li></ul>`;
    // Entra a seguir ao bloco de topo onde está o cursor (uma linha vazia é substituída)
    const s = window.getSelection();
    let no = s && s.rangeCount ? s.getRangeAt(0).startContainer : null;
    while (no && no.parentNode !== el) no = no.parentNode;
    const vazio = no && no.nodeType === 1 && !no.textContent.trim() && !no.querySelector('img,span.ntag') && !/^(UL|OL|HR)$/.test(no.tagName) && !no.hasAttribute('data-semana');
    if (!no) el.appendChild(caixa);
    else if (vazio) no.replaceWith(caixa);
    else no.after(caixa);
    if (!caixa.nextSibling) { const p = document.createElement('div'); p.innerHTML = '<br>'; caixa.after(p); }
    const li = caixa.querySelector('li');
    const r = document.createRange(); r.setStart(li, 0); r.collapse(true); s.removeAllRanges(); s.addRange(r);
    if (li.scrollIntoView) li.scrollIntoView({ block: 'nearest' });
    avisar(); atualizarEstados();
  };
  // Mantém as colunas inteiras: cada coluna tem sempre um parágrafo; um bloco com menos de 2 colunas volta a texto normal
  const arrumarColunas = () => {
    const el = ref.current; if (!el) return;
    el.querySelectorAll('div[data-cols]').forEach(b => {
      const cols = Array.from(b.children).filter(c => c.hasAttribute && c.hasAttribute('data-col'));
      if (cols.length < 2) { const partes = []; Array.from(b.childNodes).forEach(c => (c.nodeType === 1 && c.hasAttribute('data-col') ? partes.push(...Array.from(c.childNodes)) : partes.push(c))); b.replaceWith(...partes); return; }
      cols.forEach(c => {
        const soltos = Array.from(c.childNodes).filter(x => x.nodeType === 3 ? x.textContent.length > 0 : /^(BR|B|STRONG|I|EM|U|S|STRIKE|DEL|A|SPAN|MARK|CODE|IMG)$/.test(x.tagName));
        if (!soltos.length && c.firstElementChild) return;
        const s = window.getSelection(); const r0 = s && s.rangeCount ? s.getRangeAt(0) : null;
        const guardado = r0 && soltos.includes(r0.startContainer) ? [r0.startContainer, r0.startOffset] : null;
        const p = document.createElement('div');
        if (!c.firstChild) p.innerHTML = '<br>';
        else { c.insertBefore(p, soltos[0] || null); soltos.forEach(x => p.appendChild(x)); }
        if (!p.parentNode) c.appendChild(p);
        if (guardado) { try { const r = document.createRange(); r.setStart(guardado[0], guardado[1]); r.collapse(true); s.removeAllRanges(); s.addRange(r); } catch (e) { /* sem cursor */ } }
      });
      if (!b.nextSibling) { const p = document.createElement('div'); p.innerHTML = '<br>'; b.after(p); }
    });
    el.querySelectorAll('div[data-semana]').forEach(b => {
      if (!b.firstElementChild && !b.textContent) b.innerHTML = '<div><br></div>';
      if (!b.nextSibling) { const p = document.createElement('div'); p.innerHTML = '<br>'; b.after(p); }
    });
  };
  // Link: pede o endereço numa caixa da app (em vez da janela do browser)
  const [pedirLink, setPedirLink] = useState(null); // { guardada, temTexto }
  const juntarLink = () => {
    prep();
    const s = window.getSelection(); const temTexto = !!(s && !s.isCollapsed);
    setPedirLink({ guardada: ultimaSel.current, temTexto });
  };
  const aplicarLink = url => {
    const pl = pedirLink; setPedirLink(null);
    url = String(url || '').trim();
    if (!url || !pl) return;
    const guardada = pl.guardada; const temTexto = pl.temTexto;
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
  // ── Ditado por voz (Chrome / Edge / Android): o texto entra onde está o cursor ──
  // Comandos: "vírgula", "ponto final", "ponto de interrogação", "dois pontos", "nova linha"… (em inglês: "comma", "full stop", "new line"…)
  const [ditar, setDitar] = useState(null); // { lingua, provisorio }
  const recRef = useRef(null);
  const ditarRef = useRef(false);
  const ultimoDitado = useRef(0);
  const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const pontuar = (txt, pt) => {
    let s = ' ' + String(txt || '') + ' ';
    const regras = pt
      ? [[/\s+ponto e v[íi]rgula(?=\s)/gi, ';'], [/\s+v[íi]rgula(?=\s)/gi, ','], [/\s+ponto final(?=\s)/gi, '.'], [/\s+ponto de interroga[çc][ãa]o(?=\s)/gi, '?'], [/\s+ponto de exclama[çc][ãa]o(?=\s)/gi, '!'], [/\s+dois pontos(?=\s)/gi, ':'], [/\s+reticências(?=\s)/gi, '…']]
      : [[/\s+semicolon(?=\s)/gi, ';'], [/\s+comma(?=\s)/gi, ','], [/\s+(?:full stop|period)(?=\s)/gi, '.'], [/\s+question mark(?=\s)/gi, '?'], [/\s+exclamation (?:mark|point)(?=\s)/gi, '!'], [/\s+colon(?=\s)/gi, ':']];
    regras.forEach(([re, sinal]) => { s = s.replace(re, sinal); });
    // Depois de . ? ! a palavra seguinte começa com maiúscula
    return s.replace(/([.?!…])\s+(\p{L})/gu, (m, a, b) => `${a} ${b.toUpperCase()}`).replace(/\s+/g, ' ').trim();
  };
  const antesDoCursor = () => {
    const s = window.getSelection(); const el = ref.current;
    if (!s || !s.rangeCount || !el) return '';
    const r = s.getRangeAt(0); let n = r.startContainer; if (n.nodeType === 3) n = n.parentNode;
    const blocoEl = n && n.closest ? n.closest('p,div,li,h1,h2,h3,blockquote') : null;
    const b = blocoEl && el.contains(blocoEl) ? blocoEl : el;
    try { const x = document.createRange(); x.setStart(b, 0); x.setEnd(r.startContainer, r.startOffset); return x.toString().slice(-6); } catch (e) { return ''; }
  };
  const inserirDitado = (txt, lingua) => {
    const pt = String(lingua).startsWith('pt');
    prep();
    const partes = String(txt || '').split(pt ? /\s*\b(?:nova linha|novo par[áa]grafo)\b\s*/i : /\s*\b(?:new line|new paragraph)\b\s*/i);
    partes.forEach((p, i) => {
      if (i > 0) { try { document.execCommand('insertParagraph'); } catch (e) { /* */ } }
      let s = pontuar(p, pt);
      if (!s) return;
      const antes = antesDoCursor();
      if (!antes.trim() || /[.!?…]\s*$/.test(antes)) s = s.charAt(0).toUpperCase() + s.slice(1);
      if (antes && !/[\s ]$/.test(antes) && !/^[,.;:!?…]/.test(s)) s = ' ' + s;
      document.execCommand('insertText', false, s);
    });
    avisar();
  };
  // Medidor do microfone: mostra se está mesmo a entrar som (separa "o microfone não funciona" de "o reconhecimento não responde")
  const micRef = useRef(null); // { stream, ctx, raf }
  const barraRef = useRef(null);
  const ouviuSom = useRef(0);
  const pararMedidor = () => { const m = micRef.current; micRef.current = null; if (!m) return; try { cancelAnimationFrame(m.raf); } catch (e) { /* */ } try { m.stream.getTracks().forEach(t => t.stop()); } catch (e) { /* */ } try { m.ctx.close(); } catch (e) { /* */ } };
  const ligarMedidor = () => {
    if (micRef.current || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      if (!ditarRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ctx = new AC(); const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize); const m = { stream, ctx, raf: 0 }; micRef.current = m;
      const passo = () => {
        an.getByteTimeDomainData(buf); let pico = 0; for (let i = 0; i < buf.length; i++) pico = Math.max(pico, Math.abs(buf[i] - 128));
        const nv = Math.min(1, pico / 60); if (nv > 0.15) ouviuSom.current = Date.now();
        if (barraRef.current) barraRef.current.style.width = `${Math.round(nv * 100)}%`;
        m.raf = requestAnimationFrame(passo);
      };
      passo();
    }).catch(err => {
      // Sem medidor não faz mal (o reconhecimento avisa se não houver microfone); só pára se o browser recusou o microfone
      if (err && err.name === 'NotAllowedError') { if (showToast) showToast('O browser não deixou usar o microfone. Carrega no cadeado ao lado do endereço › Microfone › Permitir, e recarrega a página.', 'error'); pararDitado(); }
    });
  };
  // Motor do ditado: 'browser' (reconhecimento do Chrome/Edge, ao vivo) ou 'app' (grava e o servidor da app transcreve)
  const motorDitado = () => { let m = ''; try { m = localStorage.getItem('notas-ditado-motor') || ''; } catch (e) { /* */ } return m === 'app' || m === 'browser' ? (m === 'browser' && !SR ? 'app' : m) : (SR ? 'browser' : 'app'); };
  const gravRef = useRef(null);
  const avisouErroApp = useRef(0);
  const enviarPedaco = (g, lingua) => {
    if (!g.amostras) return;
    const wav = paraWav(g.partes, g.amostras, g.taxa);
    g.partes = []; g.amostras = 0; g.falou = false; g.silencio = 0;
    setDitar(d => (d ? { ...d, pendentes: (d.pendentes || 0) + 1 } : d));
    const pedido = transcreverAudio(wav, lingua);
    g.fila = g.fila.then(async () => {
      try { const txt = await pedido; if (txt) { ultimoDitado.current = Date.now(); inserirDitado(txt, lingua); } setDitar(d => (d ? { ...d, provisorio: '' } : d)); }
      catch (e) { if (Date.now() - avisouErroApp.current > 8000) { avisouErroApp.current = Date.now(); if (showToast) showToast(e.message, 'error'); } if (e.status === 0 || e.status === 404 || e.status === 401 || e.status === 403) pararDitado(); }
      finally { setDitar(d => (d ? { ...d, pendentes: Math.max(0, (d.pendentes || 1) - 1) } : d)); }
    });
  };
  // Texto provisório do ditado ao vivo, escrito já na nota (em cinzento), no sítio do cursor; a frase final substitui-o
  const provRef = useRef(null);
  const mostrarProvisorio = txt => {
    const el = ref.current; if (!el) return;
    let sp = provRef.current;
    if (!sp || !el.contains(sp)) {
      prep();
      const s0 = window.getSelection(); if (!s0 || !s0.rangeCount) return;
      const r = s0.getRangeAt(0); if (!el.contains(r.startContainer)) return;
      r.collapse(false);
      sp = document.createElement('span'); sp.setAttribute('data-prov', '1'); sp.setAttribute('contenteditable', 'false');
      r.insertNode(sp);
      const depois = document.createRange(); depois.setStartBefore(sp); depois.collapse(true); s0.removeAllRanges(); s0.addRange(depois);
      provRef.current = sp;
    }
    const antes = sp.previousSibling ? String(sp.previousSibling.textContent || '') : '';
    sp.textContent = (antes && !/[\s\u00a0]$/.test(antes) ? ' ' : '') + txt;
  };
  const tirarProvisorio = () => {
    const sp = provRef.current; provRef.current = null;
    if (!sp || !sp.parentNode) return;
    const r = document.createRange(); r.setStartBefore(sp); r.collapse(true);
    sp.remove();
    const s0 = window.getSelection(); if (s0) { s0.removeAllRanges(); s0.addRange(r); }
  };
  const pararGravacao = (enviarResto, lingua) => {
    const g = gravRef.current; gravRef.current = null; if (!g) return;
    try { g.proc.onaudioprocess = null; g.proc.disconnect(); } catch (e) { /* */ }
    if (g.ws) { // ao vivo: avisa que acabou, espera pelas últimas palavras e fecha
      const ws = g.ws; ws.onclose = null;
      try { if (ws.readyState === 1) ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })); } catch (e) { /* */ }
      setTimeout(() => { try { ws.close(); } catch (e) { /* */ } tirarProvisorio(); }, enviarResto ? 2500 : 0);
    }
    if (enviarResto && g.falou && g.amostras / g.taxa > 0.4) enviarPedaco(g, lingua);
    try { g.stream.getTracks().forEach(t => t.stop()); } catch (e) { /* */ } try { g.ctx.close(); } catch (e) { /* */ }
  };
  // Ao vivo: o texto aparece enquanto falas (provisório na barra) e entra na nota no fim de cada frase
  const comecarVivo = async lingua => {
    let st;
    try {
      st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      if (showToast) showToast(err && err.name === 'NotAllowedError' ? 'O browser não deixou usar o microfone. Carrega no cadeado ao lado do endereço › Microfone › Permitir.' : 'Não consegui abrir o microfone (está a ser usado por outra app, ou o Windows está a bloqueá-lo em Definições › Privacidade › Microfone).', 'error');
      pararDitado(); return;
    }
    if (!ditarRef.current) { st.getTracks().forEach(t => t.stop()); return; }
    let ws = null, tk = null, erro = null;
    try {
      tk = await pedirTokenVoz(lingua);
      for (const url of WS_VIVO) { try { ws = await ligarVivo(url, tk.token, tk.setup); break; } catch (e) { erro = e; } }
    } catch (e) { erro = e; }
    if (!ditarRef.current) { st.getTracks().forEach(t => t.stop()); try { if (ws) ws.close(); } catch (e) { /* */ } return; }
    if (!ws) {
      st.getTracks().forEach(t => t.stop());
      if (showToast) showToast(`O ditado ao vivo não arrancou (${(erro && erro.message) || 'erro'}). Passei para o ditado às frases.`, 'info');
      setDitar(d => (d ? { ...d, motor: 'app', aoVivo: false } : d));
      comecarGravacao(lingua); return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC(); const src = ctx.createMediaStreamSource(st);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    src.connect(proc); proc.connect(ctx.destination);
    const g = { stream: st, ctx, proc, ws, taxa: ctx.sampleRate, buf: [], nbuf: 0, vivo: true, lingua, aberta: Date.now() };
    ws.onmessage = async ev => {
      let m = null; try { m = JSON.parse(await textoDaMsg(ev.data)); } catch (e) { return; }
      const sc = m && m.serverContent; if (!sc) return;
      if (sc.interimInputTranscription && sc.interimInputTranscription.text) { ultimoDitado.current = Date.now(); const t = sc.interimInputTranscription.text; mostrarProvisorio(t); setDitar(d => (d ? { ...d, provisorio: t } : d)); }
      if (sc.inputTranscription && sc.inputTranscription.text) {
        const t = limparTranscricao(sc.inputTranscription.text);
        ultimoDitado.current = Date.now();
        tirarProvisorio();
        if (t) inserirDitado(t, lingua);
        setDitar(d => (d ? { ...d, provisorio: '' } : d));
      }
    };
    // As sessões da Google duram até 10 min: se fechar e ainda estiveres a ditar, volta a ligar sozinho
    ws.onclose = () => { if (gravRef.current === g && ditarRef.current) { pararGravacao(false); comecarVivo(lingua); } };
    proc.onaudioprocess = ev => {
      const d = ev.inputBuffer.getChannelData(0);
      let q = 0; for (let i = 0; i < d.length; i++) q += d[i] * d[i]; const rms = Math.sqrt(q / d.length);
      if (barraRef.current) barraRef.current.style.width = `${Math.min(100, Math.round(rms * 900))}%`;
      if (rms > 0.018) ouviuSom.current = Date.now();
      // 48 kHz → 16 kHz (média de cada janela) em PCM de 16 bits; manda de 0,1 em 0,1 s
      const r = g.taxa / 16000, m2 = Math.floor(d.length / r), pcm = new Int16Array(m2);
      for (let i = 0; i < m2; i++) { const a = Math.floor(i * r), b = Math.min(d.length, Math.floor((i + 1) * r)); let sm = 0; for (let k = a; k < b; k++) sm += d[k]; const v = Math.max(-1, Math.min(1, sm / Math.max(1, b - a))); pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
      g.buf.push(pcm); g.nbuf += pcm.length;
      if (g.nbuf >= 1600 && ws.readyState === 1) {
        const tudo = new Int16Array(g.nbuf); let o = 0; g.buf.forEach(x => { tudo.set(x, o); o += x.length; }); g.buf = []; g.nbuf = 0;
        try { ws.send(JSON.stringify({ realtimeInput: { audio: { data: pcmBase64(tudo), mimeType: 'audio/pcm;rate=16000' } } })); } catch (e) { /* ligação a fechar */ }
      }
    };
    gravRef.current = g;
    setDitar(d => (d ? { ...d, aoVivo: true } : d));
  };
  const comecarGravacao = lingua => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { if (showToast) showToast('Este browser não deixa usar o microfone.', 'error'); pararDitado(); return; }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(stream => {
      if (!ditarRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC(); const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      src.connect(proc); proc.connect(ctx.destination); // a saída fica em silêncio; é só para o Chrome chamar o onaudioprocess
      const g = { stream, ctx, proc, partes: [], amostras: 0, falou: false, silencio: 0, antes: null, taxa: ctx.sampleRate, fila: Promise.resolve() };
      proc.onaudioprocess = ev => {
        const d = ev.inputBuffer.getChannelData(0); const copia = new Float32Array(d);
        let q = 0; for (let i = 0; i < d.length; i++) q += d[i] * d[i]; const rms = Math.sqrt(q / d.length);
        if (barraRef.current) barraRef.current.style.width = `${Math.min(100, Math.round(rms * 900))}%`;
        const fala = rms > 0.018;
        if (fala) { ouviuSom.current = Date.now(); if (!g.falou && g.antes) { g.partes.push(g.antes); g.amostras += g.antes.length; } g.falou = true; g.silencio = 0; }
        else if (!g.silencio) g.silencio = Date.now();
        if (g.falou) { g.partes.push(copia); g.amostras += copia.length; } else g.antes = copia; // um bocadinho de antes, para não comer a 1.ª sílaba
        const dur = g.amostras / g.taxa;
        if (g.falou && ((g.silencio && Date.now() - g.silencio > 900 && dur > 0.8) || dur > 15)) { g.previaEm = 0; enviarPedaco(g, lingua); return; }
        // Texto "ao vivo": enquanto falas, de ~2 em 2 s manda o que já disseste nesta frase e mostra-o (provisório) na barra
        if (g.falou && dur > 1.5 && !g.previaAVer && Date.now() - (g.previaEm || 0) > 2000) {
          g.previaAVer = true; g.previaEm = Date.now();
          const n0 = g.amostras;
          transcreverAudio(paraWav(g.partes.slice(), g.amostras, g.taxa), lingua, true)
            .then(txt => { if (gravRef.current === g && g.amostras >= n0 && txt) setDitar(d => (d ? { ...d, provisorio: txt } : d)); })
            .catch(() => { /* a pré-visualização pode falhar; o texto final vai na mesma */ })
            .finally(() => { g.previaAVer = false; });
        }
      };
      gravRef.current = g;
    }).catch(err => {
      if (showToast) showToast(err && err.name === 'NotAllowedError' ? 'O browser não deixou usar o microfone. Carrega no cadeado ao lado do endereço › Microfone › Permitir.' : 'Não consegui abrir o microfone (está a ser usado por outra app, ou o Windows está a bloqueá-lo em Definições › Privacidade › Microfone).', 'error');
      pararDitado();
    });
  };
  const pararDitado = () => {
    const d = ditarRef.current; ditarRef.current = false;
    pararGravacao(true, (d && d.lingua) || linguaDitado());
    setDitar(null); pararMedidor(); const r = recRef.current; recRef.current = null; try { if (r) { r.onend = null; r.stop(); } } catch (e) { /* já parou */ }
  };
  const comecarDitado = (lingua, motorPedido) => {
    if (protegida) { if (showToast) showToast('Nas páginas protegidas o ditado fica desligado: o áudio passa pelos servidores da Google.', 'info'); return; }
    const motor = motorPedido || motorDitado();
    if (recRef.current) { try { recRef.current.onend = null; recRef.current.abort(); } catch (e) { /* */ } recRef.current = null; }
    pararGravacao(false); pararMedidor();
    try { localStorage.setItem('notas-ditado-lingua', lingua); if (motorPedido) localStorage.setItem('notas-ditado-motor', motorPedido); } catch (e) { /* sem armazenamento */ }
    if (motor === 'app' || !SR) {
      ditarRef.current = { lingua }; ultimoDitado.current = Date.now(); ouviuSom.current = 0;
      setDitar({ lingua, provisorio: '', inicio: Date.now(), motor: 'app', pendentes: 0, aoVivo: null });
      prep();
      comecarVivo(lingua);
      return;
    }
    const rec = new SR();
    rec.lang = lingua; rec.continuous = true; rec.interimResults = true;
    let arrancou = 0, falhasSeguidas = 0, temResultados = false;
    rec.onstart = () => { arrancou = Date.now(); };
    rec.onresult = ev => {
      temResultados = true; falhasSeguidas = 0; ultimoDitado.current = Date.now();
      let prov = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) { ultimoDitado.current = Date.now(); inserirDitado(r[0].transcript, lingua); } else prov += r[0].transcript;
      }
      setDitar(d => (d ? { ...d, provisorio: prov } : d));
    };
    rec.onerror = ev => {
      const e = ev.error;
      if (e === 'no-speech' || e === 'aborted') return; // silêncio: volta a ouvir sozinho
      if (e === 'network' || e === 'service-not-allowed') { if (showToast) showToast('O reconhecimento de voz deste browser não funciona aqui — passei para o ditado da app.', 'info'); comecarDitado(lingua, 'app'); return; }
      const msg = e === 'not-allowed' ? 'O browser não deixou usar o microfone. Carrega no cadeado ao lado do endereço › Microfone › Permitir, e recarrega a página.'
        : e === 'service-not-allowed' ? 'Este browser não deixa usar o reconhecimento de voz (acontece no Brave, Opera e Arc). Usa o Chrome ou o Edge.'
        : e === 'network' ? 'O reconhecimento de voz não chegou aos servidores (sem internet, VPN ou bloqueador de anúncios a bloquear?).'
        : e === 'audio-capture' ? 'Não encontrei nenhum microfone (ou o Windows está a bloqueá-lo: Definições › Privacidade › Microfone).'
        : e === 'language-not-supported' ? `O browser não reconhece a língua ${lingua}. Experimenta EN.`
        : `O ditado parou (${e || 'erro desconhecido'}).`;
      if (showToast) showToast(msg, 'error');
      pararDitado();
    };
    // O Chrome pára sozinho depois de uns segundos de silêncio: volta a ouvir até carregares em Parar (ou 1 minuto calado)
    rec.onend = () => {
      if (!ditarRef.current || recRef.current !== rec) return;
      if (Date.now() - ultimoDitado.current > 10000) { pararDitado(); if (showToast) showToast('Desliguei o microfone (10 s sem te ouvir falar).', 'info'); return; }
      // Se o reconhecimento arranca e pára logo, várias vezes seguidas, sem nunca ouvir nada: o serviço de voz não está a funcionar
      if (!temResultados && (!arrancou || Date.now() - arrancou < 1500)) falhasSeguidas++; else falhasSeguidas = 0;
      if (falhasSeguidas >= 3) { if (showToast) showToast('O reconhecimento de voz deste browser não está a responder — passei para o ditado da app.', 'info'); comecarDitado(lingua, 'app'); return; }
      arrancou = 0;
      try { rec.start(); } catch (e) { pararDitado(); }
    };
    recRef.current = rec; ditarRef.current = true; ultimoDitado.current = Date.now();
    try { localStorage.setItem('notas-ditado-lingua', lingua); } catch (e) { /* sem armazenamento */ }
    setDitar({ lingua, provisorio: '', inicio: Date.now(), motor: 'browser' });
    prep();
    ouviuSom.current = 0;
    ligarMedidor();
    try { rec.start(); } catch (e) { pararDitado(); }
  };
  const linguaDitado = () => { try { return localStorage.getItem('notas-ditado-lingua') || 'pt-PT'; } catch (e) { return 'pt-PT'; } };
  useEffect(() => () => { ditarRef.current = false; pararMedidor(); const r = recRef.current; recRef.current = null; try { if (r) r.abort(); } catch (e) { /* */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Há som a entrar mas, ao fim de uns segundos, ainda nenhuma palavra: avisa no próprio aviso do ditado
  const [semPalavras, setSemPalavras] = useState(false);
  useEffect(() => {
    if (!ditar) { setSemPalavras(false); return undefined; }
    const iv = setInterval(() => {
      const agora = Date.now(), ult = Math.max(ultimoDitado.current, ditar.inicio || 0);
      const vozRecente = agora - (ouviuSom.current || 0) < 2000;
      if (!ditar.pendentes && !ditar.provisorio && (agora - ult > (vozRecente ? 20000 : 10000))) { clearInterval(iv); pararDitado(); if (showToast) showToast(`Desliguei o microfone (${vozRecente ? '20 s com barulho, mas sem palavras' : '10 s sem te ouvir falar'}).`, 'info'); return; }
      const sp = ditar.motor !== 'app' && !!ouviuSom.current && !ditar.provisorio && Date.now() - ultimoDitado.current > 7000 && Date.now() - (ditar.inicio || 0) > 7000;
      if (sp) { clearInterval(iv); if (showToast) showToast('O reconhecimento de voz deste browser ouve mas não devolve palavras — passei para o ditado da app.', 'info'); comecarDitado(ditar.lingua, 'app'); return; }
      setSemPalavras(false);
    }, 1000);
    return () => clearInterval(iv);
  }, [ditar && ditar.inicio, ditar && ditar.provisorio, ditar && ditar.motor, ditar && ditar.pendentes]); // eslint-disable-line react-hooks/exhaustive-deps
  // Atalho "Nota por voz" (ícone da app no telemóvel): a página nova abre já a ouvir
  useEffect(() => { if (!DITAR_AO_ABRIR.sim) return undefined; DITAR_AO_ABRIR.sim = false; const tm = setTimeout(() => comecarDitado(linguaDitado()), 350); return () => clearTimeout(tm); }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
    // Troca o "@texto" pela etiqueta no próprio sítio (o insertHTML do Chrome às vezes punha-a numa linha nova)
    const r = document.createRange(); r.setStart(mencao.node, Math.max(0, mencao.ini)); r.setEnd(mencao.node, mencao.fim);
    r.deleteContents();
    const tmp = document.createElement('span'); tmp.innerHTML = tagHtml(e.t, e.id, e.nome);
    const tag = tmp.firstChild; const esp = document.createTextNode('\u00a0');
    r.insertNode(esp); r.insertNode(tag);
    const c = document.createRange(); c.setStart(esp, 1); c.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(c);
    setMencao(null); avisar();
  };
  const tecla = e => {
    // Ctrl+A dentro de uma coluna: seleciona só essa coluna (carregar outra vez seleciona a página toda)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 'a') {
      const col = dentroDe('div[data-col], div[data-semana]');
      if (col) {
        const s0 = window.getSelection();
        const r0 = s0 && s0.rangeCount ? s0.getRangeAt(0) : null;
        const tudo = document.createRange(); tudo.selectNodeContents(col);
        const jaTudo = r0 && !r0.collapsed && r0.compareBoundaryPoints(Range.START_TO_START, tudo) <= 0 && r0.compareBoundaryPoints(Range.END_TO_END, tudo) >= 0;
        if (!jaTudo) { e.preventDefault(); s0.removeAllRanges(); s0.addRange(tudo); return; }
      }
    }
    if (mencao && opcoes.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAtiva(a => (a + 1) % opcoes.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAtiva(a => (a - 1 + opcoes.length) % opcoes.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); escolher(opcoes[Math.min(ativa, opcoes.length - 1)]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMencao(null); return; }
    }
    if (e.key === 'Escape') e.stopPropagation();
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const s = window.getSelection();
      if (s && s.isCollapsed && s.rangeCount) {
        const r = s.getRangeAt(0); const n = r.startContainer, o = r.startOffset, tras = e.key === 'Backspace';
        let viz = null;
        if (n.nodeType === 3) { if (tras ? o === 0 : o === n.length) viz = tras ? n.previousSibling : n.nextSibling; }
        else viz = tras ? n.childNodes[o - 1] : n.childNodes[o];
        if (viz && viz.nodeType === 1 && viz.classList && viz.classList.contains('ntag')) { e.preventDefault(); viz.remove(); setTagMenu(null); avisar(); return; }
        const vazioAntes = (el) => { const ate = document.createRange(); ate.setStart(el, 0); ate.setEnd(r.startContainer, r.startOffset); return !ate.toString().replace(/​/g, '').length && !ate.cloneContents().querySelector('img,span.ntag,hr'); };
        const cursorEm = (no, fim) => { const c = document.createRange(); if (no.nodeType === 3) c.setStart(no, fim ? no.length : 0); else c.setStart(no, fim ? no.childNodes.length : 0); c.collapse(true); s.removeAllRanges(); s.addRange(c); };
        // Apagar no início de um ponto da lista: tira o ponto (fica uma linha normal) — não sobe para a linha de cima
        const li = tras ? dentroDe('li') : null;
        if (li && vazioAntes(li)) {
          e.preventDefault();
          const lista = li.parentElement;
          const paiLi = lista && lista.parentElement && lista.parentElement.tagName === 'LI' ? lista.parentElement : null;
          const depois = []; for (let x = li.nextSibling; x; x = x.nextSibling) depois.push(x);
          if (paiLi) {
            // ponto dentro de outro ponto: sobe um nível
            if (depois.length) { const sub2 = lista.cloneNode(false); depois.forEach(x => sub2.appendChild(x)); li.appendChild(sub2); }
            paiLi.after(li);
            if (!lista.querySelector('li')) lista.remove();
            li.removeAttribute('data-ok');
            cursorEm(li.firstChild || li, false);
          } else {
            const linha = document.createElement('div');
            while (li.firstChild) linha.appendChild(li.firstChild);
            if (!linha.childNodes.length) linha.appendChild(document.createElement('br'));
            lista.after(linha);
            if (depois.length) { const resto = lista.cloneNode(false); depois.forEach(x => resto.appendChild(x)); linha.after(resto); }
            li.remove();
            if (!lista.querySelector('li')) lista.remove();
            cursorEm(linha.firstChild && linha.firstChild.nodeName !== 'BR' ? linha.firstChild : linha, false);
          }
          avisar(); return;
        }
        // Apagar no início de uma linha cuja linha de cima tem uma etiqueta (@Pool…): junta as duas sem apagar a etiqueta
        if (tras) {
          let bl = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer;
          bl = bl && bl.closest ? bl.closest('div,p,h1,h2,h3,blockquote') : null;
          const ant = bl && ref.current && ref.current.contains(bl) && bl !== ref.current ? bl.previousElementSibling : null;
          if (ant && /^(DIV|P|H1|H2|H3|BLOCKQUOTE)$/.test(ant.tagName) && !ant.hasAttribute('data-cols') && !ant.hasAttribute('data-semana') && !ant.hasAttribute('data-col') && !bl.hasAttribute('data-col') && !bl.hasAttribute('data-semana') && ant.querySelector('span.ntag') && vazioAntes(bl)) {
            e.preventDefault();
            while (ant.lastChild && ant.lastChild.nodeName === 'BR') ant.lastChild.remove();
            const fimAnt = ant.lastChild;
            const vazio = !bl.textContent.replace(/​/g, '').trim() && !bl.querySelector('img,span.ntag,hr');
            if (!vazio) { while (bl.firstChild) { if (bl.firstChild.nodeName === 'BR' && !bl.firstChild.nextSibling) { bl.firstChild.remove(); break; } ant.appendChild(bl.firstChild); } }
            bl.remove();
            if (fimAnt) { const c = document.createRange(); c.setStartAfter(fimAnt); c.collapse(true); s.removeAllRanges(); s.addRange(c); } else cursorEm(ant, true);
            avisar(); return;
          }
        }
        // Não deixa juntar uma coluna à outra (apagar no início / fim de uma coluna, ou "puxar" a coluna para a linha de cima)
        const col = dentroDe('div[data-col], div[data-semana]');
        const vazioAte = (ini, fim) => { const ate = document.createRange(); ate.setStart(...ini); ate.setEnd(...fim); return !ate.toString().length && !ate.cloneContents().querySelector('img,span.ntag,hr'); };
        if (col) {
          let topo = r.startContainer; while (topo && topo.parentNode !== col) topo = topo.parentNode;
          if (tras && topo === col.firstChild && !dentroDe('li') && vazioAte([col, 0], [r.startContainer, r.startOffset])) { e.preventDefault(); return; }
          if (!tras && topo === col.lastChild && vazioAte([r.startContainer, r.startOffset], [col, col.childNodes.length])) { e.preventDefault(); return; }
        } else if (!tras && ref.current) {
          let topo = r.startContainer; while (topo && topo.parentNode !== ref.current) topo = topo.parentNode;
          const prox = topo && topo.nextSibling;
          if (prox && prox.nodeType === 1 && (prox.hasAttribute('data-cols') || prox.hasAttribute('data-semana')) && vazioAte([r.startContainer, r.startOffset], [topo, topo.nodeType === 3 ? topo.length : topo.childNodes.length])) { e.preventDefault(); return; }
        }
      }
    }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); juntarLink(); }
    if (e.key === 'Enter' && !e.shiftKey) {
      // Numa checklist, o item novo começa por marcar
      if (dentroDe('ul[data-chk]')) setTimeout(() => { const li = dentroDe('li'); if (li && li.parentElement && li.parentElement.hasAttribute('data-chk')) { li.setAttribute('data-ok', '0'); avisar(); } }, 0);
    }
  };
  const clique = e => {
    const tag = e.target.closest && e.target.closest('.ntag');
    if (tag) { const rc = tag.getBoundingClientRect(); setTagMenu({ el: tag, tipo: tag.getAttribute('data-tipo'), id: tag.getAttribute('data-id'), nome: tag.textContent.replace(/^@/, ''), x: rc.left, y: rc.bottom }); return; }
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
      {pedirLink && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[20vh] p-4" style={{ background: claro ? 'rgba(15,23,42,.25)' : 'rgba(0,0,0,.45)' }} onMouseDown={e => { if (e.target === e.currentTarget) setPedirLink(null); }}>
          <form onSubmit={e => { e.preventDefault(); aplicarLink(e.currentTarget.elements.url.value); }} className={`w-full max-w-sm rounded-2xl border p-4 shadow-2xl ${claro ? 'bg-white border-slate-200' : 'bg-slate-800 border-slate-700'}`}>
            <p className="text-sm font-semibold mb-2">{pedirLink.temTexto ? 'Pôr um link no texto escolhido' : 'Juntar um link'}</p>
            <input name="url" autoFocus placeholder="https://…" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setPedirLink(null); } }} className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 ${claro ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-600'}`} />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setPedirLink(null)} className={`px-3 py-1.5 text-sm rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-600 hover:bg-white/5'}`}>Cancelar</button>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white">Juntar</button>
            </div>
          </form>
        </div>
      )}
      <div className={`sticky top-0 z-20 -mx-4 sm:-mx-6 px-3 sm:px-5 py-1.5 border-b backdrop-blur ${claro ? 'bg-white/90 border-slate-200' : 'bg-slate-900/90 border-slate-700/70'}`}>
        <div className="flex items-center gap-0.5 overflow-x-auto notas-scroll">
          <BotaoFerr claro={claro} ic="desfazer" titulo="Desfazer" fn={() => cmd('undo')} />
          <BotaoFerr claro={claro} ic="refazer" titulo="Refazer" fn={() => cmd('redo')} />
          {sep}
          <BotaoFerr claro={claro} ic="micro" titulo={ditar ? 'Parar o ditado' : 'Ditar por voz'} on={!!ditar} fn={() => (ditar ? pararDitado() : comecarDitado(linguaDitado()))} />
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
          <span data-menu-cols="1" className="contents"><BotaoFerr claro={claro} ic="colunas" titulo="Colunas" on={estados.cols || !!menuCols} fn={e => { if (menuCols) { setMenuCols(null); return; } const rc = e.currentTarget.getBoundingClientRect(); setMenuCols({ x: rc.left, y: rc.bottom + 4, n: nColunas() }); }} /></span>
          <BotaoFerr claro={claro} ic="semana" titulo="Esta semana: grelha com os dias para as tarefas" fn={novaSemana} />
          <BotaoFerr claro={claro} ic="linha" titulo="Linha" fn={() => cmd('insertHorizontalRule')} />
          <BotaoFerr claro={claro} ic="limpar" titulo="Limpar formatação" fn={() => { cmd('removeFormat'); cmd('formatBlock', 'p'); }} />
          <input ref={fichRef} type="file" multiple className="hidden" onChange={e => { inserirFicheiros(e.target.files); e.target.value = ''; }} />
        </div>
        {ditar && (
          <div className={`mt-1.5 mb-0.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${claro ? 'bg-red-50 text-slate-700 ring-1 ring-red-200' : 'bg-red-500/10 text-slate-200 ring-1 ring-red-500/25'}`} role="status" aria-live="polite">
            <span className="relative flex w-2.5 h-2.5 shrink-0" aria-hidden="true"><span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" /><span className="relative w-2.5 h-2.5 rounded-full bg-red-500" /></span>
            <span className="shrink-0 font-medium">A ouvir…</span>
            <span className={`shrink-0 w-12 h-1.5 rounded-full overflow-hidden ${claro ? 'bg-slate-200' : 'bg-slate-700'}`} title="Nível do microfone"><span ref={barraRef} className="block h-full w-0 bg-emerald-500 transition-[width] duration-75" /></span>
            <span className={`flex-1 min-w-0 truncate italic ${semPalavras ? 'text-amber-500 not-italic' : claro ? 'text-slate-500' : 'text-slate-400'}`}>{(ditar.motor === 'app' && ditar.aoVivo && ditar.provisorio ? (ditar.lingua.startsWith('pt') ? 'A escrever na nota…' : 'Writing into the note…') : ditar.provisorio) || (ditar.motor === 'app' && ditar.aoVivo === null ? 'A ligar ao Gemini…' : ditar.motor === 'app' && ditar.aoVivo ? (ditar.lingua.startsWith('pt') ? 'Ao vivo — fala à vontade. Podes dizer "nova linha".' : 'Live — speak now. Say "new line".') : ditar.motor === 'app' && ditar.pendentes ? 'A escrever o que disseste…' : semPalavras ? 'O microfone está a ouvir, mas o reconhecimento de voz não está a devolver palavras.' : ditar.motor === 'app' ? (ditar.lingua.startsWith('pt') ? 'Fala à vontade — o texto aparece a cada pausa. Podes dizer "nova linha".' : 'Speak now — text appears at each pause. Say "new line".') : ditar.lingua.startsWith('pt') ? 'Fala à vontade. Diz "vírgula", "ponto final" ou "nova linha".' : 'Speak now. Say "comma", "full stop" or "new line".')}</span>
            {SR && (
              <span className={`shrink-0 inline-flex rounded-md overflow-hidden ring-1 ${claro ? 'ring-slate-300' : 'ring-slate-600'}`} role="group" aria-label="Motor do ditado">
                {[['browser', 'Browser', 'Reconhecimento do Chrome/Edge: ao vivo, mas só funciona no Chrome e no Edge'], ['app', 'App', 'A app grava e transcreve a cada pausa: funciona em qualquer browser ou app']].map(([m, txt, tt]) => (
                  <button key={m} type="button" title={tt} onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} onClick={() => { if ((ditar.motor || 'browser') !== m) comecarDitado(ditar.lingua, m); }} aria-pressed={(ditar.motor || 'browser') === m}
                    className={`px-1.5 py-0.5 text-[11px] font-semibold ${(ditar.motor || 'browser') === m ? 'bg-emerald-600 text-white' : claro ? 'bg-white text-slate-600 hover:bg-slate-100' : 'bg-slate-800 text-slate-300 hover:bg-white/10'}`}>{txt}</button>
                ))}
              </span>
            )}
            <span className={`shrink-0 inline-flex rounded-md overflow-hidden ring-1 ${claro ? 'ring-slate-300' : 'ring-slate-600'}`} role="group" aria-label="Língua do ditado">
              {[['pt-PT', 'PT'], ['en-US', 'EN']].map(([l, txt]) => (
                <button key={l} type="button" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} onClick={() => { if (ditar.lingua !== l) comecarDitado(l, ditar.motor); }} aria-pressed={ditar.lingua === l}
                  className={`px-1.5 py-0.5 text-[11px] font-semibold ${ditar.lingua === l ? 'bg-blue-600 text-white' : claro ? 'bg-white text-slate-600 hover:bg-slate-100' : 'bg-slate-800 text-slate-300 hover:bg-white/10'}`}>{txt}</button>
              ))}
            </span>
            <button type="button" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} onClick={pararDitado} className="shrink-0 px-2 py-0.5 rounded-md bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold">Parar</button>
          </div>
        )}
      </div>
      <style>{(() => { const esta = isoDia(segundaDe(new Date())); const prox = segundaDe(new Date()); prox.setDate(prox.getDate() + 7); return `.nota-ed div[data-semana="${esta}"]{border-color:rgba(96,165,250,.6)}.nota-ed div[data-semana="${esta}"]::before{content:'Esta semana';background:rgba(59,130,246,.15);color:${claro ? '#2563eb' : '#93c5fd'}}.nota-ed div[data-semana="${isoDia(prox)}"]::before{content:'Próxima semana';background:rgba(148,163,184,.15);color:${claro ? '#64748b' : '#94a3b8'}}`; })()}</style>
      <div ref={ref} className="nota-ed pt-4" contentEditable suppressContentEditableWarning data-ph={placeholder || 'Escreve aqui… usa @ para marcar um cliente, jogo ou tarefa'}
        spellCheck autoCorrect="on" autoCapitalize="sentences"
        onInput={() => { arrumarColunas(); avisar(); verMencao(); }} onKeyDown={tecla} onKeyUp={() => { atualizarEstados(); if (!mencao) verMencao(); }}
        onMouseUp={atualizarEstados} onClick={clique} onPaste={colar}
        onDragOver={e => { if (Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); }}
        onDrop={e => { if (e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); inserirFicheiros(e.dataTransfer.files); } }}
        onBlur={() => setTimeout(() => setMencao(null), 200)} />
      {menuCols && createPortal(
        <div data-menu-cols="1" className={`fixed z-[60] w-44 rounded-xl border shadow-2xl py-1 ${claro ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-800 border-slate-700 text-slate-100'}`} style={{ left: Math.min(menuCols.x, window.innerWidth - 188), top: menuCols.y }} role="menu">
          {[[2, '2 colunas'], [3, '3 colunas']].map(([n, txt]) => (
            <button key={n} type="button" role="menuitem" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} onClick={() => colunas(n)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${menuCols.n === n ? (claro ? 'text-blue-600' : 'text-blue-300') : ''} ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>
              <span className="inline-flex gap-0.5">{Array.from({ length: n }).map((_, i) => <span key={i} className="w-2 h-3.5 rounded-sm border border-current opacity-70" />)}</span>{txt}{menuCols.n === n ? ' ✓' : ''}
            </button>
          ))}
          {menuCols.n > 0 && (
            <button type="button" role="menuitem" onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} onClick={() => colunas(0)}
              className={`w-full px-3 py-2 text-sm text-left border-t ${claro ? 'border-slate-100 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/10'}`}>Tirar colunas</button>
          )}
        </div>, document.body)}
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
          <button type="button" onClick={() => { const t = tagMenu; setTagMenu(null); if (t.el && t.el.isConnected) { const txt = document.createTextNode(t.nome); t.el.replaceWith(txt); avisar(); } }} className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>
            <Ic n="editar" className="w-3.5 h-3.5" /> Passar a texto normal
          </button>
          <button type="button" onClick={() => { const t = tagMenu; setTagMenu(null); if (t.el && t.el.isConnected) { t.el.remove(); avisar(); } }} className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-red-400 ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>
            <Ic n="lixo" className="w-3.5 h-3.5" /> Tirar a etiqueta
          </button>
        </div>
      )}
    </div>
  );
};

// ── Uma página aberta: título, data, editor; grava sozinha ──
const PaginaAberta = ({ focar, onPlanearCompras, historicoCompras, meta, seccao, claro, sub, onVoltar, lerPagina, guardarPagina, mudarIndice, entidades, onIrEntidade, enviarImagem, chave, pedirDesbloquear, showToast, menuItens, onAtividade, ouvirPagina, partilhada, largo, onLargo }) => {
  const [conteudo, setConteudo] = useState(undefined); // undefined = a carregar; null = erro
  const [estado, setEstado] = useState('');
  const protegida = !!(seccao && seccao.protegida);
  const htmlRef = useRef(''); const timer = useRef(null); const sujo = useRef(false);
  const tituloRef = useRef(meta.titulo || '');
  const tituloMexido = useRef(false);
  const [versao, setVersao] = useState(0);
  const [senha, setSenha] = useState(null); // página de palavra-passe (cofre)
  const senhaRef = useRef(null);
  const ultimaTecla = useRef(0);
  const ultimoGravado = useRef(null);
  useEffect(() => {
    let vivo = true;
    setConteudo(undefined);
    (async () => {
      try {
        const d = await lerPagina(meta.id);
        let html = '';
        if (d && d.cifrado) {
          if (!chave) { if (vivo) setConteudo('__trancada'); return; }
          const obj = JSON.parse(await decifrar(chave, d.cifrado)) || {};
          if (meta.tituloC) { try { const t = await decifrar(chave, meta.tituloC); if (vivo && !sujo.current) tituloRef.current = t; } catch (e) { /* fica o que havia */ } }
          html = obj.html || '';
          if (obj.senha && vivo) { senhaRef.current = obj.senha; setSenha(obj.senha); }
        } else html = (d && d.html) || '';
        if (vivo) { htmlRef.current = limparHtml(html); ultimoGravado.current = limparHtml(html, { semBlob: true }); setConteudo(htmlRef.current); }
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
        await guardarPagina(meta.id, { cifrado: await cifrar(chave, JSON.stringify(senhaRef.current ? { html: '', senha: senhaRef.current } : { html })), editada: agora() });
        if (!tituloRef.current && meta.tituloC && !tituloMexido.current) { try { tituloRef.current = await decifrar(chave, meta.tituloC); } catch (e) { /* segue */ } }
        const tituloC = await cifrar(chave, tituloRef.current || '');
        mudarIndice(ix => ({ ...ix, paginas: ix.paginas.map(p => (p.id === meta.id ? { ...p, titulo: '', tituloC, txt: '', tags: [], editada: agora() } : p)) }));
      } else {
        ultimoGravado.current = html;
        await guardarPagina(meta.id, { html, editada: agora() });
        mudarIndice(ix => ({ ...ix, paginas: ix.paginas.map(p => (p.id === meta.id ? { ...p, titulo: tituloRef.current, txt: txt.slice(0, 600), tags: tagsDe(html), editada: agora(), ...(ehCompras(p, tituloRef.current) ? { itens: todosItens(html).slice(0, 80) } : {}) } : p)) }));
      }
      setEstado('Gravado');
    } catch (e) { console.error('Nota:', e); sujo.current = true; setEstado('Não consegui gravar — tento outra vez'); clearTimeout(timer.current); timer.current = setTimeout(gravar, 4000); }
  }, [meta.id, protegida, chave, guardarPagina, mudarIndice]);
  const agendar = () => { ultimaTecla.current = Date.now(); sujo.current = true; setEstado('…'); if (onAtividade) onAtividade(); clearTimeout(timer.current); timer.current = setTimeout(gravar, 800); };
  useEffect(() => () => { clearTimeout(timer.current); if (sujo.current) gravar(); }, [gravar]);
  // Caderno partilhado: o que a outra pessoa muda aparece aqui (se não estiveres a meio de escrever)
  useEffect(() => {
    if (!ouvirPagina || protegida) return undefined;
    const parar = ouvirPagina(meta.id, d => {
      if (!d || d.cifrado) return;
      const html = limparHtml(d.html || '', { semBlob: true });
      if (html === ultimoGravado.current || html === limparHtml(htmlRef.current, { semBlob: true })) return;
      if (sujo.current || Date.now() - ultimaTecla.current < 2500) return;
      ultimoGravado.current = html; htmlRef.current = html; setConteudo(html); setVersao(v => v + 1);
    });
    return () => { if (typeof parar === 'function') parar(); };
  }, [meta.id, ouvirPagina, protegida]); // eslint-disable-line react-hooks/exhaustive-deps
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
        <span className={`text-xs truncate ${sub}`}>{seccao ? seccao.nome : ''}{partilhada && <span className="inline-flex items-center gap-1 ml-2 text-emerald-500"><Ic n="pessoas" className="w-3.5 h-3.5" /> partilhada</span>}{protegida && <span className="inline-flex items-center gap-1 ml-2 text-amber-400"><Ic n="cadeado" className="w-3.5 h-3.5" /> protegida</span>}</span>
        <span className="flex-1" />
        {onPlanearCompras && !senha && typeof conteudo === 'string' && conteudo !== '__trancada' && ehCompras(meta, tituloRef.current) && /data-chk/.test(htmlRef.current || conteudo) && (
          <button type="button" onClick={() => { const l = itensDaLista(htmlRef.current || conteudo); if (!l.length) { if (showToast) showToast('Não há nada por comprar (tudo riscado).', 'error'); return; } onPlanearCompras(l, tituloRef.current || 'Lista'); }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-600 hover:bg-white/10'}`} title="Organizar por loja, com preços estimados e trocas mais saudáveis">✨ Planear compras</button>
        )}
        <span className={`text-xs ${sub}`} aria-live="polite">{estado}</span>
        <button type="button" onClick={() => mudarIndice(i => ({ ...i, paginas: i.paginas.map(x => (x.id === meta.id ? { ...x, fav: !x.fav } : x)) }))} aria-pressed={!!meta.fav}
          className={`w-8 h-8 inline-flex items-center justify-center rounded-lg ${meta.fav ? 'text-amber-400' : claro ? 'text-slate-400 hover:text-amber-500 hover:bg-slate-200/70' : 'text-slate-500 hover:text-amber-400 hover:bg-white/10'}`}
          title={meta.fav ? 'Tirar dos favoritos' : 'Pôr nos favoritos'} aria-label={meta.fav ? 'Tirar dos favoritos' : 'Pôr nos favoritos'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={meta.fav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>
        </button>
        {onLargo && (
          <button type="button" onClick={onLargo} aria-pressed={!!largo} title={largo ? 'Voltar a mostrar os cadernos' : 'Nota em ecrã largo (esconde os cadernos e a lista)'} aria-label={largo ? 'Voltar a mostrar os cadernos' : 'Nota em ecrã largo'}
            className={`w-8 h-8 inline-flex items-center justify-center rounded-lg ${largo ? 'text-blue-400' : ''} ${claro ? 'text-slate-500 hover:bg-slate-200/70' : 'text-slate-400 hover:bg-white/10'}`}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{largo ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}</svg>
          </button>
        )}
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
            <input key={meta.id + 't'} autoFocus={!!focar && !senha && !tituloRef.current} defaultValue={tituloRef.current || ''} placeholder={senha ? 'Nome (ex.: Gmail, Millennium, Wi-Fi de casa)' : 'Título'}
              onChange={e => { tituloRef.current = e.target.value; tituloMexido.current = true; agendar(); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const ed = e.currentTarget.parentElement.querySelector('.nota-ed'); if (ed) ed.focus(); } }}
              className={`w-full bg-transparent text-2xl sm:text-3xl font-semibold outline-none border-b pb-1 ${claro ? 'border-slate-200 placeholder-slate-300' : 'border-slate-700 placeholder-slate-600'}`} />
            <p className={`mt-1.5 text-xs ${sub}`}>{dataLonga(meta.criada)} · {horaTxt(meta.criada)}{meta.editada && meta.editada !== meta.criada ? ` · editada ${haQuanto(meta.editada)}` : ''}</p>
            {!senha && protegida && !textoDe(conteudo || '').trim() && (
              <button type="button" onClick={() => { const d0 = { tipo: 'login' }; senhaRef.current = d0; setSenha(d0); sujo.current = true; gravar(); mudarIndice(ix => ({ ...ix, paginas: ix.paginas.map(p => (p.id === meta.id ? { ...p, tipo: 'senha' } : p)) })); }}
                className="mt-3 inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-amber-400/50 text-amber-500 hover:bg-amber-400/10">
                <Ic n="cadeado" /> Usar o modelo de palavra-passe (utilizador, palavra-passe, 2FA…)
              </button>
            )}
            {senha ? (
              <CartaoSenha key={meta.id} inicial={senha} claro={claro} sub={sub} avisar={showToast} onMudar={v => { senhaRef.current = v; agendar(); }} />
            ) : (<>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.map(t => <button key={`${t.t}:${t.id}`} type="button" onClick={() => onIrEntidade && onIrEntidade(t.t, t.id)} className={`px-2 py-0.5 rounded-md text-xs ${claro ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/5 hover:bg-white/10 text-slate-300'}`}>@{t.n}</button>)}
              </div>
            )}
            <div className="px-4 sm:px-6 -mx-4 sm:-mx-6 mt-2">
              {historicoCompras && ehCompras(meta, tituloRef.current) && !protegida && (() => {
                const ja = new Set(todosItens(htmlRef.current || conteudo).map(normProduto));
                const sug = historicoCompras.filter(h => !ja.has(h.k)).slice(0, 16);
                if (!sug.length) return null;
                const juntar = nome => {
                  const d = new DOMParser().parseFromString(`<div>${htmlRef.current || ''}</div>`, 'text/html');
                  const raiz = d.body.firstChild;
                  let ul = raiz.querySelector('ul[data-chk]');
                  if (!ul) { ul = d.createElement('ul'); ul.setAttribute('data-chk', '1'); raiz.appendChild(ul); }
                  const vazio = Array.from(ul.children).find(li => !li.textContent.trim() && li.getAttribute('data-ok') !== '1');
                  const li = vazio || d.createElement('li');
                  li.textContent = nome; li.setAttribute('data-ok', '0');
                  if (!vazio) ul.appendChild(li);
                  htmlRef.current = raiz.innerHTML; setConteudo(htmlRef.current); setVersao(v => v + 1); agendar();
                };
                return (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={`text-xs ${sub}`}>Costumas comprar:</span>
                    {sug.map(h => <button key={h.k} type="button" onClick={() => juntar(h.nome)} title={`Em ${h.n} lista${h.n === 1 ? '' : 's'}`} className={`px-2 py-0.5 rounded-full text-xs border ${claro ? 'border-slate-200 hover:bg-emerald-50 hover:border-emerald-300' : 'border-slate-600 hover:bg-emerald-500/10 hover:border-emerald-500/50'}`}>+ {h.nome}</button>)}
                  </div>
                );
              })()}
              <Editor key={`${meta.id}:${versao}`} html={conteudo} claro={claro} entidades={protegida ? [] : entidades} onIrEntidade={onIrEntidade} protegida={protegida}
                onEnviarImagem={enviarImagem ? (nome, f) => enviarImagem(`notas/${meta.id}/${nome}`, f) : null} showToast={showToast}
                onMudar={h => { htmlRef.current = h; agendar(); }} />
            </div>
            </>)}
          </>
        )}
    </div>
  );
};

// ── Cofre: páginas de palavra-passe (só em secções protegidas; tudo cifrado neste dispositivo) ──
const TIPOS_SENHA = [
  { id: 'login', nome: 'Site / app', campos: [['url', 'Site', 'url'], ['utilizador', 'Utilizador / email'], ['senha', 'Palavra-passe', 'secreto']], dois: true },
  { id: 'banco', nome: 'Banco', campos: [['url', 'Site', 'url'], ['utilizador', 'Nº de adesão / utilizador'], ['senha', 'Código de acesso', 'secreto'], ['pin', 'PIN', 'secreto']], dois: true },
  { id: 'email', nome: 'Email', campos: [['utilizador', 'Email'], ['senha', 'Palavra-passe', 'secreto'], ['servidor', 'Servidor (IMAP / SMTP)']], dois: true },
  { id: 'cartao', nome: 'Cartão', campos: [['titular', 'Titular'], ['numero', 'Número', 'secreto'], ['validade', 'Validade (MM/AA)'], ['cvv', 'CVV', 'secreto'], ['pin', 'PIN', 'secreto']] },
  { id: 'wifi', nome: 'Wi-Fi', campos: [['rede', 'Nome da rede'], ['senha', 'Palavra-passe', 'secreto']] },
  { id: 'licenca', nome: 'Licença', campos: [['url', 'Site', 'url'], ['utilizador', 'Conta / email'], ['chave', 'Chave da licença', 'secreto']], dois: true },
  { id: 'outro', nome: 'Outro', campos: [['utilizador', 'Utilizador'], ['senha', 'Palavra-passe', 'secreto']], dois: true },
];
const b32 = s => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; const c = String(s || '').toUpperCase().replace(/[^A-Z2-7]/g, ''); let bits = ''; for (const ch of c) bits += A.indexOf(ch).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return new Uint8Array(out); };
// Código 2FA (TOTP, RFC 6238) — calculado aqui, sem enviar o segredo para lado nenhum
const codigoTotp = async (otp, quando = Date.now()) => {
  const chave = b32(otp.segredo); if (!chave.length || !TEM_CRIPTO) return null;
  const alg = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }[otp.algoritmo || 'SHA1'] || 'SHA-1';
  const k = await crypto.subtle.importKey('raw', chave, { name: 'HMAC', hash: alg }, false, ['sign']);
  let ct = Math.floor(quando / 1000 / (otp.periodo || 30)); const buf = new Uint8Array(8); for (let i = 7; i >= 0; i--) { buf[i] = ct & 0xff; ct = Math.floor(ct / 256); }
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, buf));
  const o = h[h.length - 1] & 0xf; const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  const dg = otp.digitos || 6; return String(n % 10 ** dg).padStart(dg, '0');
};
// Aceita a chave em texto ("JBSW Y3DP …") ou o link otpauth:// (o que está dentro do QR code)
const lerOtp = txt => {
  const t = String(txt || '').trim();
  if (/^otpauth:\/\//i.test(t)) {
    try {
      const u = new URL(t); const p = u.searchParams;
      const seg = (p.get('secret') || '').replace(/\s/g, '').replace(/=+$/, '');
      if (!seg) return null;
      return { segredo: seg.toUpperCase(), digitos: Number(p.get('digits')) || 6, periodo: Number(p.get('period')) || 30, algoritmo: (p.get('algorithm') || 'SHA1').toUpperCase(), emissor: p.get('issuer') || decodeURIComponent(u.pathname.replace(/^\/+/, '').split(':')[0] || '') };
    } catch (e) { return null; }
  }
  const seg = t.replace(/[\s-]/g, '').replace(/=+$/, '');
  return /^[A-Za-z2-7]{16,}$/.test(seg) ? { segredo: seg.toUpperCase(), digitos: 6, periodo: 30, algoritmo: 'SHA1' } : null;
};
const gerarSenha = (n = 20) => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_=+?'; const r = crypto.getRandomValues(new Uint32Array(n)); return Array.from(r, x => A[x % A.length]).join(''); };
let limparCopia = null;
const copiarSeguro = async (txt, avisar) => {
  let ok = false;
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(txt); ok = true; } } catch (e) { /* tenta o método antigo */ }
  if (!ok) { try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); ok = true; } catch (e) { /* sem acesso */ } }
  clearTimeout(limparCopia);
  limparCopia = setTimeout(() => { try { if (navigator.clipboard && document.hasFocus()) navigator.clipboard.writeText('').catch(() => {}); } catch (e) { /* sem acesso */ } }, 30000);
  if (avisar) avisar(ok ? 'Copiado — a área de transferência limpa-se dentro de 30 s' : 'Não consegui copiar', ok ? 'success' : 'error');
};
const CodigoTotp = ({ otp, claro, sub, avisar }) => {
  const [agora, setAgora] = useState(Date.now());
  const [cod, setCod] = useState(null);
  const periodo = otp.periodo || 30;
  const janela = Math.floor(agora / 1000 / periodo);
  useEffect(() => { const i = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(i); }, []);
  useEffect(() => { let vivo = true; codigoTotp(otp, agora).then(c => { if (vivo) setCod(c); }).catch(() => { if (vivo) setCod(null); }); return () => { vivo = false; }; }, [otp.segredo, otp.digitos, otp.algoritmo, periodo, janela]); // eslint-disable-line react-hooks/exhaustive-deps
  const resta = periodo - (Math.floor(agora / 1000) % periodo);
  const meio = cod ? Math.ceil(cod.length / 2) : 0;
  return (
    <button type="button" onClick={() => cod && copiarSeguro(cod, avisar)} className={`flex items-center gap-3 w-full rounded-xl border px-3 py-2.5 text-left ${claro ? 'border-slate-200 hover:bg-slate-50' : 'border-slate-700 hover:bg-white/5'}`} title="Copiar o código">
      <span className={`font-mono text-2xl tracking-widest tabular-nums ${resta <= 5 ? 'text-red-400' : claro ? 'text-blue-700' : 'text-blue-300'}`}>{cod ? `${cod.slice(0, meio)} ${cod.slice(meio)}` : '— — —'}</span>
      <span className="flex-1" />
      <span className="relative w-8 h-8 shrink-0" aria-label={`${resta} segundos`}>
        <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="3" /><circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${(resta / periodo) * 94.2} 94.2`} className={resta <= 5 ? 'text-red-400' : 'text-blue-500'} /></svg>
        <span className={`absolute inset-0 flex items-center justify-center text-[10px] tabular-nums ${sub}`}>{resta}</span>
      </span>
      <span className={`text-xs ${sub}`}>Copiar</span>
    </button>
  );
};
const CartaoSenha = ({ inicial, onMudar, claro, sub, avisar }) => {
  const [d, setD] = useState(() => ({ tipo: 'login', ...(inicial || {}) }));
  const [ver, setVer] = useState({});
  const [otpTxt, setOtpTxt] = useState('');
  const [otpErro, setOtpErro] = useState('');
  const qrRef = useRef(null);
  const set = patch => setD(prev => { const n = { ...prev, ...patch }; onMudar(n); return n; });
  const tipo = TIPOS_SENHA.find(t => t.id === d.tipo) || TIPOS_SENHA[0];
  const ic = `w-full min-w-0 rounded-lg border px-3 py-2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-blue-500 ${claro ? 'bg-white border-slate-300' : 'bg-slate-900/60 border-slate-600'}`;
  const bt = `shrink-0 h-9 px-2.5 rounded-lg border text-xs ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-700 hover:bg-white/5'}`;
  const semGuardar = { autoComplete: 'off', 'data-lpignore': 'true', 'data-1p-ignore': 'true', 'data-form-type': 'other', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off' };
  const campo = (k, rot, modo, valores = d, mudar = v => set({ [k]: v }), extraBotoes = null) => {
    const v = valores[k] || '';
    const secreto = modo === 'secreto';
    return (
      <div key={k} className="grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-1 sm:gap-3 items-center">
        <label className={`text-xs sm:text-sm ${sub}`}>{rot}</label>
        <div className="flex items-center gap-1.5 min-w-0">
          <input {...semGuardar} type={secreto && !ver[k] ? 'password' : 'text'} value={v} onChange={e => mudar(e.target.value)} className={`${ic} ${secreto ? 'font-mono' : ''}`} />
          {secreto && <button type="button" onClick={() => setVer(x => ({ ...x, [k]: !x[k] }))} className={bt} aria-label={ver[k] ? 'Esconder' : 'Mostrar'} title={ver[k] ? 'Esconder' : 'Mostrar'}>{ver[k] ? 'Esconder' : 'Ver'}</button>}
          {modo === 'url' && v && <a href={/^https?:\/\//i.test(v) ? v : `https://${v}`} target="_blank" rel="noopener noreferrer" className={`${bt} inline-flex items-center`} title="Abrir o site">↗</a>}
          {extraBotoes}
          {v && modo !== 'url' && <button type="button" onClick={() => copiarSeguro(v, avisar)} className={bt}>Copiar</button>}
        </div>
      </div>
    );
  };
  const juntarOtp = txt => {
    const o = lerOtp(txt);
    if (!o) { setOtpErro('Não reconheci. Cola a chave (letras e números, ex.: JBSW Y3DP EHPK 3PXP) ou o link otpauth://'); return; }
    setOtpErro(''); setOtpTxt(''); set({ otp: o });
  };
  const lerQr = async f => {
    try {
      if (!('BarcodeDetector' in window)) { setOtpErro('Este browser não lê QR codes de imagens. Usa a chave em texto (no site, "não consigo ler o código").'); return; }
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      const img = await createImageBitmap(f);
      const r = await det.detect(img);
      if (!r.length) { setOtpErro('Não encontrei nenhum QR code nessa imagem.'); return; }
      juntarOtp(r[0].rawValue);
    } catch (e) { setOtpErro('Não consegui ler a imagem.'); }
  };
  const extras = d.extras || [];
  return (
    <div className="space-y-4 mt-3">
      <div className="flex flex-wrap gap-1.5">
        {TIPOS_SENHA.map(t => <button key={t.id} type="button" onClick={() => set({ tipo: t.id })} className={`px-2.5 py-1 rounded-full text-xs border ${d.tipo === t.id ? 'border-blue-400 bg-blue-500/15 text-blue-500 font-medium' : claro ? 'border-slate-200 text-slate-600 hover:bg-slate-100' : 'border-slate-700 text-slate-300 hover:bg-white/5'}`}>{t.nome}</button>)}
      </div>
      <div className="space-y-2.5">
        {tipo.campos.map(([k, rot, modo]) => campo(k, rot, modo, d, v => set({ [k]: v }),
          k === 'senha' ? <button type="button" onClick={async () => { if (!d.senha || await confirmar('Trocar a palavra-passe por uma nova, gerada ao acaso?')) { set({ senha: gerarSenha() }); setVer(x => ({ ...x, senha: true })); } }} className={bt} title="Gerar uma palavra-passe forte">Gerar</button> : null))}
        {extras.map((x, i) => (
          <div key={x.id || i} className="grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-1 sm:gap-3 items-center">
            <input {...semGuardar} value={x.nome || ''} onChange={e => set({ extras: extras.map((y, j) => (j === i ? { ...y, nome: e.target.value } : y)) })} placeholder="Nome do campo" className={`${ic} !py-1.5 text-xs sm:text-sm`} />
            <div className="flex items-center gap-1.5 min-w-0">
              <input {...semGuardar} type={x.secreto && !ver['x' + i] ? 'password' : 'text'} value={x.valor || ''} onChange={e => set({ extras: extras.map((y, j) => (j === i ? { ...y, valor: e.target.value } : y)) })} className={`${ic} ${x.secreto ? 'font-mono' : ''}`} />
              <button type="button" onClick={() => (x.secreto ? setVer(v => ({ ...v, ['x' + i]: !v['x' + i] })) : set({ extras: extras.map((y, j) => (j === i ? { ...y, secreto: true } : y)) }))} className={bt} title={x.secreto ? 'Mostrar / esconder' : 'Tornar secreto'}>{x.secreto ? (ver['x' + i] ? 'Esconder' : 'Ver') : 'Secreto?'}</button>
              {x.valor && <button type="button" onClick={() => copiarSeguro(x.valor, avisar)} className={bt}>Copiar</button>}
              <button type="button" onClick={() => set({ extras: extras.filter((y, j) => j !== i) })} className={`${bt} text-red-400`} aria-label="Tirar o campo">✕</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => set({ extras: [...extras, { id: Math.random().toString(36).slice(2, 8), nome: '', valor: '', secreto: false }] })} className={`text-xs ${sub} hover:text-blue-400`}>+ Campo</button>
      </div>

      {tipo.dois && !d.otp && !d.recuperacao && !ver.dois && (
        <button type="button" onClick={() => setVer(x => ({ ...x, dois: true }))} className={`text-xs ${sub} hover:text-blue-400`}>+ Códigos 2FA deste site (opcional)</button>
      )}
      {tipo.dois && (d.otp || d.recuperacao || ver.dois) && (
        <div className={`rounded-xl border p-3 space-y-2.5 ${claro ? 'border-slate-200 bg-slate-50/60' : 'border-slate-700 bg-slate-900/30'}`}>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium flex-1">Códigos 2FA deste site</p>
            {d.otp && <button type="button" onClick={async () => { if (await confirmar('Tirar o 2FA desta página? (No site, o 2FA continua ligado.)')) set({ otp: null }); }} className="text-xs text-red-400 hover:text-red-300">Tirar</button>}
          </div>
          {d.otp ? (
            <>
              <CodigoTotp otp={d.otp} claro={claro} sub={sub} avisar={avisar} />
              <p className={`text-[11px] ${sub}`}>{d.otp.emissor ? `${d.otp.emissor} · ` : ''}{d.otp.digitos || 6} dígitos · muda a cada {d.otp.periodo || 30} s</p>
            </>
          ) : (
            <>
              <p className={`text-xs ${sub}`}>No site, ao ligar o 2FA, escolhe "não consigo ler o QR code" e cola aqui a chave que aparece. A app passa a mostrar os códigos de 6 dígitos.</p>
              <div className="flex items-center gap-1.5">
                <input {...semGuardar} value={otpTxt} onChange={e => setOtpTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); juntarOtp(otpTxt); } }} placeholder="Chave 2FA ou otpauth://…" className={`${ic} font-mono`} />
                <button type="button" onClick={() => juntarOtp(otpTxt)} disabled={!otpTxt.trim()} className={`${bt} disabled:opacity-40`}>Juntar</button>
                {typeof window !== 'undefined' && 'BarcodeDetector' in window && <button type="button" onClick={() => qrRef.current && qrRef.current.click()} className={bt} title="Ler o QR code de uma captura de ecrã">QR</button>}
                <input ref={qrRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) lerQr(f); }} />
              </div>
              {otpErro && <p className="text-xs text-red-400">{otpErro}</p>}
            </>
          )}
          <div className="space-y-1">
            <label className={`text-xs ${sub}`}>Códigos de recuperação</label>
            <textarea {...semGuardar} rows={d.recuperacao ? 4 : 2} value={d.recuperacao || ''} onChange={e => set({ recuperacao: e.target.value })} placeholder="Os códigos de uso único que o site te dá ao ligar o 2FA" className={`${ic} font-mono text-xs ${ver.rec || !d.recuperacao ? '' : 'blur-sm'}`} onFocus={() => setVer(x => ({ ...x, rec: true }))} onBlur={() => setVer(x => ({ ...x, rec: false }))} />
          </div>
        </div>
      )}

      {!d.notas && !ver.notas ? <button type="button" onClick={() => setVer(x => ({ ...x, notas: true }))} className={`block text-xs ${sub} hover:text-blue-400`}>+ Notas</button> : (
      <div className="space-y-1">
        <label className={`text-xs ${sub}`}>Notas</label>
        <textarea {...semGuardar} rows={3} value={d.notas || ''} onChange={e => set({ notas: e.target.value })} placeholder="Perguntas de segurança, quem tem acesso, etc." className={ic} />
      </div>)}
    </div>
  );
};

// Gerador de QR (modo byte, correção M, versões 1–9) — baseado no algoritmo de referência de Nayuki
const gerarQR = texto => {
  const dados = Array.from(new TextEncoder().encode(texto));
  const ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22], BLOCOS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5];
  const brutos = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
  const cap = v => Math.floor(brutos(v) / 8) - ECC[v] * BLOCOS[v];
  let ver = 1; while (ver <= 6 && 4 + 8 + dados.length * 8 > cap(ver) * 8) ver++;
  if (ver > 6) return null;
  const bits = [];
  const por = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  por(4, 4); por(dados.length, 8); dados.forEach(b => por(b, 8));
  const capBits = cap(ver) * 8;
  por(0, Math.min(4, capBits - bits.length)); por(0, (8 - bits.length % 8) % 8);
  for (let p = 0xEC; bits.length < capBits; p ^= 0xEC ^ 0x11) por(p, 8);
  const cw = []; for (let i = 0; i < bits.length; i += 8) cw.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // Reed-Solomon
  const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; };
  const divisor = g => { const r = Array(g).fill(0); r[g - 1] = 1; let root = 1; for (let i = 0; i < g; i++) { for (let j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = mul(root, 0x02); } return r; };
  const resto = (d, dv) => { const r = dv.map(() => 0); d.forEach(b => { const f = b ^ r.shift(); r.push(0); dv.forEach((c, i) => { r[i] ^= mul(c, f); }); }); return r; };
  const nb = BLOCOS[ver], ecl = ECC[ver], raw = Math.floor(brutos(ver) / 8);
  const curtos = nb - raw % nb, lenCurto = Math.floor(raw / nb);
  const dv = divisor(ecl); const blocos = [];
  for (let i = 0, k = 0; i < nb; i++) { const dat = cw.slice(k, k + lenCurto - ecl + (i < curtos ? 0 : 1)); k += dat.length; const e = resto(dat, dv); if (i < curtos) dat.push(0); blocos.push(dat.concat(e)); }
  const fin = []; for (let i = 0; i < blocos[0].length; i++) blocos.forEach((b, j) => { if (i !== lenCurto - ecl || j >= curtos) fin.push(b[i]); });
  // Matriz
  const n = ver * 4 + 17; const m = Array.from({ length: n }, () => Array(n).fill(false)); const fn = Array.from({ length: n }, () => Array(n).fill(false));
  const set = (x, y, v) => { m[y][x] = v; fn[y][x] = true; };
  for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < n && yy >= 0 && yy < n) set(xx, yy, d !== 2 && d !== 4); } };
  finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
  if (ver >= 2) { const p = 4 * ver + 10; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(p + dx, p + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
  const formato = mask => { const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const b = ((d << 10) | r) ^ 0x5412;
    const bit = i => ((b >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i)); set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i)); for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i)); set(8, n - 8, true); };
  formato(0);
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert; if (!fn[y][x] && i < fin.length * 8) { m[y][x] = ((fin[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; } } }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fn[y][x] && (x + y) % 2 === 0) m[y][x] = !m[y][x];
  formato(0);
  return m;
};
const QrSvg = ({ texto, tam = 180 }) => {
  const m = useMemo(() => gerarQR(texto), [texto]);
  if (!m) return null;
  const n = m.length, q = 3, t2 = n + q * 2;
  let d = ''; m.forEach((linha, y) => linha.forEach((v, x) => { if (v) d += `M${x + q} ${y + q}h1v1h-1z`; }));
  return <svg width={tam} height={tam} viewBox={`0 0 ${t2} ${t2}`} shapeRendering="crispEdges" className="rounded-lg bg-white" role="img" aria-label="Código QR"><rect width={t2} height={t2} fill="#fff" /><path d={d} fill="#000" /></svg>;
};
const novoSegredo = () => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; const b = crypto.getRandomValues(new Uint8Array(20)); let bits = ''; b.forEach(x => { bits += x.toString(2).padStart(8, '0'); }); let s = ''; for (let i = 0; i + 5 <= bits.length; i += 5) s += A[parseInt(bits.slice(i, i + 5), 2)]; return s; };
const codigoValido = async (segredo, cod) => {
  const c = String(cod || '').replace(/\D/g, ''); if (c.length !== 6) return false;
  for (const d of [0, -1, 1]) { if (await codigoTotp({ segredo }, Date.now() + d * 30000) === c) return true; }
  return false;
};
// Ligar o 2FA do cofre: QR para a app de autenticação (Google Authenticator, Microsoft Authenticator…) + confirmação
const Ativar2FA = ({ claro, onConfirmar, onFechar }) => {
  const [seg] = useState(() => novoSegredo());
  const [cod, setCod] = useState(''); const [erro, setErro] = useState(''); const [aguarde, setAguarde] = useState(false);
  const uri = `otpauth://totp/Dashboard:Cofre?secret=${seg}&issuer=Dashboard`;
  useEffect(() => { const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); onFechar(); } }; window.addEventListener('keydown', esc, true); return () => window.removeEventListener('keydown', esc, true); }, [onFechar]);
  const confirmar = async e => { e.preventDefault(); setAguarde(true); setErro(''); if (!(await codigoValido(seg, cod))) { setAguarde(false); setErro('Código errado. Confirma que a hora do telemóvel está certa e tenta o código seguinte.'); return; } await onConfirmar(seg); setAguarde(false); };
  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-4 pt-[8vh] sm:pt-4 bg-black/55 animate-backdropIn" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <form onSubmit={confirmar} className={`w-full max-w-sm rounded-2xl border p-4 shadow-2xl animate-modalIn space-y-3 ${claro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'}`}>
        <p className="font-semibold">Ligar a verificação em 2 passos</p>
        <p className={`text-sm ${claro ? 'text-slate-600' : 'text-slate-300'}`}>1. Na app de autenticação do telemóvel (Google Authenticator, Microsoft Authenticator…), carrega em <b>+</b> e lê este código.</p>
        <div className="flex justify-center"><QrSvg texto={uri} tam={190} /></div>
        <p className={`text-xs ${claro ? 'text-slate-500' : 'text-slate-400'}`}>Não dá para ler? Escolhe "introduzir chave" e escreve: <code className="select-all break-all">{seg.replace(/(.{4})/g, '$1 ').trim()}</code></p>
        <p className={`text-sm ${claro ? 'text-slate-600' : 'text-slate-300'}`}>2. Escreve o código de 6 dígitos que aparece na app:</p>
        <input autoFocus value={cod} onChange={e => setCod(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" maxLength={7}
          className={`w-full rounded-lg border px-3 py-2 text-lg tracking-widest text-center font-mono outline-none focus:ring-2 focus:ring-blue-500 ${claro ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-600'}`} />
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onFechar} className={`px-3 py-2 text-sm rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>Cancelar</button>
          <button type="submit" disabled={aguarde} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60">{aguarde ? 'Um momento…' : 'Ligar'}</button>
        </div>
      </form>
    </div>
  );
};

// ── Importar palavras-passe (Notion .md / .csv / .zip): tudo lido e cifrado no próprio browser ──
const lerZip = async (buf, prefixo = '') => {
  const u8 = new Uint8Array(buf); const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let fimCd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) { if (dv.getUint32(i, true) === 0x06054b50) { fimCd = i; break; } }
  if (fimCd < 0) throw new Error('zip inválido');
  const n = dv.getUint16(fimCd + 10, true); let p = dv.getUint32(fimCd + 16, true);
  const dec = new TextDecoder(); const out = [];
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true), tamC = dv.getUint32(p + 20, true);
    const ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const nome = dec.decode(u8.subarray(p + 46, p + 46 + ln)); p += 46 + ln + le + lc;
    if (nome.endsWith('/')) continue;
    const ini = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const dados = u8.subarray(ini, ini + tamC);
    let bytes;
    if (metodo === 0) bytes = dados;
    else if (metodo === 8 && typeof DecompressionStream !== 'undefined') bytes = new Uint8Array(await new Response(new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else continue;
    if (/\.zip$/i.test(nome)) out.push(...await lerZip(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), prefixo + nome + '/'));
    else if (/\.(md|txt|csv)$/i.test(nome)) out.push({ nome: prefixo + nome, texto: dec.decode(bytes) });
  }
  return out;
};
const lerCsv = texto => {
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) { if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += ch; }
    else if (ch === '"') aspas = true;
    else if (ch === ',' || ch === ';') { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && texto[i + 1] === '\n') i++; linha.push(campo); campo = ''; if (linha.some(x => x.trim())) linhas.push(linha); linha = []; }
    else campo += ch;
  }
  linha.push(campo); if (linha.some(x => x.trim())) linhas.push(linha);
  return linhas;
};
const CHAVES_SENHA = [
  [/^(user ?name|user|utilizador|login|e-?mail|conta|account|nif|n[ºo]?\.? ?contribuinte|n[ºo]?\.? ?(de )?ades[aã]o|ades[aã]o|cliente|id|username\/email)$/i, 'utilizador'],
  [/^(pass ?word|pass|senha|palavra[- ]?passe|pwd|c[oó]digo( de acesso)?|access code)$/i, 'senha'],
  [/^(url|site|website|link|endere[cç]o|web|p[aá]gina)$/i, 'url'],
  [/^(pin|c[oó]digo pin)$/i, 'pin'],
  [/^(2fa|otp|totp|mfa|secret|segredo|authenticator|chave 2fa|2fa secret|2fa key)$/i, 'otp'],
  [/^(recovery( codes)?|backup codes|c[oó]digos de recupera[cç][aã]o|recupera[cç][aã]o)$/i, 'recuperacao'],
  [/^(notes?|notas?|obs|observa[cç][oõ]es|descri[cç][aã]o|description|coment[aá]rios?)$/i, 'notas'],
  [/^(tipo|type|categor(y|ia)|tags?)$/i, 'tipo'],
  [/^(name|nome|t[ií]tulo|title|servi[cç]o|service)$/i, 'titulo'],
  [/^(rede|ssid|network|wi-?fi)$/i, 'rede'],
  [/^(n[uú]mero|card number|n[uú]mero do cart[aã]o)$/i, 'numero'],
  [/^(cvv|cvc)$/i, 'cvv'],
  [/^(validade|expiry|expira|expiration)$/i, 'validade'],
  [/^(titular|cardholder)$/i, 'titular'],
  [/^(servidor|server|imap|smtp)$/i, 'servidor'],
  [/^(chave|license|licen[cç]a|serial|license key)$/i, 'chave'],
];
const limparMd = v => String(v || '').replace(/\[([^\]]*)\]\(([^)]+)\)/g, (m, txt, url) => (/^https?:/.test(url) ? url : txt)).replace(/[*_`]+/g, '').replace(/<\/?[^>]+>/g, '').trim();
const montarEntrada = (titulo, pares, soltas) => {
  const d = { tipo: 'login' }; const extras = []; let otp = null; const notas = [...soltas];
  let tipoTxt = '';
  pares.forEach(([k0, v0]) => {
    const k = limparMd(k0).replace(/:$/, '').trim(); const v = limparMd(v0);
    if (!v) return;
    const alvo = (CHAVES_SENHA.find(([re]) => re.test(k)) || [])[1];
    if (alvo === 'titulo') { if (!titulo) titulo = v; return; }
    if (alvo === 'tipo') { tipoTxt += ` ${v}`; return; }
    if (alvo === 'otp') { otp = lerOtp(v) || otp; if (!lerOtp(v)) extras.push({ nome: k, valor: v, secreto: true }); return; }
    if (alvo === 'notas') { notas.push(v); return; }
    if (alvo === 'recuperacao') { d.recuperacao = (d.recuperacao ? `${d.recuperacao}\n` : '') + v; return; }
    if (alvo && !d[alvo]) { d[alvo] = v; return; }
    extras.push({ nome: k, valor: v, secreto: /pass|senha|pin|c[oó]digo|code|secret|segredo|chave|key|cvv|token|seed|recupera|recovery/i.test(k) });
  });
  const t = `${tipoTxt} ${titulo}`.toLowerCase();
  if (d.numero || d.cvv || /cart[aã]o|card|visa|mastercard/.test(t)) d.tipo = 'cartao';
  else if (d.rede || /wi-?fi|router|internet/.test(t)) { d.tipo = 'wifi'; if (!d.rede && d.utilizador) { d.rede = d.utilizador; delete d.utilizador; } }
  else if (/banco|bank|millennium|cgd|caixa|santander|bpi|novo banco|activo|abanca|revolut|n26|montepio|crédito agr/.test(t)) d.tipo = 'banco';
  else if (d.chave || /licen[cç]a|license|serial/.test(t)) d.tipo = 'licenca';
  else if (d.servidor || /^(e-?mail|gmail|outlook|hotmail|webmail)/.test(String(titulo).toLowerCase())) d.tipo = 'email';
  if (otp) d.otp = otp;
  if (extras.length) d.extras = extras.map((x, i) => ({ id: `i${i}${Math.random().toString(36).slice(2, 6)}`, ...x }));
  if (notas.length) d.notas = notas.join('\n');
  return { titulo: titulo || 'Sem título', dados: d };
};
// Uma página do Notion pode ter uma conta (campos soltos) ou várias (cada uma debaixo de um título,
// de uma linha a negrito, de um item de lista ou numa tabela com várias colunas). Cada conta vira uma entrada.
const alvoDe = k => (CHAVES_SENHA.find(([re]) => re.test(limparMd(k).replace(/:$/, '').trim())) || [])[1];
const ALVOS_CONTA = new Set(['utilizador', 'senha', 'pin', 'numero', 'chave', 'otp', 'rede']);
const PAGINA_GENERICA = /^(passwords?|senhas?|palavras?[- ]passe|logins?|contas?|acessos?|credenciais|untitled|sem t[ií]tulo|cofre|vault)$/i;
const tokensMd = texto => {
  const out = []; let emCodigo = false;
  String(texto).split(/\r?\n/).forEach(l0 => {
    const l = l0.trim();
    if (l.startsWith('```')) { emCodigo = !emCodigo; return; }
    if (!l) return;
    if (emCodigo) { out.push({ tipo: 'txt', t: l }); return; }
    if (/^\|?\s*:?-{3,}/.test(l)) return;
    const h = /^(#{1,6})\s+(.+)$/.exec(l);
    if (h) { out.push({ tipo: 'h', nivel: h[1].length, t: limparMd(h[2]).replace(/:$/, '') }); return; }
    const tab = /^\|(.+)\|$/.exec(l);
    if (tab) { out.push({ tipo: 'tab', c: tab[1].split('|').map(x => x.trim()) }); return; }
    const semLista = l.replace(/^(?:[-*+]|\d+\.)\s+(\[[ x]\]\s+)?/, '');
    const neg = /^\*\*([^*]{1,60})\*\*:?$/.exec(semLista);
    if (neg) { out.push({ tipo: 'h', nivel: 9, t: limparMd(neg[1]).replace(/:$/, '') }); return; }
    const m = /^(\*\*)?([^:]{1,40}?)(\*\*)?\s*:\s*(.*)$/.exec(semLista);
    if (m && !/^https?$/i.test(m[2].trim()) && !/^\s*\/\//.test(m[4])) {
      const v = limparMd(m[4]);
      out.push(v ? { tipo: 'par', k: m[2], v: m[4] } : { tipo: 'kvazio', k: limparMd(m[2]) });
      return;
    }
    const d = /^(.{1,30}?)\s+[-–=]\s+(.+)$/.exec(semLista);
    if (d && alvoDe(d[1])) { out.push({ tipo: 'par', k: d[1], v: d[2] }); return; }
    out.push({ tipo: 'txt', t: limparMd(semLista), lista: semLista !== l });
  });
  return out;
};
const entradasDaTabela = (linhas, origem) => {
  if (linhas.length < 2) return null;
  const cab = linhas[0];
  const conhecidas = cab.filter(k => alvoDe(k)).length;
  if (cab.length < 3 && conhecidas < 2) return null; // tabela de 2 colunas "campo | valor"
  const iT = cab.findIndex(k => alvoDe(k) === 'titulo');
  const iTit = iT >= 0 ? iT : 0;
  return linhas.slice(1).map(r => ({ ...montarEntrada(limparMd(r[iTit]), cab.map((k, i) => [k, r[i] || '']).filter((x, i) => i !== iTit), []), origem }));
};
const entradasDoMd = (nome, texto) => {
  const origem = String(nome).split('/').pop();
  const base = origem.replace(/\.(md|txt)$/i, '').replace(/\s+[0-9a-f]{32}$/i, '').replace(/\s+[0-9a-f]{20,}$/i, '').trim();
  const tk = tokensMd(texto);
  let pagina = '';
  const blocos = [{ titulo: '', pares: [], soltas: [] }];
  let atual = blocos[0];
  const novo = t => { atual = { titulo: t, pares: [], soltas: [] }; blocos.push(atual); };
  const deTabelas = [];
  for (let i = 0; i < tk.length; i++) {
    const x = tk[i], prox = tk[i + 1];
    if (x.tipo === 'tab') {
      const ls = []; while (i < tk.length && tk[i].tipo === 'tab') { ls.push(tk[i].c); i++; } i--;
      const multi = entradasDaTabela(ls, origem);
      if (multi) deTabelas.push(...multi);
      else ls.forEach((c, j) => { if (c.length === 2 && !(j === 0 && /^(campo|field|key|chave|propriedade|property|nome|name)$/i.test(c[0]) && /^(valor|value|conte[uú]do)$/i.test(c[1]))) atual.pares.push([c[0], c[1]]); else atual.soltas.push(limparMd(c.join(' · '))); });
      continue;
    }
    if (x.tipo === 'h') { if (x.nivel === 1 && !pagina && blocos.length === 1 && !atual.pares.length) pagina = x.t; else novo(x.t); continue; }
    if (x.tipo === 'kvazio') {
      if (prox && prox.tipo === 'txt') { atual.pares.push([x.k, prox.t]); i++; } else novo(x.k);
      continue;
    }
    if (x.tipo === 'txt') {
      if (prox && (prox.tipo === 'par' || prox.tipo === 'kvazio') && x.t.length <= 50 && !/^https?:/i.test(x.t)) novo(x.t);
      else if (x.t) atual.soltas.push(x.t);
      continue;
    }
    atual.pares.push([x.k, x.v]);
  }
  // Blocos sem nada de conta (ex.: "Pergunta de segurança" → "Resposta: …") voltam para a conta de cima
  const contas = [];
  blocos.forEach(b => {
    const temConta = b.pares.some(([k]) => ALVOS_CONTA.has(alvoDe(k)));
    const ant = contas[contas.length - 1];
    if (!b.pares.length) { (ant || blocos[0]).soltas.push(...[b.titulo, ...b.soltas].filter(Boolean)); if (!ant && b !== blocos[0]) { /* já ficou nas notas da página */ } return; }
    if (!temConta && ant) { b.pares.forEach(([k, v]) => ant.pares.push([b.titulo ? `${b.titulo} — ${limparMd(k)}` : k, v])); ant.soltas.push(...b.soltas); return; }
    contas.push(b);
  });
  const soltasPagina = blocos[0].pares.length ? [] : blocos[0].soltas;
  const generica = !pagina || PAGINA_GENERICA.test(pagina.trim()) || PAGINA_GENERICA.test(base);
  const nomePag = pagina || base;
  const out = contas.map((b, i) => {
    let titulo;
    if (contas.length === 1) titulo = nomePag || b.titulo;
    else if (!b.titulo) titulo = nomePag;
    else titulo = generica || norm(b.titulo).includes(norm(nomePag)) ? b.titulo : `${nomePag} — ${b.titulo}`;
    return { ...montarEntrada(titulo, b.pares, [...(i === 0 ? soltasPagina.filter(s => s !== b.titulo) : []), ...b.soltas].filter(Boolean)), origem };
  });
  return [...out, ...deTabelas];
};
const entradasDoCsv = (texto, origem = '') => {
  const ls = lerCsv(String(texto).replace(/^﻿/, ''));
  if (ls.length < 2) return [];
  const cab = ls[0].map(x => x.trim());
  const iTitulo = cab.findIndex(k => /^(name|nome|t[ií]tulo|title|servi[cç]o|service)$/i.test(k));
  return ls.slice(1).filter(r => r.some(c => String(c || '').trim())).map(r => ({ ...montarEntrada(iTitulo >= 0 ? r[iTitulo] : r[0], cab.map((k, i) => [k, r[i] || '']).filter((x, i) => i !== (iTitulo >= 0 ? iTitulo : 0)), []), origem }));
};
// A exportação do Notion traz a mesma conta duas vezes (o .csv da base de dados e o .md de cada linha): junta-as
const juntarRepetidas = lista => {
  const out = [];
  lista.forEach(e => {
    const k = norm(e.titulo);
    const igual = out.find(o => norm(o.titulo) === k && ['utilizador', 'senha', 'pin', 'numero', 'rede'].every(c => !o.dados[c] || !e.dados[c] || o.dados[c] === e.dados[c]));
    if (!igual) { out.push({ ...e, dados: { ...e.dados } }); return; }
    const a = igual.dados, b = e.dados;
    Object.keys(b).forEach(c => {
      if (c === 'extras') { const nomes = new Set((a.extras || []).map(x => norm(x.nome) + '|' + x.valor)); a.extras = [...(a.extras || []), ...(b.extras || []).filter(x => !nomes.has(norm(x.nome) + '|' + x.valor))]; }
      else if (c === 'notas') { if (b.notas && !String(a.notas || '').includes(b.notas)) a.notas = [a.notas, b.notas].filter(Boolean).join('\n'); }
      else if (c === 'tipo') { if (a.tipo === 'login' && b.tipo !== 'login') a.tipo = b.tipo; }
      else if (!a[c]) a[c] = b[c];
    });
    if (a.extras && !a.extras.length) delete a.extras;
    igual.juntas = (igual.juntas || 1) + 1;
  });
  return out;
};
const ImportarSenhas = ({ claro, sub, destino, onImportar, onFechar }) => {
  const [entradas, setEntradas] = useState(null);
  const [marcadas, setMarcadas] = useState(new Set());
  const [erro, setErro] = useState('');
  const [aguarde, setAguarde] = useState(false);
  const inRef = useRef(null);
  useEffect(() => { const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); onFechar(); } }; window.addEventListener('keydown', esc, true); return () => window.removeEventListener('keydown', esc, true); }, [onFechar]);
  const ler = async fs => {
    setErro(''); setAguarde(true);
    try {
      const fich = [];
      for (const f of Array.from(fs || [])) {
        if (/\.zip$/i.test(f.name)) fich.push(...await lerZip(await f.arrayBuffer()));
        else fich.push({ nome: f.name, texto: await f.text() });
      }
      const out = [];
      fich.forEach(f => { if (/\.csv$/i.test(f.nome)) out.push(...entradasDoCsv(f.texto, String(f.nome).split('/').pop())); else if (/\.(md|txt)$/i.test(f.nome)) out.push(...entradasDoMd(f.nome, f.texto)); });
      const uteis = juntarRepetidas(out).filter(e => e.dados.senha || e.dados.utilizador || e.dados.pin || e.dados.numero || e.dados.otp || (e.dados.extras || []).length);
      setEntradas(uteis); setMarcadas(new Set(uteis.map((_, i) => i)));
      if (!uteis.length) setErro('Não encontrei palavras-passe nesses ficheiros. Espera-se algo como "Password: …" ou "Username: …" em cada página.');
    } catch (e) { console.error('Importar:', e); setErro('Não consegui ler os ficheiros.'); }
    setAguarde(false);
  };
  const tipoNome = id => (TIPOS_SENHA.find(t => t.id === id) || {}).nome || id;
  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-4 pt-[6vh] sm:pt-4 bg-black/55 animate-backdropIn" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className={`w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border shadow-2xl animate-modalIn ${claro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'}`}>
        <div className="p-4 space-y-2 border-b border-inherit">
          <p className="font-semibold">Importar palavras-passe</p>
          <p className={`text-sm ${sub}`}>Escolhe os ficheiros <b>.md</b> que exportaste do Notion (podes escolher vários de uma vez), o <b>.zip</b> da exportação ou um <b>.csv</b>. São lidos e cifrados aqui no teu computador — não vão para lado nenhum sem estarem cifrados. Vão para <b>{destino}</b>.</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => inRef.current && inRef.current.click()} className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white">{aguarde ? 'A ler…' : 'Escolher ficheiros'}</button>
            <input ref={inRef} type="file" multiple accept=".md,.txt,.csv,.zip,text/markdown,text/csv,application/zip" className="hidden" onChange={e => { ler(e.target.files); e.target.value = ''; }} />
            {entradas && entradas.length > 0 && <span className={`text-xs ${sub}`}>{entradas.length} encontrada{entradas.length === 1 ? '' : 's'} — confirma os nomes (podes mudá-los aqui)</span>}
          </div>
          {erro && <p className="text-sm text-red-400">{erro}</p>}
        </div>
        {entradas && entradas.length > 0 && (
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {entradas.map((e, i) => (
              <label key={i} className={`flex items-start gap-3 px-2 py-2 rounded-lg cursor-pointer ${claro ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}>
                <input type="checkbox" checked={marcadas.has(i)} onChange={() => setMarcadas(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} className="mt-1 accent-blue-500" />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 min-w-0">
                    <input value={e.titulo} onChange={ev => { const v = ev.target.value; setEntradas(l => l.map((x, j) => (j === i ? { ...x, titulo: v } : x))); }} onClick={ev => ev.preventDefault()} aria-label="Nome"
                      className={`flex-1 min-w-0 rounded-md border px-2 py-1 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 ${/^sem t[ií]tulo$/i.test(e.titulo.trim()) || !e.titulo.trim() ? 'border-amber-400/70' : claro ? 'border-slate-200 bg-white' : 'border-slate-600 bg-slate-900/50'}`} />
                    <span className={`text-[11px] shrink-0 ${sub}`}>{tipoNome(e.dados.tipo)}</span>
                  </span>
                  <span className={`block text-xs truncate ${sub}`}>{[e.dados.utilizador || e.dados.rede || e.dados.titular, e.dados.url, e.dados.senha ? 'palavra-passe ✓' : 'sem palavra-passe', e.dados.otp ? '2FA ✓' : '', (e.dados.extras || []).length ? `+${e.dados.extras.length} campo${e.dados.extras.length === 1 ? '' : 's'}` : '', e.juntas > 1 ? `juntei ${e.juntas} repetidas` : ''].filter(Boolean).join(' · ')}</span>
                  {e.origem && <span className={`block text-[10px] truncate opacity-70 ${sub}`}>de {e.origem}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
        <div className="p-4 flex items-center justify-end gap-2 border-t border-inherit">
          <button type="button" onClick={onFechar} className={`px-3 py-2 text-sm rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>Cancelar</button>
          <button type="button" disabled={!entradas || !marcadas.size || aguarde} onClick={async () => { setAguarde(true); await onImportar(entradas.filter((_, i) => marcadas.has(i)).map(e => ({ ...e, titulo: e.titulo.trim() || (e.origem || '').replace(/\.\w+$/, '') || 'Sem título' }))); setAguarde(false); }} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40">Importar {marcadas.size || ''}</button>
        </div>
      </div>
    </div>
  );
};

// ── Quem tem acesso a um caderno partilhado ──
// ── Cofre em grelha: as palavras-passe de uma secção em colunas, agrupadas por tipo, com copiar à mão ──
const GRUPOS_COFRE = [['banco', 'Bancos'], ['login', 'Sites e apps'], ['email', 'Email'], ['cartao', 'Cartões'], ['wifi', 'Wi-Fi'], ['licenca', 'Licenças'], ['outro', 'Outros'], ['nota', 'Notas']];
const COR_INICIAL = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#14b8a6', '#f97316', '#6366f1'];
const corDe = txt => { let h = 0; for (const ch of String(txt || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COR_INICIAL[h % COR_INICIAL.length]; };
const urlCompleta = u => { const s = String(u || '').trim(); if (!s) return ''; return /^https?:\/\//i.test(s) ? s : `https://${s}`; };
const dominioDe = u => { try { return new URL(urlCompleta(u)).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
const nomeDoDominio = d => { const ps = String(d || '').split('.').filter(Boolean); if (!ps.length) return ''; let i = ps.length - 2; if (i > 0 && /^(com|co|org|net|gov|edu)$/.test(ps[i]) && ps[ps.length - 1].length === 2) i--; const n = ps[Math.max(0, i)]; return n.charAt(0).toUpperCase() + n.slice(1); };
const CofreGrelha = ({ paginas, tituloDe, chave, lerPagina, claro, sub, avisar, onAbrir, cabecalho, pedirDesbloquear, marcadas, onMarcar, onNomear }) => {
  const [dados, setDados] = useState({});
  const [filtro, setFiltro] = useState('');
  const cache = useRef({});
  const assinatura = paginas.filter(p => p.tipo === 'senha').map(p => `${p.id}:${p.editada || ''}`).join('|');
  useEffect(() => {
    if (!chave) { cache.current = {}; setDados({}); return undefined; }
    let vivo = true;
    (async () => {
      const faltam = paginas.filter(p => p.tipo === 'senha' && (!cache.current[p.id] || cache.current[p.id].ed !== (p.editada || '')));
      await Promise.all(faltam.map(async p => {
        try {
          const d = await lerPagina(p.id);
          const o = d && d.cifrado ? (JSON.parse(await decifrar(chave, d.cifrado)) || {}) : {};
          cache.current[p.id] = { ed: p.editada || '', s: o.senha || {} };
        } catch (e) { cache.current[p.id] = { ed: p.editada || '', s: {} }; }
      }));
      if (vivo) { const out = {}; paginas.forEach(p => { if (cache.current[p.id]) out[p.id] = cache.current[p.id].s; }); setDados(out); }
    })();
    return () => { vivo = false; };
  }, [chave, assinatura]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = norm(filtro.trim());
  const repetidos = {};
  paginas.forEach(p => { const k = norm(tituloDe(p)); repetidos[k] = (repetidos[k] || 0) + 1; });
  const itens = paginas.map(p => {
    const s = dados[p.id] || {};
    const titulo = tituloDe(p);
    const quem = s.utilizador || s.rede || s.titular || '';
    const dom = dominioDe(s.url);
    return { p, s, titulo, quem, dom, tipo: p.tipo === 'senha' ? (s.tipo || 'login') : 'nota', segredo: s.senha || s.chave || s.numero || s.pin || '' };
  }).filter(x => !f || [x.titulo, x.quem, x.dom].some(v => norm(v).includes(f)))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt', { numeric: true }));
  const botao = `inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] ${claro ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' : 'bg-white/5 hover:bg-white/10 text-slate-300'}`;
  const parar = fn => e => { e.stopPropagation(); fn(); };
  return (
    <div className={`rounded-2xl border p-3 lg:p-4 ${claro ? 'bg-white/80 border-slate-200' : 'bg-slate-800/40 border-slate-700/50'}`}>
      {cabecalho}
      {!chave ? (
        <div className={`py-12 text-center text-sm ${sub}`}>
          <Ic n="cadeado" className="w-8 h-8 mx-auto mb-3 text-amber-400" />
          <p className="mb-3">O cofre está trancado.</p>
          <button type="button" onClick={() => pedirDesbloquear()} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm">Desbloquear</button>
        </div>
      ) : (
        <>
          <div className="relative mb-3">
            <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${sub}`}><Ic n="procurar" /></span>
            <input value={filtro} onChange={e => setFiltro(e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && filtro) { e.stopPropagation(); setFiltro(''); } }} placeholder="Procurar no cofre (nome, utilizador, site)…" aria-label="Procurar no cofre"
              className={`w-full rounded-lg border pl-8 pr-3 py-2 text-base lg:text-sm outline-none focus:ring-2 focus:ring-blue-500 ${claro ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-700'}`} />
          </div>
          {(() => {
            const semNome = itens.filter(x => /^sem t[ií]tulo$/i.test(x.titulo.trim()));
            if (!semNome.length || marcadas) return null;
            const comSite = semNome.filter(x => x.dom);
            return (
              <div className="mb-3 rounded-lg px-3 py-2 text-xs bg-amber-500/10 text-amber-500 flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-[200px]">{semNome.length} sem nome. Abre-as e escreve o nome{comSite.length ? ', ou dá-lhes o nome do site de uma vez' : ''}.</span>
                {comSite.length > 0 && onNomear && <button type="button" onClick={() => onNomear(comSite.map(x => [x.p.id, nomeDoDominio(x.dom)]))} className="px-2.5 py-1 rounded-md border border-amber-500/40 hover:bg-amber-500/10">Dar o nome do site a {comSite.length}</button>}
              </div>
            );
          })()}
          {GRUPOS_COFRE.map(([g, nome]) => {
            const doGrupo = itens.filter(x => (GRUPOS_COFRE.some(y => y[0] === x.tipo) ? x.tipo : 'outro') === g);
            if (!doGrupo.length) return null;
            return (
              <section key={g} className="mb-4 last:mb-0">
                <p className={`px-1 mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${sub}`}>{nome} <span className="font-normal">· {doGrupo.length}</span></p>
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
                  {doGrupo.map(x => (
                    <div key={x.p.id} role="button" tabIndex={0} aria-pressed={marcadas ? marcadas.has(x.p.id) : undefined} onClick={() => (marcadas ? onMarcar(x.p.id) : onAbrir(x.p))} onKeyDown={e => { if (e.key === 'Enter' || (marcadas && e.key === ' ')) { e.preventDefault(); if (marcadas) onMarcar(x.p.id); else onAbrir(x.p); } }}
                      className={`text-left rounded-xl border px-3 py-2.5 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${marcadas && marcadas.has(x.p.id) ? 'border-red-400/70 bg-red-500/10' : claro ? 'border-slate-200 bg-white hover:border-blue-300' : 'border-slate-700/70 bg-slate-900/40 hover:border-blue-500/50'}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        {marcadas && <input type="checkbox" readOnly tabIndex={-1} checked={marcadas.has(x.p.id)} className="accent-red-500 shrink-0 pointer-events-none" aria-hidden="true" />}
                        <span className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: corDe(x.titulo) }}>{(x.titulo.trim()[0] || '?').toUpperCase()}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate flex items-center gap-1">{x.p.fav && <span className="text-amber-400 text-xs">★</span>}<span className="truncate">{x.titulo}</span></p>
                          <p className={`text-xs truncate ${sub}`}>{x.quem || x.dom || (x.tipo === 'nota' ? 'Nota' : '—')}</p>
                        </div>
                      </div>
                      {(repetidos[norm(x.titulo)] > 1 || /^sem t[ií]tulo$/i.test(x.titulo)) && <p className="mt-1.5 text-[10px] text-amber-400">{repetidos[norm(x.titulo)] > 1 ? 'Repetida? Há outra com o mesmo nome' : 'Sem nome — abre para ver o que é'}</p>}
                      {!marcadas && x.tipo !== 'nota' && (x.quem || x.segredo || x.s.url) && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {x.quem && <button type="button" onClick={parar(() => copiarSeguro(x.quem, avisar))} className={botao} title={`Copiar ${x.quem}`}><Ic n="copiar" className="w-3 h-3" /> Utilizador</button>}
                          {x.segredo && <button type="button" onClick={parar(() => copiarSeguro(x.segredo, avisar))} className={botao} title="Copiar a palavra-passe"><Ic n="copiar" className="w-3 h-3" /> {x.s.senha ? 'Palavra-passe' : x.s.chave ? 'Chave' : x.s.numero ? 'Número' : 'PIN'}</button>}
                          {x.s.url && <button type="button" onClick={parar(() => window.open(urlCompleta(x.s.url), '_blank', 'noopener'))} className={botao} title={urlCompleta(x.s.url)}><Ic n="link" className="w-3 h-3" /> Abrir</button>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {!itens.length && <p className={`py-8 text-center text-sm ${sub}`}>{f ? 'Nada encontrado.' : 'Ainda não há palavras-passe aqui.'}</p>}
        </>
      )}
    </div>
  );
};

// Listas de compras: as páginas criadas com o modelo (ou com "compra" no título) guardam os produtos no índice,
// para a app sugerir o que costumas comprar
const ehCompras = (p, titulo) => { const t = String(titulo != null ? titulo : (p && p.titulo) || ''); return !!(p && !/^plano de compras/i.test(t) && (p.tipo === 'compras' || /compra|mercearia|supermercado/i.test(t))); };
const todosItens = html => {
  const d = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  return Array.from(d.querySelectorAll('ul[data-chk] > li')).map(li => li.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
};
const normProduto = x => norm(x).replace(/^\d+([.,]\d+)?\s*(x|kg|g|l|un|uni|pacotes?|latas?|garrafas?)?\s+/, '').replace(/\s*[-—(].*$/, '').trim();
// ── Planear compras: a IA da app (Gemini) organiza a lista por loja, com preços estimados e trocas mais saudáveis ──
const itensDaLista = html => {
  const d = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  return Array.from(d.querySelectorAll('ul[data-chk] > li')).filter(li => li.getAttribute('data-ok') !== '1').map(li => li.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
};
const REGRAS_COMPRAS = `PEDIDO ESPECIAL — planear compras de supermercado (ignora a parte das finanças e o resumo).
Responde APENAS com JSON válido, sem texto antes nem depois, neste formato:
{"lojas":[{"loja":"Lidl","porque":"frase curta","itens":[{"p":"Bananas","q":"1 kg","eur":1.2,"nota":"da época"}]}],"trocas":[{"de":"Bolachas","para":"Flocos de aveia","porque":"menos açúcar"}],"dicas":["frase curta"],"total":12.5}
Regras:
- Cada produto da lista aparece uma vez, numa só loja. Usa o menor número de lojas que compense (normalmente 1 a 3) e diz em "porque" a razão (ex.: fruta mais barata no mercado).
- Usa só lojas da lista de lojas indicada. Ordena os itens de cada loja pela ordem habitual dos corredores.
- "q" é a quantidade sugerida (ou a que vem na lista). "eur" é o preço típico estimado em euros em Portugal (número). "total" é a soma.
- "nota": no máximo 6 palavras e só quando ajuda (marca branca, a granel, da época, congelado mais barato).
- "trocas": no máximo 5, só quando há alternativa claramente mais saudável ou mais barata, respeitando as preferências.
- "dicas": no máximo 3. Tudo em português de Portugal, curto.`;
const PlanearCompras = ({ itens, titulo, claro, sub, perguntarIA, onGuardar, onFechar }) => {
  const ler = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const [lojas, setLojas] = useState(() => ler('compras-lojas', 'Lidl, Continente, Pingo Doce, Mercadona, mercado / frutaria do bairro'));
  const [pref, setPref] = useState(() => ler('compras-pref', ''));
  const [zona, setZona] = useState(() => ler('compras-zona', 'Grande Lisboa'));
  const [plano, setPlano] = useState(null);
  const [bruto, setBruto] = useState('');
  const [erro, setErro] = useState('');
  const [aguarde, setAguarde] = useState(false);
  useEffect(() => { const esc = e => { if (e.key === 'Escape' && !aguarde) { e.stopPropagation(); onFechar(); } }; window.addEventListener('keydown', esc, true); return () => window.removeEventListener('keydown', esc, true); }, [onFechar, aguarde]);
  const planear = async () => {
    setErro(''); setAguarde(true); setPlano(null); setBruto('');
    try { localStorage.setItem('compras-lojas', lojas); localStorage.setItem('compras-pref', pref); localStorage.setItem('compras-zona', zona); } catch (e) { /* sem armazenamento */ }
    const pergunta = `Zona: ${zona || 'Portugal'}\nLojas possíveis: ${lojas}\nPreferências: ${pref || 'comer de forma saudável e gastar pouco'}\n\nLista de compras:\n${itens.slice(0, 80).map(x => `- ${x.slice(0, 60)}`).join('\n')}`.slice(0, 3900);
    try {
      const r = await perguntarIA(pergunta, REGRAS_COMPRAS);
      const i = r.indexOf('{'), j = r.lastIndexOf('}');
      let obj = null; try { obj = JSON.parse(r.slice(i, j + 1)); } catch (e) { /* não veio em JSON */ }
      if (obj && Array.isArray(obj.lojas) && obj.lojas.length) setPlano(obj); else setBruto(r);
    } catch (e) { setErro(String((e && e.message) || e)); }
    setAguarde(false);
  };
  const eu = v => (Number(v) > 0 ? `~${Number(v).toFixed(2).replace('.', ',')} €` : '');
  const somaLoja = l => (l.itens || []).reduce((a, x) => a + (Number(x.eur) || 0), 0);
  const total = plano ? (Number(plano.total) > 0 ? Number(plano.total) : plano.lojas.reduce((a, l) => a + somaLoja(l), 0)) : 0;
  const htmlPlano = () => {
    const d = new Date();
    if (!plano) return `<p><i>Plano de ${dataLonga(d.toISOString())} — preços estimados.</i></p>${String(bruto).split(/\n+/).map(l => `<p>${escHtml(l)}</p>`).join('')}`;
    let h = `<p><i>Feito a ${dataLonga(d.toISOString())} a partir de “${escHtml(titulo)}”. Preços estimados — podem variar.</i></p>`;
    plano.lojas.forEach(l => {
      h += `<h2>🛒 ${escHtml(l.loja)}${somaLoja(l) > 0 ? ` · ${eu(somaLoja(l))}` : ''}</h2>`;
      if (l.porque) h += `<p>${escHtml(l.porque)}</p>`;
      h += `<ul data-chk="1">${(l.itens || []).map(x => `<li data-ok="0">${escHtml(x.p)}${x.q ? ` — ${escHtml(x.q)}` : ''}${x.eur ? ` · ${eu(x.eur)}` : ''}${x.nota ? ` (${escHtml(x.nota)})` : ''}</li>`).join('')}</ul>`;
    });
    if ((plano.trocas || []).length) h += `<h2>Trocas sugeridas</h2><ul>${plano.trocas.map(t => `<li><b>${escHtml(t.de)}</b> → ${escHtml(t.para)}${t.porque ? ` — ${escHtml(t.porque)}` : ''}</li>`).join('')}</ul>`;
    if ((plano.dicas || []).length) h += `<h2>Dicas</h2><ul>${plano.dicas.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul>`;
    if (total > 0) h += `<p><b>Total estimado: ${eu(total)}</b></p>`;
    return h;
  };
  const caixa = `w-full rounded-lg border px-3 py-2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-blue-500 ${claro ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-600'}`;
  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-4 pt-[5vh] sm:pt-4 bg-black/55 backdrop-blur-sm animate-backdropIn" onMouseDown={e => { if (e.target === e.currentTarget && !aguarde) onFechar(); }}>
      <div className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl animate-modalIn ${claro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'}`}>
        <div className="p-4 space-y-3 border-b border-inherit">
          <div className="flex items-center gap-2"><p className="font-semibold flex-1">✨ Planear compras</p><button type="button" onClick={onFechar} className={`w-8 h-8 rounded-lg ${sub} ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`} aria-label="Fechar">✕</button></div>
          <p className={`text-sm ${sub}`}>{itens.length} produto{itens.length === 1 ? '' : 's'} por comprar em “{titulo}”. A IA organiza por loja, estima preços e sugere trocas mais saudáveis ou mais baratas. O plano fica numa página nova ao lado desta (se o caderno for partilhado, a Sara vê-a).</p>
          <label className="block space-y-1"><span className={`text-xs ${sub}`}>Lojas onde costumam ir</span><input value={lojas} onChange={e => setLojas(e.target.value)} className={caixa} /></label>
          <div className="grid sm:grid-cols-[1fr_160px] gap-3">
            <label className="block space-y-1"><span className={`text-xs ${sub}`}>Preferências (opcional)</span><input value={pref} onChange={e => setPref(e.target.value)} placeholder="ex.: mais saudável, pouco açúcar, sem lactose, para 4 pessoas" className={caixa} /></label>
            <label className="block space-y-1"><span className={`text-xs ${sub}`}>Zona</span><input value={zona} onChange={e => setZona(e.target.value)} className={caixa} /></label>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={planear} disabled={aguarde || !itens.length} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">{aguarde ? 'A planear…' : plano || bruto ? 'Planear outra vez' : 'Planear'}</button>
            {erro && <span className="text-sm text-red-400">{erro}</span>}
          </div>
        </div>
        {(plano || bruto) && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
            {plano ? plano.lojas.map((l, i) => (
              <div key={i}>
                <p className="font-semibold">🛒 {l.loja}<span className={`font-normal ${sub}`}>{somaLoja(l) > 0 ? ` · ${eu(somaLoja(l))}` : ''}</span></p>
                {l.porque && <p className={`text-xs ${sub}`}>{l.porque}</p>}
                <ul className="mt-1 space-y-0.5">{(l.itens || []).map((x, k) => <li key={k} className="flex gap-2"><span className="flex-1 min-w-0">{x.p}{x.q ? <span className={sub}> — {x.q}</span> : null}{x.nota ? <span className="text-emerald-500 text-xs"> · {x.nota}</span> : null}</span><span className={`tabular-nums ${sub}`}>{eu(x.eur)}</span></li>)}</ul>
              </div>
            )) : <p className="whitespace-pre-wrap">{bruto}</p>}
            {plano && (plano.trocas || []).length > 0 && <div><p className="font-semibold">Trocas sugeridas</p><ul className="mt-1 space-y-0.5">{plano.trocas.map((t, k) => <li key={k}><b>{t.de}</b> → {t.para}{t.porque ? <span className={sub}> — {t.porque}</span> : null}</li>)}</ul></div>}
            {plano && (plano.dicas || []).length > 0 && <div><p className="font-semibold">Dicas</p><ul className="mt-1 list-disc pl-5 space-y-0.5">{plano.dicas.map((t, k) => <li key={k}>{t}</li>)}</ul></div>}
            {plano && total > 0 && <p className="font-semibold">Total estimado: {eu(total)} <span className={`font-normal text-xs ${sub}`}>(preços típicos, não os do dia)</span></p>}
          </div>
        )}
        {(plano || bruto) && (
          <div className="p-4 flex justify-end gap-2 border-t border-inherit">
            <button type="button" onClick={onFechar} className={`px-3 py-2 text-sm rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>Fechar</button>
            <button type="button" onClick={() => onGuardar(`Plano de compras — ${dataLonga(new Date().toISOString())}`, htmlPlano())} className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">Guardar como página</button>
          </div>
        )}
      </div>
    </div>
  );
};

const PessoasCaderno = ({ c, claro, meuEmail, onJuntar, onTirar, onFechar }) => {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState('');
  const [aguarde, setAguarde] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const link = `${window.location.origin}/?notas`;
  const souDono = !c.dono || c.dono === meuEmail;
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); onFechar(); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onFechar]);
  const juntar = async e => {
    e.preventDefault(); setErro(''); setAguarde(true);
    const r = await onJuntar(email); setAguarde(false);
    if (r) setErro(r); else setEmail('');
  };
  const copiarLink = () => { try { navigator.clipboard.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch (er) { /* sem acesso */ } };
  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-4 pt-[12vh] sm:pt-4 bg-black/55 animate-backdropIn" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className={`w-full max-w-md rounded-2xl border p-4 shadow-2xl animate-modalIn space-y-3 ${claro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'}`}>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md inline-flex items-center justify-center text-white shrink-0" style={{ background: c.cor }}><Ic n="pessoas" className="w-3.5 h-3.5" /></span>
          <p className="font-semibold flex-1 truncate">{c.nome}</p>
          <button type="button" onClick={onFechar} className={`w-8 h-8 rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`} aria-label="Fechar">✕</button>
        </div>
        <div className={`rounded-xl border divide-y ${claro ? 'border-slate-200 divide-slate-100' : 'border-slate-700 divide-slate-700'}`}>
          {(c.membros || []).map(m => (
            <div key={m} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1 min-w-0 truncate">{m}{m === meuEmail ? ' (tu)' : ''}</span>
              {m === c.dono && <span className={`text-[11px] ${claro ? 'text-slate-500' : 'text-slate-400'}`}>criou</span>}
              {souDono && m !== meuEmail && <button type="button" onClick={async () => { if (await confirmar(`Tirar o acesso a ${m}?`)) onTirar(m); }} className="text-xs text-red-400 hover:text-red-300">Tirar</button>}
            </div>
          ))}
        </div>
        <form onSubmit={juntar} className="flex gap-2">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Juntar pessoa (email Google)" autoComplete="off"
            className={`flex-1 min-w-0 rounded-lg border px-3 py-2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-blue-500 ${claro ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-600'}`} />
          <button type="submit" disabled={aguarde || !email.trim()} className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">{aguarde ? '…' : 'Juntar'}</button>
        </form>
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <div className={`rounded-xl p-3 text-xs space-y-2 ${claro ? 'bg-slate-50 text-slate-600' : 'bg-slate-900/50 text-slate-300'}`}>
          <p>Manda este link a quem juntaste. Abre a app só com as Notas (sem as tuas finanças) — entra com a conta Google do email acima e vê apenas os cadernos partilhados com ela.</p>
          <div className="flex items-center gap-2"><code className="flex-1 min-w-0 truncate">{link}</code><button type="button" onClick={copiarLink} className={`shrink-0 px-2 py-1 rounded-md border ${copiado ? 'border-emerald-400 text-emerald-400' : claro ? 'border-slate-300 hover:bg-white' : 'border-slate-600 hover:bg-white/5'}`}>{copiado ? '✓ copiado' : 'Copiar'}</button></div>
        </div>
      </div>
    </div>
  );
};

// ── Ecrã das Notas ──
const Notas = ({ perguntarIA, partilha, navSub, onNavEmpurrar, onNavSubstituir, indice, mudarIndice, modo, theme, lerPagina, guardarPagina, apagarPagina, enviarImagem, entidades, onIrEntidade, abrir, onAberto, showToast }) => {
  const claro = theme === 'light';
  const sub = claro ? 'text-slate-500' : 'text-slate-400';
  const ix = indice || NOTAS_VAZIO;
  const [secId, setSecId] = useState(() => { try { return localStorage.getItem('notas-sec') || null; } catch (e) { return null; } });
  const [pagId, setPagId] = useState(() => { try { return localStorage.getItem('notas-pag') || null; } catch (e) { return null; } });
  const [vista, setVista] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 1024 ? 'arvore' : 'pagina')); // telemóvel: 'arvore' | 'paginas' | 'pagina'
  // Computador: nota em ecrã largo (esconde os cadernos e a lista de páginas)
  const [largo, setLargo] = useState(() => { try { return localStorage.getItem('notas-largo') === '1'; } catch (e) { return false; } });
  const mudarLargo = () => setLargo(v => { try { localStorage.setItem('notas-largo', v ? '0' : '1'); } catch (e) { /* sem armazenamento */ } return !v; });
  const [filtro, setFiltro] = useState(null); // null | 'recentes' | 'favoritos' | { tag }
  const [procura, setProcura] = useState('');
  // Recuar/avançar da app: cada secção, página ou lista aberta fica no histórico
  const navN = useRef({ primeiro: true, deFora: false, ult: null, desde: Date.now() });
  useEffect(() => {
    const r = navN.current; const sub = { secId, pagId, filtro, vista: larguraTelemovel ? vista : null }; const k = JSON.stringify(sub); // no computador a 'vista' não muda o ecrã
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
    const alvo = { secId: s.secId ?? null, pagId: s.pagId ?? null, filtro: s.filtro ?? null, vista: larguraTelemovel ? (s.vista || vista) : null };
    if (JSON.stringify(alvo) === navN.current.ult) return;
    navN.current.deFora = true;
    setSecId(alvo.secId); setPagId(alvo.pagId); setFiltro(alvo.filtro); if (alvo.vista) setVista(alvo.vista); setProcura('');
  }, [navSub]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ordem, setOrdem] = useState(() => { try { return localStorage.getItem('notas-ordem') || 'editada'; } catch (e) { return 'editada'; } });
  const [fechados, setFechados] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('notas-fechados')) || []); } catch (e) { return new Set(); } });
  const [pedir, setPedir] = useState(null);
  const [pessoas, setPessoas] = useState(null);
  const [ativar2fa, setAtivar2fa] = useState(false);
  const [listaPref, setListaPref] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('notas-cofre-lista')) || []); } catch (e) { return new Set(); } });
  const [cofreModal, setCofreModal] = useState(false);
  const [selCofre, setSelCofre] = useState(null);
  const pedirAberto = useRef(false);
  useEffect(() => {
    if (!cofreModal) return undefined;
    const f = e => { if (e.key === 'Escape' && !pedirAberto.current && !e.defaultPrevented) setCofreModal(false); };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [cofreModal]);
  const [planear, setPlanear] = useState(null); // { itens, titulo, sid }
  const [importar, setImportar] = useState(null); // secção de destino // id do caderno partilhado aberto em "Pessoas com acesso"
  const [chave, setChave] = useState(null);
  const [bioPode, setBioPode] = useState(false);
  const [bioId, setBioId] = useState(() => { try { return localStorage.getItem(BIO_LS) || null; } catch (e) { return null; } });
  useEffect(() => {
    let vivo = true;
    try { if (window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(v => { if (vivo) setBioPode(!!v); }).catch(() => {}); } catch (e) { /* sem suporte */ }
    return () => { vivo = false; };
  }, []);
  const chaveAtual = chave;
  const [titulosC, setTitulosC] = useState({});
  const [larguraTelemovel, setLarguraTelemovel] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  const [comMenuBaixo, setComMenuBaixo] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640); // telemóvel: há o menu fixo em baixo
  const focarNova = useRef(null);
  // Carregar outra vez em "Notas" no menu de baixo: volta ao início das notas
  useEffect(() => {
    const f = () => { setVista('arvore'); setProcura(''); setFiltro(null); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    window.addEventListener('notas-inicio', f); return () => window.removeEventListener('notas-inicio', f);
  }, []);
  // As colunas da esquerda ficam presas logo abaixo da barra de cima da app (e não por baixo dela)
  const [topo, setTopo] = useState(16);
  useEffect(() => {
    const medir = () => { const cab = document.querySelector('div.sticky.top-0.z-50'); setTopo(cab ? Math.round(cab.getBoundingClientRect().height) + 12 : 16); };
    medir(); const t = setTimeout(medir, 400);
    window.addEventListener('resize', medir);
    return () => { clearTimeout(t); window.removeEventListener('resize', medir); };
  }, []);
  const ultimaAtividade = useRef(Date.now());
  useEffect(() => { const r = () => { setLarguraTelemovel(window.innerWidth < 1024); setComMenuBaixo(window.innerWidth < 640); }; window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  useEffect(() => { if (pagId !== focarNova.current) focarNova.current = null; }, [pagId]);
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
  // O que costumas comprar: produtos das listas de compras, pelos que aparecem em mais listas (e mais recentes)
  const historicoCompras = useMemo(() => {
    const m = new Map();
    (ix.paginas || []).filter(p => !p.tituloC && Array.isArray(p.itens) && ehCompras(p)).forEach(p => {
      const vistos = new Set();
      p.itens.forEach(nome => {
        const k = normProduto(nome); if (!k || k.length < 2 || vistos.has(k)) return; vistos.add(k);
        const x = m.get(k) || { k, nome: nome.replace(/\s*[-—(].*$/, '').trim(), n: 0, ult: '' };
        x.n += 1; const d = p.editada || p.criada || ''; if (d > x.ult) { x.ult = d; x.nome = nome.replace(/\s*[-—(].*$/, '').trim() || x.nome; }
        m.set(k, x);
      });
    });
    return [...m.values()].sort((a, b) => b.n - a.n || String(b.ult).localeCompare(String(a.ult))).slice(0, 60);
  }, [ix.paginas]);
  const secPagina = pagina ? secDe(pagina.seccaoId) : null;
  const cadPagina = secPagina ? (ix.cadernos || []).find(c => c.id === secPagina.cadernoId) : null;

  // "Nota por voz" (atalho no ícone da app): página nova já a ouvir
  useEffect(() => {
    if (modo === 'carregar' || !(ix.seccoes || []).some(s2 => !s2.protegida)) return; // espera pelas secções
    let pedido = false; try { pedido = localStorage.getItem('notas-voz') === '1'; localStorage.removeItem('notas-voz'); } catch (e) { /* */ }
    if (!pedido) return;
    DITAR_AO_ABRIR.sim = true;
    let sid = null; try { sid = localStorage.getItem('notas-ult-sec'); } catch (e) { /* */ }
    const ok = sid && (ix.seccoes || []).some(s2 => s2.id === sid && !s2.protegida);
    novaPagina('branco', null, null, { titulo: `Nota por voz — ${dataLonga(agora())} ${horaTxt(agora())}`, html: '', ...(ok ? { sid } : {}) });
  }, [modo, (ix.seccoes || []).length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Abrir uma página vinda de outro sítio da app (ex.: ficha do cliente)
  useEffect(() => {
    if (!abrir || modo === 'carregar') return;
    if (abrir.id) { const p = (ix.paginas || []).find(x => x.id === abrir.id); if (p) { setSecId(p.seccaoId); setPagId(p.id); setFiltro(null); setVista('pagina'); setCofreModal(true); } }
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
  // Secções-cofre (protegidas e com palavras-passe) mostram-se em grelha, a não ser que escolhas a lista
  const emGrelha = !!(!mostrarSeccao && secao && secao.protegida && (ix.paginas || []).some(p => p.seccaoId === secao.id && p.tipo === 'senha') && !listaPref.has(secao.id));
  const mudarVistaCofre = grelha => setListaPref(prev => { const n = new Set(prev); if (grelha) n.delete(secao.id); else n.add(secao.id); try { localStorage.setItem('notas-cofre-lista', JSON.stringify([...n])); } catch (e) { /* sem armazenamento */ } return n; });

  // ── "Hey Google" → Google Tasks → Notas: o que dizes ao telemóvel entra numa página por dia ──
  const [gCfg, setGCfg] = useState(() => { try { return JSON.parse(localStorage.getItem('gtasks-cfg')) || null; } catch (e) { return null; } });
  const gravarGCfg = c => { setGCfg(c); try { if (c) localStorage.setItem('gtasks-cfg', JSON.stringify(c)); else localStorage.removeItem('gtasks-cfg'); } catch (e) { /* sem armazenamento */ } };
  const [painelG, setPainelG] = useState(false);
  const [gListas, setGListas] = useState(null);
  const [gMsg, setGMsg] = useState('');
  const [gOcupado, setGOcupado] = useState(false);
  const ixRef = useRef(ix); ixRef.current = ix;
  const pagIdRef = useRef(pagId); pagIdRef.current = pagId;
  const aImportarG = useRef(false);
  const carregarListasG = async (cfg = gCfg) => {
    if (!cfg || !cfg.conta) return;
    try { const T = await import('./trabalho'); const j = await T.pedirTasks(cfg.conta, 'users/@me/lists?maxResults=100'); setGListas(j.items || []); setGMsg(''); }
    catch (e) { setGMsg(`⚠ ${e.message || e}`); }
  };
  const ligarG = async () => {
    setGOcupado(true); setGMsg('');
    try { const T = await import('./trabalho'); const conta = await T.ligarGoogleTasks(); const c = { ...(gCfg || {}), conta }; gravarGCfg(c); await carregarListasG(c); }
    catch (e) { setGMsg(`⚠ ${e.message || e}`); }
    setGOcupado(false);
  };
  const criarListaG = async () => {
    setGOcupado(true);
    try { const T = await import('./trabalho'); const l = await T.pedirTasks(gCfg.conta, 'users/@me/lists', { method: 'POST', body: JSON.stringify({ title: 'Notas' }) }); gravarGCfg({ ...gCfg, lista: l.id, listaNome: l.title }); await carregarListasG(); }
    catch (e) { setGMsg(`⚠ ${e.message || e}`); }
    setGOcupado(false);
  };
  const importarGoogle = async manual => {
    const cfg = gCfg;
    if (!cfg || !cfg.conta || !cfg.lista || aImportarG.current || modo === 'carregar') return;
    aImportarG.current = true;
    try {
      const T = await import('./trabalho');
      const j = await T.pedirTasks(cfg.conta, `lists/${encodeURIComponent(cfg.lista)}/tasks?showCompleted=false&showHidden=false&maxResults=100`);
      let feitos = []; try { feitos = JSON.parse(localStorage.getItem('gtasks-feitos')) || []; } catch (e) { /* */ }
      const itens = (j.items || []).filter(x => x.title && x.title.trim() && x.status !== 'completed' && !feitos.includes(x.id)).sort((a, b) => String(a.updated).localeCompare(String(b.updated)));
      if (!itens.length) { if (manual && showToast) showToast('Não há notas novas no Google Tasks.', 'info'); return; }
      const ix0 = ixRef.current;
      const secs = ix0.seccoes || [];
      const sid = cfg.seccao && secs.some(s2 => s2.id === cfg.seccao && !s2.protegida) ? cfg.seccao : (secs.find(s2 => !s2.protegida) || {}).id;
      if (!sid) return;
      const titulo = `Notas por voz — ${dataLonga(agora())}`;
      const novoHtml = `<ul>${itens.map(x => `<li><b>${horaTxt(x.updated)}</b> — ${escHtml(x.title.trim())}${x.notes ? `<br>${escHtml(x.notes)}` : ''}</li>`).join('')}</ul>`;
      const existente = (ix0.paginas || []).find(p => p.seccaoId === sid && !p.tituloC && p.titulo === titulo);
      if (existente && existente.id !== pagIdRef.current) {
        const d = await lerPagina(existente.id);
        const html = `${(d && d.html) || ''}${novoHtml}`;
        await guardarPagina(existente.id, { html, editada: agora() }, sid);
        mudarIndice(i => ({ ...i, paginas: (i.paginas || []).map(p => (p.id === existente.id ? { ...p, txt: textoDe(html).slice(0, 600), tags: tagsDe(html), editada: agora() } : p)) }));
      } else {
        const id = nId();
        await guardarPagina(id, { html: novoHtml, editada: agora() }, sid);
        mudarIndice(i => ({ ...i, paginas: [...(i.paginas || []), { id, seccaoId: sid, titulo, criada: agora(), editada: agora(), txt: textoDe(novoHtml).slice(0, 600), tags: tagsDe(novoHtml) }] }));
      }
      try { localStorage.setItem('gtasks-feitos', JSON.stringify([...itens.map(x => x.id), ...feitos].slice(0, 400))); } catch (e) { /* */ }
      // No Google Tasks ficam marcadas como feitas (não se apagam: vês tudo em "Concluídas")
      for (const x of itens) { try { await T.pedirTasks(cfg.conta, `lists/${encodeURIComponent(cfg.lista)}/tasks/${encodeURIComponent(x.id)}`, { method: 'PATCH', body: JSON.stringify({ id: x.id, status: 'completed' }) }); } catch (e) { /* fica por marcar; não volta a entrar */ } }
      if (showToast) showToast(`${itens.length} nota${itens.length === 1 ? '' : 's'} do "Hey Google" em ${titulo}`, 'success');
    } catch (e) { if (manual) { setGMsg(`⚠ ${e.message || e}`); if (showToast) showToast(String(e.message || e), 'error'); } }
    finally { aImportarG.current = false; }
  };
  // Ao abrir as notas e ao voltar à app (no máximo uma vez por minuto)
  const ultG = useRef(0);
  useEffect(() => {
    if (modo === 'carregar' || !gCfg || !gCfg.lista) return undefined;
    const f = () => { if (document.hidden || Date.now() - ultG.current < 60000) return; ultG.current = Date.now(); importarGoogle(false); };
    f();
    window.addEventListener('focus', f); document.addEventListener('visibilitychange', f);
    return () => { window.removeEventListener('focus', f); document.removeEventListener('visibilitychange', f); };
  }, [modo, gCfg && gCfg.lista, gCfg && gCfg.conta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (painelG && gCfg && gCfg.conta && !gListas) carregarListasG(); }, [painelG]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!painelG) return undefined; const f = e => { if (e.key === 'Escape') setPainelG(false); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [painelG]);

  // ── Operações ──
  const novaPagina = async (modeloId = 'branco', sobre = null, kDesbloq = null, pronto = null) => {
    const chave = kDesbloq || chaveAtual;
    let sid = secao ? secao.id : (seccoes[0] && seccoes[0].id);
    if (sobre || !sid || (secDe(sid) && secDe(sid).protegida && !chave)) sid = (seccoes.find(s => !s.protegida) || {}).id;
    if (pronto && pronto.sid) sid = pronto.sid;
    if (!sid) { if (showToast) showToast('Cria primeiro uma secção.', 'error'); return; }
    const m = MODELOS.find(x => x.id === modeloId) || MODELOS[0];
    const id = nId();
    let html = valorDe(m.html) || '';
    let titulo = valorDe(m.titulo) || '';
    if (sobre) { html = `<p>${tagHtml(sobre.tipo, sobre.id, sobre.nome)}&nbsp;</p><p><br></p>`; titulo = `${sobre.nome} — ${dataLonga(agora())}`; }
    const comConteudo = !!(pronto && (pronto.html != null || pronto.titulo != null)); // { sid } sozinho só escolhe a secção
    if (comConteudo) { html = limparHtml(pronto.html || ''); titulo = pronto.titulo || ''; }
    const protegida = !!(secDe(sid) && secDe(sid).protegida);
    const meta = { id, seccaoId: sid, ...(m.tipo && !comConteudo && !sobre ? { tipo: m.tipo } : {}), titulo: protegida ? '' : titulo, criada: agora(), editada: agora(), txt: protegida ? '' : textoDe(html).slice(0, 600), tags: protegida ? [] : tagsDe(html) };
    try {
      if (protegida) { meta.tituloC = await cifrar(chave, titulo); await guardarPagina(id, { cifrado: await cifrar(chave, JSON.stringify({ html })), editada: agora() }); }
      else await guardarPagina(id, { html, editada: agora() }, sid);
    } catch (e) { console.error('Nota:', e); if (showToast) showToast('Não consegui criar a página.', 'error'); return; }
    mudarIndice(i => ({ ...i, paginas: [...(i.paginas || []), meta] }));
    focarNova.current = id;
    if (!protegida) { try { localStorage.setItem('notas-ult-sec', sid); } catch (e) { /* sem armazenamento */ } }
    setSecId(sid); setFiltro(null); setProcura(''); setPagId(id); setVista('pagina'); setCofreModal(true);
    if (protegida) setTitulosC(t => ({ ...t, [id]: titulo }));
  };
  // Nova palavra-passe: vai sempre para uma secção protegida (cria a secção "Cofre" se ainda não houver)
  const novaSenha = async (k = chave) => {
    if (!TEM_CRIPTO) { if (showToast) showToast('Este browser não tem cifra disponível.', 'error'); return; }
    if (!k) { pedirDesbloquear(kk => novaSenha(kk)); return; }
    const cadDe = s => (ix.cadernos || []).find(c => c.id === s.cadernoId) || {};
    let s = secao && secao.protegida && !cadDe(secao).partilhado ? secao : seccoes.find(x => x.protegida && !cadDe(x).partilhado);
    if (!s) {
      const cad = secao && !cadDe(secao).partilhado ? secao.cadernoId : ((ix.cadernos || []).find(c => !c.partilhado) || {}).id;
      if (!cad) { if (showToast) showToast('Cria primeiro um caderno.', 'error'); return; }
      s = { id: nId(), cadernoId: cad, nome: 'Cofre', cor: '#f59e0b', ordem: 99, protegida: true };
      const nova = s;
      mudarIndice(i => ({ ...i, seccoes: [...(i.seccoes || []), nova] }));
    }
    const id = nId();
    try {
      await guardarPagina(id, { cifrado: await cifrar(k, JSON.stringify({ html: '', senha: { tipo: 'login' } })), editada: agora() }, s.id);
      const meta = { id, seccaoId: s.id, titulo: '', tituloC: await cifrar(k, ''), tipo: 'senha', criada: agora(), editada: agora(), txt: '', tags: [] };
      mudarIndice(i => ({ ...i, paginas: [...(i.paginas || []), meta] }));
    } catch (e) { console.error('Cofre:', e); if (showToast) showToast('Não consegui criar a página.', 'error'); return; }
    setTitulosC(t2 => ({ ...t2, [id]: '' }));
    setSecId(s.id); setFiltro(null); setProcura(''); setPagId(id); setVista('pagina'); setCofreModal(true);
  };
  // Importar várias palavras-passe de uma vez (ficheiros do Notion, CSV) para uma secção protegida
  const abrirImportar = (k = chave) => {
    if (!TEM_CRIPTO) { if (showToast) showToast('Este browser não tem cifra disponível.', 'error'); return; }
    if (!k) { pedirDesbloquear(kk => abrirImportar(kk)); return; }
    const cadDe = s => (ix.cadernos || []).find(c => c.id === s.cadernoId) || {};
    let s = secao && secao.protegida && !cadDe(secao).partilhado ? secao : seccoes.find(x => x.protegida && !cadDe(x).partilhado);
    if (!s) {
      const cad = secao && !cadDe(secao).partilhado ? secao.cadernoId : ((ix.cadernos || []).find(c => !c.partilhado) || {}).id;
      if (!cad) { if (showToast) showToast('Cria primeiro um caderno.', 'error'); return; }
      s = { id: nId(), cadernoId: cad, nome: 'Cofre', cor: '#f59e0b', ordem: 99, protegida: true };
      const nova = s; mudarIndice(i => ({ ...i, seccoes: [...(i.seccoes || []), nova] }));
    }
    setImportar({ s, k });
  };
  const fazerImportar = async lista => {
    const { s, k } = importar || {}; if (!s || !k) return;
    const metas = [], nomes = {};
    const lote = agora();
    try {
      for (const e of lista) {
        const id = nId();
        await guardarPagina(id, { cifrado: await cifrar(k, JSON.stringify({ html: '', senha: e.dados })), editada: agora() }, s.id);
        metas.push({ id, seccaoId: s.id, titulo: '', tituloC: await cifrar(k, e.titulo), tipo: 'senha', criada: agora(), editada: agora(), txt: '', tags: [], imp: lote });
        nomes[id] = e.titulo;
      }
    } catch (er) { console.error('Importar:', er); if (showToast) showToast(`Só consegui importar ${metas.length} de ${lista.length}.`, 'error'); }
    if (metas.length) { mudarIndice(i => ({ ...i, paginas: [...(i.paginas || []), ...metas] })); setTitulosC(t2 => ({ ...t2, ...nomes })); setSecId(s.id); setFiltro(null); setProcura(''); setPagId(metas[0].id); setVista('paginas'); }
    setImportar(null);
    if (showToast && metas.length) showToast(`${metas.length} palavra${metas.length === 1 ? '' : 's'}-passe importada${metas.length === 1 ? '' : 's'} e cifrada${metas.length === 1 ? '' : 's'}. Apaga agora os ficheiros .md do computador.`, 'success', 8000);
  };
  const apagarPaginaOp = async p => {
    if (!await confirmar(`Apagar a página "${tituloDe(p)}"?`)) return;
    mudarIndice(i => ({ ...i, paginas: i.paginas.filter(x => x.id !== p.id) }));
    if (apagarPagina) apagarPagina(p.id).catch(() => {});
    if (pagId === p.id) { setPagId(null); setVista('paginas'); }
  };
  const duplicarPagina = async p => {
    try {
      const d = await lerPagina(p.id);
      const id = nId();
      await guardarPagina(id, { ...(d || {}), editada: agora() }, p.seccaoId);
      mudarIndice(i => ({ ...i, paginas: [...i.paginas, { ...p, id, titulo: p.titulo ? `${p.titulo} (cópia)` : p.titulo, criada: agora(), editada: agora(), fav: false }] }));
      setPagId(id);
    } catch (e) { if (showToast) showToast('Não consegui duplicar.', 'error'); }
  };
  const moverPagina = (p, destino) => {
    const de = secDe(p.seccaoId), para = secDe(destino);
    if (!para || de === para) return;
    if (p.tipo === 'senha' && !para.protegida) { if (showToast) showToast('As palavras-passe só podem ir para secções protegidas.', 'error'); return; }
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
  const apagarSeccao = async s => {
    const ps = (ix.paginas || []).filter(p => p.seccaoId === s.id);
    if (!await confirmar(`Apagar a secção "${s.nome}"${ps.length ? ` e as ${ps.length} página${ps.length === 1 ? '' : 's'} dela` : ''}?`)) return;
    mudarIndice(i => ({ ...i, seccoes: i.seccoes.filter(x => x.id !== s.id), paginas: i.paginas.filter(p => p.seccaoId !== s.id) }));
    ps.forEach(p => apagarPagina && apagarPagina(p.id).catch(() => {}));
    if (secId === s.id) setSecId(null);
  };
  const partilharPedir = c => setPedir({
    titulo: `Partilhar "${c.nome}"`,
    texto: 'Escreve o email Google da pessoa (ex.: a Sara). Ela entra na app com essa conta e vê só este caderno — as tuas finanças e os outros cadernos ficam privados.',
    campos: [{ k: 'e', tipo: 'email', ph: 'email@gmail.com' }],
    ok: async v => { const r = await partilha.partilhar(c.id, v.e); if (r) return r; setPedir(null); setPessoas(c.id); if (showToast) showToast(`"${c.nome}" está partilhado`); return ''; },
  });
  const sairDoCaderno = async c => { if (!await confirmar(`Deixar de ver "${c.nome}"? Para voltar, quem o criou tem de te juntar outra vez.`)) return; partilha.sair(c.id); };
  const apagarCaderno = async c => {
    const ss = seccoes.filter(s => s.cadernoId === c.id); const ids = new Set(ss.map(s => s.id));
    const ps = (ix.paginas || []).filter(p => ids.has(p.seccaoId));
    if (!await confirmar(`Apagar o caderno "${c.nome}" (${ss.length} secç${ss.length === 1 ? 'ão' : 'ões'}, ${ps.length} página${ps.length === 1 ? '' : 's'})?${c.partilhado ? '\n\nEstá partilhado: desaparece também para as outras pessoas.' : ''}`)) return;
    mudarIndice(i => ({ ...i, cadernos: i.cadernos.filter(x => x.id !== c.id), seccoes: i.seccoes.filter(s => !ids.has(s.id)), paginas: i.paginas.filter(p => !ids.has(p.seccaoId)) }));
    ps.forEach(p => apagarPagina && apagarPagina(p.id).catch(() => {}));
  };

  // ── Cofre (secções protegidas) ──
  const desligar2FA = () => setPedir({
    titulo: 'Desligar a verificação em 2 passos', texto: 'Para desligar, escreve o código atual da app de autenticação.', campos: [{ k: 'c', codigo: true, ph: '123 456' }],
    ok: async v => {
      try { const seg = await decifrar(chave, ix.cofre.otpC); if (!(await codigoValido(seg, v.c))) return 'Código errado.'; }
      catch (e) { return 'Tranca e volta a abrir o cofre primeiro.'; }
      mudarIndice(i => { const { otpC, otpEm, ...resto } = i.cofre || {}; return { ...i, cofre: resto }; });
      setPedir(null); if (showToast) showToast('Verificação em 2 passos desligada.'); return '';
    },
  });
  const bioReg = ix.cofre && ix.cofre.bio && bioId ? ix.cofre.bio[bioId] : null;
  const abrirComBio = async () => {
    const out = await prfDaPasskey(bioId, deB64(bioReg.salt));
    const bits = deB64(await decifrar(await chaveDoPrf(out), bioReg.emb));
    const k = await chaveDosBits(bits);
    if ((await decifrar(k, ix.cofre.verif)) !== 'cofre-ok') throw new Error('chave-antiga');
    return k;
  };
  const pedirDesbloquear = (depois = null, semBio = false) => {
    if (!TEM_CRIPTO) { if (showToast) showToast('Este browser não tem cifra disponível.', 'error'); return; }
    if (!ix.cofre) { criarCofre(depois); return; }
    if (bioReg && !semBio) {
      abrirComBio().then(k => { ultimaAtividade.current = Date.now(); setChave(k); setPedir(null); if (depois) setTimeout(() => depois(k), 0); })
        .catch(e => { if (e && e.message === 'chave-antiga' && showToast) showToast('A biometria deste dispositivo já não serve (a palavra-passe mudou?). Usa a palavra-passe e volta a ligá-la.', 'error'); pedirDesbloquear(depois, true); });
      return;
    }
    setPedir({
      titulo: 'Desbloquear notas protegidas', texto: 'Escreve a palavra-passe das notas protegidas.', campos: [{ k: 'p', tipo: 'password', ph: 'Palavra-passe' }],
      extra: bioReg ? { txt: 'Usar biometria', fn: () => { setPedir(null); pedirDesbloquear(depois); } } : null,
      ok: async v => {
        try {
          const k = await derivarChave(v.p, deB64(ix.cofre.salt));
          const t = await decifrar(k, ix.cofre.verif);
          if (t !== 'cofre-ok') return 'Palavra-passe errada.';
          if (ix.cofre.otpC) {
            const seg = await decifrar(k, ix.cofre.otpC);
            setPedir({
              titulo: 'Código de verificação', texto: 'Escreve o código de 6 dígitos da app de autenticação do telemóvel.', campos: [{ k: 'c', codigo: true, ph: '123 456' }],
              ok: async v2 => {
                if (!(await codigoValido(seg, v2.c))) return 'Código errado (ou já mudou). Tenta o que está agora na app.';
                ultimaAtividade.current = Date.now(); setChave(k); setPedir(null); if (depois) setTimeout(() => depois(k), 0); return '';
              },
            });
            return '';
          }
          ultimaAtividade.current = Date.now(); setChave(k); setPedir(null); if (depois) setTimeout(() => depois(k), 0); return '';
        } catch (e) { return 'Palavra-passe errada.'; }
      },
    });
  };
  const ligarBio = async () => {
    if (!ix.cofre || !navigator.credentials) return;
    const salt = crypto.getRandomValues(new Uint8Array(32));
    let cred;
    try {
      cred = await navigator.credentials.create({ publicKey: {
        rp: { name: 'Dashboard — cofre das notas' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'cofre', displayName: 'Cofre das notas' },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000,
        extensions: { prf: { eval: { first: salt } } },
      } });
    } catch (e) { if (showToast) showToast('A biometria foi cancelada ou não está disponível.', 'error'); return; }
    const ext = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
    if (ext.prf && ext.prf.enabled === false) { if (showToast) showToast('Este dispositivo não deixa usar a biometria para isto (precisa de iOS 18 / Android recente).', 'error'); return; }
    const id = b64(cred.rawId);
    let out = ext.prf && ext.prf.results && ext.prf.results.first ? new Uint8Array(ext.prf.results.first) : null;
    setPedir({
      titulo: 'Ligar a biometria', texto: 'Confirma a palavra-passe do cofre (só desta vez). Depois, neste dispositivo, abres o cofre com o Face ID / impressão digital.', campos: [{ k: 'p', tipo: 'password', ph: 'Palavra-passe' }],
      ok: async v => {
        try { if (!out) out = await prfDaPasskey(id, salt); } catch (e) { return 'A biometria não respondeu (ou este dispositivo não a deixa usar para isto). Tenta outra vez.'; }
        const bits = await bitsDaSenha(v.p, deB64(ix.cofre.salt));
        try { if ((await decifrar(await chaveDosBits(bits), ix.cofre.verif)) !== 'cofre-ok') return 'Palavra-passe errada.'; } catch (e) { return 'Palavra-passe errada.'; }
        const emb = await cifrar(await chaveDoPrf(out), b64(bits));
        mudarIndice(i => ({ ...i, cofre: { ...(i.cofre || {}), bio: { ...((i.cofre || {}).bio || {}), [id]: { salt: b64(salt), emb, nome: nomeDispositivo(), criado: agora() } } } }));
        try { localStorage.setItem(BIO_LS, id); } catch (e) { /* sem armazenamento */ }
        setBioId(id); setPedir(null);
        if (showToast) showToast('Pronto: neste dispositivo o cofre abre com a biometria.');
        return '';
      },
    });
  };
  const desligarBio = async () => {
    if (!await confirmar('Deixar de abrir o cofre com a biometria neste dispositivo?')) return;
    mudarIndice(i => { const bio = { ...((i.cofre || {}).bio || {}) }; delete bio[bioId]; return { ...i, cofre: { ...(i.cofre || {}), bio } }; });
    try { localStorage.removeItem(BIO_LS); } catch (e) { /* sem armazenamento */ }
    setBioId(null);
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
    if ((ix.paginas || []).some(p => p.seccaoId === s.id && p.tipo === 'senha')) { if (showToast) showToast('Esta secção tem palavras-passe: passa-as primeiro para outra secção protegida.', 'error'); return; }
    const fazer = async () => {
      if (!await confirmar(`Tirar a proteção de "${s.nome}"? As páginas voltam a ficar legíveis na base de dados.`)) return;
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
    setSecId(s.id); setFiltro(null); setProcura(''); setCofreModal(false); setSelCofre(null);
    const ps = ordenar((ix.paginas || []).filter(p => p.seccaoId === s.id));
    if (!larguraTelemovel && ps.length && !ps.some(p => p.id === pagId)) setPagId(ps[0].id);
    setVista('paginas');
    if (s.protegida && !chave) pedirDesbloquear();
  };
  const abrirPagina = p => { setPagId(p.id); if (!mostrarSeccao) setSecId(p.seccaoId); setVista('pagina'); };

  const apagarVarias = async ids => {
    const lista = (ix.paginas || []).filter(p => ids.has(p.id));
    if (!lista.length) return;
    if (!await confirmar(`Apagar ${lista.length} página${lista.length === 1 ? '' : 's'}?\n\n${lista.slice(0, 12).map(p => `• ${tituloDe(p)}`).join('\n')}${lista.length > 12 ? `\n… e mais ${lista.length - 12}` : ''}`)) return;
    mudarIndice(i => ({ ...i, paginas: i.paginas.filter(x => !ids.has(x.id)) }));
    if (apagarPagina) lista.forEach(p => apagarPagina(p.id).catch(() => {}));
    if (ids.has(pagId)) setPagId(null);
    setSelCofre(null);
    if (showToast) showToast(`${lista.length} apagada${lista.length === 1 ? '' : 's'}.`);
  };
  // A última importação (marcada com a hora em que foi feita) — para poder voltar a importar com outros nomes
  const ultimaImportacao = secao ? (() => { const ls = (ix.paginas || []).filter(p => p.seccaoId === secao.id && p.imp); if (!ls.length) return null; const lote = ls.map(p => p.imp).sort().pop(); return ls.filter(p => p.imp === lote); })() : null;

  if (modo === 'carregar') return <div className="py-16 text-center text-slate-400 text-sm">A carregar as notas…</div>;

  const linhaBtn = ativo => `w-full flex items-center gap-2 px-2 py-2 lg:py-1.5 rounded-lg text-sm text-left ${ativo ? (claro ? 'bg-slate-200/70 font-semibold' : 'bg-white/10 font-semibold') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`;
  const painel = `rounded-2xl border ${claro ? 'bg-white/80 border-slate-200' : 'bg-slate-800/40 border-slate-700/50'}`;

  // Coluna 1: procura, atalhos, cadernos e secções
  const procuraEl = (
      <div className="relative">
        <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${sub}`}><Ic n="procurar" /></span>
        <input value={procura} onChange={e => { setProcura(e.target.value); if (e.target.value && !larguraTelemovel) setVista('paginas'); }} placeholder="Procurar nas notas…" type="search" enterKeyHint="search"
          className={`w-full rounded-lg border pl-8 pr-3 py-2 text-base lg:text-sm outline-none focus:ring-2 focus:ring-blue-500 ${larguraTelemovel ? 'rounded-xl py-2.5' : ''} ${claro ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-700'}`} />
      </div>
  );
  const atalhosEl = (
      <div className="space-y-0.5">
        <button type="button" onClick={() => { setFiltro('recentes'); setProcura(''); setVista('paginas'); }} className={linhaBtn(filtro === 'recentes')}><Ic n="relogio" className={`w-4 h-4 ${sub}`} /> Recentes</button>
        <button type="button" onClick={() => { setFiltro('favoritos'); setProcura(''); setVista('paginas'); }} className={linhaBtn(filtro === 'favoritos')}><Ic n="estrela" className={`w-4 h-4 ${sub}`} /> Favoritos <span className={`ml-auto text-xs ${sub}`}>{(ix.paginas || []).filter(p => p.fav).length || ''}</span></button>
        <button type="button" onClick={() => setPainelG(true)} className={linhaBtn(false)} title="Notas ditas ao telemóvel (Google Tasks)"><Ic n="micro" className={`w-4 h-4 ${sub}`} /> Hey Google <span className={`ml-auto text-[11px] ${gCfg && gCfg.lista ? 'text-emerald-500' : sub}`}>{gCfg && gCfg.lista ? 'ligado' : ''}</span></button>
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
                  <button key={p.id} type="button" onClick={() => { setFiltro(null); setProcura(''); setSecId(p.seccaoId); setPagId(p.id); setVista('pagina'); setCofreModal(true); }}
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
  );
  const cadernosEl = (
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
                  {c.partilhado && <span className="text-emerald-500 shrink-0" title={`Partilhado: ${(c.membros || []).join(', ')}`}><Ic n="pessoas" className="w-3.5 h-3.5" /></span>}
                </button>
                <button type="button" onClick={() => novaSeccao(c.id)} className={`w-7 h-7 inline-flex items-center justify-center rounded-md lg:opacity-0 lg:group-hover:opacity-100 ${sub}`} aria-label={`Nova secção em ${c.nome}`} title="Nova secção"><Ic n="mais" className="w-3.5 h-3.5" /></button>
                <Menu claro={claro} itens={[
                  { txt: 'Mudar o nome', ic: 'editar', fn: () => renomear('caderno', c) }, { txt: 'Mudar a cor', fn: () => mudarCor('caderno', c) },
                  partilha && (c.partilhado ? { txt: 'Pessoas com acesso', ic: 'pessoas', fn: () => setPessoas(c.id) } : { txt: 'Partilhar…', ic: 'pessoas', fn: () => partilharPedir(c) }),
                  '-',
                  c.partilhado && c.dono && partilha && c.dono !== partilha.meuEmail
                    ? { txt: 'Deixar de ver este caderno', ic: 'lixo', perigo: true, fn: () => sairDoCaderno(c) }
                    : { txt: c.partilhado ? 'Apagar para todos' : 'Apagar caderno', ic: 'lixo', perigo: true, fn: () => apagarCaderno(c) },
                ]} />
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
                          c.partilhado ? null : s.protegida ? { txt: 'Tirar a proteção', ic: 'aberto', fn: () => desprotegerSeccao(s) } : { txt: 'Proteger com palavra-passe', ic: 'cadeado', fn: () => protegerSeccao(s) },
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
  );
  const rodapeEl = (<>
      {chave && <button type="button" onClick={trancar} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg border border-amber-400/40 text-amber-400 hover:bg-amber-400/10"><Ic n="cadeado" className="w-3.5 h-3.5" /> Trancar as notas protegidas</button>}
      {chave && ix.cofre && (bioReg
        ? <button type="button" onClick={desligarBio} className={`w-full text-[11px] ${sub} hover:text-red-400`}>✓ Abre com biometria neste dispositivo · desligar</button>
        : bioPode && <button type="button" onClick={ligarBio} className={`w-full text-[11px] ${sub} hover:text-blue-400`}>+ Abrir com Face ID / impressão digital neste dispositivo</button>)}
      {chave && ix.cofre && (ix.cofre.otpC
        ? <button type="button" onClick={desligar2FA} className={`w-full text-[11px] ${sub} hover:text-red-400`}>✓ Verificação em 2 passos ligada · desligar</button>
        : <button type="button" onClick={() => setAtivar2fa(true)} className={`w-full text-[11px] ${sub} hover:text-blue-400`}>+ Pedir também um código do telemóvel para abrir</button>)}
      {partilha && partilha.erro && (ix.cadernos || []).some(c => c.partilhado) && <p className="px-2 text-[11px] text-amber-400">Os cadernos partilhados não estão a atualizar (regras da Firebase).</p>}
      {modo === 'g' && <p className="px-2 text-[11px] text-amber-400">As notas estão a gravar no documento principal (falta a regra do Firestore). Funciona, mas o espaço é limitado.</p>}
  </>);
  const arvore = (
    <div className={`${painel} p-2 lg:p-3 space-y-3`}>
      {procuraEl}
      {atalhosEl}
      {cadernosEl}
      {rodapeEl}
    </div>
  );

  // ── Telemóvel: ecrã de entrada das notas (o que mais se usa logo à mão) ──
  const porEditada = (a, b) => String(b.editada || b.criada).localeCompare(String(a.editada || a.criada));
  const secRapida = (() => {
    const livre = s => s && !s.protegida;
    let u = null; try { u = secDe(localStorage.getItem('notas-ult-sec')); } catch (e) { /* sem armazenamento */ }
    if (livre(u)) return u;
    if (livre(secao)) return secao;
    return seccoes.find(s => livre(s) && /^geral$/i.test(s.nome)) || seccoes.find(livre) || null;
  })();
  const notaRapida = () => (secRapida ? novaPagina('branco', null, null, { sid: secRapida.id, titulo: '', html: '' }) : novaPagina('branco'));
  const ultCompras = (ix.paginas || []).filter(p => !p.tituloC && ehCompras(p)).sort(porEditada)[0] || null;
  const secCofre = seccoes.find(s => s.protegida && !(((ix.cadernos || []).find(c => c.id === s.cadernoId)) || {}).partilhado) || null;
  const recentesM = (ix.paginas || []).filter(p => !p.tituloC && p.tipo !== 'senha').sort(porEditada);
  const favsM = (ix.paginas || []).filter(p => p.fav && !(p.tipo === 'senha' && !chave)).sort(porEditada);
  const abrirDaHome = p => { setFiltro(null); setSecId(p.seccaoId); setPagId(p.id); setVista('pagina'); setCofreModal(true); };
  const tile = `rounded-2xl border text-left active:scale-[0.98] transition-transform ${claro ? 'bg-white border-slate-200' : 'bg-slate-800/60 border-slate-700/60'}`;
  const tituloSecM = t => <p className={`px-1 mb-2 text-xs font-semibold uppercase tracking-wide ${sub}`}>{t}</p>;
  const inicioMovel = (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-3xl font-bold tracking-tight">Notas</h2>
        <span className={`text-xs pb-1.5 ${sub}`}>{(ix.paginas || []).length} página{(ix.paginas || []).length === 1 ? '' : 's'}</span>
      </div>
      {procuraEl}
      {q ? (
        <div>
          {tituloSecM(`${lista.length} resultado${lista.length === 1 ? '' : 's'}`)}
          <div className={`${painel} p-1.5 space-y-0.5`}>
            {lista.map(p => { const s = secDe(p.seccaoId); return (
              <button key={p.id} type="button" onClick={() => abrirPagina(p)} className={`w-full text-left px-3 py-2.5 rounded-xl ${claro ? 'active:bg-slate-100' : 'active:bg-white/5'}`}>
                <span className="flex items-center gap-2"><span className="w-1 h-4 rounded-full shrink-0" style={{ background: s ? s.cor : '#94a3b8' }} /><span className="text-[15px] font-medium truncate">{tituloDe(p)}</span></span>
                <span className={`block text-xs truncate mt-0.5 ${sub}`}>{s ? `${s.nome} · ` : ''}{haQuanto(p.editada || p.criada)}{p.txt ? ` · ${p.txt.slice(0, 80)}` : ''}</span>
              </button>
            ); })}
            {!lista.length && <p className={`px-2 py-6 text-center text-sm ${sub}`}>Nada encontrado.</p>}
          </div>
        </div>
      ) : (<>
        <div className="space-y-2">
          <button type="button" onClick={notaRapida} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-white shadow-lg shadow-blue-600/25 bg-gradient-to-br from-blue-500 to-blue-700 active:scale-[0.99] transition-transform">
            <span className="w-10 h-10 rounded-xl bg-white/20 inline-flex items-center justify-center shrink-0"><Ic n="editar" className="w-5 h-5" /></span>
            <span className="min-w-0 text-left"><span className="block font-semibold">Nova nota</span><span className="block text-xs text-white/80 truncate">{secRapida ? `em ${secRapida.nome}` : 'Escreve já, organizas depois'}</span></span>
            <Ic n="mais" className="w-5 h-5 ml-auto shrink-0" />
          </button>
          <div className={`grid gap-2 ${secCofre ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <button type="button" onClick={() => (ultCompras ? abrirDaHome(ultCompras) : novaPagina('compras', null, null, secRapida ? { sid: secRapida.id } : null))} className={`${tile} px-3 py-3`}>
              <span className="w-8 h-8 rounded-lg inline-flex items-center justify-center bg-amber-500/15 text-amber-500"><Ic n="carrinho" className="w-[18px] h-[18px]" /></span>
              <span className="block text-sm font-medium mt-2">Compras</span>
              <span className={`block text-[11px] truncate ${sub}`}>{ultCompras ? haQuanto(ultCompras.editada || ultCompras.criada) : 'Lista nova'}</span>
            </button>
            <button type="button" onClick={() => novaPagina('todo', null, null, secRapida ? { sid: secRapida.id } : null)} className={`${tile} px-3 py-3`}>
              <span className="w-8 h-8 rounded-lg inline-flex items-center justify-center bg-emerald-500/15 text-emerald-500"><Ic n="visto" className="w-[18px] h-[18px]" /></span>
              <span className="block text-sm font-medium mt-2">Tarefas</span>
              <span className={`block text-[11px] truncate ${sub}`}>Lista com visto</span>
            </button>
            {secCofre && (
              <button type="button" onClick={() => abrirSeccao(secCofre)} className={`${tile} px-3 py-3`}>
                <span className="w-8 h-8 rounded-lg inline-flex items-center justify-center bg-slate-500/15 text-slate-400"><Ic n="cadeado" className="w-[18px] h-[18px]" /></span>
                <span className="block text-sm font-medium mt-2">{secCofre.nome}</span>
                <span className={`block text-[11px] truncate ${chave ? 'text-emerald-500' : sub}`}>{chave ? 'Aberto' : 'Trancado'}</span>
              </button>
            )}
          </div>
        </div>
        {favsM.length > 0 && (
          <div>
            {tituloSecM('Favoritos')}
            <div className="-mx-3 px-3 flex gap-2 overflow-x-auto scrollbar-hide" data-sem-swipe="1">
              {favsM.map(p => { const s = secDe(p.seccaoId); return (
                <button key={p.id} type="button" onClick={() => abrirDaHome(p)} className={`shrink-0 max-w-[60vw] inline-flex items-center gap-2 pl-2.5 pr-3.5 py-2 rounded-full border text-sm ${claro ? 'bg-white border-slate-200' : 'bg-slate-800/60 border-slate-700/60'}`}>
                  <span className="text-amber-400 text-xs" aria-hidden="true">★</span>
                  <span className="truncate">{tituloDe(p)}</span>
                  {p.tituloC && !chave ? <Ic n="cadeado" className="w-3 h-3 text-amber-400 shrink-0" /> : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s ? s.cor : '#94a3b8' }} />}
                </button>
              ); })}
            </div>
          </div>
        )}
        {recentesM.length > 0 && (
          <div>
            <div className="flex items-center justify-between">
              {tituloSecM('Recentes')}
              {recentesM.length > 6 && <button type="button" onClick={() => { setFiltro('recentes'); setProcura(''); setVista('paginas'); }} className="mb-2 px-1 text-xs font-medium text-blue-500">Ver todas</button>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {recentesM.slice(0, 6).map(p => { const s = secDe(p.seccaoId); return (
                <button key={p.id} type="button" onClick={() => abrirDaHome(p)} className={`${tile} relative overflow-hidden p-3 pl-3.5 min-h-[104px] flex flex-col`}>
                  <span className="absolute left-0 inset-y-0 w-1" style={{ background: s ? s.cor : '#94a3b8' }} />
                  <span className="text-sm font-semibold leading-snug line-clamp-2 break-words">{p.fav && <span className="text-amber-400 mr-1">★</span>}{tituloDe(p)}</span>
                  {p.txt && <span className={`mt-1 text-xs leading-snug line-clamp-2 break-words ${sub}`}>{p.txt.slice(0, 140)}</span>}
                  <span className={`mt-auto pt-2 text-[11px] truncate w-full ${sub}`}>{s ? `${s.nome} · ` : ''}{haQuanto(p.editada || p.criada)}</span>
                </button>
              ); })}
            </div>
          </div>
        )}
        <div>
          <div className={`${painel} p-2 space-y-3`}>
            {cadernosEl}
            {rodapeEl}
          </div>
        </div>
      </>)}
    </div>
  );
  // Botão redondo "+" (nota nova) por cima do menu de baixo
  const fabNotas = larguraTelemovel && vista === 'paginas' && !emGrelha ? (
    <button type="button" aria-label="Nova nota" title="Nova nota"
      onClick={() => (vista === 'paginas' && secao && !mostrarSeccao ? (secao.protegida && !chave ? pedirDesbloquear(k => novaPagina('branco', null, k)) : novaPagina('branco')) : notaRapida())}
      className="fixed right-4 z-40 w-14 h-14 rounded-full shadow-xl text-white inline-flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 active:scale-95 transition-transform no-print"
      style={{ bottom: comMenuBaixo ? 'calc(max(0.6rem, env(safe-area-inset-bottom)) + 96px)' : '1.5rem' }}>
      <Ic n="editar" className="w-6 h-6" />
    </button>
  ) : null;

  const temSenhasSec = !!(secao && secao.protegida && (ix.paginas || []).some(p => p.seccaoId === secao.id && p.tipo === 'senha'));
  const menuCofre = temSenhasSec ? ['-',
    emGrelha ? { txt: 'Ver em lista', ic: 'lista', fn: () => mudarVistaCofre(false) } : { txt: 'Ver em grelha (colunas)', ic: 'lista', fn: () => mudarVistaCofre(true) },
    emGrelha && chave && { txt: 'Selecionar para apagar…', ic: 'lixo', fn: () => setSelCofre(new Set()) },
    ultimaImportacao && { txt: `Desfazer a última importação (${ultimaImportacao.length})`, ic: 'lixo', perigo: true, fn: () => apagarVarias(new Set(ultimaImportacao.map(p => p.id))) },
  ] : [];
  const botaoVista = temSenhasSec && (
    <div className={`inline-flex rounded-lg p-0.5 ${claro ? 'bg-slate-100' : 'bg-white/5'}`} role="group" aria-label="Vista">
      {[[true, 'Grelha', <svg key="g" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>], [false, 'Lista', <Ic key="l" n="lista" className="w-3.5 h-3.5" />]].map(([g, nm, ic]) => (
        <button key={nm} type="button" onClick={() => mudarVistaCofre(g)} aria-pressed={emGrelha === g} title={nm} className={`w-7 h-7 inline-flex items-center justify-center rounded-md ${emGrelha === g ? (claro ? 'bg-white shadow-sm text-slate-900' : 'bg-white/15 text-white') : sub}`}>{ic}</button>
      ))}
    </div>
  );

  // Coluna 2: páginas
  const paginas = (
    <div className={`${painel} p-2 lg:p-3`}>
      <div className="flex items-center gap-1 mb-2">
        <button type="button" onClick={() => setVista('arvore')} className={`lg:hidden w-9 h-9 inline-flex items-center justify-center rounded-lg ${claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'}`} aria-label="Voltar"><Ic n="voltar" className="w-5 h-5" /></button>
        <p className="flex-1 min-w-0 px-1 font-semibold truncate flex items-center gap-1.5">{secao && !mostrarSeccao && <span className="w-1 h-4 rounded-full" style={{ background: secao.cor }} />}{tituloLista || 'Páginas'}{secao && !mostrarSeccao && secao.protegida && <Ic n={chave ? 'aberto' : 'cadeado'} className="w-3.5 h-3.5 text-amber-400" />}</p>
        {!mostrarSeccao && botaoVista}
        <select value={ordem} onChange={e => { setOrdem(e.target.value); try { localStorage.setItem('notas-ordem', e.target.value); } catch (er) { /* sem armazenamento */ } }} aria-label="Ordenar" className={`text-xs rounded-md bg-transparent px-1 py-1 ${sub}`}>
          <option value="editada" className={claro ? '' : 'bg-slate-800'}>Recentes</option><option value="criada" className={claro ? '' : 'bg-slate-800'}>Criação</option><option value="titulo" className={claro ? '' : 'bg-slate-800'}>A–Z</option>
        </select>
      </div>
      {!mostrarSeccao && secao && (
        <div className="flex gap-1.5 mb-2">
          <button type="button" onClick={() => (secao.protegida && !chave ? pedirDesbloquear(k => novaPagina('branco', null, k)) : novaPagina('branco'))} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white"><Ic n="mais" /> Página</button>
          {secao.protegida && <button type="button" onClick={() => novaSenha()} className="inline-flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-medium whitespace-nowrap rounded-lg border border-amber-400/50 text-amber-500 hover:bg-amber-400/10" title="Nova palavra-passe"><Ic n="cadeado" className="w-3.5 h-3.5" /> Palavra-passe</button>}
          <Menu claro={claro} itens={[...MODELOS.filter(m => m.id !== 'branco').map(m => ({ txt: `Nova: ${m.nome}`, fn: () => (secao.protegida && !chave ? pedirDesbloquear(k => novaPagina(m.id, null, k)) : novaPagina(m.id)) })), '-', { txt: 'Nova: Palavra-passe (cofre)', ic: 'cadeado', fn: () => novaSenha() }, { txt: 'Importar palavras-passe (Notion, CSV)…', ic: 'cadeado', fn: () => abrirImportar() }, ...menuCofre]} />
        </div>
      )}
      <div className="space-y-0.5">
        {lista.map(p => {
          const s = secDe(p.seccaoId);
          return (
            <button key={p.id} type="button" onClick={() => abrirPagina(p)} className={`w-full text-left px-2.5 py-2 rounded-lg ${pagId === p.id && !larguraTelemovel ? (claro ? 'bg-slate-200/70' : 'bg-white/10') : claro ? 'hover:bg-slate-100' : 'hover:bg-white/5'}`}>
              <span className="flex items-center gap-1.5">
                {p.fav && <span className="text-amber-400 text-xs">★</span>}
                {p.tipo === 'senha' ? <Ic n="cadeado" className="w-3.5 h-3.5 text-amber-400" /> : p.tituloC && !chave && <Ic n="cadeado" className="w-3.5 h-3.5 text-amber-400" />}
                <span className="text-sm font-medium truncate">{tituloDe(p)}</span>
              </span>
              {(p.tipo !== 'senha' || mostrarSeccao) && <span className={`block text-xs truncate ${sub}`}>{mostrarSeccao && s ? `${s.nome} · ` : ''}{haQuanto(p.editada || p.criada)}{p.txt ? ` · ${p.txt.slice(0, 80)}` : ''}</span>}
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
      <PaginaAberta key={pagina.id + (chave ? 'k' : '')} focar={focarNova.current === pagina.id} meta={pagina} seccao={secPagina} claro={claro} sub={sub}
        onVoltar={() => setVista('paginas')} lerPagina={lerPagina} guardarPagina={guardarPagina} mudarIndice={mudarIndice}
        entidades={entidades} onIrEntidade={onIrEntidade} enviarImagem={enviarImagem} chave={secPagina && secPagina.protegida ? chave : null}
        pedirDesbloquear={() => pedirDesbloquear()} showToast={showToast} menuItens={menuPagina}
        historicoCompras={historicoCompras}
        onPlanearCompras={perguntarIA && !(secPagina && secPagina.protegida) ? (itens, tit) => setPlanear({ itens, titulo: tit, sid: pagina.seccaoId }) : null}
        ouvirPagina={partilha && cadPagina && cadPagina.partilhado ? partilha.ouvirPagina : null} partilhada={!!(cadPagina && cadPagina.partilhado)} onAtividade={() => { ultimaAtividade.current = Date.now(); }}
        largo={largo} onLargo={larguraTelemovel || emGrelha ? null : mudarLargo} />
    </div>
  ) : (
    <div className={`${painel} p-10 text-center ${sub} hidden lg:block`}>
      <Ic n="caderno" className="w-10 h-10 mx-auto mb-3 opacity-50" />
      <p className="text-sm">Escolhe uma página ou cria uma nova.</p>
    </div>
  );

  // Cofre em grelha (colunas) — a página abre por cima, numa janela
  const grelha = emGrelha ? (
    <CofreGrelha paginas={lista} tituloDe={tituloDe} chave={chave} lerPagina={lerPagina} claro={claro} sub={sub} avisar={showToast} pedirDesbloquear={() => pedirDesbloquear()}
      marcadas={selCofre} onMarcar={id => setSelCofre(prev => { const n = new Set(prev || []); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
      onAbrir={p => { setPagId(p.id); setVista('pagina'); setCofreModal(true); }}
      onNomear={async pares => {
        if (!chave) return;
        const novos = {};
        for (const [id, nome] of pares) novos[id] = { nome, c: await cifrar(chave, nome) };
        mudarIndice(i => ({ ...i, paginas: i.paginas.map(x => (novos[x.id] ? { ...x, tituloC: novos[x.id].c } : x)) }));
        setTitulosC(t => ({ ...t, ...Object.fromEntries(Object.entries(novos).map(([id, v]) => [id, v.nome])) }));
        if (showToast) showToast(`${pares.length} com nome. Confirma se estão certos.`);
      }}
      cabecalho={
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button type="button" onClick={() => setVista('arvore')} className={`lg:hidden w-9 h-9 inline-flex items-center justify-center rounded-lg ${claro ? 'hover:bg-slate-200/70' : 'hover:bg-white/10'}`} aria-label="Voltar"><Ic n="voltar" className="w-5 h-5" /></button>
          <p className="flex-1 min-w-0 font-semibold truncate flex items-center gap-1.5"><span className="w-1 h-4 rounded-full" style={{ background: secao.cor }} />{secao.nome}<Ic n={chave ? 'aberto' : 'cadeado'} className="w-3.5 h-3.5 text-amber-400" /><span className={`text-xs font-normal ${sub}`}>{lista.length}</span></p>
          {selCofre ? (
            <>
              <span className={`text-xs ${sub}`}>{selCofre.size} escolhida{selCofre.size === 1 ? '' : 's'}</span>
              <button type="button" onClick={() => setSelCofre(new Set(lista.map(p => p.id)))} className={`px-2.5 py-1.5 text-xs rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>Todas</button>
              <button type="button" disabled={!selCofre.size} onClick={() => apagarVarias(selCofre)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-40">Apagar {selCofre.size || ''}</button>
              <button type="button" onClick={() => setSelCofre(null)} className={`px-2.5 py-1.5 text-xs rounded-lg ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}>Cancelar</button>
            </>
          ) : (
            <>
              {botaoVista}
              <button type="button" onClick={() => novaSenha()} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white"><Ic n="mais" className="w-3.5 h-3.5" /> Palavra-passe</button>
              <Menu claro={claro} itens={[{ txt: 'Nova página de texto', ic: 'mais', fn: () => (chave ? novaPagina('branco') : pedirDesbloquear(k => novaPagina('branco', null, k))) }, { txt: 'Importar palavras-passe (Notion, CSV)…', ic: 'cadeado', fn: () => abrirImportar() }, ...menuCofre]} />
            </>
          )}
        </div>
      } />
  ) : null;
  const fecharModal = () => setCofreModal(false);
  pedirAberto.current = !!(pedir || importar || pessoas);
  const modalCofre = emGrelha && cofreModal && pagina && pagina.seccaoId === secao.id && !larguraTelemovel ? (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 lg:p-8 animate-backdropIn backdrop-blur-md" style={{ background: claro ? 'rgba(15,23,42,.25)' : 'rgba(0,0,0,.45)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) fecharModal(); }}>
      <div className="relative w-full max-w-3xl max-h-full flex animate-modalIn">
        <button type="button" onClick={fecharModal} className={`absolute top-1 -right-12 w-9 h-9 inline-flex items-center justify-center rounded-full shadow-lg ${claro ? 'bg-white text-slate-600 hover:bg-slate-100' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`} aria-label="Fechar" title="Fechar (Esc)">✕</button>
        <div className={`flex-1 min-w-0 overflow-y-auto rounded-2xl shadow-2xl ${claro ? 'bg-white' : 'bg-slate-900'}`}>{editor}</div>
      </div>
    </div>
  ) : null;

  return (
    <div className={`${claro ? '' : 'dark-notas'}`}>
      <style>{CSS_NOTAS}</style>
      {larguraTelemovel ? (
        <div className="pb-24">
          {vista === 'arvore' && inicioMovel}
          {vista === 'paginas' && (grelha || paginas)}
          {vista === 'pagina' && (pagina ? editor : (grelha || paginas))}
        </div>
      ) : (
        grelha ? (
          <div className="grid grid-cols-[260px_minmax(0,1fr)] gap-4 items-start">
            <div className="sticky overflow-y-auto" style={{ top: topo, maxHeight: `calc(100vh - ${topo + 16}px)` }}>{arvore}</div>
            {grelha}
          </div>
        ) : (
        largo && pagina ? editor : (
        <div className="grid grid-cols-[260px_280px_minmax(0,1fr)] gap-4 items-start">
          <div className="sticky overflow-y-auto" style={{ top: topo, maxHeight: `calc(100vh - ${topo + 16}px)` }}>{arvore}</div>
          <div className="sticky overflow-y-auto" style={{ top: topo, maxHeight: `calc(100vh - ${topo + 16}px)` }}>{paginas}</div>
          {editor}
        </div>
        )
        )
      )}
      {modalCofre}
      {fabNotas}
      {pedir && <Pedir key={pedir.titulo} {...pedir} claro={claro} onFechar={() => setPedir(null)} />}
      {painelG && (
        <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-4 pt-[10vh] sm:pt-4 bg-black/55" onMouseDown={e => { if (e.target === e.currentTarget) setPainelG(false); }}>
          <div role="dialog" aria-label="Notas pelo Hey Google" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setPainelG(false); } }} className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl space-y-4 ${claro ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-800 border-slate-700 text-slate-100'}`}>
            <div className="flex items-start gap-3">
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${claro ? 'bg-blue-50 text-blue-600' : 'bg-blue-500/15 text-blue-300'}`}><Ic n="micro" className="w-5 h-5" /></span>
              <div className="flex-1">
                <p className="font-semibold">Notas pelo “Hey Google”</p>
                <p className={`text-sm ${sub}`}>Dizes uma nota ao telemóvel e ela aparece aqui, numa página por dia.</p>
              </div>
              <button type="button" onClick={() => setPainelG(false)} className={`w-8 h-8 rounded-lg ${sub} ${claro ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`} aria-label="Fechar">✕</button>
            </div>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-2.5"><span className={`shrink-0 w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center ${gCfg && gCfg.conta ? 'bg-emerald-500 text-white' : claro ? 'bg-slate-200' : 'bg-slate-700'}`}>{gCfg && gCfg.conta ? '✓' : '1'}</span>
                <div className="flex-1 space-y-1">
                  <p>Liga a conta Google do teu telemóvel (a do Gemini).</p>
                  {gCfg && gCfg.conta ? <p className={`text-xs ${sub}`}>Ligada: <b className={claro ? 'text-slate-700' : 'text-slate-200'}>{gCfg.conta}</b> · <button type="button" onClick={ligarG} className="text-blue-500 hover:underline">trocar</button></p>
                    : <button type="button" disabled={gOcupado} onClick={ligarG} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">{gOcupado ? 'A ligar…' : 'Ligar a conta Google'}</button>}
                </div>
              </li>
              <li className="flex gap-2.5"><span className={`shrink-0 w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center ${gCfg && gCfg.lista ? 'bg-emerald-500 text-white' : claro ? 'bg-slate-200' : 'bg-slate-700'}`}>{gCfg && gCfg.lista ? '✓' : '2'}</span>
                <div className="flex-1 space-y-1.5">
                  <p>Escolhe a lista do Google Tasks de onde vêm as notas.</p>
                  {gCfg && gCfg.conta && (gListas ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={gCfg.lista || ''} onChange={e => { const l = gListas.find(x => x.id === e.target.value); gravarGCfg({ ...gCfg, lista: l ? l.id : null, listaNome: l ? l.title : '' }); }} className={`flex-1 min-w-0 rounded-lg border px-2 py-1.5 text-sm bg-transparent ${claro ? 'border-slate-300' : 'border-slate-600'}`} aria-label="Lista do Google Tasks">
                        <option value="" className={claro ? '' : 'bg-slate-800'}>Escolhe…</option>
                        {gListas.map(l => <option key={l.id} value={l.id} className={claro ? '' : 'bg-slate-800'}>{l.title}</option>)}
                      </select>
                      {!gListas.some(l => /^notas?$/i.test(l.title)) && <button type="button" disabled={gOcupado} onClick={criarListaG} className={`px-2.5 py-1.5 text-xs rounded-lg border ${claro ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-600 hover:bg-white/5'}`}>Criar a lista “Notas”</button>}
                    </div>
                  ) : <p className={`text-xs ${sub}`}>A ver as tuas listas…</p>)}
                </div>
              </li>
              <li className="flex gap-2.5"><span className={`shrink-0 w-6 h-6 rounded-full text-xs font-semibold flex items-center justify-center ${claro ? 'bg-slate-200' : 'bg-slate-700'}`}>3</span>
                <div className="flex-1 space-y-1.5">
                  <p>Secção onde ficam as notas:</p>
                  <select value={(gCfg && gCfg.seccao) || ''} onChange={e => gravarGCfg({ ...(gCfg || {}), seccao: e.target.value || null })} className={`w-full rounded-lg border px-2 py-1.5 text-sm bg-transparent ${claro ? 'border-slate-300' : 'border-slate-600'}`} aria-label="Secção das notas por voz">
                    <option value="" className={claro ? '' : 'bg-slate-800'}>A primeira secção</option>
                    {seccoes.filter(s2 => !s2.protegida).map(s2 => { const c = (ix.cadernos || []).find(x => x.id === s2.cadernoId); return <option key={s2.id} value={s2.id} className={claro ? '' : 'bg-slate-800'}>{c ? `${c.nome} › ` : ''}{s2.nome}</option>; })}
                  </select>
                </div>
              </li>
            </ol>
            <div className={`rounded-xl p-3 text-sm space-y-1 ${claro ? 'bg-slate-50' : 'bg-slate-900/50'}`}>
              <p className="font-medium">No telemóvel, diz:</p>
              <p className={sub}>“Hey Google, adiciona {gCfg && gCfg.listaNome && !/^(my tasks|as minhas tarefas|minhas tarefas)$/i.test(gCfg.listaNome) ? <>à minha lista <b>{gCfg.listaNome}</b> do Google Tasks</> : 'aos meus Tasks'}: ideia para o vídeo do Mahjong…”</p>
              <p className={`text-xs ${sub}`}>A app vai buscar as notas quando abres as Notas (e ao voltares à app), e marca-as como feitas no Google Tasks.</p>
            </div>
            {gMsg && <p className={`text-sm ${/^⚠/.test(gMsg) ? 'text-red-400' : sub}`}>{gMsg}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {gCfg ? <button type="button" onClick={() => { gravarGCfg(null); setGListas(null); }} className={`text-xs ${sub} hover:text-red-400`}>Desligar</button> : <span />}
              <button type="button" disabled={!gCfg || !gCfg.lista || gOcupado} onClick={async () => { setGOcupado(true); await importarGoogle(true); setGOcupado(false); }} className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40">Ir buscar agora</button>
            </div>
          </div>
        </div>
      )}
      {planear && <PlanearCompras itens={planear.itens} titulo={planear.titulo} claro={claro} sub={sub} perguntarIA={perguntarIA} onFechar={() => setPlanear(null)}
        onGuardar={async (tit, html) => { const sid = planear.sid; setPlanear(null); await novaPagina('branco', null, null, { titulo: tit, html, sid }); if (showToast) showToast('Plano guardado numa página nova.'); }} />}
      {importar && <ImportarSenhas claro={claro} sub={sub} destino={`${(((ix.cadernos || []).find(c => c.id === importar.s.cadernoId)) || {}).nome || ''} › ${importar.s.nome}`} onImportar={fazerImportar} onFechar={() => setImportar(null)} />}
      {ativar2fa && chave && <Ativar2FA claro={claro} onFechar={() => setAtivar2fa(false)} onConfirmar={async seg => { const otpC = await cifrar(chave, seg); mudarIndice(i => ({ ...i, cofre: { ...(i.cofre || {}), otpC, otpEm: agora() } })); setAtivar2fa(false); if (showToast) showToast('Pronto: o cofre passa a pedir também o código do telemóvel.'); }} />}
      {pessoas && partilha && (() => { const c = (ix.cadernos || []).find(x => x.id === pessoas); if (!c) return null; return <PessoasCaderno c={c} claro={claro} meuEmail={partilha.meuEmail} onJuntar={e => partilha.partilhar(c.id, e)} onTirar={e => partilha.tirarPessoa(c.id, e)} onFechar={() => setPessoas(null)} />; })()}
    </div>
  );
};

export default Notas;
export { Notas, tagsDe, NOTAS_VAZIO };
export const FICHEIRO_APP = 'notas';
