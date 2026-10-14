import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot, collection, query, where, writeBatch } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, reauthenticateWithPopup } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCAyPVtpdIYSqx2JcLfCgIPbSKme68lQxM",
  authDomain: "dashboard-financas-f2b55.firebaseapp.com",
  projectId: "dashboard-financas-f2b55",
  storageBucket: "dashboard-financas-f2b55.firebasestorage.app",
  messagingSenderId: "1001287643592",
  appId: "1:1001287643592:web:1550e6bc9124bd63e250fd"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Provider com scope para Google Sheets
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');

// Guardar o access token para usar com Google Sheets API
let accessToken = null;

export const signInWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  // Guardar o access token
  const credential = GoogleAuthProvider.credentialFromResult(result);
  accessToken = credential?.accessToken;
  return result;
};

export const getAccessToken = () => accessToken;

// Pede outra vez a conta Google (para ações perigosas, como apagar todos os dados)
export const confirmarIdentidade = async () => {
  if (!auth.currentUser) throw new Error('Sem sessão.');
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'login', login_hint: auth.currentUser.email || '' });
  await reauthenticateWithPopup(auth.currentUser, p);
  return true;
};

export const logOut = () => {
  accessToken = null;
  return signOut(auth);
};

export const subscribeToAuth = (callback) => onAuthStateChanged(auth, callback);

// Firestore operations
export const getUserData = async (userId) => {
  const docRef = doc(db, 'users', userId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() : null;
};

export const saveUserData = async (userId, data) => {
  const docRef = doc(db, 'users', userId);
  await setDoc(docRef, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
};

export const subscribeToUserData = (userId, callback) => {
  const docRef = doc(db, 'users', userId);
  return onSnapshot(docRef, (doc) => {
    if (doc.exists()) {
      callback(doc.data());
    }
  });
};

// Separador Trabalho (tarefas, pastas, tempos): documento à parte, users/<uid>/trabalho/dados,
// para não encher o documento principal (o Firestore aceita até 1 MB por documento).
const docTrabalho = (userId) => doc(db, 'users', userId, 'trabalho', 'dados');

export const guardarTrabalho = async (userId, dados) => {
  await setDoc(docTrabalho(userId), dados);
};

// Chama cb(dados, pendente) sempre que o documento muda (também noutro dispositivo).
// Se não houver autorização, chama erro(e) — a app passa então a gravar no documento principal.
export const ouvirTrabalho = (userId, cb, erro) => onSnapshot(
  docTrabalho(userId),
  { includeMetadataChanges: false },
  (snap) => cb(snap.exists() ? snap.data() : null, snap.metadata.hasPendingWrites),
  (e) => { console.error('Trabalho:', e); if (erro) erro(e); }
);

// Trabalho dividido por anos: users/<uid>/trabalho/dados (pastas, jogos, freelancers…) +
// users/<uid>/trabalho/tarefas-2026, tarefas-2025… (as tarefas de cada ano). Cada documento tem o seu limite de 1 MB.
// Ouve a coleção toda de uma vez: cb({ dados, 'tarefas-2026': {...}, … }, pendente)
export const ouvirTrabalhoAnos = (userId, cb, erro) => onSnapshot(
  collection(db, 'users', userId, 'trabalho'),
  { includeMetadataChanges: false },
  (snap) => { const docs = {}; snap.forEach(d => { docs[d.id] = d.data(); }); cb(docs, snap.metadata.hasPendingWrites); },
  (e) => { console.error('Trabalho (anos):', e); if (erro) erro(e); }
);
// Grava vários documentos do Trabalho de uma vez (ou todos ou nenhum)
export const guardarTrabalhoDocs = async (userId, mapa) => {
  const b = writeBatch(db);
  Object.entries(mapa).forEach(([id, dados]) => b.set(doc(db, 'users', userId, 'trabalho', id), dados));
  await b.commit();
};

// Google Sheets API - Criar nova spreadsheet
export const createGoogleSheet = async (title, sheetsData) => {
  if (!accessToken) {
    throw new Error('Não autenticado. Por favor, faz logout e login novamente.');
  }
  
  // Criar spreadsheet
  const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: sheetsData.map((sheet, idx) => ({
        properties: { 
          sheetId: idx,
          title: sheet.title,
          gridProperties: { rowCount: sheet.data.length + 10, columnCount: 10 }
        }
      }))
    })
  });
  
  if (!createResponse.ok) {
    const error = await createResponse.json();
    throw new Error(error.error?.message || 'Erro ao criar spreadsheet');
  }
  
  const spreadsheet = await createResponse.json();
  const spreadsheetId = spreadsheet.spreadsheetId;
  
  // Adicionar dados a cada sheet
  const requests = [];
  
  sheetsData.forEach((sheet, sheetIdx) => {
    // Dados
    requests.push({
      updateCells: {
        range: {
          sheetId: sheetIdx,
          startRowIndex: 0,
          startColumnIndex: 0,
        },
        rows: sheet.data.map((row, rowIdx) => ({
          values: row.map((cell, colIdx) => {
            const cellData = { userEnteredValue: {} };
            
            if (typeof cell === 'number') {
              cellData.userEnteredValue.numberValue = cell;
            } else {
              cellData.userEnteredValue.stringValue = String(cell || '');
            }
            
            // Estilos
            const format = {};
            
            // Título principal (primeira linha)
            if (rowIdx === 0) {
              format.backgroundColor = { red: 0.31, green: 0.27, blue: 0.9 };
              format.textFormat = { bold: true, fontSize: 14, foregroundColor: { red: 1, green: 1, blue: 1 } };
              format.horizontalAlignment = 'CENTER';
            }
            // Headers de secção (linhas com ═══)
            else if (String(cell).includes('═══')) {
              format.backgroundColor = { red: 0.95, green: 0.95, blue: 0.95 };
            }
            // Headers de tabela
            else if (sheet.headerRows?.includes(rowIdx)) {
              format.backgroundColor = { red: 0.39, green: 0.4, blue: 0.95 };
              format.textFormat = { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } };
            }
            // Linhas de total
            else if (String(cell).toUpperCase().includes('TOTAL')) {
              format.backgroundColor = { red: 0.86, green: 0.98, blue: 0.88 };
              format.textFormat = { bold: true };
            }
            // Valores negativos
            else if (typeof cell === 'number' && cell < 0) {
              format.textFormat = { foregroundColor: { red: 0.9, green: 0.2, blue: 0.2 } };
            }
            
            if (Object.keys(format).length > 0) {
              cellData.userEnteredFormat = format;
            }
            
            // Formato de moeda para números (exceto percentagens)
            if (typeof cell === 'number' && !String(row[0]).includes('%')) {
              cellData.userEnteredFormat = {
                ...cellData.userEnteredFormat,
                numberFormat: { type: 'CURRENCY', pattern: '#,##0.00 €' }
              };
            }
            
            return cellData;
          })
        })),
        fields: 'userEnteredValue,userEnteredFormat'
      }
    });
    
    // Auto-resize colunas
    requests.push({
      autoResizeDimensions: {
        dimensions: {
          sheetId: sheetIdx,
          dimension: 'COLUMNS',
          startIndex: 0,
          endIndex: 6
        }
      }
    });
    
    // Freeze primeira linha
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId: sheetIdx,
          gridProperties: { frozenRowCount: 1 }
        },
        fields: 'gridProperties.frozenRowCount'
      }
    });
  });
  
  // Executar batch update
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests })
  });
  
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
};

// ── Anexos das tarefas (Firebase Storage). Só se carrega quando é preciso ──
let _storage = null;
const storageMod = async () => {
  if (!_storage) { const m = await import('firebase/storage'); _storage = { m, s: m.getStorage(app) }; }
  return _storage;
};
export const enviarAnexo = async (userId, caminho, ficheiro, onProgresso) => {
  const { m, s } = await storageMod();
  const r = m.ref(s, `users/${userId}/${caminho}`);
  return new Promise((ok, falha) => {
    const tarefa = m.uploadBytesResumable(r, ficheiro, { contentType: ficheiro.type || 'application/octet-stream' });
    tarefa.on('state_changed',
      x => { if (onProgresso) onProgresso(x.bytesTransferred / Math.max(1, x.totalBytes)); },
      falha,
      async () => { try { ok({ url: await m.getDownloadURL(tarefa.snapshot.ref), caminho: tarefa.snapshot.ref.fullPath }); } catch (e) { falha(e); } });
  });
};
export const apagarAnexo = async (caminho) => {
  try { const { m, s } = await storageMod(); await m.deleteObject(m.ref(s, caminho)); } catch (e) { console.warn('Anexo:', e); }
};

// ── Notas (estilo OneNote): um índice (cadernos, secções, títulos) e um documento por página ──
const docNotas = (userId) => doc(db, 'users', userId, 'notas', 'indice');
const docPaginaNota = (userId, id) => doc(db, 'users', userId, 'notasPaginas', id);
export const ouvirNotas = (userId, cb, erro) => onSnapshot(
  docNotas(userId),
  { includeMetadataChanges: false },
  (snap) => cb(snap.exists() ? snap.data() : null, snap.metadata.hasPendingWrites),
  (e) => { console.error('Notas:', e); if (erro) erro(e); }
);
export const guardarNotas = async (userId, dados) => { await setDoc(docNotas(userId), dados); };
export const lerPaginaNota = async (userId, id) => { const s = await getDoc(docPaginaNota(userId, id)); return s.exists() ? s.data() : null; };
export const guardarPaginaNota = async (userId, id, dados) => { await setDoc(docPaginaNota(userId, id), dados); };
export const apagarPaginaNota = async (userId, id) => { await deleteDoc(docPaginaNota(userId, id)); };

// ── Cadernos de notas partilhados (ex.: lista de compras com a Sara) ──
// partilhas/<id> guarda o índice (nome, secções, páginas) e "membros" (emails com acesso);
// partilhas/<id>/paginas/<pág> guarda o conteúdo de cada página.
const docPartilha = (id) => doc(db, 'partilhas', id);
const docPaginaPartilha = (cid, id) => doc(db, 'partilhas', cid, 'paginas', id);
export const ouvirPartilhas = (email, cb, erro) => onSnapshot(
  query(collection(db, 'partilhas'), where('membros', 'array-contains', email)),
  (snap) => { const out = {}; snap.forEach(d => { out[d.id] = { ...d.data(), id: d.id }; }); cb(out, snap.metadata.hasPendingWrites); },
  (e) => { console.error('Partilhas:', e); if (erro) erro(e); }
);
export const guardarPartilha = async (id, dados) => { await setDoc(docPartilha(id), dados, { merge: true }); };
export const apagarPartilha = async (id) => { await deleteDoc(docPartilha(id)); };
export const lerPaginaPartilha = async (cid, id) => { const s = await getDoc(docPaginaPartilha(cid, id)); return s.exists() ? s.data() : null; };
export const guardarPaginaPartilha = async (cid, id, dados) => { await setDoc(docPaginaPartilha(cid, id), dados); };
export const apagarPaginaPartilha = async (cid, id) => { await deleteDoc(docPaginaPartilha(cid, id)); };
export const ouvirPaginaPartilha = (cid, id, cb) => onSnapshot(
  docPaginaPartilha(cid, id),
  (s) => { if (!s.metadata.hasPendingWrites) cb(s.exists() ? s.data() : null); },
  (e) => console.error('Página partilhada:', e)
);
