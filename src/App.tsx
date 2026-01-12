import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Settings from './pages/Settings';
import ApiProxy from './pages/ApiProxy';
import Monitor from './pages/Monitor';
import ThemeManager from './components/common/ThemeManager';
import { useEffect } from 'react';
import { useConfigStore } from './stores/useConfigStore';
import { useAccountStore } from './stores/useAccountStore';
import { useTranslation } from 'react-i18next';
import { isTauri } from './utils/request';


import Login from './pages/Login';
import { useAuth } from './hooks/useAuth';
import { Navigate, Outlet } from 'react-router-dom';

// 数据初始化组件 - 仅在认证通过后运行
const DataInitializer = ({ children }: { children: React.ReactNode }) => {
  const { loadConfig } = useConfigStore();
  const { fetchCurrentAccount, fetchAccounts } = useAccountStore();

  useEffect(() => {
    const init = async () => {
      try {
        await loadConfig();
        await fetchCurrentAccount();
        await fetchAccounts();

        // Show window logic for Tauri
        if (isTauri()) {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          setTimeout(async () => {
            await getCurrentWindow().show();
          }, 100);
        }
      } catch (e) {
        console.error("Data initialization failed:", e);
      }
    };
    init();
  }, [loadConfig, fetchCurrentAccount, fetchAccounts]);

  return <>{children}</>;
};

// 路由保护组件
const RequireAuth = () => {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return (
    <DataInitializer>
      <Outlet />
    </DataInitializer>
  );
};

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPageWrapper />,
  },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          {
            index: true,
            element: <Dashboard />,
          },
          {
            path: 'accounts',
            element: <Accounts />,
          },
          {
            path: 'api-proxy',
            element: <ApiProxy />,
          },
          {
            path: 'monitor',
            element: <Monitor />,
          },
          {
            path: 'settings',
            element: <Settings />,
          },
        ]
      }
    ]
  },
]);

// 包装 Login 组件以注入 props
function LoginPageWrapper() {
  const auth = useAuth();

  if (auth.isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  return (
    <Login
      isPasswordSet={auth.isPasswordSet}
      onSetup={auth.setup}
      onLogin={auth.login}
      error={auth.error}
      isLoading={auth.isLoading && !auth.error} // 仅在无错误 loading 时显示 loading 状态
    />
  );
}

function App() {
  const { config } = useConfigStore();
  const { fetchCurrentAccount, fetchAccounts } = useAccountStore();
  const { i18n } = useTranslation();

  // Sync language from config
  useEffect(() => {
    if (config?.language) {
      i18n.changeLanguage(config.language);
    }
  }, [config?.language, i18n]);

  // Listen for tray events
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void)[] = [];

    const initListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        // 监听托盘切换账号事件
        unlisten.push(await listen('tray://account-switched', () => {
          console.log('[App] Tray account switched, refreshing...');
          fetchCurrentAccount();
          fetchAccounts();
        }));

        // 监听托盘刷新事件
        unlisten.push(await listen('tray://refresh-current', () => {
          console.log('[App] Tray refresh triggered, refreshing...');
          fetchCurrentAccount();
          fetchAccounts();
        }));
      } catch (e) {
        console.warn("Failed to setup Tauri listeners", e);
      }
    };

    initListeners();

    // Cleanup
    return () => {
      unlisten.forEach(u => u());
    };
  }, [fetchCurrentAccount, fetchAccounts]);

  return (
    <>
      <ThemeManager />
      <RouterProvider router={router} />
    </>
  );
}

export default App;