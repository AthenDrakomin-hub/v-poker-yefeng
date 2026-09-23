import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

/**
 * V-POKER 注册页面
 */

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    inviteCode: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 表单校验
    if (form.username.length < 3) {
      setError('用户名至少 3 个字符');
      return;
    }
    if (form.password.length < 6) {
      setError('密码至少 6 个字符');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      // 调用注册接口
      const resp = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          invite_code: form.inviteCode || undefined,
        }),
      });
      const data = await resp.json();

      if (data.code === 0) {
        // 注册成功，自动登录
        localStorage.setItem('vp_token', data.data.token);
        localStorage.setItem('vp_user_id', data.data.user_id);
        navigate('/');
      } else {
        setError(data.message || '注册失败');
      }
    } catch (err: any) {
      setError(err.message || '网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundImage: `url(/assets/backgrounds/login_bg.png)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/assets/ui/logo.png"
            alt="V-POKER"
            className="h-16 mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-vp-gold">注册账号</h1>
          <p className="text-vp-text-muted mt-2">加入 V-POKER 高端棋牌平台</p>
        </div>

        {/* 注册表单 */}
        <div className="glass-card p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 用户名 */}
            <div>
              <label className="block text-sm text-vp-text-muted mb-2">用户名</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="请输入用户名"
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg focus:border-vp-gold/50 outline-none transition-colors"
                required
              />
            </div>

            {/* 密码 */}
            <div>
              <label className="block text-sm text-vp-text-muted mb-2">密码</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="请输入密码（至少 6 位）"
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg focus:border-vp-gold/50 outline-none transition-colors"
                required
              />
            </div>

            {/* 确认密码 */}
            <div>
              <label className="block text-sm text-vp-text-muted mb-2">确认密码</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                placeholder="请再次输入密码"
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg focus:border-vp-gold/50 outline-none transition-colors"
                required
              />
            </div>

            {/* 邀请码（可选） */}
            <div>
              <label className="block text-sm text-vp-text-muted mb-2">
                邀请码 <span className="text-xs">(可选)</span>
              </label>
              <input
                type="text"
                value={form.inviteCode}
                onChange={(e) => setForm({ ...form, inviteCode: e.target.value })}
                placeholder="输入邀请码可获得新手礼包"
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg focus:border-vp-gold/50 outline-none transition-colors"
              />
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="p-3 bg-vp-danger/20 border border-vp-danger/50 rounded-lg text-vp-danger text-sm">
                {error}
              </div>
            )}

            {/* 注册按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="btn-gold w-full"
            >
              {loading ? '注册中...' : '立即注册'}
            </button>
          </form>

          {/* 登录链接 */}
          <div className="mt-6 text-center text-sm text-vp-text-muted">
            已有账号？{' '}
            <Link to="/login" className="text-vp-gold hover:underline">
              立即登录
            </Link>
          </div>
        </div>

        {/* 底部链接 */}
        <div className="mt-6 text-center text-xs text-vp-text-muted space-x-4">
          <Link to="/privacy" className="hover:text-vp-gold transition-colors">
            隐私政策
          </Link>
          <Link to="/terms" className="hover:text-vp-gold transition-colors">
            用户协议
          </Link>
        </div>
      </div>
    </div>
  );
}
