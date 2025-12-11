# 💎 Dashboard Financeiro

Aplicação de gestão de orçamento para freelancers com sincronização na cloud via Firebase.

## 🚀 Deploy no Vercel

### Passo 1: Criar repositório GitHub

1. Vai a https://github.com/new
2. Cria um novo repositório (ex: `dashboard-financeiro`)
3. Faz upload de todos os ficheiros desta pasta

### Passo 2: Deploy no Vercel

1. Vai a https://vercel.com
2. Clica "Add New..." > "Project"
3. Importa o repositório GitHub que criaste
4. Clica "Deploy" (as configurações default funcionam)
5. Aguarda ~1 minuto

### Passo 3: Configurar domínio autorizado no Firebase

1. Vai a https://console.firebase.google.com
2. Abre o teu projeto
3. Vai a Authentication > Settings > Authorized domains
4. Adiciona o domínio do Vercel (ex: `dashboard-financeiro.vercel.app`)

### Passo 4: Configurar regras Firestore

1. No Firebase Console, vai a Firestore Database > Rules
2. Substitui pelas seguintes regras:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Clica "Publish"

## ✅ Pronto!

Acede ao URL do Vercel e faz login com a tua conta Google. Os dados sincronizam automaticamente entre dispositivos.

## 🛠️ Desenvolvimento Local

```bash
npm install
npm run dev
```

Abre http://localhost:5173
