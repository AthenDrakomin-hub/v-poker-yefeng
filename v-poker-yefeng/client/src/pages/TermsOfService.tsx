import { Link } from 'react-router-dom';

/**
 * V-POKER 用户协议页面
 */

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-vp-black p-6">
      <div className="max-w-3xl mx-auto">
        {/* 头部 */}
        <div className="mb-8">
          <Link to="/login" className="text-vp-text-muted hover:text-vp-gold transition-colors">
            ← 返回
          </Link>
          <h1 className="text-3xl font-bold text-vp-gold mt-4">用户协议</h1>
          <p className="text-vp-text-muted mt-2">最后更新：2024年1月1日</p>
        </div>

        {/* 内容 */}
        <div className="glass-card p-8 space-y-6">
          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">1. 服务说明</h2>
            <p className="text-vp-text leading-relaxed">
              V-POKER 是一个封闭式虚拟经济棋牌游戏平台。平台内所有筹码均为虚拟游戏道具，不具有任何货币价值，不可兑换为法定货币，不可进行任何形式的充值或提现。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">2. 账号注册</h2>
            <p className="text-vp-text leading-relaxed">
              您承诺：注册时提供真实、准确的信息；不得注册多个账号；不得将账号转让、出借或出售给他人；账号因您个人原因导致的安全问题由您自行承担。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">3. 游戏规则</h2>
            <p className="text-vp-text leading-relaxed">
              您同意遵守：公平竞技原则，不使用任何外挂、作弊工具；不恶意攻击服务器；不恶意刷屏、骚扰其他玩家；遵守各游戏的具体规则。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">4. 虚拟道具</h2>
            <p className="text-vp-text leading-relaxed">
              平台内所有筹码、道具均为虚拟游戏物品，所有权归平台所有。您仅享有在游戏内的使用权。平台有权根据运营需要调整道具属性或获取方式。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">5. 禁止行为</h2>
            <p className="text-vp-text leading-relaxed">
              严禁以下行为：使用外挂/脚本/机器人；多开/组队作弊；利用系统漏洞牟利；发布违法违规内容；恶意攻击平台；进行任何形式的线下现金交易。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">6. 违规处理</h2>
            <p className="text-vp-text leading-relaxed">
              对于违规账号，平台有权根据情节轻重采取：警告、暂时冻结、永久封号等措施。违规账号内的虚拟道具将被清零，且不予补偿。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">7. 服务变更</h2>
            <p className="text-vp-text leading-relaxed">
              平台有权根据运营需要变更、暂停或终止部分或全部服务。变更前将提前公告。因服务变更导致的损失，平台不承担责任。
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-vp-gold mb-3">8. 免责声明</h2>
            <p className="text-vp-text leading-relaxed">
              本平台为纯娱乐性质的虚拟游戏平台，不涉及任何形式的赌博。用户因使用本平台产生的一切后果由用户自行承担。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
