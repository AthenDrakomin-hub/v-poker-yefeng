import { Link } from 'react-router-dom';

/**
 * V-POKER 隐私政策页面
 */

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-vp-black p-6">
      <div className="max-w-3xl mx-auto">
        {/* 头部 */}
        <div className="mb-8">
          <Link to="/login" className="text-vp-text-muted hover:text-vp-gold transition-colors">
            ← 返回
          </Link>
          <h1 className="text-3xl font-bold text-vp-gold mt-4">隐私政策</h1>
          <p className="text-vp-text-muted mt-2">最后更新：2024年1月1日</p>
        </div>

        {/* 内容 */}
        <div className="glass-card p-8 space-y-6">
          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">1. 信息收集</h2>
            <p className="text-vp-text leading-relaxed">
              V-POKER（以下简称"我们"）重视用户隐私。我们收集的信息包括：您主动提供的账号信息（用户名、密码哈希）、游戏行为数据（对局记录、筹码变动）、设备信息（浏览器类型、IP地址）。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">2. 信息使用</h2>
            <p className="text-vp-text leading-relaxed">
              我们使用收集的信息用于：提供游戏服务、保障账号安全、改进产品体验、统计分析游戏数据。我们不会将您的个人信息出售给第三方。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">3. 信息安全</h2>
            <p className="text-vp-text leading-relaxed">
              我们采用行业标准的安全措施保护您的信息，包括：密码哈希存储、JWT 令牌认证、HTTPS 加密传输、数据库定期备份。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">4. 信息共享</h2>
            <p className="text-vp-text leading-relaxed">
              我们不会向任何第三方出售、出租或交易您的个人信息。仅在以下情况可能共享：法律法规要求、政府部门要求、保护我们的合法权益。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">5. 您的权利</h2>
            <p className="text-vp-text leading-relaxed">
              您有权：访问您的个人信息、更正错误信息、删除您的账号、注销账号。您可以通过联系客服行使这些权利。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">6. 未成年人保护</h2>
            <p className="text-vp-text leading-relaxed">
              本平台仅限 18 周岁以上成年人使用。我们不主动收集未成年人信息。如果发现未成年人注册，我们将立即删除相关账号。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">7. 政策更新</h2>
            <p className="text-vp-text leading-relaxed">
              我们可能会不定期更新本隐私政策。更新后将在本页面发布，重大变更将通过站内通知告知您。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">8. 联系我们</h2>
            <p className="text-vp-text leading-relaxed">
              如果您对本隐私政策有任何疑问，请通过客服渠道联系我们。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
