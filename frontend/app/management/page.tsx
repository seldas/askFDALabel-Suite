'use client';

import { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';
import Header from '../components/Header';
import { useRouter } from 'next/navigation';

interface User {
  id: number;
  username: string;
  is_admin: boolean;
  ai_provider: string;
}

export default function ManagementPage() {
  const { session, loading: sessionLoading } = useUser();
  const router = useRouter();
  
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [activeTasks, setActiveTasks] = useState<Record<number, any>>({});
  const [dbStatus, setDbStatus] = useState<Record<string, any>>({});
  
  // New user form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  
  // Edit user state
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editPassword, setEditPassword] = useState('');

  // Poll for active tasks
  useEffect(() => {
    const taskIds = Object.keys(activeTasks).map(Number);
    if (taskIds.length === 0) return;

    const interval = setInterval(async () => {
      for (const id of taskIds) {
        try {
          const res = await fetch(`/api/dashboard/admin/tasks/${id}`);
          const data = await res.json();
          if (data.success) {
            const task = data.task;
            setActiveTasks(prev => ({ ...prev, [id]: task }));
            setDbStatus(prev => ({ ...prev, [task.type]: task }));
            
            if (task.status === 'completed' || task.status === 'failed') {
              setActiveTasks(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
              });
            }
          }
        } catch (err) {
          console.error(`Poll error for task ${id}`, err);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeTasks]);

  useEffect(() => {
    if (!sessionLoading && (!session?.is_authenticated || !session?.is_admin)) {
      router.push('/');
    }
  }, [session, sessionLoading, router]);

  useEffect(() => {
    if (session?.is_admin) {
      fetchUsers();
    }
  }, [session]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/dashboard/admin/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      }
    } catch (err) {
      console.error('Failed to fetch users', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/dashboard/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          is_admin: newIsAdmin
        })
      });
      const data = await res.json();
      if (data.success) {
        setNewUsername('');
        setNewPassword('');
        setNewIsAdmin(false);
        fetchUsers();
      } else {
        alert(data.error || 'Failed to create user');
      }
    } catch (err) {
      console.error('Create user error', err);
    }
  };

  const handleUpdateRole = async (userId: number, isAdmin: boolean) => {
    try {
      const res = await fetch(`/api/dashboard/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_admin: isAdmin })
      });
      if (res.ok) fetchUsers();
    } catch (err) {
      console.error('Update role error', err);
    }
  };

  const handleChangePassword = async (userId: number) => {
    if (!editPassword) return;
    try {
      const res = await fetch(`/api/dashboard/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: editPassword })
      });
      if (res.ok) {
        setEditingUserId(null);
        setEditPassword('');
        alert('Password updated successfully');
      }
    } catch (err) {
      console.error('Change password error', err);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await fetch(`/api/dashboard/admin/users/${userId}`, {
        method: 'DELETE'
      });
      if (res.ok) fetchUsers();
      else {
        const data = await res.json();
        alert(data.error || 'Failed to delete user');
      }
    } catch (err) {
      console.error('Delete user error', err);
    }
  };

  const triggerUpdate = async (type: string) => {
    try {
      const res = await fetch('/api/dashboard/admin/update_db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      const data = await res.json();
      if (data.success) {
        const taskId = data.task_id;
        setActiveTasks(prev => ({ ...prev, [taskId]: { status: 'processing', progress: 0 } }));
        setDbStatus(prev => ({ ...prev, [type]: { status: 'processing', progress: 0 } }));
      } else {
        alert(data.error || 'Failed to trigger update');
      }
    } catch (err) {
      console.error('Trigger update error', err);
    }
  };

  if (sessionLoading || !session?.is_admin) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Verifying admin access...</div>;
  }

  const ProgressBar = ({ progress, status, message }: { progress: number, status: string, message?: string }) => {
    const isError = status === 'failed';
    const isComplete = status === 'completed';
    
    return (
      <div style={{ marginTop: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: '4px' }}>
          <span style={{ fontWeight: 700, color: isError ? '#ef4444' : (isComplete ? '#22c55e' : '#6366f1') }}>
            {status.toUpperCase()}: {message || ''}
          </span>
          <span style={{ fontWeight: 800 }}>{progress}%</span>
        </div>
        <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
          <div 
            style={{ 
              width: `${progress}%`, 
              height: '100%', 
              background: isError ? '#ef4444' : (isComplete ? '#22c55e' : '#6366f1'),
              transition: 'width 0.4s ease' 
            }} 
          />
        </div>
      </div>
    );
  };

  return (
    <div className="management-container">
      <Header />
      
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <h1 style={{ fontWeight: 900, fontSize: '2.5rem', marginBottom: '2rem', color: '#0f172a' }}>
          System Management
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          
          {/* Section 1: User Management */}
          <section className="mgmt-card">
            <h2 className="section-title">User Management</h2>
            
            {/* Create User Form */}
            <form onSubmit={handleCreateUser} className="mgmt-form">
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
                <input 
                  type="text" 
                  placeholder="Username" 
                  value={newUsername} 
                  onChange={e => setNewUsername(e.target.value)}
                  className="mgmt-input"
                  required
                />
                <input 
                  type="password" 
                  placeholder="Password" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)}
                  className="mgmt-input"
                  required
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', fontWeight: 700 }}>
                  <input 
                    type="checkbox" 
                    checked={newIsAdmin} 
                    onChange={e => setNewIsAdmin(e.target.checked)}
                  /> Admin
                </label>
                <button type="submit" className="btn-primary">Add</button>
              </div>
            </form>

            <div className="user-table-wrapper">
              <table className="user-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td style={{ fontWeight: 700 }}>{user.username}</td>
                      <td>
                        <select 
                          value={user.is_admin ? 'admin' : 'user'}
                          onChange={e => handleUpdateRole(user.id, e.target.value === 'admin')}
                          className="mgmt-select"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            onClick={() => setEditingUserId(editingUserId === user.id ? null : user.id)}
                            className="btn-ghost"
                          >
                            Password
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(user.id)}
                            className="btn-danger-ghost"
                          >
                            Delete
                          </button>
                        </div>
                        {editingUserId === user.id && (
                          <div style={{ marginTop: '8px', display: 'flex', gap: '5px' }}>
                            <input 
                              type="password" 
                              placeholder="New password" 
                              value={editPassword}
                              onChange={e => setEditPassword(e.target.value)}
                              className="mgmt-input-sm"
                            />
                            <button onClick={() => handleChangePassword(user.id)} className="btn-primary-sm">Save</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 2: Database Maintenance */}
          <section className="mgmt-card">
            <h2 className="section-title">Database Maintenance</h2>
            <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Manually trigger background synchronization with local source files (data/downloads).
            </p>

            <div className="update-grid">
              {[
                { id: 'labeling', name: 'Drug Labeling', desc: 'Full SPL import from local disk' },
                { id: 'orangebook', name: 'Orange Book', desc: 'Patent & Exclusivity data' },
                { id: 'drugtox', name: 'DrugTox', desc: 'Liver toxicity assessments' },
                { id: 'meddra', name: 'MedDRA', desc: 'Dictionary (SOC, HLT, etc.)' }
              ].map(item => (
                <div key={item.id} className="update-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: '#1e293b' }}>{item.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.desc}</div>
                    </div>
                    <button 
                      onClick={() => triggerUpdate(item.id)}
                      className="btn-update"
                      disabled={dbStatus[item.id]?.status === 'processing'}
                    >
                      {dbStatus[item.id]?.status === 'processing' ? 'Running...' : 'Update'}
                    </button>
                  </div>
                  
                  {dbStatus[item.id] && (
                    <ProgressBar 
                      progress={dbStatus[item.id].progress} 
                      status={dbStatus[item.id].status}
                      message={dbStatus[item.id].message}
                    />
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 800, fontSize: '0.8rem', color: '#475569', marginBottom: '8px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                Processing Note
              </div>
              <p style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4, margin: 0 }}>
                Updates run as background processes. Larger datasets (Labeling, MedDRA) may take 5-10 minutes. 
                Existing data will be replaced using the <code>--force</code> flag.
              </p>
            </div>
          </section>

        </div>
      </main>

      <style jsx>{`
        .mgmt-card {
          background: white;
          border-radius: 24px;
          padding: 2rem;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
          border: 1px solid #e2e8f0;
        }

        .section-title {
          font-weight: 900;
          font-size: 1.5rem;
          color: #0f172a;
          margin-bottom: 1rem;
        }

        .mgmt-input {
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          font-size: 0.9rem;
          flex: 1;
        }

        .mgmt-input-sm {
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid #e2e8f0;
          font-size: 0.8rem;
          flex: 1;
        }

        .mgmt-select {
          padding: 4px 8px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          font-size: 0.8rem;
          font-weight: 600;
          background: #f8fafc;
        }

        .btn-primary {
          background: #0f172a;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: 700;
          cursor: pointer;
        }

        .btn-primary-sm {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          font-weight: 700;
          font-size: 0.8rem;
          cursor: pointer;
        }

        .btn-ghost {
          background: transparent;
          color: #64748b;
          border: 1px solid #e2e8f0;
          padding: 4px 8px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.75rem;
          cursor: pointer;
        }

        .btn-danger-ghost {
          background: transparent;
          color: #ef4444;
          border: 1px solid #fee2e2;
          padding: 4px 8px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 0.75rem;
          cursor: pointer;
        }

        .user-table-wrapper {
          margin-top: 1.5rem;
          overflow-x: auto;
        }

        .user-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }

        .user-table th {
          font-size: 0.75rem;
          text-transform: uppercase;
          color: #94a3b8;
          font-weight: 800;
          padding: 8px;
          border-bottom: 2px solid #f1f5f9;
        }

        .user-table td {
          padding: 12px 8px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 0.9rem;
        }

        .update-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .update-item {
          display: flex;
          align-items: center;
          padding: 1rem;
          background: #f8fafc;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
        }

        .btn-update {
          background: white;
          color: #0f172a;
          border: 1px solid #e2e8f0;
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: 800;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }

        .btn-update:hover {
          background: #0f172a;
          color: white;
          border-color: #0f172a;
        }
      `}</style>
    </div>
  );
}
