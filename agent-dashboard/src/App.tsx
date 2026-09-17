/**
 * 代理端后台 (Refine App 入口配置与核心资源定义)
 * 提供代理树查询、佣金余额看板、流水日志追踪
 */
import React from "react";
import { Refine } from "@refinedev/core";
import dataProvider from "@refinedev/simple-rest";

const API_URL = process.env.VITE_BFF_URL || "http://localhost:4000/api/agent";

export const AgentDashboardApp: React.FC = () => {
  return (
    <Refine
      dataProvider={dataProvider(API_URL)}
      resources={[
        {
          name: "dashboard",
          list: "/dashboard",
          meta: { label: "佣金总览看板" }
        },
        {
          name: "settlements",
          list: "/settlements",
          meta: { label: "对局分账日志" }
        },
        {
          name: "tree",
          list: "/tree",
          meta: { label: "下级代理拓扑树" }
        }
      ]}
    >
      {/* 代理端核心界面渲染 */}
      <div className="p-6 font-sans">
        <h1 className="text-2xl font-bold text-gray-800">代理独立收益控制台</h1>
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white p-4 rounded shadow border border-gray-100">
            <span className="text-gray-500 text-sm">可用佣金筹码</span>
            <div className="text-2xl font-bold text-emerald-600 mt-1">46,250 筹码</div>
          </div>
          <div className="bg-white p-4 rounded shadow border border-gray-100">
            <span className="text-gray-500 text-sm">当前返佣比例 r_0</span>
            <div className="text-2xl font-bold text-blue-600 mt-1">50.00%</div>
          </div>
          <div className="bg-white p-4 rounded shadow border border-gray-100">
            <span className="text-gray-500 text-sm">直属开房活跃桌数</span>
            <div className="text-2xl font-bold text-indigo-600 mt-1">8 卓</div>
          </div>
        </div>
      </div>
    </Refine>
  );
};

export default AgentDashboardApp;
