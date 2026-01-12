import { useState, useEffect, useCallback } from 'react';
import { isTauri } from '../utils/request';

interface AuthState {
    isLoading: boolean;
    isPasswordSet: boolean;
    isLoggedIn: boolean;
    error: string | null;
}

interface UseAuthReturn extends AuthState {
    setup: (password: string) => Promise<boolean>;
    login: (password: string) => Promise<boolean>;
    logout: () => Promise<void>;
    checkStatus: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
    const [state, setState] = useState<AuthState>({
        isLoading: true,
        isPasswordSet: false,
        isLoggedIn: false,
        error: null,
    });

    // 检查认证状态
    const checkStatus = useCallback(async () => {
        // Tauri 模式不需要登录
        if (isTauri()) {
            setState({
                isLoading: false,
                isPasswordSet: true,
                isLoggedIn: true,
                error: null,
            });
            return;
        }

        try {
            const res = await fetch('/api/auth/status');
            if (!res.ok) {
                throw new Error('Failed to check auth status');
            }
            const json = await res.json();

            setState({
                isLoading: false,
                isPasswordSet: json.data?.password_set ?? false,
                isLoggedIn: json.data?.logged_in ?? false,
                error: null,
            });
        } catch (e) {
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: e instanceof Error ? e.message : 'Unknown error',
            }));
        }
    }, []);

    // 首次设置密码
    const setup = useCallback(async (password: string): Promise<boolean> => {
        try {
            setState(prev => ({ ...prev, isLoading: true, error: null }));

            const res = await fetch('/api/auth/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            const json = await res.json();

            if (!res.ok) {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: json.message || 'Setup failed',
                }));
                return false;
            }

            // 设置成功后自动登录
            setState({
                isLoading: false,
                isPasswordSet: true,
                isLoggedIn: true,
                error: null,
            });
            return true;
        } catch (e) {
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: e instanceof Error ? e.message : 'Unknown error',
            }));
            return false;
        }
    }, []);

    // 登录
    const login = useCallback(async (password: string): Promise<boolean> => {
        try {
            setState(prev => ({ ...prev, isLoading: true, error: null }));

            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            const json = await res.json();

            if (!res.ok) {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: json.message || '登录失败',
                }));
                return false;
            }

            setState({
                isLoading: false,
                isPasswordSet: true,
                isLoggedIn: true,
                error: null,
            });
            return true;
        } catch (e) {
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: e instanceof Error ? e.message : 'Unknown error',
            }));
            return false;
        }
    }, []);

    // 登出
    const logout = useCallback(async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            setState(prev => ({
                ...prev,
                isLoggedIn: false,
            }));
        } catch (e) {
            console.error('Logout error:', e);
        }
    }, []);

    // 初始化时检查状态
    useEffect(() => {
        checkStatus();
    }, [checkStatus]);

    return {
        ...state,
        setup,
        login,
        logout,
        checkStatus,
    };
}
