# CloudLink 雲程智慧工務 SaaS (Production Track)

這個資料夾將把目前的 `prototype/` (CDN + Babel + localStorage) Demo 版本，升級為可正式上線的產品架構：
- 前端：可 build 部署 (不在瀏覽器即時編譯)
- 後端：API + 權限 + 流程管控 + 金流/錢包帳務
- DB：PostgreSQL
- 檔案：照片/簽名改走物件儲存 (S3/R2)

## 我建議的上線架構 (兼顧速度與可維運)
- Frontend: Next.js + React + Tailwind (TypeScript)
- Backend: Node.js + NestJS
- DB: PostgreSQL (Supabase/Neon/RDS)
- Storage: Cloudflare R2 (或 S3)
- Deploy:
  - Frontend: Cloudflare Pages
  - Backend: Fly.io 或 Render

> 為了能快速落地，我們會把權限/狀態流轉/帳務(Ledger)做在後端，前端只做 UI 與呼叫 API。

## 目錄
- `prototype/`: 目前可直接開啟的 demo 版本 (保留)
- `backend/`: FastAPI skeleton (legacy stub, kept for reference)
- `services/backend-nest/`: NestJS backend (target)
- `services/frontend-next/`: Next.js frontend (target)
- `services/ai-service/`: FastAPI AI dispatch service
- `infra/`: docker compose / 環境設定
- `docs/`: 資料表、API、流程文件

## 下一步
1. 我會先建立 DB schema + OpenAPI 路由骨架，確保你要的功能都能被 API 支援。
2. 再把 prototype 的 UI 拆成 frontend 專案並接 API。
3. 最後接金流、檔案上傳、聊天室 realtime。
