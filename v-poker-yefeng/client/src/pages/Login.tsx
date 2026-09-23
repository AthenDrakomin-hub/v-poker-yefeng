import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(username, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* 背景图片 */}
      <div
        style={{
          ...styles.bgImage,
          backgroundImage: `url(/assets/backgrounds/login_bg.png)`,
        }}
      />
      {/* 背景装饰光晕 */}
      <div style={styles.glow1} />
      <div style={styles.glow2} />

      <div style={styles.card}>
        {/* V-POKER Logo */}
        <img src="/assets/ui/logo.png" alt="V-POKER" style={styles.logo} />
        <h1 style={styles.title}>V-POKER</h1>
        <p style={styles.subtitle}>高端棋牌娱乐平台</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputWrapper}>
            <input
              style={styles.input}
              type="text"
              placeholder=" "
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <label style={styles.label}>用户名</label>
          </div>
          <div style={styles.inputWrapper}>
            <input
              style={styles.input}
              type="password"
              placeholder=" "
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label style={styles.label}>密码</label>
          </div>
          {error && <p style={styles.error}>⚠️ {error}</p>}
          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? (
              <span style={styles.loadingSpinner} />
            ) : (
              "登 录"
            )}
          </button>
        </form>

        {/* 注册链接 */}
        <div style={{ textAlign: 'center', marginTop: '20px', color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
          还没有账号？{' '}
          <Link to="/register" style={{ color: 'var(--vp-gold)', textDecoration: 'none' }}>
            立即注册
          </Link>
        </div>

        {/* 底部链接 */}
        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px' }}>
          <Link to="/privacy" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none', marginRight: '16px' }}>
            隐私政策
          </Link>
          <Link to="/terms" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>
            用户协议
          </Link>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    position: "relative",
    overflow: "hidden",
  },
  bgImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundSize: "cover",
    backgroundPosition: "center",
    zIndex: 0,
  },
  glow1: {
    position: "absolute",
    top: "-20%",
    left: "-10%",
    width: "600px",
    height: "600px",
    background: "radial-gradient(circle, rgba(233,69,96,0.15) 0%, transparent 70%)",
    borderRadius: "50%",
    pointerEvents: "none",
    zIndex: 1,
  },
  glow2: {
    position: "absolute",
    bottom: "-20%",
    right: "-10%",
    width: "600px",
    height: "600px",
    background: "radial-gradient(circle, rgba(212,175,55,0.15) 0%, transparent 70%)",
    borderRadius: "50%",
    pointerEvents: "none",
    zIndex: 1,
  },
  card: {
    background: "rgba(20, 20, 30, 0.85)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(212, 175, 55, 0.3)",
    padding: "50px 40px",
    borderRadius: "24px",
    boxShadow: "0 25px 50px rgba(0,0,0,0.5), 0 0 40px rgba(212, 175, 55, 0.1)",
    width: "400px",
    position: "relative",
    zIndex: 2,
  },
  logo: {
    width: "120px",
    height: "120px",
    margin: "0 auto 20px",
    display: "block",
    objectFit: "contain",
  },
  title: {
    textAlign: "center",
    margin: 0,
    fontSize: "32px",
    fontWeight: "700",
    color: "var(--vp-gold)",
    letterSpacing: "4px",
    textShadow: "0 0 20px rgba(212, 175, 55, 0.5)",
  },
  subtitle: {
    textAlign: "center",
    color: "rgba(255,255,255,0.6)",
    margin: "8px 0 40px",
    fontSize: "14px",
    letterSpacing: "2px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  inputWrapper: {
    position: "relative",
  },
  input: {
    width: "100%",
    padding: "16px 16px 8px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    fontSize: "15px",
    color: "#fff",
    outline: "none",
    transition: "all 0.3s ease",
    boxSizing: "border-box",
  },
  label: {
    position: "absolute",
    top: "14px",
    left: "16px",
    color: "rgba(255,255,255,0.4)",
    fontSize: "14px",
    pointerEvents: "none",
    transition: "all 0.2s ease",
  },
  button: {
    padding: "16px",
    background: "linear-gradient(135deg, var(--vp-gold) 0%, var(--vp-gold-hover) 100%)",
    color: "var(--vp-surface)",
    border: "none",
    borderRadius: "12px",
    fontSize: "16px",
    fontWeight: "700",
    cursor: "pointer",
    letterSpacing: "4px",
    transition: "all 0.3s ease",
    boxShadow: "0 10px 30px rgba(212, 175, 55, 0.4)",
    marginTop: "10px",
  },
  loadingSpinner: {
    display: "inline-block",
    width: "20px",
    height: "20px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  error: {
    color: "var(--vp-danger)",
    fontSize: "14px",
    margin: 0,
    padding: "10px 14px",
    background: "rgba(255,107,107,0.1)",
    borderRadius: "8px",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    margin: "30px 0 15px",
  },
  dividerText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: "12px",
    padding: "0 16px",
  },
  hint: {
    textAlign: "center",
    color: "rgba(255,255,255,0.3)",
    fontSize: "12px",
    margin: 0,
  },
};
