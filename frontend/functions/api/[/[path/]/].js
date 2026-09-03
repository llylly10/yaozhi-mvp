// Cloudflare Pages Function：将 /api/* 反向代理到 Render 上的 FastAPI 后端。
// 与本地 Vite dev 代理行为一致：去掉 /api 前缀后转发（后端端点本身不带 /api）。
// 后端地址通过 Pages 环境变量 BACKEND_URL 注入（生产环境 Cloudflare 控制台设置，不写死在此）。
export async function onRequest(context) {
  const backend = context.env.BACKEND_URL;
  if (!backend) {
    return new Response(
      "BACKEND_URL 未配置。请在 Cloudflare Pages 控制台 → 设置 → 环境变量 中设置 BACKEND_URL 为 Render 后端地址（如 https://yaozhi-backend.onrender.com）。",
      { status: 500 }
    );
  }
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const target = `${backend.replace(/\/+$/, "")}${path}${url.search}`;

  const init = {
    method: context.request.method,
    headers: context.request.headers,
    redirect: "manual",
  };
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    init.body = context.request.body;
  }

  try {
    return await fetch(target, init);
  } catch (e) {
    return new Response(`代理后端失败：${e.message}`, { status: 502 });
  }
}
