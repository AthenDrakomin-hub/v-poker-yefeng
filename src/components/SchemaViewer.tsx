import React from "react";
import { BookOpen, Shield, Key, Hash, FileCode, CheckCircle2 } from "lucide-react";

export const SchemaViewer: React.FC = () => {
  const tables = [
    {
      name: "wallets (钱包表)",
      desc: "存储各角色用户筹码与冻结余额",
      fields: [
        { name: "wallet_id", type: "string", pk: true, desc: "钱包唯一标识 (PK)" },
        { name: "user_id", type: "string", pk: false, desc: "唯一用户ID (UNIQUE, 关联玩家/代理/客服/管理员)" },
        { name: "user_type", type: "string", pk: false, desc: "角色类型 (admin / support / agent / player)" },
        { name: "balance", type: "integer", pk: false, desc: "可用余额 (筹码整数，严禁浮点)" },
        { name: "frozen_balance", type: "integer", pk: false, desc: "冻结余额 (如在局押注)" },
        { name: "updated_at", type: "integer", pk: false, desc: "Unix 毫秒时间戳" },
      ]
    },
    {
      name: "transactions (流水账本)",
      desc: "系统唯一真实总账，严格防重放幂等支持",
      fields: [
        { name: "transaction_id", type: "string", pk: true, desc: "全局唯一交易流水号 (PK，幂等键)" },
        { name: "from_wallet_id", type: "string", pk: false, desc: "支出方钱包ID (铸币时为 NULL)" },
        { name: "to_wallet_id", type: "string", pk: false, desc: "接收方钱包ID" },
        { name: "amount", type: "integer", pk: false, desc: "实际到账净额或转账基数" },
        { name: "fee", type: "integer", pk: false, desc: "本笔交易扣除的手续费 (0.01% 或对局抽水)" },
        { name: "fee_recipient", type: "string", pk: false, desc: "手续费归集池账户 (默认 platform_fee)" },
        { name: "type", type: "string", pk: false, desc: "交易类型 (mint / transfer / game_settle)" },
        { name: "status", type: "string", pk: false, desc: "状态 (pending / success / failed)" },
        { name: "remark", type: "string", pk: false, desc: "审计附言与风控备注" },
        { name: "created_at", type: "integer", pk: false, desc: "创建毫秒时间戳" },
      ]
    },
    {
      name: "fee_pool (手续费池)",
      desc: "平台全局手续费损耗归集池",
      fields: [
        { name: "pool_id", type: "string", pk: true, desc: "固定单例主键 (platform_fee)" },
        { name: "balance", type: "integer", pk: false, desc: "平台累计沉淀手续费总额" },
        { name: "updated_at", type: "integer", pk: false, desc: "最后更新毫秒时间戳" },
      ]
    },
    {
      name: "agents (代理表)",
      desc: "多级代理分销树与抽佣分成模型",
      fields: [
        { name: "agent_id", type: "string", pk: true, desc: "代理唯一标识 (PK)" },
        { name: "parent_id", type: "string", pk: false, desc: "上级代理 ID (NULL 为顶级公会)" },
        { name: "level", type: "integer", pk: false, desc: "层级 (0=直接开房代理, 1=二级, 2=总代)" },
        { name: "r_ratio", type: "decimal", pk: false, desc: "该级抽成比例 r_i (如 0.4000 = 40%)" },
        { name: "commission_balance", type: "integer", pk: false, desc: "累计未提佣金余额" },
        { name: "status", type: "string", pk: false, desc: "状态 (active / frozen)" },
      ]
    },
    {
      name: "game_records (游戏流水)",
      desc: "记录德州扑克牌局原始流水",
      fields: [
        { name: "transaction_id", type: "string", pk: true, desc: "关联结算主交易流水号 (PK)" },
        { name: "room_id", type: "string", pk: false, desc: "房间/牌桌号" },
        { name: "total_flow", type: "integer", pk: false, desc: "本局总底池 / 总流水 S" },
        { name: "player_count", type: "integer", pk: false, desc: "当局玩家总数" },
        { name: "settlement_status", type: "string", pk: false, desc: "结算状态 (pending / settled / failed)" },
        { name: "created_at", type: "integer", pk: false, desc: "牌局结束毫秒时间戳" },
      ]
    },
    {
      name: "settlement_logs (结算分账明细)",
      desc: "各级代理与平台的分水日志",
      fields: [
        { name: "settlement_id", type: "string", pk: true, desc: "分账明细唯一主键 (PK)" },
        { name: "transaction_id", type: "string", pk: false, desc: "关联流水号" },
        { name: "agent_id", type: "string", pk: false, desc: "获佣代理 ID" },
        { name: "level", type: "integer", pk: false, desc: "代理层级" },
        { name: "commission_amount", type: "integer", pk: false, desc: "佣金筹码数" },
        { name: "platform_revenue", type: "integer", pk: false, desc: "平台最终留存收益" },
        { name: "created_at", type: "integer", pk: false, desc: "毫秒时间戳" },
      ]
    }
  ];

  return (
    <div className="space-y-6">
      {/* Rules Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white">
        <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-800">
          <Shield className="w-5 h-5 text-amber-400" />
          <h2 className="text-base font-bold text-slate-100">全局命名规范（六大铁律）</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-4 text-xs font-mono">
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 text-[11px] block">1. 字段命名</span>
            <span className="text-amber-300 font-bold">全部 snake_case (小写+下划线)</span>
          </div>
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 text-[11px] block">2. 金额单位</span>
            <span className="text-emerald-300 font-bold">整数 integer (筹码微单位，禁浮点)</span>
          </div>
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 text-[11px] block">3. 比例规范</span>
            <span className="text-indigo-300 font-bold">小数 Decimal 保留 4 位 (如 0.0300)</span>
          </div>
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 text-[11px] block">4. 时间戳</span>
            <span className="text-sky-300 font-bold">Unix 毫秒时间戳 (bigint)</span>
          </div>
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 text-[11px] block">5. ID 格式</span>
            <span className="text-pink-300 font-bold">字符串 string (避免 JS 64位溢出)</span>
          </div>
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-slate-400 text-[11px] block">6. API 响应</span>
            <span className="text-violet-300 font-bold">&#123; code: 0, message, data &#125;</span>
          </div>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tables.map((tbl) => (
          <div key={tbl.name} className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-sm font-mono">{tbl.name}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{tbl.desc}</p>
              </div>
            </div>
            <div className="p-4">
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] text-slate-400 uppercase font-mono border-b border-slate-100">
                  <tr>
                    <th className="pb-2">字段</th>
                    <th className="pb-2">类型</th>
                    <th className="pb-2">说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {tbl.fields.map((f) => (
                    <tr key={f.name}>
                      <td className="py-2 font-semibold text-slate-800 flex items-center gap-1">
                        {f.pk && <span className="text-amber-500 text-[9px] font-bold">[PK]</span>}
                        <span>{f.name}</span>
                      </td>
                      <td className="py-2 text-indigo-600">{f.type}</td>
                      <td className="py-2 text-slate-600 font-sans text-xs">{f.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
