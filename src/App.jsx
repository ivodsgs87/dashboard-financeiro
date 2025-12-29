import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { signInWithGoogle, logOut, subscribeToAuth, getUserData, saveUserData } from './firebase';
import OrcamentoApp from './OrcamentoApp';

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(undefined); // undefined = loading, null = sem dados
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
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
        setUserData(data); // null se não existir, objeto se existir
        setLastSync(data?.updatedAt || null);
      } catch (e) {
        console.error('Erro ao carregar dados:', e);
        setUserData(null);
      }
    };
    loadData();
  }, [user]);

  // Save data to Firebase - useCallback para evitar re-renders
  const handleSaveData = useCallback(async (data) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    
    setSyncing(true);
    try {
      await saveUserData(currentUser.uid, data);
      setLastSync(new Date().toISOString());
      console.log('Dados salvos no Firebase');
    } catch (error) {
      console.error('Error saving data:', error);
    }
    setSyncing(false);
  }, []); // Sem dependências - usa ref para user

  // Memorizar props para evitar re-renders desnecessários
  const memoizedInitialData = useMemo(() => userData, [userData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">A carregar...</p>
        </div>
      </div>
    );
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

  // Mostrar loading enquanto carrega dados do utilizador
  if (userData === undefined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">A carregar os teus dados...</p>
        </div>
      </div>
    );
  }

  return (
    <OrcamentoApp 
      user={user}
      initialData={memoizedInitialData}
      onSaveData={handleSaveData}
      onLogout={logOut}
      syncing={syncing}
      lastSync={lastSync}
    />
  );
};

export default App;
