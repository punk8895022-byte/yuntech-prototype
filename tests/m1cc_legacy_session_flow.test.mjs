/**
 * M1c-C controlled contract test. Extracts and executes the ACTUAL CloudLink
 * ClientCreateJob handler from both index.html and app.jsx. No external imports,
 * no credentials, no deployment, no simulated customer money.
 * Run: node --test tests/m1cc_legacy_session_flow.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const load = path => {
  const text = readFileSync(new URL("../" + path, import.meta.url), "utf8").replace(/\r\n/g,"\n");
  const comp = text.indexOf("const ClientCreateJob =");
  assert.ok(comp >= 0, path + ": missing actual ClientCreateJob");
  const start = text.indexOf("  const handleSubmit = async () => {", comp);
  const end = text.indexOf("  const handleAi = () => {", start);
  assert.ok(start > comp && end > start && end - start < 6000, path + ": handler drift");
  const before = text.slice(comp, start);
  assert.match(before, /const submissionLockRef = useRef\(false\)/);
  return text.slice(start, end).trim();
};

const originalHandler = load("index.html");
const sourceHandler = load("app.jsx");

function setup({ when = {}, flag = true, category = "網路工程", address = "台南市" } = {}) {
  const calls = [], toasts = [], lock = { current:false }, cleared = [];
  let closed = 0;
  const response = (ok, status, data) => ({ok,status,json:async()=>data});
  const fetch = async (url, options) => {
    calls.push({url, options});
    if (when[url] instanceof Function) return await when[url](options);
    if (when[url]) return when[url];
    if (url === "/staging/session") return response(true, 200, {access_token:"short-lived-synthetic-session-token-abcdef",expires_in:600});
    if (url === "/legacy/requests") return response(true, 201, {id:"synthetic-job-id",state:"PENDING"});
    if (url === "/staging/session/revoke") return response(true, 200, {revoked:true});
    throw Error("Unexpected endpoint " + url);
  };
  const ctx = {
    window: { __CLOUDLINK_M1B_STAGING_ENABLED__: flag, location:{hostname:"127.0.0.1"} },
    PROJECT_CATEGORIES: [{label:"網路工程",id:"net"},{label:"監視器",id:"cctv"},{label:"門禁",id:"access"}],
    form:{type:category,address,title:"虛構商業門市 Wi-Fi 設備更新",desc:"經隔離測試確認的商用網路模擬案件"},
    stagingToken:"bootstrap-synthetic-customer-token-abcdefgh",
    submissionLockRef:lock, setStagingToken:value=>cleared.push(value),
    fetch, addToast:(message,type)=>toasts.push({message,type}), onClose:()=>{closed++;}
  };
  const submit = vm.runInNewContext(originalHandler + "\nhandleSubmit", ctx);
  return {submit,calls,toasts,lock,cleared,closed:()=>closed,response};
}

test("index.html and app.jsx execute the same guarded React handler", () => {
  assert.equal(originalHandler, sourceHandler);
  assert.match(originalHandler, /fetch\("\/staging\/session"/);
  assert.match(originalHandler, /fetch\("\/legacy\/requests"/);
  assert.match(originalHandler, /fetch\("\/staging\/session\/revoke"/);
  assert.doesNotMatch(originalHandler, /deposit_paid|wallet\s*[:-]/);
});
test("success: bootstrap exchange -> short token request -> revoke; no simulated payment", async () => {
  const t=setup(); await t.submit();
  assert.deepEqual(t.calls.map(x=>x.url), ["/staging/session","/legacy/requests","/staging/session/revoke"]);
  assert.equal(t.calls[0].options.headers.Authorization,"Bearer bootstrap-synthetic-customer-token-abcdefgh");
  assert.equal(t.calls[1].options.headers.Authorization,"Bearer short-lived-synthetic-session-token-abcdef");
  assert.equal(t.calls[2].options.headers.Authorization,"Bearer short-lived-synthetic-session-token-abcdef");
  assert.equal(t.calls[1].options.body.includes('"categoryId":"net"'),true);
  assert.equal(t.closed(),1); assert.equal(t.lock.current,false);
  assert.deepEqual(t.cleared, [""]);
  assert.equal(t.toasts.at(-1).type,"success");
});
test("failed session exchange closes no forms and never sends request", async () => {
  const t=setup({when:{"/staging/session":{ok:false,status:401,json:async()=>({})}}});
  await t.submit();
  assert.deepEqual(t.calls.map(x=>x.url), ["/staging/session"]);
  assert.equal(t.closed(),0); assert.equal(t.lock.current,false);
  assert.equal(t.toasts.at(-1).type,"error");
});
test("failed business request still revokes any issued short token", async () => {
  const t=setup({when:{"/legacy/requests":{ok:false,status:409,json:async()=>({})}}});
  await t.submit();
  assert.deepEqual(t.calls.map(x=>x.url), ["/staging/session","/legacy/requests","/staging/session/revoke"]);
  assert.equal(t.closed(),0); assert.equal(t.lock.current,false);
});
test("revocation failure does not claim accepted security gate", async () => {
  const t=setup({when:{"/staging/session/revoke":{ok:false,status:500,json:async()=>({})}}});
  await t.submit();
  assert.equal(t.closed(),0); assert.equal(t.toasts.at(-1).type,"error");
  assert.match(t.toasts.at(-1).message,/撤銷未確認/);
});
test("feature flag closed refuses every network call", async () => {
  const t=setup({flag:false}); await t.submit();
  assert.equal(t.calls.length,0); assert.equal(t.closed(),0);
});
test("unsupported legacy category fails closed", async () => {
  const t=setup({category:"弱電其他"}); await t.submit();
  assert.equal(t.calls.length,0);
});
test("specific street address cannot be uploaded", async () => {
  const t=setup({address:"台南市東區長榮路1號"}); await t.submit();
  assert.equal(t.calls.length,0);
});
test("concurrent double-submit is serialized while session exchange is pending", async () => {
  let release;
  const pending=new Promise(resolve => {release=resolve});
  const t=setup({when:{"/staging/session":async ()=>pending}});
  const first=t.submit();
  const second=t.submit();
  await second;
  assert.equal(t.calls.length,1); assert.equal(t.lock.current,true);
  release(t.response(true,200,{access_token:"short-lived-synthetic-session-token-abcdef",expires_in:600}));
  await first;
  assert.equal(t.calls.length,3); assert.equal(t.lock.current,false);
  assert.equal(t.closed(),1);
});


test("original React UI and user guidance never claim a deposit or escrow for synthetic cases", () => {
  for (const file of ["index.html", "app.jsx"]) {
    const text = readFileSync(new URL("../" + file, import.meta.url), "utf8").replace(/\r\n/g,"\n");
    const start = text.indexOf("const ClientCreateJob =");
    const end = text.indexOf("const ClientEditJobModal", start);
    assert.ok(start > -1 && end > start, file + ": original form section changed");
    const page = text.slice(start, end);
    assert.match(page, />送出模擬案件（不付款）<\/button>/);
    assert.doesNotMatch(page, /支付訂金 \(30%\) 並發布/);
    assert.doesNotMatch(page, /系統採第三方託管機制/);
    assert.match(text, /步驟三：送出隔離測試需求（不付款）/);
    assert.doesNotMatch(text, /確認金額無誤後，點擊 \[支付訂金/);
  }
});
