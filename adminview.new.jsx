
const AdminView = ({ user }) => {
  const { jobs, setJobs, users, setUsers, logout, resetData } = useApp();
  const { addToast } = useToast();

  // Views: overview | jobs | users | approvals | reports | settings
  const [view, setView] = useState("overview");

  // Modals
  const [showReport, setShowReport] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editJob, setEditJob] = useState(null);
  const [inspectJob, setInspectJob] = useState(null);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createJobOpen, setCreateJobOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  // Filters
  const [qJobs, setQJobs] = useState("");
  const [jobStatus, setJobStatus] = useState("all");
  const [jobType, setJobType] = useState("all");

  const [userTab, setUserTab] = useState("clients"); // clients | engineers | admins | all
  const [qUsers, setQUsers] = useState("");
  const [userStatus, setUserStatus] = useState("all");

  // Bulk selection
  const [selectedJobIds, setSelectedJobIds] = useState(() => new Set());
  const [selectedUserIds, setSelectedUserIds] = useState(() => new Set());

  // Reports range
  const [rFrom, setRFrom] = useState("");
  const [rTo, setRTo] = useState("");

  // Audit log (local-only)
  const [audit, setAudit] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cl_admin_audit_v101")) || []; } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("cl_admin_audit_v101", JSON.stringify(audit.slice(-500))); } catch {}
  }, [audit]);

  const logAudit = (action, detail = "") => {
    const row = {
      id: `A-${Date.now()}`,
      at: new Date().toISOString(),
      admin: user?.id || "admin",
      action,
      detail,
    };
    setAudit((prev) => [...prev, row]);
  };

  const getUserById = (id) => users.find((u) => u.id === id) || null;
  const getUserName = (id, fallback = "") => getUserById(id)?.name || fallback || "";
  const getUserPhone = (id) => getUserById(id)?.phone || "";

  const downloadText = (filename, text, mime = "text/plain;charset=utf-8") => {
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      addToast("匯出失敗，請再試一次", "error");
    }
  };

  const csvEscape = (v) => {
    const s = String(v ?? "");
    if (/[\",\n\r]/.test(s)) return `"${s.replace(/\"/g, '""')}"`;
    return s;
  };

  const toCSV = (rows, headers) => {
    const cols = headers && headers.length ? headers : (rows[0] ? Object.keys(rows[0]) : []);
    const lines = [
      cols.map(csvEscape).join(","),
      ...rows.map((r) => cols.map((c) => csvEscape(r?.[c])).join(",")),
    ];
    return "\ufeff" + lines.join("\n");
  };

  const exportJobs = (list, format = "csv") => {
    const rows = list.map((j) => {
      const total = calcJobTotal(j);
      const dep = Number(j.depositAmount) || calcDeposit(total);
      const tail = Number(j.tailAmount) || calcTail(total);
      return {
        id: j.id,
        status: j.status,
        type: j.type,
        title: j.title,
        client: getUserName(j.clientId, j.clientName),
        client_phone: getUserPhone(j.clientId),
        engineer: getUserName(j.assignee),
        engineer_phone: getUserPhone(j.assignee),
        address: j.address,
        scheduledDate: j.scheduledDate,
        laborBudget: j.laborBudget,
        materialBudget: j.materialBudget,
        total,
        deposit_paid: j.deposit_paid ? "Y" : "N",
        depositAmount: dep,
        tail_paid: j.tail_paid ? "Y" : "N",
        tailAmount: tail,
        created_at: j.created_at,
        paidAt: j.paidAt || "",
        photos: (j.photos || []).length,
        materials: (j.materials || []).length,
        messages: (j.messages || []).length,
      };
    });

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "json") return downloadText(`jobs_${stamp}.json`, JSON.stringify(rows, null, 2), "application/json;charset=utf-8");
    return downloadText(`jobs_${stamp}.csv`, toCSV(rows), "text/csv;charset=utf-8");
  };

  const exportUsers = (list, format = "csv") => {
    const rows = list.map((u) => ({
      id: u.id,
      role: u.role,
      status: u.status || "",
      name: u.name || "",
      email: u.email || "",
      phone: u.phone || "",
      address: u.address || "",
      company_name: u.company_name || u.company || "",
      tax_id: u.tax_id || u.taxId || u.taxid || "",
      title: u.title || "",
      experience: u.experience || "",
      rating: u.rating ?? "",
      jobs: u.jobs ?? "",
      skills: Array.isArray(u.skills) ? u.skills.join("|") : "",
      wallet: u.wallet ?? 0,
    }));

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "json") return downloadText(`users_${stamp}.json`, JSON.stringify(rows, null, 2), "application/json;charset=utf-8");
    return downloadText(`users_${stamp}.csv`, toCSV(rows), "text/csv;charset=utf-8");
  };

  const exportSnapshot = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      version: "v101",
      users,
      jobs,
      audit,
    };
    logAudit("export_snapshot", `users=${users.length} jobs=${jobs.length}`);
    downloadText(`cloudlink_snapshot_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    addToast("已匯出完整備份(JSON)", "success");
  };

  const allJobTypes = useMemo(() => {
    const set = new Set();
    jobs.forEach((j) => { if (j.type) set.add(j.type); });
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), "zh-Hant"));
  }, [jobs]);

  const engineers = useMemo(() => users.filter((u) => u.role === "engineer"), [users]);
  const clients = useMemo(() => users.filter((u) => String(u.role || "").startsWith("client")), [users]);
  const admins = useMemo(() => users.filter((u) => u.role === "admin"), [users]);

  const filteredJobs = useMemo(() => {
    const q = qJobs.trim().toLowerCase();
    return jobs
      .filter((j) => (jobStatus === "all" ? true : j.status === jobStatus))
      .filter((j) => (jobType === "all" ? true : j.type === jobType))
      .filter((j) => {
        if (!q) return true;
        const hay = [
          j.id,
          j.title,
          j.type,
          j.address,
          j.desc,
          getUserName(j.clientId, j.clientName),
          getUserName(j.assignee),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [jobs, qJobs, jobStatus, jobType, users]);

  const filteredUsers = useMemo(() => {
    const q = qUsers.trim().toLowerCase();
    const base = userTab === "clients" ? clients : userTab === "engineers" ? engineers : userTab === "admins" ? admins : users;
    return base
      .filter((u) => (userStatus === "all" ? true : String(u.status || "") === userStatus))
      .filter((u) => {
        if (!q) return true;
        const hay = [u.id, u.name, u.email, u.phone, u.address, u.company_name, u.company, u.title]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh-Hant"));
  }, [userTab, qUsers, userStatus, users, clients, engineers, admins]);

  const jobsByStatus = useMemo(() => {
    return jobs.reduce((acc, j) => {
      const k = j.status || "open";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
  }, [jobs]);

  const lifetimeRevenue = useMemo(() => {
    return jobs
      .filter((j) => j.status === "closed")
      .reduce((acc, j) => acc + (Number(j.releasedTotal) || calcJobTotal(j)), 0);
  }, [jobs]);

  const escrowTailOutstanding = useMemo(() => {
    return jobs
      .filter((j) => j.status !== "closed")
      .reduce((acc, j) => {
        const total = calcJobTotal(j);
        const dep = Number(j.depositAmount) || calcDeposit(total);
        const tail = Number(j.tailAmount) || (total - dep);
        return acc + tail;
      }, 0);
  }, [jobs]);

  const todayKey = new Date().toLocaleDateString();
  const createdToday = useMemo(() => jobs.filter((j) => new Date(j.created_at).toLocaleDateString() === todayKey), [jobs, todayKey]);
  const closedToday = useMemo(() => jobs.filter((j) => j.paidAt && new Date(j.paidAt).toLocaleDateString() === todayKey), [jobs, todayKey]);

  const todayDepositCollected = useMemo(() => {
    return createdToday.reduce((acc, j) => {
      if (!j.deposit_paid) return acc;
      const total = calcJobTotal(j);
      const dep = Number(j.depositAmount) || calcDeposit(total);
      return acc + dep;
    }, 0);
  }, [createdToday]);

  const todayTailCollected = useMemo(() => {
    return closedToday.reduce((acc, j) => {
      const total = calcJobTotal(j);
      const dep = Number(j.depositAmount) || calcDeposit(total);
      const tail = Number(j.tailAmount) || (total - dep);
      return acc + tail;
    }, 0);
  }, [closedToday]);

  const cashRevenueToday = todayDepositCollected + todayTailCollected;

  const sevenDayRevenue = useMemo(() => {
    const days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toLocaleDateString();
    });
    const byKey = new Map(days.map((k) => [k, 0]));

    jobs.forEach((j) => {
      const total = calcJobTotal(j);
      const dep = Number(j.depositAmount) || calcDeposit(total);
      const tail = Number(j.tailAmount) || (total - dep);

      const createdKey = new Date(j.created_at).toLocaleDateString();
      if (j.deposit_paid && byKey.has(createdKey)) byKey.set(createdKey, byKey.get(createdKey) + dep);

      if (j.paidAt) {
        const paidKey = new Date(j.paidAt).toLocaleDateString();
        if (byKey.has(paidKey)) byKey.set(paidKey, byKey.get(paidKey) + tail);
      }
    });

    return days.map((k) => byKey.get(k) || 0);
  }, [jobs]);

  const inRange = (iso, from, to) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return false;
    const f = from ? new Date(from + "T00:00:00").getTime() : null;
    const tt = to ? new Date(to + "T23:59:59").getTime() : null;
    if (f && t < f) return false;
    if (tt && t > tt) return false;
    return true;
  };

  const rangeCreated = useMemo(() => jobs.filter((j) => inRange(j.created_at, rFrom, rTo)), [jobs, rFrom, rTo]);
  const rangeClosed = useMemo(() => jobs.filter((j) => inRange(j.paidAt, rFrom, rTo)), [jobs, rFrom, rTo]);

  const rangeDepositCollected = useMemo(() => {
    return rangeCreated.reduce((acc, j) => {
      if (!j.deposit_paid) return acc;
      const total = calcJobTotal(j);
      const dep = Number(j.depositAmount) || calcDeposit(total);
      return acc + dep;
    }, 0);
  }, [rangeCreated]);

  const rangeTailCollected = useMemo(() => {
    return rangeClosed.reduce((acc, j) => {
      const total = calcJobTotal(j);
      const dep = Number(j.depositAmount) || calcDeposit(total);
      const tail = Number(j.tailAmount) || (total - dep);
      return acc + tail;
    }, 0);
  }, [rangeClosed]);

  const rangeCashRevenue = rangeDepositCollected + rangeTailCollected;

  const toggleSet = (setState, id) => {
    setState((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelections = () => {
    setSelectedJobIds(new Set());
    setSelectedUserIds(new Set());
  };

  useEffect(() => {
    // Changing view should clear selection to avoid confusion
    clearSelections();
  }, [view]);

  const bulkUpdateJobsStatus = (status) => {
    const ids = Array.from(selectedJobIds);
    if (ids.length === 0) return addToast("請先選取工單", "error");
    if (!window.confirm(`確定要將 ${ids.length} 筆工單狀態改成 ${status}？`)) return;
    setJobs((prev) => prev.map((j) => (selectedJobIds.has(j.id) ? normalizeJob({ ...j, status }) : j)));
    logAudit("bulk_update_jobs", `count=${ids.length} status=${status}`);
    addToast("已批次更新工單狀態", "success");
    setSelectedJobIds(new Set());
  };

  const bulkUpdateUsersStatus = (status) => {
    const ids = Array.from(selectedUserIds);
    if (ids.length === 0) return addToast("請先選取會員", "error");
    if (!window.confirm(`確定要將 ${ids.length} 位會員狀態改成 ${status}？`)) return;
    setUsers((prev) => prev.map((u) => (selectedUserIds.has(u.id) ? { ...u, status } : u)));
    logAudit("bulk_update_users", `count=${ids.length} status=${status}`);
    addToast("已批次更新會員狀態", "success");
    setSelectedUserIds(new Set());
  };

  const bulkExportSelectedJobs = (format = "csv") => {
    const list = jobs.filter((j) => selectedJobIds.has(j.id));
    if (list.length === 0) return addToast("請先選取工單", "error");
    logAudit("bulk_export_jobs", `count=${list.length} format=${format}`);
    exportJobs(list, format);
  };

  const bulkExportSelectedUsers = (format = "csv") => {
    const list = users.filter((u) => selectedUserIds.has(u.id));
    if (list.length === 0) return addToast("請先選取會員", "error");
    logAudit("bulk_export_users", `count=${list.length} format=${format}`);
    exportUsers(list, format);
  };

  const approveEngineer = (engId) => {
    setUsers((prev) => prev.map((u) => (u.id === engId ? { ...u, status: "verified" } : u)));
    logAudit("approve_engineer", engId);
    addToast("已通過工程師審核", "success");
  };

  const suspendUser = (uid) => {
    setUsers((prev) => prev.map((u) => (u.id === uid ? { ...u, status: "suspended" } : u)));
    logAudit("suspend_user", uid);
    addToast("已停權會員", "success");
  };

  const activateUser = (uid) => {
    setUsers((prev) => prev.map((u) => (u.id === uid ? { ...u, status: "active" } : u)));
    logAudit("activate_user", uid);
    addToast("已恢復會員", "success");
  };

  const DailyReport = ({ onClose }) => {
    const report = {
      date: todayKey,
      jobs_created: createdToday.length,
      jobs_closed: closedToday.length,
      deposit_collected: todayDepositCollected,
      tail_collected: todayTailCollected,
      cash_revenue: cashRevenueToday,
      tail_outstanding_total: escrowTailOutstanding,
    };

    return (
      <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-gradient-to-br from-indigo-600 to-slate-900 p-6 text-white text-center">
            <h2 className="text-2xl font-bold">每日營運日報</h2>
            <p className="opacity-90">{todayKey}</p>
          </div>

          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-slate-50 rounded-xl">
              <p className="text-xs text-slate-400">今日新增</p>
              <h3 className="text-2xl font-bold">{createdToday.length}</h3>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl">
              <p className="text-xs text-slate-400">今日完工</p>
              <h3 className="text-2xl font-bold">{closedToday.length}</h3>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl">
              <p className="text-xs text-slate-400">已收訂金 (30%)</p>
              <h3 className="text-xl font-bold text-indigo-600 font-num">{formatCurrency(todayDepositCollected)}</h3>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl">
              <p className="text-xs text-slate-400">今日收尾款</p>
              <h3 className="text-xl font-bold text-emerald-600 font-num">{formatCurrency(todayTailCollected)}</h3>
            </div>
          </div>

          <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card-modern p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase">今日現金流營收</div>
                  <div className="text-xs text-slate-400 mt-1">訂金 + 今日驗收尾款</div>
                </div>
                <div className="text-2xl font-bold text-emerald-600 font-num">{formatCurrency(cashRevenueToday)}</div>
              </div>
            </div>
            <div className="card-modern p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase">待收尾款 (未結案)</div>
                  <div className="text-xs text-slate-400 mt-1">應收帳款總額</div>
                </div>
                <div className="text-2xl font-bold text-rose-600 font-num">{formatCurrency(escrowTailOutstanding)}</div>
              </div>
            </div>
          </div>

          <div className="px-6 pb-6">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Icon name="download" size={16} /> 匯出日報
              </div>
              <div className="flex gap-2">
                <button onClick={() => downloadText(`daily_report_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(report, null, 2), "application/json;charset=utf-8")} className="btn btn-outline px-4 py-2 rounded-xl">JSON</button>
                <button onClick={() => downloadText(`daily_report_${new Date().toISOString().slice(0, 10)}.csv`, toCSV([report]), "text/csv;charset=utf-8")} className="btn btn-outline px-4 py-2 rounded-xl">CSV</button>
              </div>
            </div>
          </div>

          <div className="p-6 border-t flex gap-3">
            <button onClick={onClose} className="flex-1 btn btn-primary">關閉</button>
          </div>
        </div>
      </div>
    );
  };
  const AuditModal = ({ onClose }) => {
    return (
      <div className="fixed inset-0 z-[220] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b flex items-center justify-between">
            <div>
              <h3 className="font-bold text-lg">管理操作紀錄</h3>
              <div className="text-xs text-slate-400 mt-1">僅存於本機 localStorage (Demo)</div>
            </div>
            <button onClick={onClose} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100"><Icon name="x" /></button>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-slate-400">共 {audit.length} 筆 (最多保留 500 筆)</div>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadText(`admin_audit_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(audit), "text/csv;charset=utf-8")}
                  className="btn btn-outline px-4 py-2 rounded-xl"
                >
                  匯出 CSV
                </button>
                <button
                  onClick={() => downloadText(`admin_audit_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(audit, null, 2), "application/json;charset=utf-8")}
                  className="btn btn-outline px-4 py-2 rounded-xl"
                >
                  匯出 JSON
                </button>
                <button
                  onClick={() => {
                    if (!window.confirm("確定要清空操作紀錄？")) return;
                    setAudit([]);
                    addToast("已清空操作紀錄", "success");
                  }}
                  className="btn btn-danger px-4 py-2 rounded-xl"
                >
                  清空
                </button>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto no-scrollbar">
                <table className="min-w-[900px] w-full text-left text-sm">
                  <thead className="bg-white border-b text-slate-500">
                    <tr>
                      <th className="p-4">時間</th>
                      <th className="p-4">管理員</th>
                      <th className="p-4">動作</th>
                      <th className="p-4">細節</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.slice().reverse().slice(0, 200).map((a) => (
                      <tr key={a.id} className="border-b border-slate-200/50 hover:bg-white">
                        <td className="p-4 text-xs text-slate-500">{a.at ? new Date(a.at).toLocaleString() : "-"}</td>
                        <td className="p-4 font-mono text-xs text-slate-500">{a.admin}</td>
                        <td className="p-4 font-bold text-slate-800">{a.action}</td>
                        <td className="p-4 text-slate-600">{a.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-3">顯示最近 200 筆</div>
          </div>
        </div>
      </div>
    );
  };

  const ImportModal = ({ onClose }) => {
    const [mode, setMode] = useState("merge"); // merge | replace
    const [busy, setBusy] = useState(false);

    const onFile = async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      setBusy(true);
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        const nextUsers = Array.isArray(payload.users) ? payload.users : null;
        const nextJobs = Array.isArray(payload.jobs) ? payload.jobs : null;
        const nextAudit = Array.isArray(payload.audit) ? payload.audit : null;

        if (!nextUsers || !nextJobs) {
          addToast("檔案格式不正確：需要包含 users/jobs", "error");
          setBusy(false);
          return;
        }

        if (!window.confirm(`確定要${mode === "replace" ? "完全取代" : "合併"}目前資料？`)) {
          setBusy(false);
          return;
        }

        if (mode === "replace") {
          setUsers(nextUsers);
          setJobs(nextJobs.map(normalizeJob));
          if (nextAudit) setAudit(nextAudit);
        } else {
          setUsers((prev) => {
            const map = new Map(prev.map((u) => [u.id, u]));
            nextUsers.forEach((u) => map.set(u.id, { ...map.get(u.id), ...u }));
            return Array.from(map.values());
          });
          setJobs((prev) => {
            const map = new Map(prev.map((j) => [j.id, j]));
            nextJobs.forEach((j) => map.set(j.id, normalizeJob({ ...map.get(j.id), ...j })));
            return Array.from(map.values());
          });
          if (nextAudit) setAudit((prev) => [...prev, ...nextAudit].slice(-500));
        }

        logAudit("import_snapshot", `mode=${mode} file=${file.name}`);
        addToast("已匯入資料", "success");
        onClose();
      } catch {
        addToast("匯入失敗：請確認是合法 JSON", "error");
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="fixed inset-0 z-[220] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b flex items-center justify-between">
            <div>
              <h3 className="font-bold text-lg">匯入備份 (JSON)</h3>
              <div className="text-xs text-slate-400 mt-1">支援使用後台匯出的 snapshot 檔案</div>
            </div>
            <button onClick={onClose} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100"><Icon name="x" /></button>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <div className="text-xs font-bold text-slate-500 mb-2">匯入模式</div>
              <div className="flex gap-2">
                <button onClick={() => setMode("merge")} className={`px-4 py-2 rounded-xl font-bold text-sm border ${mode === "merge" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-white text-slate-600 border-slate-200"}`}>合併</button>
                <button onClick={() => setMode("replace")} className={`px-4 py-2 rounded-xl font-bold text-sm border ${mode === "replace" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-white text-slate-600 border-slate-200"}`}>取代</button>
              </div>
              <div className="text-xs text-slate-400 mt-2">合併：同 ID 覆寫欄位；取代：直接用檔案完全取代目前資料</div>
            </div>

            <label className={`w-full flex items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed ${busy ? "bg-slate-50 text-slate-400" : "bg-white hover:bg-slate-50 text-slate-600"} cursor-pointer`}>
              <Icon name="upload" size={18} />
              <span className="font-bold">選擇 JSON 檔案</span>
              <input type="file" accept="application/json" className="hidden" onChange={onFile} disabled={busy} />
            </label>

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 btn btn-outline">關閉</button>
            </div>
          </div>
        </div>
      </div>
    );
  };
  const CreateUserModal = ({ onClose }) => {
    const [form, setForm] = useState({
      role: "client_personal",
      name: "",
      email: "",
      password: "123",
      phone: "",
      address: "",
      status: "active",
      wallet: 0,
      company_name: "",
      tax_id: "",
      title: "",
      experience: "",
      skills: "",
    });

    const save = () => {
      if (!form.name || !form.email) return addToast("請填寫姓名與 Email/帳號", "error");
      const id = `U-${Date.now()}`;
      const u = {
        id,
        role: form.role,
        name: form.name,
        email: form.email,
        password: form.password || "123",
        phone: form.phone,
        address: form.address,
        status: form.status,
        wallet: Number(form.wallet) || 0,
        avatar: form.name ? String(form.name)[0] : "U",
      };

      if (form.role === "client_business") {
        u.company_name = form.company_name;
        u.tax_id = form.tax_id;
      }

      if (form.role === "engineer") {
        u.title = form.title;
        u.experience = form.experience;
        u.skills = form.skills.split(",").map((s) => s.trim()).filter(Boolean);
        u.rating = 5.0;
        u.jobs = 0;
      }

      setUsers((prev) => [...prev, u]);
      logAudit("create_user", `${u.role} ${u.id}`);
      addToast("已新增會員", "success");
      onClose();
    };

    const isEngineer = form.role === "engineer";
    const isBiz = form.role === "client_business";

    return (
      <div className="fixed inset-0 z-[220] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b flex items-center justify-between">
            <div>
              <h3 className="font-bold text-lg">新增會員</h3>
              <div className="text-xs text-slate-400 mt-1">建立新客戶/工程師/管理員帳號</div>
            </div>
            <button onClick={onClose} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100"><Icon name="x" /></button>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">角色</label>
              <select className="input-modern" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, status: e.target.value === "engineer" ? "pending" : "active" })}>
                <option value="client_personal">client_personal</option>
                <option value="client_business">client_business</option>
                <option value="engineer">engineer</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">狀態</label>
              <select className="input-modern" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">active</option>
                <option value="verified">verified</option>
                <option value="pending">pending</option>
                <option value="suspended">suspended</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">姓名</label>
              <input className="input-modern" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Email/帳號</label>
              <input className="input-modern" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">密碼</label>
              <input className="input-modern" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">錢包</label>
              <input className="input-modern" type="number" value={form.wallet} onChange={(e) => setForm({ ...form, wallet: e.target.value })} />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">電話</label>
              <input className="input-modern" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">地址</label>
              <input className="input-modern" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>

            {isBiz && (
              <>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">公司名稱</label>
                  <input className="input-modern" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">統一編號</label>
                  <input className="input-modern" value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
                </div>
              </>
            )}

            {isEngineer && (
              <>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">職稱</label>
                  <input className="input-modern" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">年資</label>
                  <input className="input-modern" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 block mb-1">技能 (逗號分隔)</label>
                  <input className="input-modern" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
                </div>
              </>
            )}
          </div>
          <div className="p-6 border-t flex gap-3">
            <button onClick={onClose} className="flex-1 btn btn-outline">取消</button>
            <button onClick={save} className="flex-1 btn btn-primary">新增</button>
          </div>
        </div>
      </div>
    );
  };

  const CreateJobModal = ({ onClose }) => {
    const [form, setForm] = useState({
      title: "",
      type: "",
      status: "open",
      clientId: "",
      assignee: "",
      address: "",
      desc: "",
      scheduledDate: "",
      laborBudget: 0,
      materialBudget: 0,
      deposit_paid: true,
    });

    const save = () => {
      if (!form.title) return addToast("請填寫標題", "error");
      if (!form.clientId) return addToast("請選擇客戶", "error");

      const j = normalizeJob({
        id: `J-${Date.now()}`,
        title: form.title,
        type: form.type,
        status: form.status,
        clientId: form.clientId,
        clientName: getUserName(form.clientId),
        address: form.address,
        desc: form.desc,
        scheduledDate: form.scheduledDate,
        assignee: form.assignee || null,
        laborBudget: Number(form.laborBudget) || 0,
        materialBudget: Number(form.materialBudget) || 0,
        deposit_paid: Boolean(form.deposit_paid),
        created_at: new Date().toISOString(),
        materials: [],
        messages: [],
        photos: [],
        signature: null,
      });

      setJobs((prev) => [j, ...prev]);
      logAudit("create_job", j.id);
      addToast("已新增工單", "success");
      onClose();
    };

    const total = (Number(form.laborBudget) || 0) + (Number(form.materialBudget) || 0);

    return (
      <div className="fixed inset-0 z-[220] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b flex items-center justify-between">
            <div>
              <h3 className="font-bold text-lg">新增工單</h3>
              <div className="text-xs text-slate-400 mt-1">快速建立一筆全域工單</div>
            </div>
            <button onClick={onClose} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100"><Icon name="x" /></button>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-500 block mb-1">標題</label>
              <input className="input-modern" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">類別</label>
              <input className="input-modern" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="例：網路工程" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">狀態</label>
              <select className="input-modern" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="open">open</option>
                <option value="active">active</option>
                <option value="completed">completed</option>
                <option value="closed">closed</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">客戶</label>
              <select className="input-modern" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                <option value="">(選擇客戶)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">工程師 (可選)</label>
              <select className="input-modern" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
                <option value="">(未指派)</option>
                {engineers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-500 block mb-1">地址</label>
              <input className="input-modern" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-500 block mb-1">描述</label>
              <textarea className="input-modern h-24 resize-none" value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">預約時間</label>
              <input className="input-modern" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} placeholder="YYYY-MM-DD..." />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <div className="text-xs font-bold text-slate-500 mb-2">金額</div>
              <div className="grid grid-cols-2 gap-2">
                <input className="input-modern py-2" type="number" value={form.laborBudget} onChange={(e) => setForm({ ...form, laborBudget: e.target.value })} placeholder="工資" />
                <input className="input-modern py-2" type="number" value={form.materialBudget} onChange={(e) => setForm({ ...form, materialBudget: e.target.value })} placeholder="材料" />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-slate-500">總計</div>
                <div className="font-bold text-slate-900 font-num">{formatCurrency(total)}</div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-slate-500">訂金已收</div>
                <input type="checkbox" checked={Boolean(form.deposit_paid)} onChange={(e) => setForm({ ...form, deposit_paid: e.target.checked })} />
              </div>
            </div>
          </div>
          <div className="p-6 border-t flex gap-3">
            <button onClick={onClose} className="flex-1 btn btn-outline">取消</button>
            <button onClick={save} className="flex-1 btn btn-primary">新增</button>
          </div>
        </div>
      </div>
    );
  };
  const EditUserModal = ({ data, onClose }) => {
    const [form, setForm] = useState({ ...data });
    const isEngineer = form.role === "engineer";
    const isClientBiz = form.role === "client_business";

    const save = () => {
      setUsers((prev) => prev.map((u) => (u.id === data.id ? { ...u, ...form } : u)));
      logAudit("edit_user", data.id);
      addToast("會員資料已更新", "success");
      onClose();
    };

    const resetPwd = () => {
      if (!window.confirm("確定要將密碼重設為 123？")) return;
      setUsers((prev) => prev.map((u) => (u.id === data.id ? { ...u, password: "123" } : u)));
      logAudit("reset_password", data.id);
      addToast("已重設密碼為 123", "success");
    };

    return (
      <div className="fixed inset-0 z-[220] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-lg rounded-2xl p-6 shadow-2xl">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs text-slate-400 font-mono">{form.id}</div>
              <h3 className="font-bold text-lg">編輯會員</h3>
            </div>
            <button onClick={onClose} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100"><Icon name="x" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">姓名</label>
              <input className="input-modern" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">Email/帳號</label>
              <input className="input-modern" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">電話</label>
              <input className="input-modern" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">地址</label>
              <input className="input-modern" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">角色</label>
              <select className="input-modern" value={form.role || ""} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="admin">admin</option>
                <option value="client_personal">client_personal</option>
                <option value="client_business">client_business</option>
                <option value="engineer">engineer</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">狀態</label>
              <select className="input-modern" value={form.status || "active"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">active</option>
                <option value="verified">verified</option>
                <option value="pending">pending</option>
                <option value="suspended">suspended</option>
              </select>
            </div>

            {isClientBiz && (
              <>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">公司名稱</label>
                  <input className="input-modern" value={form.company_name || form.company || ""} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">統一編號</label>
                  <input className="input-modern" value={form.tax_id || form.taxId || ""} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
                </div>
              </>
            )}

            {isEngineer && (
              <>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">職稱</label>
                  <input className="input-modern" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">年資</label>
                  <input className="input-modern" value={form.experience || ""} onChange={(e) => setForm({ ...form, experience: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 block mb-1">技能 (用逗號分隔)</label>
                  <input
                    className="input-modern"
                    value={Array.isArray(form.skills) ? form.skills.join(",") : (form.skills || "")}
                    onChange={(e) => setForm({ ...form, skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  />
                </div>
              </>
            )}

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">錢包餘額</label>
              <input className="input-modern" type="number" value={Number(form.wallet) || 0} onChange={(e) => setForm({ ...form, wallet: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">密碼</label>
              <input className="input-modern" value={form.password || ""} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button onClick={resetPwd} className="btn btn-danger px-4 py-3 rounded-xl">重設密碼</button>
            <button onClick={onClose} className="flex-1 btn btn-outline">取消</button>
            <button onClick={save} className="flex-1 btn btn-primary">保存</button>
          </div>
        </div>
      </div>
    );
  };

  const EditJobModal = ({ data, onClose }) => {
    const [form, setForm] = useState({ ...data });

    const save = () => {
      const merged = normalizeJob({ ...data, ...form });
      if (merged.status === "closed" && !merged.paidAt) merged.paidAt = new Date().toISOString();
      setJobs((prev) => prev.map((j) => (j.id === data.id ? merged : j)));
      logAudit("edit_job", data.id);
      addToast("工單資料已更新", "success");
      onClose();
    };

    const total = calcJobTotal(form);

    return (
      <div className="fixed inset-0 z-[220] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-3xl rounded-2xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs text-slate-400 font-mono">{form.id}</div>
              <h3 className="font-bold text-lg">編輯工單</h3>
            </div>
            <button onClick={onClose} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100"><Icon name="x" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-500 block mb-1">標題</label>
              <input className="input-modern" value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">類別</label>
              <input className="input-modern" value={form.type || ""} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">狀態</label>
              <select className="input-modern" value={form.status || "open"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="open">open</option>
                <option value="active">active</option>
                <option value="completed">completed</option>
                <option value="closed">closed</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">客戶</label>
              <select className="input-modern" value={form.clientId || ""} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
                <option value="">(未指定)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">工程師</label>
              <select className="input-modern" value={form.assignee || ""} onChange={(e) => setForm({ ...form, assignee: e.target.value || null })}>
                <option value="">(未指派)</option>
                {engineers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-500 block mb-1">地址</label>
              <input className="input-modern" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-500 block mb-1">描述</label>
              <textarea className="input-modern h-24 resize-none" value={form.desc || ""} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">預約時間</label>
              <input className="input-modern" value={form.scheduledDate || ""} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} />
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <div className="text-xs font-bold text-slate-500 mb-2">金額</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-slate-400">工資</div>
                  <input className="input-modern py-2" type="number" value={Number(form.laborBudget) || 0} onChange={(e) => setForm({ ...form, laborBudget: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">材料</div>
                  <input className="input-modern py-2" type="number" value={Number(form.materialBudget) || 0} onChange={(e) => setForm({ ...form, materialBudget: Number(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-xs text-slate-500">總計</div>
                <div className="font-bold text-slate-900 font-num">{formatCurrency(total)}</div>
              </div>
            </div>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-500">訂金已收</div>
                  <input type="checkbox" checked={Boolean(form.deposit_paid)} onChange={(e) => setForm({ ...form, deposit_paid: e.target.checked })} />
                </div>
                <div className="mt-2">
                  <label className="text-[10px] text-slate-400 block mb-1">訂金金額</label>
                  <input className="input-modern py-2" type="number" value={Number(form.depositAmount) || 0} onChange={(e) => setForm({ ...form, depositAmount: Number(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-500">尾款已收</div>
                  <input type="checkbox" checked={Boolean(form.tail_paid)} onChange={(e) => setForm({ ...form, tail_paid: e.target.checked })} />
                </div>
                <div className="mt-2">
                  <label className="text-[10px] text-slate-400 block mb-1">尾款金額</label>
                  <input className="input-modern py-2" type="number" value={Number(form.tailAmount) || 0} onChange={(e) => setForm({ ...form, tailAmount: Number(e.target.value) || 0 })} />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">建立時間</label>
              <input className="input-modern" value={form.created_at || ""} onChange={(e) => setForm({ ...form, created_at: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">驗收付款時間</label>
              <input className="input-modern" value={form.paidAt || ""} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button onClick={onClose} className="flex-1 btn btn-outline">取消</button>
            <button onClick={save} className="flex-1 btn btn-primary">保存</button>
          </div>
        </div>
      </div>
    );
  };

  const JobInspectModal = ({ data, onClose }) => {
    const j = normalizeJob(data);
    const total = calcJobTotal(j);
    const dep = Number(j.depositAmount) || calcDeposit(total);
    const tail = Number(j.tailAmount) || calcTail(total);

    return (
      <div className="fixed inset-0 z-[220] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b flex items-start justify-between">
            <div>
              <div className="text-xs text-slate-400 font-mono">{j.id}</div>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={j.status} />
                <h3 className="font-bold text-lg text-slate-800">{j.title}</h3>
              </div>
              <div className="text-xs text-slate-500 mt-2 flex flex-wrap gap-4">
                <span className="flex items-center gap-1"><Icon name="user" size={14} /> 客戶: {getUserName(j.clientId, j.clientName) || "-"}</span>
                <span className="flex items-center gap-1"><Icon name="wrench" size={14} /> 工程師: {getUserName(j.assignee) || "-"}</span>
                <span className="flex items-center gap-1"><Icon name="map-pin" size={14} /> {j.address || "-"}</span>
              </div>
            </div>
            <button onClick={onClose} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100"><Icon name="x" /></button>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card-modern p-4">
              <div className="text-xs text-slate-400">預算總計</div>
              <div className="text-2xl font-bold text-slate-900 font-num">{formatCurrency(total)}</div>
              <div className="text-xs text-slate-400 mt-2">訂金 {formatCurrency(dep)} | 尾款 {formatCurrency(tail)}</div>
            </div>
            <div className="card-modern p-4">
              <div className="text-xs text-slate-400">耗材筆數</div>
              <div className="text-2xl font-bold text-indigo-600 font-num">{(j.materials || []).length}</div>
              <div className="text-xs text-slate-400 mt-2">照片 {(j.photos || []).length} / 簽名 {j.signature ? "有" : "無"}</div>
            </div>
            <div className="card-modern p-4">
              <div className="text-xs text-slate-400">訊息筆數</div>
              <div className="text-2xl font-bold text-slate-900 font-num">{(j.messages || []).length}</div>
              <div className="text-xs text-slate-400 mt-2">建立 {j.created_at ? new Date(j.created_at).toLocaleString() : "-"}</div>
            </div>
          </div>

          <div className="p-6 border-t flex gap-3">
            <button onClick={() => { setEditJob(j); onClose(); }} className="flex-1 btn btn-outline">編輯工單</button>
            <button onClick={onClose} className="flex-1 btn btn-primary">關閉</button>
          </div>
        </div>
      </div>
    );
  };
  const pendingEngineers = useMemo(() => engineers.filter((u) => String(u.status || "") === "pending"), [engineers]);

  const ReportsPanel = () => {
    return (
      <div className="space-y-4">
        <div className="card-modern p-5">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">報表中心</h2>
              <div className="text-sm text-slate-500 mt-1">依日期區間統計訂金、尾款與現金流</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => exportJobs(rangeCreated, "csv")} className="btn btn-outline px-4 py-2 rounded-xl">匯出區間新增(工單)</button>
              <button onClick={() => exportJobs(rangeClosed, "csv")} className="btn btn-outline px-4 py-2 rounded-xl">匯出區間完工(工單)</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">起日</label>
              <input className="input-modern" type="date" value={rFrom} onChange={(e) => setRFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 block mb-1">迄日</label>
              <input className="input-modern" type="date" value={rTo} onChange={(e) => setRTo(e.target.value)} />
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <div className="text-xs text-slate-500">區間現金流營收</div>
              <div className="text-2xl font-bold text-emerald-600 font-num">{formatCurrency(rangeCashRevenue)}</div>
              <div className="text-xs text-slate-400 mt-1">訂金 {formatCurrency(rangeDepositCollected)} + 尾款 {formatCurrency(rangeTailCollected)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="text-xs text-slate-500">區間新增</div>
              <div className="text-xl font-bold text-slate-900 font-num">{rangeCreated.length}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="text-xs text-slate-500">區間完工</div>
              <div className="text-xl font-bold text-slate-900 font-num">{rangeClosed.length}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="text-xs text-slate-500">區間已收訂金</div>
              <div className="text-xl font-bold text-indigo-700 font-num">{formatCurrency(rangeDepositCollected)}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="text-xs text-slate-500">區間已收尾款</div>
              <div className="text-xl font-bold text-emerald-700 font-num">{formatCurrency(rangeTailCollected)}</div>
            </div>
          </div>
        </div>

        <div className="card-modern p-6">
          <h3 className="font-bold text-slate-800">近 7 日現金流趨勢</h3>
          <SimpleBarChart data={sevenDayRevenue} />
          <div className="text-xs text-slate-400 mt-2">計算方式：訂金(建立日) + 尾款(驗收付款日)</div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row">
      {showReport && <DailyReport onClose={() => setShowReport(false)} />}
      {editUser && <EditUserModal data={editUser} onClose={() => setEditUser(null)} />}
      {editJob && <EditJobModal data={editJob} onClose={() => setEditJob(null)} />}
      {inspectJob && <JobInspectModal data={inspectJob} onClose={() => setInspectJob(null)} />}
      {createUserOpen && <CreateUserModal onClose={() => setCreateUserOpen(false)} />}
      {createJobOpen && <CreateJobModal onClose={() => setCreateJobOpen(false)} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
      {auditOpen && <AuditModal onClose={() => setAuditOpen(false)} />}

      <aside className="w-full md:w-80 bg-white border-r p-6 flex flex-col">
        <div className="flex items-center gap-3 font-bold text-xl text-indigo-700 mb-6"><Icon name="cloud-lightning" /> 雲程中控</div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-5">
          <div className="text-xs text-slate-500">登入身分</div>
          <div className="font-bold text-slate-800 mt-1">{user?.name || "Admin"}</div>
          <div className="text-xs text-slate-400 mt-1">God Mode · pending 技師 {pendingEngineers.length}</div>
        </div>

        <nav className="space-y-1 flex-1">
          {[
            { id: "overview", label: "戰情儀表", icon: "layout-dashboard" },
            { id: "jobs", label: "全域工單", icon: "file-text" },
            { id: "users", label: "會員管理", icon: "users" },
            { id: "approvals", label: "技師審核", icon: "badge-check" },
            { id: "reports", label: "報表中心", icon: "bar-chart-3" },
            { id: "settings", label: "系統設定", icon: "settings" },
          ].map((i) => (
            <button key={i.id} onClick={() => setView(i.id)} className={`w-full text-left p-3 rounded-xl font-bold flex items-center gap-3 transition-all ${view === i.id ? "bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100" : "text-slate-600 hover:bg-slate-50"}`}>
              <Icon name={i.icon} size={18} /> {i.label}
            </button>
          ))}
        </nav>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button onClick={() => setShowReport(true)} className="btn btn-primary">日報</button>
          <button onClick={() => setAuditOpen(true)} className="btn btn-outline">紀錄</button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          <button onClick={() => exportSnapshot()} className="btn btn-outline">備份</button>
          <button onClick={() => setImportOpen(true)} className="btn btn-outline">還原</button>
        </div>

        <button onClick={() => { if (!window.confirm("確定要重置 Demo 資料？")) return; logAudit("reset_demo", "resetData()"); resetData(); }} className="mt-3 w-full py-3 bg-rose-50 text-rose-700 rounded-xl text-sm font-bold border border-rose-100 hover:bg-rose-100 flex items-center justify-center gap-2">
          <Icon name="trash-2" size={16} /> 重置 Demo 資料
        </button>

        <button onClick={logout} className="mt-3 text-slate-400 hover:text-red-500 flex items-center gap-2 px-3">
          <Icon name="log-out" size={16} /> 登出系統
        </button>
      </aside>

      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        {view === "overview" && (
          <>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">戰情儀表</h2>
                <div className="text-sm text-slate-500 mt-1">全域數據總覽 · 可批次匯出報表</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => exportJobs(jobs, "csv")} className="btn btn-outline px-4 py-2 rounded-xl">工單 CSV</button>
                <button onClick={() => exportUsers(users, "csv")} className="btn btn-outline px-4 py-2 rounded-xl">會員 CSV</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="card-modern p-5">
                <div className="text-xs text-slate-400">總營收 (已結案)</div>
                <div className="text-2xl font-bold text-emerald-600 font-num">{formatCurrency(lifetimeRevenue)}</div>
              </div>
              <div className="card-modern p-5">
                <div className="text-xs text-slate-400">待收尾款 (未結案)</div>
                <div className="text-2xl font-bold text-rose-600 font-num">{formatCurrency(escrowTailOutstanding)}</div>
              </div>
              <div className="card-modern p-5">
                <div className="text-xs text-slate-400">今日現金流營收</div>
                <div className="text-2xl font-bold text-slate-900 font-num">{formatCurrency(cashRevenueToday)}</div>
              </div>
              <div className="card-modern p-5">
                <div className="text-xs text-slate-400">今日新增 / 完工</div>
                <div className="text-2xl font-bold text-indigo-700 font-num">{createdToday.length} / {closedToday.length}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
              <div className="card-modern p-5 md:col-span-2">
                <div className="text-xs text-slate-400 mb-3">案件狀態分布</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {["open", "active", "completed", "closed"].map((k) => (
                    <div key={k} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                      <div className="font-bold text-slate-700">{k}</div>
                      <div className="font-bold text-indigo-700 font-num">{jobsByStatus[k] || 0}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-slate-400">會員：客戶 {clients.length} / 工程師 {engineers.length} / 管理 {admins.length}</div>
              </div>

              <div className="card-modern p-5 md:col-span-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-slate-800">近 7 日現金流趨勢</div>
                  <div className="text-xs text-slate-400">訂金 + 尾款</div>
                </div>
                <SimpleBarChart data={sevenDayRevenue} />
              </div>
            </div>

            <div className="card-modern p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800">最新工單</h3>
                <div className="flex gap-2">
                  <button onClick={() => { setView("jobs"); }} className="btn btn-outline px-4 py-2 rounded-xl">前往工單</button>
                  <button onClick={() => setCreateJobOpen(true)} className="btn btn-primary px-4 py-2 rounded-xl">新增工單</button>
                </div>
              </div>
              <div className="space-y-2">
                {filteredJobs.slice(0, 5).map((j) => (
                  <div key={j.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={j.status} />
                        <div className="font-bold text-slate-800 truncate">{j.title}</div>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 truncate">{getUserName(j.clientId, j.clientName) || "-"} · {j.address || "-"}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="font-bold text-indigo-700 font-num">{formatCurrency(calcJobTotal(j))}</div>
                      <button onClick={() => setInspectJob(j)} className="btn btn-outline px-3 py-2 rounded-xl">查看</button>
                      <button onClick={() => setEditJob(j)} className="btn btn-outline px-3 py-2 rounded-xl">編輯</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {view === "jobs" && (
          <>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">全域工單</h2>
                <div className="text-sm text-slate-500 mt-1">搜尋、篩選、批次操作、匯出</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setCreateJobOpen(true)} className="btn btn-primary px-4 py-2 rounded-xl">新增工單</button>
                <button onClick={() => exportJobs(filteredJobs, "csv")} className="btn btn-outline px-4 py-2 rounded-xl">匯出 CSV</button>
                <button onClick={() => exportJobs(filteredJobs, "json")} className="btn btn-outline px-4 py-2 rounded-xl">匯出 JSON</button>
              </div>
            </div>

            <div className="card-modern p-5 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 block mb-1">搜尋</label>
                  <input className="input-modern" placeholder="ID/標題/地址/客戶/工程師/描述…" value={qJobs} onChange={(e) => setQJobs(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">狀態</label>
                  <select className="input-modern" value={jobStatus} onChange={(e) => setJobStatus(e.target.value)}>
                    <option value="all">全部</option>
                    <option value="open">open</option>
                    <option value="active">active</option>
                    <option value="completed">completed</option>
                    <option value="closed">closed</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">類別</label>
                  <select className="input-modern" value={jobType} onChange={(e) => setJobType(e.target.value)}>
                    <option value="all">全部</option>
                    {allJobTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="text-xs text-slate-400">共 {filteredJobs.length} 筆 · 已選 {selectedJobIds.size} 筆</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => bulkExportSelectedJobs("csv")} className="btn btn-outline px-4 py-2 rounded-xl">匯出選取 CSV</button>
                  <button onClick={() => bulkExportSelectedJobs("json")} className="btn btn-outline px-4 py-2 rounded-xl">匯出選取 JSON</button>
                  <select className="input-modern py-2" defaultValue="" onChange={(e) => { const v = e.target.value; if(!v) return; bulkUpdateJobsStatus(v); e.target.value = ""; }}>
                    <option value="">批次改狀態…</option>
                    <option value="open">open</option>
                    <option value="active">active</option>
                    <option value="completed">completed</option>
                    <option value="closed">closed</option>
                  </select>
                  <button onClick={() => setSelectedJobIds(new Set())} className="btn btn-outline px-4 py-2 rounded-xl">清除選取</button>
                </div>
              </div>
            </div>

            <div className="card-modern overflow-hidden">
              <div className="overflow-x-auto no-scrollbar">
                <table className="min-w-[1250px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 border-b sticky top-0">
                    <tr>
                      <th className="p-4">
                        <input
                          type="checkbox"
                          checked={filteredJobs.length > 0 && selectedJobIds.size === filteredJobs.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedJobIds(new Set(filteredJobs.map((j) => j.id)));
                            else setSelectedJobIds(new Set());
                          }}
                        />
                      </th>
                      <th className="p-4">ID</th>
                      <th className="p-4">狀態</th>
                      <th className="p-4">類別</th>
                      <th className="p-4">標題</th>
                      <th className="p-4">客戶</th>
                      <th className="p-4">工程師</th>
                      <th className="p-4">金額</th>
                      <th className="p-4">訂金/尾款</th>
                      <th className="p-4">建立</th>
                      <th className="p-4">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredJobs.map((j) => {
                      const total = calcJobTotal(j);
                      const dep = Number(j.depositAmount) || calcDeposit(total);
                      const tail = Number(j.tailAmount) || calcTail(total);
                      return (
                        <tr key={j.id} className="border-b hover:bg-slate-50 align-top">
                          <td className="p-4">
                            <input type="checkbox" checked={selectedJobIds.has(j.id)} onChange={() => toggleSet(setSelectedJobIds, j.id)} />
                          </td>
                          <td className="p-4 font-mono text-slate-400">{String(j.id).slice(-10)}</td>
                          <td className="p-4"><StatusBadge status={j.status} /></td>
                          <td className="p-4 text-slate-600">{j.type || "-"}</td>
                          <td className="p-4">
                            <div className="font-bold text-slate-800">{j.title}</div>
                            <div className="text-xs text-slate-400 mt-1">{j.address || "-"}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-slate-800">{getUserName(j.clientId, j.clientName) || "-"}</div>
                            <div className="text-xs text-slate-400 mt-1">{getUserPhone(j.clientId) || ""}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-slate-800">{getUserName(j.assignee) || "-"}</div>
                            <div className="text-xs text-slate-400 mt-1">{getUserPhone(j.assignee) || ""}</div>
                          </td>
                          <td className="p-4 font-bold text-indigo-700 font-num">{formatCurrency(total)}</td>
                          <td className="p-4">
                            <div className={`font-bold font-num ${j.deposit_paid ? "text-emerald-600" : "text-slate-400"}`}>D {formatCurrency(dep)} {j.deposit_paid ? "" : "(未收)"}</div>
                            <div className={`font-bold font-num ${j.tail_paid ? "text-emerald-600" : "text-slate-400"}`}>T {formatCurrency(tail)} {j.tail_paid ? "" : "(未收)"}</div>
                          </td>
                          <td className="p-4 text-xs text-slate-500">{j.created_at ? new Date(j.created_at).toLocaleString() : "-"}</td>
                          <td className="p-4">
                            <div className="flex gap-2">
                              <button onClick={() => setInspectJob(j)} className="text-slate-700 font-bold hover:underline">查看</button>
                              <button onClick={() => setEditJob(j)} className="text-indigo-600 font-bold hover:underline">編輯</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        {view === "users" && (
          <>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">會員管理</h2>
                <div className="text-sm text-slate-500 mt-1">客戶、工程師、管理員 · 批次操作 · 匯出</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setCreateUserOpen(true)} className="btn btn-primary px-4 py-2 rounded-xl">新增會員</button>
                <button onClick={() => exportUsers(filteredUsers, "csv")} className="btn btn-outline px-4 py-2 rounded-xl">匯出 CSV</button>
                <button onClick={() => exportUsers(filteredUsers, "json")} className="btn btn-outline px-4 py-2 rounded-xl">匯出 JSON</button>
              </div>
            </div>

            <div className="card-modern p-5 mb-4">
              <div className="flex flex-wrap gap-2 mb-4">
                {[{ id: "clients", label: `客戶 (${clients.length})` }, { id: "engineers", label: `工程師 (${engineers.length})` }, { id: "admins", label: `管理員 (${admins.length})` }, { id: "all", label: `全部 (${users.length})` }].map((t) => (
                  <button key={t.id} onClick={() => setUserTab(t.id)} className={`px-4 py-2 rounded-xl font-bold text-sm border transition ${userTab === t.id ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-slate-500 block mb-1">搜尋</label>
                  <input className="input-modern" placeholder="姓名/電話/Email/地址/公司/職稱…" value={qUsers} onChange={(e) => setQUsers(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">狀態</label>
                  <select className="input-modern" value={userStatus} onChange={(e) => setUserStatus(e.target.value)}>
                    <option value="all">全部</option>
                    <option value="active">active</option>
                    <option value="verified">verified</option>
                    <option value="pending">pending</option>
                    <option value="suspended">suspended</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="text-xs text-slate-400">共 {filteredUsers.length} 筆 · 已選 {selectedUserIds.size} 筆</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => bulkExportSelectedUsers("csv")} className="btn btn-outline px-4 py-2 rounded-xl">匯出選取 CSV</button>
                  <button onClick={() => bulkExportSelectedUsers("json")} className="btn btn-outline px-4 py-2 rounded-xl">匯出選取 JSON</button>
                  <select className="input-modern py-2" defaultValue="" onChange={(e) => { const v = e.target.value; if(!v) return; bulkUpdateUsersStatus(v); e.target.value = ""; }}>
                    <option value="">批次改狀態…</option>
                    <option value="active">active</option>
                    <option value="verified">verified</option>
                    <option value="pending">pending</option>
                    <option value="suspended">suspended</option>
                  </select>
                  <button onClick={() => setSelectedUserIds(new Set())} className="btn btn-outline px-4 py-2 rounded-xl">清除選取</button>
                </div>
              </div>
            </div>

            <div className="card-modern overflow-hidden">
              <div className="overflow-x-auto no-scrollbar">
                <table className="min-w-[1200px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 border-b sticky top-0">
                    <tr>
                      <th className="p-4">
                        <input
                          type="checkbox"
                          checked={filteredUsers.length > 0 && selectedUserIds.size === filteredUsers.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedUserIds(new Set(filteredUsers.map((u) => u.id)));
                            else setSelectedUserIds(new Set());
                          }}
                        />
                      </th>
                      <th className="p-4">姓名</th>
                      <th className="p-4">角色</th>
                      <th className="p-4">狀態</th>
                      <th className="p-4">電話</th>
                      <th className="p-4">地址</th>
                      <th className="p-4">公司/職稱</th>
                      <th className="p-4">錢包</th>
                      <th className="p-4">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="border-b hover:bg-slate-50 align-top">
                        <td className="p-4">
                          <input type="checkbox" checked={selectedUserIds.has(u.id)} onChange={() => toggleSet(setSelectedUserIds, u.id)} />
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-400 mt-1 font-mono">{u.id}</div>
                          <div className="text-xs text-slate-400 mt-1">{u.email}</div>
                        </td>
                        <td className="p-4"><span className="bg-slate-100 px-2 py-1 rounded-lg text-xs font-bold">{u.role}</span></td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${String(u.status) === "suspended" ? "bg-rose-100 text-rose-700" : String(u.status) === "pending" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                            {u.status || "-"}
                          </span>
                        </td>
                        <td className="p-4 text-slate-600">{u.phone || "-"}</td>
                        <td className="p-4 text-slate-600">{u.address || "-"}</td>
                        <td className="p-4 text-slate-600">
                          <div className="font-bold text-slate-700">{u.company_name || u.company || u.title || "-"}</div>
                          <div className="text-xs text-slate-400 mt-1">{u.tax_id || u.taxId || u.experience || ""}</div>
                        </td>
                        <td className="p-4 font-bold text-indigo-700 font-num">{formatCurrency(u.wallet || 0)}</td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <button onClick={() => setEditUser(u)} className="text-indigo-600 font-bold hover:underline">編輯</button>
                            {String(u.status) !== "suspended" ? (
                              <button onClick={() => suspendUser(u.id)} className="text-rose-600 font-bold hover:underline">停權</button>
                            ) : (
                              <button onClick={() => activateUser(u.id)} className="text-emerald-600 font-bold hover:underline">恢復</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        {view === "approvals" && (
          <>
            <div className="flex items-end justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">技師審核</h2>
                <div className="text-sm text-slate-500 mt-1">審核 pending 工程師帳號，通過後狀態改為 verified</div>
              </div>
              <button onClick={() => setView("users")} className="btn btn-outline px-4 py-2 rounded-xl">前往會員管理</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card-modern p-6">
                <h3 className="font-bold text-slate-800">待審核 ({pendingEngineers.length})</h3>
                <div className="text-xs text-slate-400 mt-1">建議：確認姓名/電話/技能/年資，再按通過</div>

                <div className="space-y-3 mt-4">
                  {pendingEngineers.length === 0 ? (
                    <div className="text-sm text-slate-400">目前沒有待審核工程師</div>
                  ) : (
                    pendingEngineers.map((e) => (
                      <div key={e.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 truncate">{e.name}</div>
                            <div className="text-xs text-slate-500 mt-1">{e.title || "-"} · {e.experience || "-"}</div>
                            <div className="text-xs text-slate-400 mt-1">{e.phone || "-"} · {e.email || "-"}</div>
                            <div className="text-xs text-slate-400 mt-1">技能：{Array.isArray(e.skills) ? e.skills.join(", ") : "-"}</div>
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <button onClick={() => setEditUser(e)} className="btn btn-outline px-4 py-2 rounded-xl">編輯</button>
                            <button onClick={() => approveEngineer(e.id)} className="btn btn-primary px-4 py-2 rounded-xl">通過</button>
                            <button onClick={() => suspendUser(e.id)} className="btn btn-danger px-4 py-2 rounded-xl">拒絕/停權</button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card-modern p-6">
                <h3 className="font-bold text-slate-800">審核建議檢核表</h3>
                <div className="text-sm text-slate-600 mt-3 space-y-2">
                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <div className="font-bold">1. 基本資料</div>
                    <div className="text-xs text-slate-400 mt-1">姓名、電話、地址是否完整</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <div className="font-bold">2. 專業能力</div>
                    <div className="text-xs text-slate-400 mt-1">技能、年資、職稱是否合理</div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <div className="font-bold">3. 風險控管</div>
                    <div className="text-xs text-slate-400 mt-1">可先給 verified，後續再依評分調整</div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {view === "reports" && <ReportsPanel />}

        {view === "settings" && (
          <>
            <div className="flex items-end justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">系統設定</h2>
                <div className="text-sm text-slate-500 mt-1">備份/還原、資料維護、管理工具</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card-modern p-6">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Icon name="database" size={18} /> 資料備份</h3>
                <div className="text-sm text-slate-600 mt-2">匯出完整 users/jobs/audit 成為 snapshot JSON，可在另一台電腦匯入延續開發。</div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => exportSnapshot()} className="btn btn-primary">匯出備份</button>
                  <button onClick={() => setImportOpen(true)} className="btn btn-outline">匯入還原</button>
                </div>
              </div>

              <div className="card-modern p-6">
                <h3 className="font-bold text-slate-800 flex items-center gap-2"><Icon name="tool" size={18} /> 管理工具</h3>
                <div className="text-sm text-slate-600 mt-2">提供清空操作紀錄、重置 Demo、快速建立資料等功能。</div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button onClick={() => setCreateUserOpen(true)} className="btn btn-outline">新增會員</button>
                  <button onClick={() => setCreateJobOpen(true)} className="btn btn-outline">新增工單</button>
                  <button onClick={() => setAuditOpen(true)} className="btn btn-outline">查看紀錄</button>
                  <button onClick={() => { if(!window.confirm("確定要重置 Demo 資料？")) return; logAudit("reset_demo", "resetData()"); resetData(); }} className="btn btn-danger">重置 Demo</button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
