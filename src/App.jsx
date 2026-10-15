import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { signInWithGoogle, logOut, subscribeToAuth, getUserData, saveUserData, subscribeToUserData } from './firebase';

// A app principal é grande, por isso vem num ficheiro à parte que começa a
// descarregar logo aqui, ao mesmo tempo que o login e os dados da Firebase.
// Assim o ecrã de "A carregar..." aparece mais depressa, sobretudo no telemóvel.
const carregarApp = () => import('./OrcamentoApp');
const appPromessa = carregarApp();
appPromessa.catch(() => {}); // o erro (se houver) é tratado em baixo
const OrcamentoApp = React.lazy(() => appPromessa
  .catch(carregarApp)
  .then(m => { try { sessionStorage.removeItem('app-recarregada'); } catch (e) { /* sem acesso */ } return m; })
  .catch(() => {
    // Ficheiro antigo depois de uma atualização: recarrega a página uma vez
    let ja = null;
    try { ja = sessionStorage.getItem('app-recarregada'); sessionStorage.setItem('app-recarregada', '1'); } catch (e) { ja = '1'; }
    if (!ja) { window.location.reload(); return new Promise(() => {}); }
    return { default: () => <EcraCarregar texto="Não foi possível abrir a app. Verifica a ligação à internet e recarrega a página." /> };
  }));

// Último recurso: se a app inteira der erro, mostra um aviso em vez de um ecrã em branco
class ProtecaoApp extends React.Component {
  constructor(props) { super(props); this.state = { erro: null }; }
  static getDerivedStateFromError(erro) { return { erro }; }
  componentDidCatch(erro) { console.error('Erro na app:', erro); }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div role="alert" className="max-w-md w-full text-center bg-slate-800/60 border border-slate-700 rounded-2xl p-6 text-slate-300">
          <p className="text-lg font-semibold mb-1">Algo correu mal</p>
          <p className="text-sm opacity-80 mb-5">Os teus dados estão guardados na cloud. Recarrega a página para continuar.</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white">Recarregar a página</button>
          <p className="mt-4 text-xs opacity-60 break-words">{String(this.state.erro?.message || this.state.erro)}</p>
        </div>
      </div>
    );
  }
}

const EcraCarregar = ({ texto }) => (
  <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
    <div className="text-center">
      <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-slate-400">{texto}</p>
    </div>
  </div>
);

// Versão memoizada: só re-renderiza quando os dados que afetam o conteúdo
// (user, initialData) mudam. Assim as oscilações de syncing/lastSync durante
// a gravação deixam de remontar os ecrãs e de apagar o que se está a escrever.
const MemoOrcamentoApp = React.memo(
  OrcamentoApp,
  (prev, next) =>
    prev.user === next.user &&
    prev.initialData === next.initialData &&
    prev.onSaveData === next.onSaveData &&
    prev.onLogout === next.onLogout &&
    prev.remoto === next.remoto
);

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(undefined); // undefined = loading, null = sem dados
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [erroCarregar, setErroCarregar] = useState(null); // não conseguiu ler os dados (ex.: sem internet) — nunca arranca com dados vazios
  const [remoto, setRemoto] = useState(null); // dados mudados noutro dispositivo
  const [tentativa, setTentativa] = useState(0);
  const dataLoadedRef = useRef(false);
  const userRef = useRef(null);

  // Manter ref do user atualizada
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Listen to auth state
  useEffect(() => {
    const unsubscribe = subscribeToAuth((user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load user data ONCE when logged in
  useEffect(() => {
    if (!user) {
      setUserData(undefined);
      dataLoadedRef.current = false;
      return;
    }

    if (dataLoadedRef.current) return;
    dataLoadedRef.current = true;

    const loadData = async () => {
      console.log('Carregando dados do utilizador...');
      try {
        const data = await getUserData(user.uid);
        console.log('Dados carregados:', data ? 'sim' : 'não');
        setErroCarregar(null);
        setUserData(data); // null só se o documento não existir (utilizador novo)
        setLastSync(data?.updatedAt || null);
      } catch (e) {
        // Falhou a leitura (sem internet, servidor em baixo…): NÃO arranca como utilizador novo —
        // isso gravava os valores vazios por cima dos teus dados. Mostra o erro e deixa tentar outra vez.
        console.error('Erro ao carregar dados:', e);
        dataLoadedRef.current = false;
        setErroCarregar(e);
      }
    };
    loadData();
  }, [user, tentativa]);

  // Depois de carregar, ouve o documento: se outro dispositivo gravar, a app recebe os dados novos
  const carregou = userData !== undefined;
  useEffect(() => {
    if (!user || !carregou) return undefined;
    return subscribeToUserData(user.uid, d => setRemoto(d));
  }, [user, carregou]);

  // Save data to Firebase - useCallback para evitar re-renders
  const handleSaveData = useCallback(async (data, opcoes = {}) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    
    setSyncing(true);
    try {
      const v = await saveUserData(currentUser.uid, data, opcoes);
      setLastSync(v || new Date().toISOString());
      console.log('Dados salvos no Firebase');
    } catch (error) {
      console.error('Error saving data:', error);
      setSyncing(false);
      throw error; // a app tem de saber que não gravou (para tentar outra vez e avisar)
    }
    setSyncing(false);
  }, []); // Sem dependências - usa ref para user

  // Memorizar props para evitar re-renders desnecessários
  const memoizedInitialData = useMemo(() => userData, [userData]);

  if (loading) {
    return <EcraCarregar texto="A carregar..." />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-6">💎</div>
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard Financeiro</h1>
          <p className="text-slate-400 mb-8">Gere o teu orçamento freelance de forma simples e eficiente.</p>
          
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Entrar com Google
          </button>
          
          <p className="text-slate-500 text-sm mt-6">
            Os teus dados ficam sincronizados na cloud e acessíveis em qualquer dispositivo.
          </p>
        </div>
      </div>
    );
  }

  if (erroCarregar && userData === undefined) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div role="alert" className="max-w-md w-full text-center bg-slate-800/60 border border-slate-700 rounded-2xl p-6 text-slate-300">
          <p className="text-lg font-semibold mb-1">Não consegui carregar os teus dados</p>
          <p className="text-sm opacity-80 mb-5">Verifica a ligação à internet. Os teus dados estão seguros na cloud — a app só abre depois de os ler, para não gravar nada por cima.</p>
          <button onClick={() => { setErroCarregar(null); setTentativa(x => x + 1); }} className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white">Tentar outra vez</button>
          <p className="mt-4 text-xs opacity-60 break-words">{String(erroCarregar?.message || erroCarregar)}</p>
        </div>
      </div>
    );
  }

  // Mostrar loading enquanto carrega dados do utilizador
  if (userData === undefined) {
    return <EcraCarregar texto="A carregar os teus dados..." />;
  }

  return (
    <ProtecaoApp>
    <Suspense fallback={<EcraCarregar texto="A carregar os teus dados..." />}>
      <MemoOrcamentoApp 
        user={user}
        initialData={memoizedInitialData}
        onSaveData={handleSaveData}
        onLogout={logOut}
        syncing={syncing}
        lastSync={lastSync}
        remoto={remoto}
      />
    </Suspense>
    </ProtecaoApp>
  );
};

export default App;
