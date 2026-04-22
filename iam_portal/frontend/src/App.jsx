import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRequest, setEditingRequest] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [notification, setNotification] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentView, setCurrentView] = useState('requests');
  const [users, setUsers] = useState([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', role: 'user' });
  
  const commonRoles = [
    'roles/viewer',
    'roles/editor',
    'roles/owner',
    'roles/storage.admin',
    'roles/storage.objectViewer',
    'roles/compute.admin',
    'roles/compute.viewer',
    'roles/cloudsql.admin',
    'roles/iam.serviceAccountUser',
    'roles/iam.securityReviewer'
  ];

  const commonProjects = [...new Set([...requests.map(r => r.project_id), 'prj-int-test-edg-cloudops-23'])].filter(Boolean);

  // Fallback sample data if backend is not reachable
  const sampleData = [
    { id: '1', email: 'alex.rivera@vaultarchive.io', project_id: 'prj-sec-core-01', role: 'roles/compute.viewer', status: 'approved', requested_at: '2023-10-12T10:00:00Z' },
    { id: '2', email: 'j.chen@ops-vault.io', project_id: 'prj-data-warehouse-7', role: 'roles/storage.admin', status: 'pending', requested_at: '2023-10-14T14:30:00Z' },
    { id: '3', email: 'e.vogt@security.io', project_id: 'prj-audit-compliance', role: 'roles/iam.securityReviewer', status: 'approved', requested_at: '2023-10-15T09:15:00Z' },
    { id: '4', email: 's.gupta@cloud-ops.io', project_id: 'prj-infra-scaling', role: 'roles/dns.operator', status: 'revoked', requested_at: '2023-10-16T16:45:00Z' }
  ];

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/requests');
      if (response.ok) {
        const data = await response.json();
        setRequests(data);
      } else {
        setRequests(sampleData);
      }
    } catch (error) {
      console.error("Failed to fetch requests, using sample data", error);
      setRequests(sampleData);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Failed to fetch users", error);
    }
  };

  useEffect(() => {
    fetchUser();
    fetchRequests();
    if (user?.role === 'admin') fetchUsers();
  }, [user?.role]);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/me');
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (error) {
      console.error("Failed to fetch user", error);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    // IAP logout URL
    window.location.href = "/_gcp_iap/clear_login_cookie";
  };

  const handleAction = async (id, action) => {
    try {
      const response = await fetch(`/api/requests/${id}/${action}`, { method: 'POST' });
      const result = await response.json();
      
      setNotification({
        type: action === 'approve' ? 'success' : 'error',
        message: result.message || `Request ${action === 'approve' ? 'approved' : 'declined'}`
      });
      
      fetchRequests();
      
      setTimeout(() => setNotification(null), 5000);
    } catch (error) {
      console.error(`Failed to ${action} request`, error);
      setRequests(requests.map(r => r.id === id ? { ...r, status: action === 'approve' ? 'approved' : 'declined' } : r));
    }
  };

  const handleUserAction = async (userEmail, action, data = null) => {
    try {
      let response;
      if (action === 'delete') {
        response = await fetch(`/api/users/${userEmail}`, { method: 'DELETE' });
      } else if (action === 'upsert') {
        response = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      }

      if (response.ok) {
        const result = await response.json();
        setNotification({ type: 'success', message: result.message });
        fetchUsers();
        setIsUserModalOpen(false);
        setNewUser({ email: '', role: 'user' });
      } else {
        const error = await response.json();
        setNotification({ type: 'error', message: error.detail || 'Action failed' });
      }
      setTimeout(() => setNotification(null), 5000);
    } catch (error) {
      console.error("User action failed", error);
    }
  };

  const openEditModal = (request) => {
    setEditingRequest({ ...request });
    setIsModalOpen(true);
  };

  const openNewModal = () => {
    setEditingRequest({
      id: null,
      email: '',
      project_id: '',
      role: '',
      status: 'pending',
      requested_at: new Date().toISOString()
    });
    setIsModalOpen(true);
  };

  const handleUpdate = async () => {
    try {
      const response = await fetch(`/api/requests/${editingRequest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingRequest)
      });
      
      if (response.ok) {
        setIsModalOpen(false);
        fetchRequests();
      }
    } catch (error) {
      console.error("Failed to update request", error);
      setRequests(requests.map(r => r.id === editingRequest.id ? editingRequest : r));
      setIsModalOpen(false);
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesStatus = statusFilter === 'All' || req.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesSearch = req.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         req.project_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         req.role.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const statusCounts = requests.reduce((acc, req) => {
    const normalized = (req.status || '').toLowerCase();
    acc[normalized] = (acc[normalized] || 0) + 1;
    return acc;
  }, {});

  const pendingCount = statusCounts.pending || 0;
  const approvedCount = (statusCounts.approved || 0) + (statusCounts.actioned || 0) + (statusCounts.complete || 0);
  const declinedCount = (statusCounts.declined || 0) + (statusCounts.revoked || 0);
  const errorCount = statusCounts.error || 0;
  const openCount = pendingCount + errorCount;
  const closedCount = approvedCount + declinedCount;
  const totalCount = requests.length;

  const toPercent = (value) => {
    if (!totalCount) return 0;
    return Math.round((value / totalCount) * 100);
  };

  const getStatusBadge = (status) => {
    const s = status.toLowerCase();
    let classes = 'font-bold px-4 py-1.5 rounded-full text-[13px] inline-block whitespace-nowrap min-w-[100px] text-center transition-all duration-200 ';
    
    if (s === 'actioned' || s === 'approved' || s === 'complete') {
      classes += 'bg-[#065f46] text-white shadow-sm hover:brightness-110';
    } else if (s === 'draft' || s === 'pending') {
      classes += 'bg-white text-slate-600 border border-slate-200 shadow-sm hover:bg-slate-50';
    } else if (s === 'revoked' || s === 'declined' || s === 'error') {
      classes += 'bg-red-600 text-white shadow-sm hover:brightness-110';
    } else {
      classes += 'bg-slate-100 text-slate-600';
    }
    
    return <span className={classes}>{s}</span>;
  };

  if (authLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-900"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white font-body text-slate-900 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6 flex items-center justify-center">
          <img src="/logo.png" alt="IAM Portal Logo" className="h-16 w-auto object-contain" />
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <a 
            href="#" 
            onClick={() => setCurrentView('requests')}
            className={`sidebar-link ${currentView === 'requests' ? 'active' : ''}`}
          >
            <span className="material-symbols-outlined">assignment</span>
            <span>Access Requests</span>
          </a>
          {user?.role === 'admin' && (
            <a 
              href="#" 
              onClick={() => setCurrentView('users')}
              className={`sidebar-link ${currentView === 'users' ? 'active' : ''}`}
            >
              <span className="material-symbols-outlined">group</span>
              <span>User Management</span>
            </a>
          )}
          <a 
            href="#" 
            onClick={() => setCurrentView('reporting')}
            className={`sidebar-link ${currentView === 'reporting' ? 'active' : ''}`}
          >
            <span className="material-symbols-outlined">bar_chart</span>
            <span>Reporting</span>
          </a>
          {user?.role === 'admin' && (
            <>
              <a href="#" className="sidebar-link">
                <span className="material-symbols-outlined">settings</span>
                <span>Admin Settings</span>
              </a>
              <a href="#" className="sidebar-link">
                <span className="material-symbols-outlined">database</span>
                <span>Base Reference Data</span>
              </a>
            </>
          )}
          <a href="#" className="sidebar-link">
            <span className="material-symbols-outlined">help</span>
            <span>How to Guide</span>
          </a>
        </nav>

        <div className="p-4 border-t border-slate-200">
          <button 
            onClick={handleLogout}
            className="sidebar-link text-red-600 hover:bg-red-50 w-full transition-colors"
          >
            <span className="material-symbols-outlined">logout</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Nav */}
        <header className="h-16 border-b border-slate-200 flex items-center justify-end px-8 gap-6 bg-white shrink-0">
          <button className="text-slate-400 hover:text-slate-600 transition-colors">
            <span className="material-symbols-outlined">refresh</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-medium text-slate-900">{user?.displayName || 'User'}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{user?.email}</div>
            </div>
            <div className="group relative">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-slate-200 cursor-pointer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-900 font-bold text-xs cursor-pointer">
                  {user?.email?.[0].toUpperCase() || 'U'}
                </div>
              )}
              <div className="absolute right-0 top-full pt-2 hidden group-hover:block z-50">
                <div className="bg-white border border-slate-200 rounded-lg shadow-xl py-2 w-48">
                  <button 
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">logout</span>
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-8 bg-slate-50/30">
          <div className="max-w-7xl mx-auto">
            {currentView === 'requests' ? (
              <>
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-1">Access Requests</h1>
                    <p className="text-slate-500 text-sm">Create and manage cloud IAM access requests</p>
                  </div>
                  <button 
                    onClick={openNewModal}
                    className="btn-primary flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-lg">add</span>
                    New Request
                  </button>
                </div>

                {/* Filters & Search */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative flex-1 max-w-md">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                    <input 
                      type="text" 
                      placeholder="Search requests..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded px-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/10 focus:border-blue-900/30 transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#f1f5f9] p-1.5 rounded-lg border border-slate-200/50">
                    {['All', 'Pending', 'Approved', 'Declined', 'Error'].map(status => (
                      <button 
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`px-4 py-1.5 text-[13px] font-bold rounded-md transition-all duration-200 ${statusFilter === status ? 'bg-[#1e3a5f] text-white shadow-md' : 'text-slate-500 hover:bg-slate-200/60 hover:text-slate-700'}`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>

                {notification && (
                  <div className={`mb-6 p-4 rounded-lg border-l-4 ${notification.type === 'success' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-red-50 border-red-500 text-red-800'} text-sm font-medium`}>
                    {notification.message}
                  </div>
                )}

                {/* Table */}
                <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
                  <table className="w-full text-left custom-table border-collapse">
                    <thead className="bg-slate-50/50">
                      <tr>
                        <th>Email</th>
                        <th>Project ID</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Requested At</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan="6" className="py-12 text-center text-slate-400 italic">Loading requests...</td>
                        </tr>
                      ) : filteredRequests.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="py-12 text-center text-slate-400 italic">No requests found matching your filters.</td>
                        </tr>
                      ) : filteredRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                          <td>
                            <button 
                              onClick={() => openEditModal(req)}
                              className="text-blue-600 hover:underline font-medium"
                            >
                              {req.email.split('@')[0]}
                            </button>
                            <div className="text-[11px] text-slate-400">{req.email}</div>
                          </td>
                          <td className="py-4 cursor-pointer group" onClick={() => openEditModal(req)}>
                            <div className="flex items-center gap-1">
                              <span className="bg-[#f1f5f9] text-slate-600 px-2.5 py-1 rounded border border-slate-200/50 font-mono text-[13px] group-hover:bg-slate-200 transition-colors">
                                {req.project_id}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 cursor-pointer group" onClick={() => openEditModal(req)}>
                            <div className="flex items-center gap-1">
                              <span className="bg-[#f8fafc] text-slate-500 text-[11px] font-bold px-2 py-1 rounded border border-slate-200/50 uppercase tracking-tight group-hover:bg-slate-100 transition-colors">
                                {req.role.split('/').pop()}
                              </span>
                            </div>
                          </td>
                          <td>
                            {getStatusBadge(req.status)}
                          </td>
                          <td className="text-slate-500 tabular-nums">
                            {new Date(req.requested_at).toLocaleDateString()}
                          </td>
                          <td className="text-right">
                            <div className="flex justify-end items-center gap-3">
                              <button 
                                onClick={() => openEditModal(req)}
                                className="text-slate-400 hover:text-blue-600 transition-colors"
                                title="Edit Request"
                              >
                                <span className="material-symbols-outlined text-lg">edit</span>
                              </button>
                              {req.status === 'pending' && user?.role === 'admin' ? (
                                <>
                                  <button 
                                    onClick={() => handleAction(req.id, 'approve')}
                                    className="text-emerald-600 hover:text-emerald-700 font-bold text-[11px] uppercase tracking-wider"
                                  >
                                    Approve
                                  </button>
                                  <button 
                                    onClick={() => handleAction(req.id, 'decline')}
                                    className="text-red-500 hover:text-red-600 font-bold text-[11px] uppercase tracking-wider"
                                  >
                                    Decline
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : currentView === 'reporting' ? (
              <>
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-1">Reporting</h1>
                    <p className="text-slate-500 text-sm">Ticket and access request status overview</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
                  <div className="bg-white rounded border border-slate-200 p-4 shadow-sm">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Total Tickets</div>
                    <div className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">{totalCount}</div>
                  </div>
                  <div className="bg-white rounded border border-slate-200 p-4 shadow-sm">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Open Tickets</div>
                    <div className="mt-2 text-3xl font-bold text-amber-600 tabular-nums">{openCount}</div>
                    <div className="text-xs text-slate-400 mt-1">{toPercent(openCount)}% of total</div>
                  </div>
                  <div className="bg-white rounded border border-slate-200 p-4 shadow-sm">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Pending</div>
                    <div className="mt-2 text-3xl font-bold text-slate-700 tabular-nums">{pendingCount}</div>
                    <div className="text-xs text-slate-400 mt-1">Awaiting review</div>
                  </div>
                  <div className="bg-white rounded border border-slate-200 p-4 shadow-sm">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Closed Tickets</div>
                    <div className="mt-2 text-3xl font-bold text-emerald-700 tabular-nums">{closedCount}</div>
                    <div className="text-xs text-slate-400 mt-1">{toPercent(closedCount)}% of total</div>
                  </div>
                  <div className="bg-white rounded border border-slate-200 p-4 shadow-sm">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Errors</div>
                    <div className="mt-2 text-3xl font-bold text-red-600 tabular-nums">{errorCount}</div>
                    <div className="text-xs text-slate-400 mt-1">Needs attention</div>
                  </div>
                </div>

                <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Status Breakdown</h2>
                  </div>
                  <table className="w-full text-left custom-table border-collapse">
                    <thead className="bg-slate-50/50">
                      <tr>
                        <th>Status</th>
                        <th>Count</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[
                        { label: 'Approved / Actioned / Complete', value: approvedCount },
                        { label: 'Declined / Revoked', value: declinedCount },
                        { label: 'Pending', value: pendingCount },
                        { label: 'Error', value: errorCount }
                      ].map((row) => (
                        <tr key={row.label} className="hover:bg-slate-50/40 transition-colors">
                          <td className="font-medium text-slate-800">{row.label}</td>
                          <td className="tabular-nums">{row.value}</td>
                          <td className="tabular-nums text-slate-500">{toPercent(row.value)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-1">User Management</h1>
                    <p className="text-slate-500 text-sm">Manage platform access and roles</p>
                  </div>
                  <button 
                    onClick={() => setIsUserModalOpen(true)}
                    className="btn-primary flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-lg">person_add</span>
                    Add User
                  </button>
                </div>

                {notification && (
                  <div className={`mb-6 p-4 rounded-lg border-l-4 ${notification.type === 'success' ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-red-50 border-red-500 text-red-800'} text-sm font-medium`}>
                    {notification.message}
                  </div>
                )}

                <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
                  <table className="w-full text-left custom-table border-collapse">
                    <thead className="bg-slate-50/50">
                      <tr>
                        <th>User</th>
                        <th>Platform Role</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan="3" className="py-12 text-center text-slate-400 italic">No users registered in the portal.</td>
                        </tr>
                      ) : users.map((u) => (
                        <tr key={u.email} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4">
                            <div className="font-medium text-slate-900">{u.email.split('@')[0]}</div>
                            <div className="text-[11px] text-slate-400">{u.email}</div>
                          </td>
                          <td className="py-4">
                            <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${u.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-4 text-right">
                            <div className="flex justify-end items-center gap-4">
                              <button 
                                onClick={() => handleUserAction(u.email, 'upsert', { email: u.email, role: u.role === 'admin' ? 'user' : 'admin' })}
                                className="text-blue-600 hover:text-blue-700 text-[11px] font-bold uppercase"
                              >
                                {u.role === 'admin' ? 'Make User' : 'Make Admin'}
                              </button>
                              <button 
                                onClick={() => handleUserAction(u.email, 'delete')}
                                className="text-red-500 hover:text-red-600"
                                title="Remove Access"
                                disabled={u.email === user?.email}
                              >
                                <span className="material-symbols-outlined text-lg">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {/* User Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-xl overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-900">Add Platform User</h2>
                <button onClick={() => setIsUserModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Email Address</label>
                  <input 
                    type="email" 
                    placeholder="user@example.com"
                    className="w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
                    value={newUser.email} 
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Platform Role</label>
                  <select 
                    className="w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-900/30 bg-white"
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    onClick={() => handleUserAction(newUser.email, 'upsert', newUser)}
                    className="flex-1 bg-blue-900 text-white rounded py-2.5 text-sm font-bold hover:bg-blue-800 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50"
                    disabled={!newUser.email}
                  >
                    Grant Access
                  </button>
                  <button 
                    onClick={() => setIsUserModalOpen(false)}
                    className="flex-1 bg-slate-100 text-slate-600 rounded py-2.5 text-sm font-bold hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal (matching the new style) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-xl overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-900">
                  {editingRequest.id ? 'Edit Request' : 'New Request'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Status</label>
                    <div>{getStatusBadge(editingRequest.status)}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Requested At</label>
                    <div className="text-sm font-medium text-slate-700">{new Date(editingRequest.requested_at).toLocaleString()}</div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Project ID</label>
                  <input 
                    type="text" 
                    list="project-options"
                    className="w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
                    value={editingRequest.project_id} 
                    onChange={(e) => setEditingRequest({ ...editingRequest, project_id: e.target.value })}
                  />
                  <datalist id="project-options">
                    {commonProjects.map(p => <option key={p} value={p} />)}
                  </datalist>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Role</label>
                  <input 
                    type="text" 
                    list="role-options"
                    className="w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-700 font-mono focus:outline-none focus:ring-1 focus:ring-blue-900/30"
                    value={editingRequest.role} 
                    onChange={(e) => setEditingRequest({ ...editingRequest, role: e.target.value })}
                  />
                  <datalist id="role-options">
                    {commonRoles.map(r => <option key={r} value={r} />)}
                  </datalist>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Email</label>
                  <input 
                    type="text" 
                    className="w-full border border-slate-200 rounded px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-900/30"
                    value={editingRequest.email} 
                    onChange={(e) => setEditingRequest({ ...editingRequest, email: e.target.value })}
                  />
                </div>

                {editingRequest.raw_comments && (
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Comments</label>
                    <div className="bg-slate-50 p-3 rounded text-sm text-slate-600 italic border border-slate-100">
                      "{editingRequest.raw_comments}"
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  className="flex-1 px-4 py-2 rounded font-bold text-slate-500 hover:bg-slate-100 transition-colors text-sm"
                  onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button 
                  className="flex-1 px-4 py-2 bg-blue-900 text-white rounded font-bold shadow-sm hover:bg-blue-950 transition-colors text-sm"
                  onClick={handleUpdate}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;


