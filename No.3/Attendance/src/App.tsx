import { useEffect, useState, useMemo } from "react";
import dayjs from "dayjs";
import { Toaster, toast } from "sonner";
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { 
  initDB, getCustomFields, saveCustomFields, addEmployee, 
  deleteEmployee, getEmployeesWithStatus, togglePunch, getRawRecords, getEmployees,
  punchAllEmployees, punchSpecificDate, updateEmployee
} from "./db";
import { 
  LayoutDashboard, PieChart, Users, Settings, 
  CheckCircle2, Trash2, Plus, Search, 
  X, Fingerprint, Calendar, Download, Loader2, Zap, RotateCcw, AlertTriangle, Pencil
} from "lucide-react";

import 'dayjs/locale/zh-cn';
dayjs.locale('zh-cn');

type Tab = 'attendance' | 'stats' | 'management';

interface ConfirmModal {
  isOpen: boolean;
  title: string;
  desc: string;
  onConfirm: () => Promise<void>;
  type: 'info' | 'danger';
}

interface Employee {
  id: number;
  name: string;
  extra_data: Record<string, string>;
  is_punched?: boolean;
  presentCount?: number;
  absentCount?: number;
  missedDates: string[]; 
}

interface NavItemProps { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; }
interface HeaderProps { title: string; subtitle?: string; rightAction?: React.ReactNode; }
interface SectionProps { title: string; icon: React.ReactNode; children: React.ReactNode; }
interface InputProps { label: string; required?: boolean; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string; }
interface StatBoxProps { label: string; value: number; color: 'emerald' | 'rose'; }
interface EmptyStateProps { text: string; }

const getDatesInRange = (start: string, end: string) => {
  const dates: string[] = [];
  let curr = dayjs(start);
  const last = dayjs(end);
  while (curr.diff(last) <= 0) {
    dates.push(curr.format("YYYY-MM-DD"));
    curr = curr.add(1, 'day');
  }
  return dates;
};

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('attendance');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const [newName, setNewName] = useState("");
  const [newExtraData, setNewExtraData] = useState<Record<string, string>>({});
  const [newFieldName, setNewFieldName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentEditId, setCurrentEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editExtraData, setEditExtraData] = useState<Record<string, string>>({});

  const [confirmModal, setConfirmModal] = useState<ConfirmModal>({ 
    isOpen: false, title: '', desc: '', onConfirm: async () => {}, type: 'info' 
  });

  const [dateRange, setDateRange] = useState({ 
    start: dayjs().startOf('month').format('YYYY-MM-DD'), 
    end: dayjs().format('YYYY-MM-DD') 
  });
  
  const [statsData, setStatsData] = useState<Employee[]>([]);
  const [selectedEmpDetail, setSelectedEmpDetail] = useState<Employee | null>(null);

  useEffect(() => {
    initDB().then(() => loadData()).catch(() => toast.error("数据库初始化失败"));
  }, []);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    setSearchTerm("");
  };

  const loadData = async () => {
    try {
      const fields = await getCustomFields();
      setCustomFields(fields);
      const emps = await getEmployeesWithStatus();
      setEmployees(emps);
    } catch (err) {
      toast.error("加载数据失败");
    }
  };

  const filteredEmployees = useMemo(() => {
    let result = employees;
    if (searchTerm) {
      result = employees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return [...result].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }, [employees, searchTerm]);

  const filteredStats = useMemo(() => {
    let result = statsData;
    if (searchTerm) {
      result = statsData.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return [...result].sort((a, b) => (b.absentCount ?? 0) - (a.absentCount ?? 0));
  }, [statsData, searchTerm]);

  const exportToCSV = async () => {
    if (statsData.length === 0) {
      toast.error("当前没有数据可导出");
      return;
    }
    try {
      const headers = ["姓名", ...customFields, "出勤天数", "缺勤天数", "缺勤日期明细"];
      const rows = statsData.map(item => {
        const customValues = customFields.map(f => `"${item.extra_data[f] || ''}"`);
        const missedDatesStr = item.missedDates.join("; ") || "";
        return [
          `"${item.name}"`, 
          ...customValues, 
          item.presentCount ?? 0, 
          item.absentCount ?? 0, 
          `"${missedDatesStr}"`
        ].join(",");
      });
      const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");

      const filePath = await save({
        filters: [{ name: 'CSV File', extensions: ['csv'] }],
        defaultPath: `考勤报表_${dateRange.start}_${dateRange.end}.csv`
      });

      if (filePath) {
        await writeTextFile(filePath, csvContent);
        toast.success(`导出成功！文件已保存`);
      }
    } catch (e: any) {
      console.error(e);
      toast.error("导出失败: " + (e.message || e));
    }
  };

  const handlePunch = async (empId: number) => {
    try {
      const targetEmp = employees.find(e => e.id === empId);
      if (!targetEmp) return;
      await togglePunch(empId);
      if (!targetEmp.is_punched) {
        toast.success(`${targetEmp.name} 打卡成功`);
      } else {
        toast.success(`${targetEmp.name} 撤销打卡成功`);
      }
      setEmployees(prev => prev.map(e => e.id === empId ? { ...e, is_punched: !e.is_punched } : e));
      await loadData(); 
    } catch (err) {
      toast.error("打卡操作失败");
    }
  };

  // --- 弹窗逻辑集合 ---

  const triggerPunchAll = () => {
    setConfirmModal({
      isOpen: true,
      title: "一键全员打卡",
      desc: "确定要帮当前所有员工进行“今日打卡”吗？",
      type: 'info',
      onConfirm: async () => {
        try {
          const toastId = toast.loading("正在处理...");
          await punchAllEmployees();
          await loadData();
          toast.dismiss(toastId);
          toast.success("全员打卡完成！");
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          toast.error("全员打卡失败");
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const triggerRetroactivePunch = (empId: number, dateStr: string) => {
    if (!selectedEmpDetail) return;
    setConfirmModal({
      isOpen: true,
      title: "确认补卡",
      desc: `确定为 ${selectedEmpDetail.name} 补签 ${dateStr} 的考勤记录吗？`, 
      type: 'info',
      onConfirm: async () => {
        try {
          await punchSpecificDate(empId, dateStr);
          toast.success(`已补签: ${dateStr}`);
          await calculateStats();
          setSelectedEmpDetail((prev) => {
            if (!prev) return null;
            const currentMissedDates = prev.missedDates || [];
            return {
              ...prev,
              absentCount: (prev.absentCount ?? 0) - 1,
              presentCount: (prev.presentCount ?? 0) + 1,
              missedDates: currentMissedDates.filter((d: string) => d !== dateStr)
            };
          });
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          toast.error("补卡操作失败");
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const triggerDeleteEmployee = (id: number) => {
    setConfirmModal({
      isOpen: true,
      title: "危险操作：删除员工",
      desc: "删除员工将永久清空该员工的所有历史打卡记录，此操作无法撤销！",
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteEmployee(id);
          await loadData();
          toast.success('员工已删除');
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          toast.error("删除员工失败");
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  // --- 重点修复：触发删除字段 (只打开弹窗，不执行删除) ---
  const triggerRemoveField = (field: string) => {
    setConfirmModal({
      isOpen: true,
      title: "删除扩展字段",
      desc: `确定要删除字段“${field}”吗？\n删除后，界面上将不再显示该列，但历史数据保留在数据库中。`,
      type: 'danger',
      onConfirm: async () => {
        // 这里的代码只有点击“确认”才会跑
        try {
          const updated = customFields.filter(f => f !== field);
          await saveCustomFields(updated);
          await loadData();
          toast.success(`字段“${field}”已删除`);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          toast.error("删除字段失败");
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleAddEmployee = async () => {
    if (!newName.trim()) { toast.warning("请输入员工姓名"); return; }
    setIsSaving(true);
    try {
      const success = await addEmployee(newName, newExtraData);
      if (success) {
        setNewName("");
        setNewExtraData({});
        await loadData();
        toast.success("员工录入成功");
      }
    } catch (err) { toast.error("保存出错"); } finally { setIsSaving(false); }
  };

  const openEditModal = (emp: Employee) => {
    setCurrentEditId(emp.id);
    setEditName(emp.name);
    setEditExtraData({ ...emp.extra_data });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!currentEditId || !editName.trim()) { toast.warning("姓名不能为空"); return; }
    setIsSaving(true);
    try {
      await updateEmployee(currentEditId, editName, editExtraData);
      await loadData();
      toast.success("员工信息更新成功");
      setIsEditModalOpen(false);
    } catch (e) { toast.error("更新失败"); } finally { setIsSaving(false); }
  };

  const addField = async () => {
    if (!newFieldName.trim()) { toast.warning("请输入字段名称"); return; }
    if (customFields.includes(newFieldName)) { toast.warning("该字段已存在"); return; }
    const updated = [...customFields, newFieldName];
    await saveCustomFields(updated);
    setNewFieldName("");
    await loadData();
    toast.success(`字段 "${newFieldName}" 已添加`);
  };

  const calculateStats = async () => {
    try {
      const allDates = getDatesInRange(dateRange.start, dateRange.end);
      const allEmps = await getEmployees();
      const rawRecords = await getRawRecords(dateRange.start, dateRange.end);

      const stats = allEmps.map(emp => {
        const punchedDates = rawRecords.filter(r => r.emp_id === emp.id).map(r => r.date_str);
        const missedDates = allDates.filter(d => !punchedDates.includes(d)) || [];
        return {
          ...emp,
          presentCount: punchedDates.length,
          absentCount: missedDates.length,
          missedDates: missedDates
        };
      });
      setStatsData(stats);
    } catch (err) { toast.error("计算统计数据失败"); }
  };

  useEffect(() => {
    if (activeTab === 'stats') calculateStats();
  }, [activeTab, dateRange]);

  const customStyles = `
    @keyframes fade-in-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes zoom-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    .animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; }
    .animate-fade-in { animation: fade-in 0.2s ease-out forwards; }
    .animate-zoom-in { animation: zoom-in 0.2s ease-out forwards; }
  `;

  return (
    <>
      <style>{customStyles}</style>
      <div className="flex h-screen bg-[#F8FAFC] text-slate-800 font-sans selection:bg-indigo-100">
        <Toaster position="top-center" richColors closeButton={false} duration={2000} />

        <aside className="w-20 lg:w-64 bg-white border-r border-slate-200 flex flex-col items-center lg:items-stretch py-8 z-20 transition-all duration-300">
          <div className="px-6 mb-10 flex items-center gap-3 justify-center lg:justify-start">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Fingerprint size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 hidden lg:block">AttenPro</h1>
          </div>
          <nav className="flex-1 px-3 space-y-2">
            <NavItem active={activeTab === 'attendance'} onClick={() => switchTab('attendance')} icon={<LayoutDashboard size={20} />} label="打卡大厅" />
            <NavItem active={activeTab === 'stats'} onClick={() => switchTab('stats')} icon={<PieChart size={20} />} label="数据统计" />
            <div className="pt-4 mt-4 border-t border-slate-100">
              <NavItem active={activeTab === 'management'} onClick={() => switchTab('management')} icon={<Users size={20} />} label="人员管理" />
            </div>
          </nav>
        </aside>

        <main className="flex-1 overflow-auto relative">
          <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-indigo-50/50 to-transparent -z-10" />

          <div className="max-w-7xl mx-auto p-6 lg:p-10">
            {activeTab === 'attendance' && (
              <div className="animate-fade-in-up">
                <Header 
                  title="今日考勤" subtitle={dayjs().format('YYYY年MM月DD日 dddd')}
                  rightAction={
                    <div className="flex gap-3">
                      <button onClick={triggerPunchAll} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-full text-sm font-bold shadow-md shadow-orange-200 active:scale-95 transition-all">
                        <Zap size={16} fill="currentColor" /> 一键全员打卡
                      </button>
                      <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-indigo-500 transition-colors" />
                        <input type="text" placeholder="搜索员工姓名..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-full text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm" />
                      </div>
                    </div>
                  }
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {filteredEmployees.map(emp => (
                    <div key={emp.id} className="group relative bg-white rounded-2xl p-1 border border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                      <div className="p-5">
                        <div className="flex justify-between items-start mb-4">
                          <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-lg font-bold text-slate-600">{emp.name.charAt(0)}</div>
                          {emp.is_punched ? (
                            <div className="px-2.5 py-1 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-full flex items-center gap-1"><CheckCircle2 size={12} /> 已打卡</div>
                          ) : (
                            <div className="px-2.5 py-1 bg-slate-100 text-slate-400 text-xs font-bold rounded-full">未打卡</div>
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 mb-1">{emp.name}</h3>
                        <div className="flex flex-wrap gap-1 mb-6 min-h-[1.5rem]">
                          {customFields.map(f => emp.extra_data[f] && (
                            <span key={f} className="text-[10px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{emp.extra_data[f]}</span>
                          ))}
                        </div>
                        <button onClick={() => handlePunch(emp.id)} className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 ${emp.is_punched ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-md shadow-slate-200'}`}>
                          {emp.is_punched ? "撤销打卡" : "立即打卡"}
                        </button>
                      </div>
                    </div>
                  ))}
                  {filteredEmployees.length === 0 && <EmptyState text="未找到匹配的员工" />}
                </div>
              </div>
            )}

            {activeTab === 'stats' && (
              <div className="animate-fade-in-up">
                <Header title="考勤报表" subtitle="查看出勤记录、导出表格或补卡" rightAction={
                    <div className="flex gap-3">
                       <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-indigo-500 transition-colors" />
                        <input type="text" placeholder="搜索姓名..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm" />
                      </div>
                    </div>
                  }
                />
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-6 flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex items-center gap-4">
                     <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                        <Calendar size={16} className="text-slate-400"/>
                        <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 cursor-pointer p-0 w-28" />
                        <span className="text-slate-300">→</span>
                        <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 cursor-pointer p-0 w-28" />
                     </div>
                     <div className="text-sm font-medium text-slate-500">共 <span className="text-indigo-600 font-bold">{getDatesInRange(dateRange.start, dateRange.end).length}</span> 天</div>
                  </div>
                  <button onClick={exportToCSV} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md shadow-emerald-200 active:scale-95">
                    <Download size={16} /> 导出表格
                  </button>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <th className="p-5 pl-8">员工姓名</th>
                        {customFields.map(f => <th key={f} className="p-5 hidden sm:table-cell">{f}</th>)}
                        <th className="p-5 text-center">出勤率</th>
                        <th className="p-5 text-center">缺勤</th>
                        <th className="p-5 text-right pr-8">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredStats.map(item => (
                        <tr key={item.id} className="group hover:bg-slate-50/80 transition-colors">
                          <td className="p-5 pl-8"><div className="font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">{item.name}</div></td>
                          {customFields.map(f => (<td key={f} className="p-5 text-sm text-slate-500 hidden sm:table-cell">{item.extra_data[f] || '-'}</td>))}
                          <td className="p-5 text-center">
                             <div className="flex flex-col items-center gap-1">
                               <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                 <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${((item.presentCount ?? 0) / ((item.presentCount ?? 0) + (item.absentCount ?? 0) || 1)) * 100}%` }}></div>
                               </div>
                               <span className="text-[10px] text-slate-400">{item.presentCount ?? 0}天</span>
                             </div>
                          </td>
                          <td className="p-5 text-center">{(item.absentCount ?? 0) > 0 ? (<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-rose-50 text-rose-600">{item.absentCount ?? 0}</span>) : (<span className="text-slate-200">-</span>)}</td>
                          <td className="p-5 text-right pr-8"><button onClick={() => setSelectedEmpDetail(item)} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">明细/补卡</button></td>
                        </tr>
                      ))}
                      {filteredStats.length === 0 && <tr><td colSpan={10} className="p-10 text-center text-slate-400">无数据</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'management' && (
              <div className="max-w-4xl mx-auto animate-fade-in-up">
                <Header title="人员配置" subtitle="管理员工信息与扩展字段" />
                <div className="grid gap-8">
                  <Section title="扩展字段" icon={<Settings size={18} />}>
                     <div className="flex gap-3 mb-4">
                       <input value={newFieldName} onChange={e => setNewFieldName(e.target.value)} placeholder="增加列名 (如: 部门)" className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all" />
                       <button onClick={addField} className="bg-white border border-slate-200 text-slate-700 px-5 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors">添加</button>
                     </div>
                     <div className="flex flex-wrap gap-2">
                       {customFields.map(f => (
                         <span key={f} className="inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 group border border-slate-200">
                           {f}
                           {/* --- 修复点：X 按钮绑定的是 triggerRemoveField，不是 old removeField --- */}
                           <button onClick={() => triggerRemoveField(f)} className="p-1 hover:bg-white rounded-md text-slate-400 hover:text-rose-500 transition-colors"><X size={12}/></button>
                         </span>
                       ))}
                     </div>
                  </Section>

                  <Section title="录入员工" icon={<Plus size={18} />}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                      <Input label="姓名" required value={newName} onChange={e => setNewName(e.target.value)} placeholder="输入姓名" />
                      {customFields.map(f => (
                        <Input key={f} label={f} value={newExtraData[f] || ''} onChange={e => setNewExtraData({...newExtraData, [f]: e.target.value})} placeholder={`输入${f}`} />
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <button onClick={handleAddEmployee} disabled={!newName.trim() || isSaving} className="bg-slate-900 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-slate-200 hover:bg-indigo-600 hover:shadow-indigo-200 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                        {isSaving && <Loader2 className="animate-spin" size={16}/>}
                        {isSaving ? "保存中..." : "保存员工信息"}
                      </button>
                    </div>
                  </Section>

                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                     <div className="p-4 border-b border-slate-100 bg-slate-50/50 text-xs font-bold text-slate-500 uppercase">已录入员工 ({employees.length})</div>
                     <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                       {employees.map(emp => (
                         <div key={emp.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                           <div className="flex items-center gap-3">
                             <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-xs">{emp.name.charAt(0)}</div>
                             <div className="text-sm font-bold text-slate-700">{emp.name}</div>
                           </div>
                           <div className="flex gap-2">
                             <button onClick={() => openEditModal(emp)} className="text-slate-300 hover:text-indigo-500 p-2 transition-colors"><Pencil size={16} /></button>
                             <button onClick={() => triggerDeleteEmployee(emp.id)} className="text-slate-300 hover:text-rose-500 p-2 transition-colors"><Trash2 size={16} /></button>
                           </div>
                         </div>
                       ))}
                     </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {selectedEmpDetail && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden scale-100 animate-zoom-in">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-bold text-slate-800">考勤明细: {selectedEmpDetail.name}</h3>
                <button onClick={() => setSelectedEmpDetail(null)} className="p-1 rounded hover:bg-slate-200 transition"><X size={18} className="text-slate-500"/></button>
              </div>
              <div className="p-6">
                <div className="flex gap-4 mb-6">
                  <StatBox label="已打卡" value={selectedEmpDetail.presentCount ?? 0} color="emerald" />
                  <StatBox label="缺勤" value={selectedEmpDetail.absentCount ?? 0} color="rose" />
                </div>
                <div className="text-xs font-bold text-slate-400 uppercase mb-3 flex justify-between items-end">
                  <span>缺勤日期记录</span><span className="text-[10px] text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded">点击日期可补卡</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 min-h-[100px] max-h-[250px] overflow-y-auto border border-slate-100">
                  {selectedEmpDetail.missedDates && selectedEmpDetail.missedDates.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {selectedEmpDetail.missedDates.map((date: string) => (
                        <button key={date} onClick={() => triggerRetroactivePunch(selectedEmpDetail.id, date)} className="bg-white border border-rose-100 hover:border-indigo-400 text-rose-600 hover:text-indigo-600 hover:bg-indigo-50 text-xs py-2 px-3 rounded-md text-center font-medium shadow-sm transition-all flex items-center justify-between group" title="点击补卡">
                          {dayjs(date).format('MM-DD')} <span className="text-[10px] opacity-60 group-hover:hidden">{dayjs(date).format('ddd')}</span><RotateCcw size={12} className="hidden group-hover:block" />
                        </button>
                      ))}
                    </div>
                  ) : (<div className="h-full flex flex-col items-center justify-center text-emerald-600 gap-2"><CheckCircle2 size={24} /><span className="text-sm font-bold">全勤无缺席</span></div>)}
                </div>
              </div>
            </div>
          </div>
        )}

        {isEditModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 scale-100 animate-zoom-in">
              <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Pencil size={18} /> 编辑员工信息
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                <Input label="姓名" required value={editName} onChange={e => setEditName(e.target.value)} placeholder="输入姓名" />
                {customFields.map(f => (
                  <Input key={f} label={f} value={editExtraData[f] || ''} onChange={e => setEditExtraData({...editExtraData, [f]: e.target.value})} placeholder={`输入${f}`} />
                ))}
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setIsEditModalOpen(false)} className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition">取消</button>
                <button onClick={handleSaveEdit} disabled={isSaving} className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm shadow-lg hover:bg-indigo-600 hover:shadow-indigo-200 hover:-translate-y-0.5 transition-all flex items-center gap-2">
                  {isSaving && <Loader2 className="animate-spin" size={16}/>} 保存修改
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmModal.isOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 scale-100 animate-zoom-in">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${confirmModal.type === 'danger' ? 'bg-rose-100 text-rose-500' : 'bg-indigo-100 text-indigo-500'}`}>
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{confirmModal.title}</h3>
              <p className="text-sm text-slate-500 mb-6 leading-relaxed whitespace-pre-line">{confirmModal.desc}</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmModal(prev => ({...prev, isOpen: false}))} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition">取消</button>
                <button onClick={confirmModal.onConfirm} className={`flex-1 py-2.5 rounded-xl text-white font-bold text-sm shadow-lg transition hover:-translate-y-0.5 ${confirmModal.type === 'danger' ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-200' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'}`}>确认</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const NavItem = ({ active, onClick, icon, label }: NavItemProps) => (
  <button onClick={onClick} className={`w-full flex lg:justify-start justify-center items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group ${active ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
    <span className={`${active ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'} transition-colors`}>{icon}</span>
    <span className="text-sm font-bold hidden lg:block">{label}</span>
  </button>
);
const Header = ({ title, subtitle, rightAction }: HeaderProps) => (
  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 gap-4">
    <div><h2 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h2>{subtitle && <p className="text-slate-400 text-sm font-medium mt-1">{subtitle}</p>}</div>
    {rightAction && <div>{rightAction}</div>}
  </div>
);
const Section = ({ title, icon, children }: SectionProps) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-5 uppercase tracking-wide"><span className="text-indigo-500">{icon}</span> {title}</h3>
    {children}
  </div>
);
const Input = ({ label, required, ...props }: InputProps) => (
  <div className="space-y-1.5">
    <label className="text-xs font-bold text-slate-500 ml-1">{label} {required && <span className="text-rose-500">*</span>}</label>
    <input {...props} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300" />
  </div>
);
const StatBox = ({ label, value, color }: StatBoxProps) => {
  const colors: Record<string, string> = { emerald: "bg-emerald-50 text-emerald-700 border-emerald-100", rose: "bg-rose-50 text-rose-700 border-rose-100" };
  return (<div className={`flex-1 ${colors[color]} border p-4 rounded-2xl text-center`}><div className="text-xs font-bold uppercase opacity-70 mb-1">{label}</div><div className="text-2xl font-extrabold">{value}</div></div>);
};
const EmptyState = ({ text }: EmptyStateProps) => (
  <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-300 border-2 border-dashed border-slate-100 rounded-3xl"><Search size={48} className="mb-4 opacity-20" /><p className="font-medium">{text}</p></div>
);

export default App;