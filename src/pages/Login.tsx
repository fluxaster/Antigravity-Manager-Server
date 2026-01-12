import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Eye, EyeOff, Key, Shield } from 'lucide-react';

interface LoginProps {
    isPasswordSet: boolean;
    onSetup: (password: string) => Promise<boolean>;
    onLogin: (password: string) => Promise<boolean>;
    error: string | null;
    isLoading: boolean;
}

export default function Login({ isPasswordSet, onSetup, onLogin, error, isLoading }: LoginProps) {
    const { t } = useTranslation();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);

        if (!isPasswordSet) {
            // 设置密码模式
            if (password.length < 6) {
                setLocalError(t('auth.password_too_short') || '密码长度至少需要 6 个字符');
                return;
            }
            if (password !== confirmPassword) {
                setLocalError(t('auth.password_mismatch') || '两次输入的密码不一致');
                return;
            }
            await onSetup(password);
        } else {
            // 登录模式
            await onLogin(password);
        }
    };

    const displayError = localError || error;

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950">
            {/* 背景装饰 */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400/20 rounded-full blur-3xl"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-400/20 rounded-full blur-3xl"></div>
            </div>

            <div className="relative w-full max-w-md px-6">
                {/* Logo 和标题 */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg mb-4">
                        <Shield className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Antigravity Tools
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">
                        {isPasswordSet
                            ? (t('auth.login_subtitle') || '请输入密码访问管理界面')
                            : (t('auth.setup_subtitle') || '首次使用，请设置访问密码')}
                    </p>
                </div>

                {/* 登录卡片 */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 p-8">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* 标题 */}
                        <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                            {isPasswordSet ? (
                                <>
                                    <Lock className="w-5 h-5 text-blue-500" />
                                    {t('auth.login_title') || '登录'}
                                </>
                            ) : (
                                <>
                                    <Key className="w-5 h-5 text-indigo-500" />
                                    {t('auth.setup_title') || '设置密码'}
                                </>
                            )}
                        </div>

                        {/* 错误提示 */}
                        {displayError && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                                {displayError}
                            </div>
                        )}

                        {/* 密码输入 */}
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                {t('auth.password') || '密码'}
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    placeholder={isPasswordSet ? '••••••' : (t('auth.enter_password') || '输入密码')}
                                    autoFocus
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        {/* 确认密码（仅设置模式） */}
                        {!isPasswordSet && (
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {t('auth.confirm_password') || '确认密码'}
                                </label>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    placeholder={t('auth.reenter_password') || '再次输入密码'}
                                    required
                                />
                            </div>
                        )}

                        {/* 提交按钮 */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    {t('common.loading') || '处理中...'}
                                </>
                            ) : isPasswordSet ? (
                                <>
                                    <Lock className="w-5 h-5" />
                                    {t('auth.login_button') || '登录'}
                                </>
                            ) : (
                                <>
                                    <Key className="w-5 h-5" />
                                    {t('auth.setup_button') || '设置并登录'}
                                </>
                            )}
                        </button>
                    </form>

                    {/* 提示信息 */}
                    {!isPasswordSet && (
                        <p className="mt-4 text-xs text-center text-gray-500 dark:text-gray-400">
                            {t('auth.setup_hint') || '密码设置后无法通过界面修改，如需重置请删除服务器上的密码文件'}
                        </p>
                    )}
                </div>

                {/* 版本信息 */}
                <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
                    Antigravity Tools - Headless Server
                </p>
            </div>
        </div>
    );
}
