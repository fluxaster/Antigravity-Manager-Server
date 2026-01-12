import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Database, Globe, FileClock, Loader2, CheckCircle2, XCircle, Copy, Check, ExternalLink, ClipboardPaste, Upload } from 'lucide-react';
import { useAccountStore } from '../../stores/useAccountStore';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { request as invoke, isTauri } from '../../utils/request';
import { getWebOAuthUrl, submitWebOAuthCode } from '../../services/accountService';

interface AddAccountDialogProps {
    onAdd: (email: string, refreshToken: string) => Promise<void>;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

function AddAccountDialog({ onAdd }: AddAccountDialogProps) {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'oauth' | 'token' | 'import'>('oauth');
    const [refreshToken, setRefreshToken] = useState('');
    const [oauthUrl, setOauthUrl] = useState('');
    const [oauthUrlCopied, setOauthUrlCopied] = useState(false);

    // Web 模式手动 Code 输入
    const [manualCode, setManualCode] = useState('');
    const isWebMode = !isTauri();

    // UI State
    const [status, setStatus] = useState<Status>('idle');
    const [message, setMessage] = useState('');

    const { startOAuthLogin, completeOAuthLogin, cancelOAuthLogin, importFromDb, importV1Accounts, importFromCustomDb, refreshAllQuotas, fetchAccounts } = useAccountStore();

    const oauthUrlRef = useRef(oauthUrl);
    const statusRef = useRef(status);
    const activeTabRef = useRef(activeTab);
    const isOpenRef = useRef(isOpen);

    useEffect(() => {
        oauthUrlRef.current = oauthUrl;
        statusRef.current = status;
        activeTabRef.current = activeTab;
        isOpenRef.current = isOpen;
    }, [oauthUrl, status, activeTab, isOpen]);

    // Reset state when dialog opens or tab changes
    useEffect(() => {
        if (isOpen) {
            resetState();
        }
    }, [isOpen, activeTab]);

    // Listen for OAuth URL
    useEffect(() => {
        let unlisten: (() => void) | undefined;

        const setupListener = async () => {
            unlisten = await listen('oauth-url-generated', (event) => {
                setOauthUrl(event.payload as string);
                // 自动复制到剪贴板? 可选，这里只设置状态让用户手动复制
            });
        };

        setupListener();

        return () => {
            if (unlisten) unlisten();
        };
    }, []);

    // Listen for OAuth callback completion (user may open the URL manually without clicking Start)
    useEffect(() => {
        let unlisten: (() => void) | undefined;

        const setupListener = async () => {
            unlisten = await listen('oauth-callback-received', async () => {
                if (!isOpenRef.current) return;
                if (activeTabRef.current !== 'oauth') return;
                if (statusRef.current === 'loading' || statusRef.current === 'success') return;
                if (!oauthUrlRef.current) return;

                // Auto-complete: exchange code and save account (no browser open)
                setStatus('loading');
                setMessage(`${t('accounts.add.tabs.oauth')}...`);

                try {
                    await completeOAuthLogin();
                    setStatus('success');
                    setMessage(`${t('accounts.add.tabs.oauth')} ${t('common.success')}!`);
                    setTimeout(() => {
                        setIsOpen(false);
                        resetState();
                    }, 1500);
                } catch (error) {
                    setStatus('error');
                    let errorMsg = String(error);
                    if (errorMsg.includes('Refresh Token') || errorMsg.includes('refresh_token')) {
                        setMessage(errorMsg);
                    } else if (errorMsg.includes('Tauri') || errorMsg.toLowerCase().includes('environment') || errorMsg.includes('环境')) {
                        setMessage(t('common.environment_error', { error: errorMsg }));
                    } else {
                        setMessage(`${t('accounts.add.tabs.oauth')} ${t('common.error')}: ${errorMsg}`);
                    }
                }
            });
        };

        setupListener();

        return () => {
            if (unlisten) unlisten();
        };
    }, [completeOAuthLogin, t]);

    // Pre-generate OAuth URL when dialog opens on OAuth tab (so URL is shown BEFORE "Start OAuth")
    useEffect(() => {
        if (!isOpen) return;
        if (activeTab !== 'oauth') return;
        if (oauthUrl) return;

        invoke<string>('prepare_oauth_url')
            .then((url) => {
                // Set directly (also emitted via event), to avoid any race if event is missed.
                if (typeof url === 'string' && url.length > 0) setOauthUrl(url);
            })
            .catch((e) => {
                console.error('Failed to prepare OAuth URL:', e);
            });
    }, [isOpen, activeTab, oauthUrl]);

    // If user navigates away from OAuth tab, cancel prepared flow to release the port.
    useEffect(() => {
        if (!isOpen) return;
        if (activeTab === 'oauth') return;
        if (!oauthUrl) return;

        cancelOAuthLogin().catch(() => { });
        setOauthUrl('');
        setOauthUrlCopied(false);
    }, [isOpen, activeTab]);

    const resetState = () => {
        setStatus('idle');
        setMessage('');
        setRefreshToken('');
        setOauthUrl('');
        setOauthUrlCopied(false);
        setManualCode('');
    };

    const handleAction = async (
        actionName: string,
        actionFn: () => Promise<any>,
        options?: { clearOauthUrl?: boolean }
    ) => {
        setStatus('loading');
        setMessage(`${actionName}...`);
        if (options?.clearOauthUrl !== false) {
            setOauthUrl(''); // Clear previous URL
        }
        try {
            await actionFn();
            setStatus('success');
            setMessage(`${actionName} ${t('common.success')}!`);

            // 延迟关闭,让用户看到成功状态
            setTimeout(() => {
                setIsOpen(false);
                resetState();
            }, 1500);
        } catch (error) {
            setStatus('error');

            // 改进错误信息显示
            let errorMsg = String(error);

            // 如果是 refresh_token 缺失错误,显示完整信息(包含解决方案)
            if (errorMsg.includes('Refresh Token') || errorMsg.includes('refresh_token')) {
                setMessage(errorMsg);
            } else if (errorMsg.includes('Tauri') || errorMsg.toLowerCase().includes('environment') || errorMsg.includes('环境')) {
                // 环境错误
                setMessage(t('common.environment_error', { error: errorMsg }));
            } else {
                // 其他错误
                setMessage(`${actionName} ${t('common.error')}: ${errorMsg}`);
            }
        }
    };

    const handleSubmit = async () => {
        if (!refreshToken) {
            setStatus('error');
            setMessage(t('accounts.add.token.error_token'));
            return;
        }

        setStatus('loading');

        // 1. 尝试解析输入
        let tokens: string[] = [];
        const input = refreshToken.trim();

        try {
            // 尝试解析为 JSON
            if (input.startsWith('[') && input.endsWith(']')) {
                const parsed = JSON.parse(input);
                if (Array.isArray(parsed)) {
                    tokens = parsed
                        .map((item: any) => item.refresh_token)
                        .filter((t: any) => typeof t === 'string' && t.startsWith('1//'));
                }
            }
        } catch (e) {
            // JSON 解析失败,忽略
            console.debug('JSON parse failed, falling back to regex', e);
        }

        // 2. 如果 JSON 解析没有结果,尝试正则提取 (或者输入不是 JSON)
        if (tokens.length === 0) {
            const regex = /1\/\/[a-zA-Z0-9_\-]+/g;
            const matches = input.match(regex);
            if (matches) {
                tokens = matches;
            }
        }

        // 去重
        tokens = [...new Set(tokens)];

        if (tokens.length === 0) {
            setStatus('error');
            setMessage(t('accounts.add.token.error_token')); // 或者提示"未找到有效 Token"
            return;
        }

        // 3. 批量添加
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < tokens.length; i++) {
            const currentToken = tokens[i];
            setMessage(t('accounts.add.token.batch_progress', { current: i + 1, total: tokens.length }));

            try {
                await onAdd("", currentToken);
                successCount++;
            } catch (error) {
                console.error(`Failed to add token ${i + 1}:`, error);
                failCount++;
            }
            // 稍微延迟一下,避免太快
            await new Promise(r => setTimeout(r, 100));
        }

        // 4. 结果反馈
        if (successCount === tokens.length) {
            setStatus('success');
            setMessage(t('accounts.add.token.batch_success', { count: successCount }));
            setTimeout(() => {
                setIsOpen(false);
                resetState();
            }, 1500);
        } else if (successCount > 0) {
            // 部分成功
            setStatus('success'); // 还是用绿色,但提示部分失败
            setMessage(t('accounts.add.token.batch_partial', { success: successCount, fail: failCount }));
            // 不自动关闭,让用户看到结果
        } else {
            // 全部失败
            setStatus('error');
            setMessage(t('accounts.add.token.batch_fail'));
        }
    };

    const handleOAuth = () => {
        // Default flow: opens the default browser and completes automatically.
        // (If user opened the URL manually, completion is also triggered by oauth-callback-received.)
        handleAction(t('accounts.add.tabs.oauth'), startOAuthLogin, { clearOauthUrl: false });
    };

    const handleCompleteOAuth = () => {
        // Manual flow: user already authorized in their preferred browser, just finish the flow.
        handleAction(t('accounts.add.tabs.oauth'), completeOAuthLogin, { clearOauthUrl: false });
    };

    const handleCopyUrl = async () => {
        if (oauthUrl) {
            try {
                await navigator.clipboard.writeText(oauthUrl);
                setOauthUrlCopied(true);
                setTimeout(() => setOauthUrlCopied(false), 1500);
            } catch (err) {
                console.error('Failed to copy: ', err);
            }
        }
    };

    // ===== Web 模式 OAuth 处理 =====
    const handleWebGetUrl = async () => {
        setStatus('loading');
        setMessage(t('accounts.add.oauth.getting_link'));
        try {
            const url = await getWebOAuthUrl();
            setOauthUrl(url);
            setStatus('idle');
            setMessage('');
        } catch (error) {
            setStatus('error');
            setMessage(String(error));
        }
    };

    const handleWebSubmitCode = async () => {
        if (!manualCode.trim()) {
            setStatus('error');
            setMessage(t('accounts.add.oauth.code_empty'));
            return;
        }

        setStatus('loading');
        setMessage(t('accounts.add.oauth.exchanging_code'));

        try {
            // 支持自动解析完整 URL 或纯 code
            let code = manualCode.trim();

            // 如果粘贴的是完整 URL，尝试提取 code 参数
            if (code.includes('?') || code.includes('code=')) {
                try {
                    // 尝试作为 URL 解析
                    const url = new URL(code.startsWith('http') ? code : `http://dummy?${code}`);
                    const extractedCode = url.searchParams.get('code');
                    if (extractedCode) {
                        code = extractedCode;
                    }
                } catch {
                    // URL 解析失败，尝试正则提取
                    const match = code.match(/code=([^&\s]+)/);
                    if (match) {
                        code = match[1];
                    }
                }
            }

            const result = await submitWebOAuthCode(code);

            // 登录成功后自动刷新配额
            setMessage(t('accounts.add.import.refreshing_quota'));
            try {
                await fetchAccounts();
                await refreshAllQuotas();
            } catch {
                // 刷新失败不影响登录结果
            }

            setStatus('success');
            setMessage(t('accounts.add.oauth.success', { email: result.email }));
            setTimeout(() => {
                setIsOpen(false);
                resetState();
            }, 1500);
        } catch (error) {
            setStatus('error');
            setMessage(String(error));
        }
    };

    const handleImportDb = () => {
        handleAction(t('accounts.add.tabs.import'), importFromDb);
    };

    const handleImportV1 = () => {
        handleAction(t('accounts.add.import.btn_v1'), importV1Accounts);
    };

    const handleImportCustomDb = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'VSCode DB',
                    extensions: ['vscdb']
                }, {
                    name: 'All Files',
                    extensions: ['*']
                }]
            });

            if (selected && typeof selected === 'string') {
                handleAction(t('accounts.add.import.btn_custom_db') || 'Import Custom DB', () => importFromCustomDb(selected));
            }
        } catch (err) {
            console.error('Failed to open dialog:', err);
        }
    };

    // 隐藏的文件输入 ref
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Web 模式 JSON 文件导入
    const handleImportJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setStatus('loading');
        setMessage(t('accounts.add.import.reading_file'));

        try {
            const text = await file.text();
            let data: Array<{ email?: string; refresh_token?: string }>;

            try {
                data = JSON.parse(text);
            } catch {
                throw new Error(t('accounts.add.import.json_parse_error'));
            }

            if (!Array.isArray(data)) {
                throw new Error(t('accounts.add.import.json_format_error'));
            }

            const tokens = data
                .map(item => item.refresh_token)
                .filter((t): t is string => typeof t === 'string' && t.startsWith('1//'));

            if (tokens.length === 0) {
                throw new Error(t('accounts.add.import.json_no_tokens'));
            }

            // 批量添加
            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < tokens.length; i++) {
                setMessage(t('accounts.add.token.batch_progress', { current: i + 1, total: tokens.length }));
                try {
                    await onAdd('', tokens[i]);
                    successCount++;
                } catch {
                    failCount++;
                }
                await new Promise(r => setTimeout(r, 100));
            }

            if (successCount === tokens.length) {
                setStatus('success');
                setMessage(t('accounts.add.import.json_success', { count: successCount }));
                // 导入成功后自动刷新配额
                setMessage(t('accounts.add.import.refreshing_quota'));
                try {
                    await refreshAllQuotas();
                } catch {
                    // 刷新失败不影响导入结果
                }
                setMessage(t('accounts.add.import.json_success', { count: successCount }));
                setTimeout(() => {
                    setIsOpen(false);
                    resetState();
                }, 1500);
            } else if (successCount > 0) {
                setStatus('success');
                setMessage(t('accounts.add.import.json_partial', { success: successCount, fail: failCount }));
                // 部分成功也刷新配额
                try {
                    await fetchAccounts();
                    await refreshAllQuotas();
                } catch {
                    // 刷新失败不影响导入结果
                }
            } else {
                setStatus('error');
                setMessage(t('accounts.add.token.batch_fail'));
            }
        } catch (error) {
            setStatus('error');
            setMessage(String(error));
        } finally {
            // 重置文件输入
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // 状态提示组件
    const StatusAlert = () => {
        if (status === 'idle' || !message) return null;

        const styles = {
            loading: 'alert-info',
            success: 'alert-success',
            error: 'alert-error'
        };

        const icons = {
            loading: <Loader2 className="w-5 h-5 animate-spin" />,
            success: <CheckCircle2 className="w-5 h-5" />,
            error: <XCircle className="w-5 h-5" />
        };

        return (
            <div className={`alert ${styles[status]} mb-4 text-sm py-2 shadow-sm`}>
                {icons[status]}
                <span>{message}</span>
            </div>
        );
    };

    return (
        <>
            <button
                className="px-4 py-2 bg-white dark:bg-base-100 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-base-200 transition-colors flex items-center gap-2 shadow-sm border border-gray-200/50 dark:border-base-300"
                onClick={() => setIsOpen(true)}
            >
                <Plus className="w-4 h-4" />
                {t('accounts.add_account')}
            </button>

            {isOpen && createPortal(
                <div className="modal modal-open z-[100]">
                    {/* Draggable Top Region */}
                    <div data-tauri-drag-region className="fixed top-0 left-0 right-0 h-8 z-[110]" />

                    <div className="modal-box bg-white dark:bg-base-100 text-gray-900 dark:text-base-content">
                        <h3 className="font-bold text-lg mb-4">{t('accounts.add.title')}</h3>

                        {/* Tab 导航 - 胶囊风格 */}
                        <div className="bg-gray-100 dark:bg-base-200 p-1 rounded-xl mb-6 grid grid-cols-3 gap-1">
                            <button
                                className={`py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'oauth'
                                    ? 'bg-white dark:bg-base-100 shadow-sm text-blue-600 dark:text-blue-400'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-base-300'
                                    } `}
                                onClick={() => setActiveTab('oauth')}
                            >
                                {t('accounts.add.tabs.oauth')}
                            </button>
                            <button
                                className={`py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'token'
                                    ? 'bg-white dark:bg-base-100 shadow-sm text-blue-600 dark:text-blue-400'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-base-300'
                                    } `}
                                onClick={() => setActiveTab('token')}
                            >
                                {t('accounts.add.tabs.token')}
                            </button>
                            <button
                                className={`py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${activeTab === 'import'
                                    ? 'bg-white dark:bg-base-100 shadow-sm text-blue-600 dark:text-blue-400'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-base-300'
                                    } `}
                                onClick={() => setActiveTab('import')}
                            >
                                {t('accounts.add.tabs.import')}
                            </button>
                        </div>

                        {/* 状态提示区 */}
                        <StatusAlert />

                        <div className="min-h-[200px]">
                            {/* OAuth 授权 */}
                            {activeTab === 'oauth' && (
                                <div className="space-y-6 py-4">
                                    <div className="text-center space-y-3">
                                        <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
                                            <Globe className="w-10 h-10 text-blue-500" />
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                                {isWebMode ? t('accounts.add.oauth.web_mode_title') : t('accounts.add.oauth.recommend')}
                                            </h4>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                                                {isWebMode ? t('accounts.add.oauth.web_mode_desc') : t('accounts.add.oauth.desc')}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Web 模式：手动 Code 流程 */}
                                    {isWebMode ? (
                                        <div className="space-y-4">
                                            {/* 第一步：获取授权链接 */}
                                            <div className="space-y-2">
                                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                                    <span className="bg-blue-500 text-white w-4 h-4 rounded-full text-[10px] flex items-center justify-center">1</span>
                                                    {t('accounts.add.oauth.step1_get_link')}
                                                </div>
                                                {!oauthUrl ? (
                                                    <button
                                                        className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                                        onClick={handleWebGetUrl}
                                                        disabled={status === 'loading'}
                                                    >
                                                        {status === 'loading' ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <Globe className="w-4 h-4" />
                                                        )}
                                                        {t('accounts.add.oauth.get_link')}
                                                    </button>
                                                ) : (
                                                    <div className="space-y-2">
                                                        <div className="flex gap-2">
                                                            <a
                                                                href={oauthUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-2"
                                                            >
                                                                <ExternalLink className="w-4 h-4" />
                                                                {t('accounts.add.oauth.open_link')}
                                                            </a>
                                                            <button
                                                                type="button"
                                                                className="px-4 py-2 bg-white dark:bg-base-100 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-xl border border-gray-200 dark:border-base-300 hover:bg-gray-50 dark:hover:bg-base-200 transition-all flex items-center gap-2"
                                                                onClick={handleCopyUrl}
                                                            >
                                                                {oauthUrlCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* 第二步：粘贴 Code */}
                                            {oauthUrl && (
                                                <div className="space-y-2">
                                                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                                        <span className="bg-blue-500 text-white w-4 h-4 rounded-full text-[10px] flex items-center justify-center">2</span>
                                                        {t('accounts.add.oauth.step2_paste_code')}
                                                    </div>
                                                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                                                        <p className="text-xs text-amber-700 dark:text-amber-300">
                                                            {t('accounts.add.oauth.code_hint')}
                                                        </p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            className="flex-1 px-4 py-2 bg-white dark:bg-base-100 text-gray-900 dark:text-base-content text-sm rounded-xl border border-gray-200 dark:border-base-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                            placeholder={t('accounts.add.oauth.code_placeholder')}
                                                            value={manualCode}
                                                            onChange={(e) => setManualCode(e.target.value)}
                                                            disabled={status === 'loading' || status === 'success'}
                                                        />
                                                    </div>
                                                    <button
                                                        className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                                        onClick={handleWebSubmitCode}
                                                        disabled={status === 'loading' || status === 'success' || !manualCode.trim()}
                                                    >
                                                        {status === 'loading' ? (
                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                        ) : (
                                                            <ClipboardPaste className="w-4 h-4" />
                                                        )}
                                                        {t('accounts.add.oauth.submit_code')}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        /* Tauri 模式：原有的自动流程 */
                                        <div className="space-y-3">
                                            <button
                                                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                                onClick={handleOAuth}
                                                disabled={status === 'loading' || status === 'success'}
                                            >
                                                {status === 'loading' ? t('accounts.add.oauth.btn_waiting') : t('accounts.add.oauth.btn_start')}
                                            </button>

                                            {oauthUrl && (
                                                <div className="space-y-2">
                                                    <div className="text-[11px] text-gray-500 dark:text-gray-400 text-left">
                                                        {t('accounts.add.oauth.link_label')}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="w-full px-4 py-2 bg-white dark:bg-base-100 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-xl border border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-base-200 transition-all flex items-center gap-2"
                                                        onClick={handleCopyUrl}
                                                        title={t('accounts.add.oauth.link_click_to_copy')}
                                                    >
                                                        {oauthUrlCopied ? (
                                                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                        ) : (
                                                            <Copy className="w-3.5 h-3.5" />
                                                        )}
                                                        <code className="text-[11px] font-mono truncate flex-1 text-left">
                                                            {oauthUrl}
                                                        </code>
                                                        <span className="text-[11px] whitespace-nowrap">
                                                            {oauthUrlCopied ? t('accounts.add.oauth.copied') : t('accounts.add.oauth.copy_link')}
                                                        </span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="w-full px-4 py-2 bg-white dark:bg-base-100 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl border border-gray-200 dark:border-base-300 hover:bg-gray-50 dark:hover:bg-base-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                                        onClick={handleCompleteOAuth}
                                                        disabled={status === 'loading' || status === 'success'}
                                                    >
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        {t('accounts.add.oauth.btn_finish')}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Refresh Token */}
                            {activeTab === 'token' && (
                                <div className="space-y-4 py-2">
                                    <div className="bg-gray-50 dark:bg-base-200 p-4 rounded-lg border border-gray-200 dark:border-base-300">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('accounts.add.token.label')}</span>
                                        </div>
                                        <textarea
                                            className="textarea textarea-bordered w-full h-32 font-mono text-xs leading-relaxed focus:outline-none focus:border-blue-500 transition-colors bg-white dark:bg-base-100 text-gray-900 dark:text-base-content border-gray-300 dark:border-base-300 placeholder:text-gray-400"
                                            placeholder={t('accounts.add.token.placeholder')}
                                            value={refreshToken}
                                            onChange={(e) => setRefreshToken(e.target.value)}
                                            disabled={status === 'loading' || status === 'success'}
                                        />
                                        <p className="text-[10px] text-gray-400 mt-2">
                                            {t('accounts.add.token.hint')}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* 从数据库导入 */}
                            {activeTab === 'import' && (
                                <div className="space-y-6 py-2">
                                    {/* 隐藏的文件输入 */}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".json"
                                        className="hidden"
                                        onChange={handleImportJson}
                                    />

                                    {isWebMode ? (
                                        /* Web 模式：仅显示 JSON 导入 */
                                        <div className="space-y-2">
                                            <h4 className="font-semibold flex items-center gap-2 text-gray-800 dark:text-gray-200">
                                                <Upload className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                                {t('accounts.add.import.json_title')}
                                            </h4>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {t('accounts.add.import.json_desc')}
                                            </p>
                                            <button
                                                className="w-full px-4 py-3 bg-gray-50 dark:bg-base-200 text-gray-700 dark:text-gray-300 font-medium rounded-xl border border-gray-200 dark:border-base-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800 hover:text-blue-600 dark:hover:text-blue-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={status === 'loading' || status === 'success'}
                                            >
                                                <Upload className="w-4 h-4" />
                                                {t('accounts.add.import.btn_json')}
                                            </button>
                                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mt-4">
                                                <p className="text-xs text-amber-700 dark:text-amber-300">
                                                    {t('accounts.add.import.json_hint')}
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Tauri 模式：原有 UI */
                                        <>
                                            <div className="space-y-2">
                                                <h4 className="font-semibold flex items-center gap-2 text-gray-800 dark:text-gray-200">
                                                    <Database className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                                    {t('accounts.add.import.scheme_a')}
                                                </h4>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {t('accounts.add.import.scheme_a_desc')}
                                                </p>
                                                <button
                                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-base-200 text-gray-700 dark:text-gray-300 font-medium rounded-xl border border-gray-200 dark:border-base-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-800 hover:text-blue-600 dark:hover:text-blue-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mb-2 shadow-sm"
                                                    onClick={handleImportDb}
                                                    disabled={status === 'loading' || status === 'success'}
                                                >
                                                    <CheckCircle2 className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    {t('accounts.add.import.btn_db')}
                                                </button>
                                                <button
                                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-base-200 text-gray-700 dark:text-gray-300 font-medium rounded-xl border border-gray-200 dark:border-base-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-200 dark:hover:border-indigo-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                                    onClick={handleImportCustomDb}
                                                    disabled={status === 'loading' || status === 'success'}
                                                >
                                                    <Database className="w-4 h-4" />
                                                    {t('accounts.add.import.btn_custom_db') || 'Custom DB (state.vscdb)'}
                                                </button>
                                            </div>

                                            <div className="divider text-xs text-gray-300 dark:text-gray-600">{t('accounts.add.import.or')}</div>

                                            <div className="space-y-2">
                                                <h4 className="font-semibold flex items-center gap-2 text-gray-800 dark:text-gray-200">
                                                    <FileClock className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                                    {t('accounts.add.import.scheme_b')}
                                                </h4>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {t('accounts.add.import.scheme_b_desc')}
                                                </p>
                                                <button
                                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-base-200 text-gray-700 dark:text-gray-300 font-medium rounded-xl border border-gray-200 dark:border-base-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-200 dark:hover:border-emerald-800 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                                    onClick={handleImportV1}
                                                    disabled={status === 'loading' || status === 'success'}
                                                >
                                                    <FileClock className="w-4 h-4" />
                                                    {t('accounts.add.import.btn_v1')}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 w-full mt-6">
                            <button
                                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-base-200 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-base-300 transition-colors focus:outline-none focus:ring-2 focus:ring-200 dark:focus:ring-base-300"
                                onClick={async () => {
                                    if (status === 'loading' && activeTab === 'oauth') {
                                        await cancelOAuthLogin();
                                    }
                                    setIsOpen(false);
                                }}
                                disabled={status === 'success'} // Only disable on success, allow cancel on loading
                            >
                                {t('accounts.add.btn_cancel')}
                            </button>
                            {activeTab === 'token' && (
                                <button
                                    className="flex-1 px-4 py-2.5 text-white font-medium rounded-xl shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 bg-blue-500 hover:bg-blue-600 focus:ring-blue-500 shadow-blue-100 dark:shadow-blue-900/30 flex justify-center items-center gap-2"
                                    onClick={handleSubmit}
                                    disabled={status === 'loading' || status === 'success'}
                                >
                                    {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {t('accounts.add.btn_confirm')}
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="modal-backdrop bg-black/40 backdrop-blur-sm fixed inset-0 z-[-1]" onClick={() => setIsOpen(false)}></div>
                </div>,
                document.body
            )}
        </>
    );
}

export default AddAccountDialog;
