import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

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
