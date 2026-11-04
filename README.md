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

## M1c-C｜舊 React 發案改接短效 Session（2026-11-05，隔離功能）

**只在 feature 分支**：原始可執行 `index.html` 與對照 `app.jsx` 的 `ClientCreateJob.handleSubmit` 同步修改。舊流程直接用 Demo 長效權杖向 `/legacy/requests` 送出；啟用新後端 `XY_STAGING_SESSIONS=1` 後會 HTTP 401。現在實際處理器會先 `POST /staging/session` 換得短效 Bearer → `POST /legacy/requests` → 在成功或失敗後 `POST /staging/session/revoke`，失敗時顯示錯誤，撤銷不成功不宣稱安全完成，且防止重複提交／不把假訂金視為收款。
- 仍只容許 **localhost + /legacy-react + 測試權杖 + 虛構縣市**；只有 `net/cctv/access` 類別，原始其他 demo 假錢包/使用者資料仍在，不得公開或輸入真實資料。
- 在受控 V8 隔離環境，直接抽取上傳 GitHub 後的 React 處理器，驗證 **11/11 邏輯案例 PASS**，且兩份來源完全一致；並附 [Node 原始碼契約測試](tests/m1cc_legacy_session_flow.test.mjs)（`node --test tests/m1cc_legacy_session_flow.test.mjs`）。**目前未取得 Node/GitHub CI 實際執行證據，沒有原版整頁瀏覽器 E2E。**
- 對照 [YC Tech Match 後端 Contract 測試](https://github.com/punk8895022-byte/yc-tech-smartdispatch/blob/feature/asset-os-dual-platforms-20261031/pocs/cloudlink-staging-api/tests/test_m1cc_react_legacy_session_contract.py)；[跨專案 AI OS 研究吸收 Draft PR](https://github.com/punk8895022-byte/xiaoyun-ai-os/pull/35)。
- 本分支 Draft PR [#1](https://github.com/punk8895022-byte/yuntech-prototype/pull/1) 保留，不合併、未部署、不收款；Owner Gate CLOSED。M1c-C `SOURCE_HANDLER_UNIT_PASS`，`ORIGINAL_REACT_BROWSER_E2E_NOT_RUN`。
