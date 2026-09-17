"""
FastAPI-Admin 管理端启动入口 (端口 8088)
"""
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI(title="Admin Dashboard (FastAPI-Admin)", version="1.0.0")


@app.get("/", response_class=HTMLResponse)
async def admin_portal():
    return """
    <!DOCTYPE html>
    <html>
      <head>
        <title>虚拟经济总控管理端</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
      </head>
      <body class="bg-gray-100 p-8">
        <div class="max-w-5xl mx-auto bg-white p-6 rounded-lg shadow-md">
          <div class="flex justify-between items-center border-b pb-4">
            <h1 class="text-2xl font-bold text-gray-800">封闭式虚拟经济总控平台</h1>
            <span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">能量守恒状态: 正常 (0 差额)</span>
          </div>
          <div class="grid grid-cols-4 gap-4 my-6">
            <div class="bg-blue-50 p-4 rounded border border-blue-100">
              <p class="text-xs text-blue-600 font-bold uppercase">系统历史总铸币</p>
              <h2 class="text-2xl font-extrabold text-blue-900 mt-1">1,000,000</h2>
            </div>
            <div class="bg-indigo-50 p-4 rounded border border-indigo-100">
              <p class="text-xs text-indigo-600 font-bold uppercase">在市所有钱包总额</p>
              <h2 class="text-2xl font-extrabold text-indigo-900 mt-1">999,980</h2>
            </div>
            <div class="bg-amber-50 p-4 rounded border border-amber-100">
              <p class="text-xs text-amber-600 font-bold uppercase">手续费池沉淀</p>
              <h2 class="text-2xl font-extrabold text-amber-900 mt-1">20</h2>
            </div>
            <div class="bg-emerald-50 p-4 rounded border border-emerald-100">
              <p class="text-xs text-emerald-600 font-bold uppercase">守恒检验差额</p>
              <h2 class="text-2xl font-extrabold text-emerald-900 mt-1">0 (精确守恒)</h2>
            </div>
          </div>
          <div class="mt-4 p-4 border rounded bg-gray-50">
            <h3 class="font-bold text-gray-700">管理员快速铸币</h3>
            <p class="text-sm text-gray-500 mt-1">仅限具有 Root 权限管理员操作，注入筹码计入系统总资产发行量。</p>
          </div>
        </div>
      </body>
    </html>
    """


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8088, reload=True)
