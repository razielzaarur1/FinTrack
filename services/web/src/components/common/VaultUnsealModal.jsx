import React, { useState } from 'react';
import { KeyRound, ShieldAlert, CheckCircle2, AlertCircle, X, Lock, Sparkles, Copy, Check } from 'lucide-react';
import { unsealVault, initVaultAuto } from '../../lib/api';

export default function VaultUnsealModal({ isOpen, onClose, onUnsealed }) {
  const [unsealKey, setUnsealKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!unsealKey.trim()) {
      setError('חובה להזין את מפתח ה-Unseal');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await unsealVault(unsealKey.trim());
      if (res && res.sealed === false) {
        setSuccess(true);
        if (onUnsealed) onUnsealed();
        setTimeout(() => {
          setSuccess(false);
          setUnsealKey('');
          onClose();
        }, 1500);
      } else if (res && res.progress !== undefined) {
        setSuccess(true);
        if (onUnsealed) onUnsealed();
        setTimeout(() => {
          setSuccess(false);
          setUnsealKey('');
          onClose();
        }, 1500);
      } else {
        setError(res?.error || 'מפתח Unseal שגוי או שהכספת עדיין נעולה');
      }
    } catch (err) {
      setError(err.message || 'שגיאה בשחרור נעילת הכספת');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoInit = async () => {
    setInitLoading(true);
    setError(null);

    try {
      const res = await initVaultAuto();
      if (res && res.success) {
        setGeneratedKeys({
          unsealKey2: res.unsealKey2,
          rootToken: res.rootToken,
        });
        if (onUnsealed) onUnsealed();
      } else {
        setError(res?.error || 'שגיאה באתחול הכספת');
      }
    } catch (err) {
      setError(err.message || 'שגיאה באתחול הכספת');
    } finally {
      setInitLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-lg rounded-3xl bg-navy-900 border border-amber-500/40 shadow-2xl p-6 sm:p-7 text-right">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute left-5 top-5 p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <KeyRound className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">פתיחת כספת HashiCorp Vault</h2>
            <p className="text-xs text-slate-400">שחרור נעילת הכספת באמצעות Unseal Key</p>
          </div>
        </div>

        {generatedKeys ? (
          <div className="space-y-4 animate-fade-in">
            <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span><strong>הכספת אותחלה ונפתחה בהצלחה!</strong> שמור את המפתח הבא במקום מאובטח:</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-navy-950 border border-white/10 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 block">Unseal Key 2 שלך:</span>
              <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-black/40 border border-white/5 font-mono text-xs text-brand-cyan select-all">
                <span className="break-all">{generatedKeys.unsealKey2}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(generatedKeys.unsealKey2)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white flex-shrink-0 transition-colors"
                  title="העתק מפתח"
                >
                  {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setGeneratedKeys(null);
                onClose();
              }}
              className="w-full py-3 rounded-xl glass-button text-xs font-bold"
            >
              שמרתי את המפתח, המשך לאפליקציה
            </button>
          </div>
        ) : (
          <>
            {/* Explainer Notice */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200/90 mb-5 leading-relaxed">
              <strong>כספת ה-Vault במצב נעול (Sealed).</strong> אם כבר הפעלת את המערכת בעבר, הדבק את <strong>Unseal Key 2</strong>. אם זו פעם ראשונה או שאין לך מפתח – לחץ למטה על אתחול אוטומטי.
            </div>

            {success ? (
              <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-sm flex items-center justify-center gap-2 animate-fade-in">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-bold">הכספת נפתחה בהצלחה! מנוע ההצפנה מוכן לפעולה.</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    יש לך מפתח Unseal? הזן אותו כאן:
                  </label>
                  <input
                    type="password"
                    value={unsealKey}
                    onChange={(e) => setUnsealKey(e.target.value)}
                    placeholder="הדבק כאן את מפתח ה-Unseal (Base64)"
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-sm text-white font-mono placeholder-slate-500"
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={loading || !unsealKey.trim()}
                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-navy-950 font-bold text-xs flex items-center justify-center gap-2 shadow-glow-amber disabled:opacity-40 transition-all cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-navy-950/30 border-t-navy-950 rounded-full animate-spin" />
                        <span>פותח כספת...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>פתח עם מפתח</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleAutoInit}
                    disabled={initLoading}
                    className="flex-1 py-3 px-4 rounded-xl bg-brand-blue/20 hover:bg-brand-blue/30 border border-brand-blue/40 text-brand-cyan font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {initLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-brand-cyan/30 border-t-brand-cyan rounded-full animate-spin" />
                        <span>מאתחל כספת...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>אין לי מפתח (אתחול חדש)</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}



