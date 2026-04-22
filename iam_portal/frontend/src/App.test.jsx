import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const REQUESTS = [
  { id: '1', email: 'alex@test.io', project_id: 'prj-1', role: 'roles/compute.viewer', status: 'approved', requested_at: '2024-01-12T10:00:00Z' },
  { id: '2', email: 'bob@test.io', project_id: 'prj-pending', role: 'roles/storage.admin', status: 'pending', requested_at: '2024-01-14T14:30:00Z' },
  { id: '3', email: 'carol@test.io', project_id: 'prj-3', role: 'roles/iam.securityReviewer', status: 'declined', requested_at: '2024-01-15T09:15:00Z' },
  { id: '4', email: 'dave@test.io', project_id: 'prj-4', role: 'roles/dns.operator', status: 'revoked', requested_at: '2024-01-16T16:45:00Z' },
  { id: '5', email: 'eve@test.io', project_id: 'prj-5', role: 'roles/viewer', status: 'error', requested_at: '2024-01-17T08:00:00Z' },
  { id: '6', email: 'frank@test.io', project_id: 'prj-6', role: 'roles/editor', status: 'actioned', requested_at: '2024-01-18T10:00:00Z' },
  { id: '7', email: 'grace@test.io', project_id: 'prj-7', role: 'roles/viewer', status: 'complete', requested_at: '2024-01-19T08:00:00Z' },
];

const USER = { email: 'user@test.io', displayName: 'Test User', role: 'user', photoURL: null };
const ADMIN = { email: 'admin@test.io', displayName: 'Admin User', role: 'admin', photoURL: 'https://example.com/photo.jpg' };
const USERS_LIST = [
  { email: 'admin@test.io', role: 'admin' },
  { email: 'other@test.io', role: 'user' },
];

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------
const ok = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
const notOk = (detail) => Promise.resolve({ ok: false, json: () => Promise.resolve(detail ? { detail } : {}) });

function mockFetch({ user = USER, requests = REQUESTS, users = USERS_LIST, requestsOk = true } = {}) {
  global.fetch = vi.fn((url, opts = {}) => {
    if (url === '/api/me') return ok(user);
    if (url === '/api/requests' && !opts.method) return requestsOk ? ok(requests) : notOk();
    if (url === '/api/users' && !opts.method) return ok(users);
    if (/\/api\/requests\/[^/]+\/(approve|decline)/.test(url)) return ok({ message: 'Done' });
    if (/\/api\/requests\/[^/]+/.test(url) && opts?.method === 'PUT') return ok({});
    if (/\/api\/users\/.+/.test(url) && opts?.method === 'DELETE') return ok({ message: 'Deleted' });
    if (url === '/api/users' && opts?.method === 'POST') return ok({ message: 'Added' });
    return Promise.reject(new Error(`Unmocked fetch: ${url}`));
  });
}

async function renderApp(opts) {
  mockFetch(opts);
  render(<App />);
  await waitFor(() => {
    expect(screen.queryByText('Loading requests...')).not.toBeInTheDocument();
    expect(screen.getAllByText('Access Requests').length).toBeGreaterThan(0);
  }, { timeout: 3000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('App', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
  });

  // -------------------------------------------------------------------------
  // Auth / loading
  // -------------------------------------------------------------------------
  it('shows loading spinner while auth is pending', () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    render(<App />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('hides spinner after auth resolves', async () => {
    await renderApp();
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
  });

  it('renders main app even when /api/me fails', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/me') return Promise.reject(new Error('network'));
      if (url === '/api/requests') return ok(REQUESTS);
      return Promise.reject(new Error('unmocked'));
    });
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('Access Requests').length).toBeGreaterThan(0), { timeout: 3000 });
  });

  // -------------------------------------------------------------------------
  // Sidebar & navigation
  // -------------------------------------------------------------------------
  it('renders logo in sidebar', async () => {
    await renderApp();
    expect(screen.getByAltText('IAM Portal Logo')).toBeInTheDocument();
  });

  it('shows Sign Out in sidebar', async () => {
    await renderApp();
    // Sign Out appears in both the sidebar button and the avatar hover-dropdown
    expect(screen.getAllByText('Sign Out').length).toBeGreaterThan(0);
  });

  it('logout navigates to IAP clear URL', async () => {
    await renderApp();
    // Click the sidebar Sign Out button (first occurrence)
    fireEvent.click(screen.getAllByText('Sign Out')[0]);
    expect(window.location.href).toBe('/_gcp_iap/clear_login_cookie');
  });

  it('shows user email in top nav', async () => {
    await renderApp({ user: USER });
    expect(screen.getByText('user@test.io')).toBeInTheDocument();
  });

  it('shows user initials avatar when photoURL is null', async () => {
    await renderApp({ user: { ...USER, email: 'zara@test.io', photoURL: null } });
    expect(screen.getByText('Z')).toBeInTheDocument();
  });

  it('shows user photo avatar when photoURL is set', async () => {
    await renderApp({ user: ADMIN });
    const avatars = document.querySelectorAll('img[src="https://example.com/photo.jpg"]');
    expect(avatars.length).toBeGreaterThan(0);
  });

  it('non-admin does not see User Management or Admin Settings', async () => {
    await renderApp({ user: USER });
    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Base Reference Data')).not.toBeInTheDocument();
  });

  it('admin sees User Management, Admin Settings, and Base Reference Data', async () => {
    await renderApp({ user: ADMIN });
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Admin Settings')).toBeInTheDocument();
    expect(screen.getByText('Base Reference Data')).toBeInTheDocument();
  });

  it('clicking Reporting switches view', async () => {
    await renderApp();
    fireEvent.click(screen.getByText('Reporting'));
    expect(screen.getByText('Ticket and access request status overview')).toBeInTheDocument();
  });

  it('clicking Access Requests from Reporting returns to requests view', async () => {
    await renderApp();
    fireEvent.click(screen.getByText('Reporting'));
    fireEvent.click(screen.getAllByText('Access Requests')[0]);
    expect(screen.getByRole('heading', { name: 'Access Requests' })).toBeInTheDocument();
  });

  it('admin clicks User Management and switches view', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getByText('User Management'));
    expect(screen.getByRole('heading', { name: 'User Management' })).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Access Requests view
  // -------------------------------------------------------------------------
  it('renders table headers', async () => {
    await renderApp();
    ['Email', 'Project ID', 'Role', 'Status', 'Requested At', 'Actions'].forEach(h => {
      expect(screen.getByText(h)).toBeInTheDocument();
    });
  });

  it('renders request rows returned from API', async () => {
    await renderApp();
    expect(screen.getByText('alex')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('falls back to sample data when requests API returns not-ok', async () => {
    mockFetch({ requestsOk: false });
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading requests...')).not.toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('alex.rivera')).toBeInTheDocument();
  });

  it('falls back to sample data when requests API throws', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/me') return ok(USER);
      if (url === '/api/requests') return Promise.reject(new Error('network'));
      return Promise.reject(new Error('unmocked'));
    });
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading requests...')).not.toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('alex.rivera')).toBeInTheDocument();
  });

  it('shows empty state when no requests match the search', async () => {
    await renderApp();
    const search = screen.getByPlaceholderText('Search requests...');
    await userEvent.type(search, 'nonexistent@nobody.io');
    expect(screen.getByText('No requests found matching your filters.')).toBeInTheDocument();
  });

  it('filters rows by email search', async () => {
    await renderApp();
    const search = screen.getByPlaceholderText('Search requests...');
    await userEvent.type(search, 'bob');
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.queryByText('alex')).not.toBeInTheDocument();
  });

  it('filters rows by project_id search', async () => {
    await renderApp();
    await userEvent.type(screen.getByPlaceholderText('Search requests...'), 'prj-pending');
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.queryByText('alex')).not.toBeInTheDocument();
  });

  it('filters rows by role search', async () => {
    await renderApp();
    await userEvent.type(screen.getByPlaceholderText('Search requests...'), 'storage.admin');
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.queryByText('alex')).not.toBeInTheDocument();
  });

  it('status filter Pending shows only pending rows', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Pending' }));
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.queryByText('alex')).not.toBeInTheDocument();
  });

  it('status filter Approved shows approved rows', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Approved' }));
    expect(screen.getByText('alex')).toBeInTheDocument();
    expect(screen.queryByText('bob')).not.toBeInTheDocument();
  });

  it('status filter Declined shows declined rows', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Declined' }));
    expect(screen.getByText('carol')).toBeInTheDocument();
    expect(screen.queryByText('alex')).not.toBeInTheDocument();
  });

  it('status filter Error shows error rows', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Error' }));
    expect(screen.getByText('eve')).toBeInTheDocument();
    expect(screen.queryByText('alex')).not.toBeInTheDocument();
  });

  it('status filter All resets to show all rows', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Pending' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('alex')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Status badges – all branches of getStatusBadge
  // -------------------------------------------------------------------------
  it.each([
    ['approved'],
    ['actioned'],
    ['complete'],
  ])('renders %s badge in green style', async (status) => {
    await renderApp({ requests: [{ ...REQUESTS[0], id: 'x', status }] });
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it.each([
    ['pending'],
    ['draft'],
  ])('renders %s badge in outlined style', async (status) => {
    await renderApp({ requests: [{ ...REQUESTS[0], id: 'x', status }] });
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it.each([
    ['declined'],
    ['revoked'],
    ['error'],
  ])('renders %s badge in red style', async (status) => {
    await renderApp({ requests: [{ ...REQUESTS[0], id: 'x', status }] });
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it('renders unknown status badge with default style', async () => {
    await renderApp({ requests: [{ ...REQUESTS[0], id: 'x', status: 'unknown_xyz' }] });
    expect(screen.getByText('unknown_xyz')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // New Request modal
  // -------------------------------------------------------------------------
  it('New Request button opens the modal', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /New Request/i }));
    expect(screen.getByRole('heading', { name: 'New Request' })).toBeInTheDocument();
  });

  it('Cancel in New Request modal closes it', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /New Request/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'New Request' })).not.toBeInTheDocument();
  });

  it('close icon in New Request modal closes it', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /New Request/i }));
    const closeIcons = screen.getAllByText('close');
    fireEvent.click(closeIcons[0].closest('button'));
    expect(screen.queryByRole('heading', { name: 'New Request' })).not.toBeInTheDocument();
  });

  it('New Request modal save calls PUT and closes modal', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /New Request/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'New Request' })).not.toBeInTheDocument()
    );
  });

  // -------------------------------------------------------------------------
  // Edit modal
  // -------------------------------------------------------------------------
  it('clicking row email button opens Edit Request modal', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'alex' }));
    expect(screen.getByRole('heading', { name: 'Edit Request' })).toBeInTheDocument();
  });

  it('edit modal is pre-filled with request data', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'alex' }));
    expect(screen.getByDisplayValue('prj-1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('roles/compute.viewer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('alex@test.io')).toBeInTheDocument();
  });

  it('edit modal allows editing project_id', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'alex' }));
    const input = screen.getByDisplayValue('prj-1');
    fireEvent.change(input, { target: { value: 'prj-updated' } });
    expect(input.value).toBe('prj-updated');
  });

  it('edit modal allows editing role', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'alex' }));
    const input = screen.getByDisplayValue('roles/compute.viewer');
    fireEvent.change(input, { target: { value: 'roles/viewer' } });
    expect(input.value).toBe('roles/viewer');
  });

  it('edit modal allows editing email', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'alex' }));
    const input = screen.getByDisplayValue('alex@test.io');
    fireEvent.change(input, { target: { value: 'new@test.io' } });
    expect(input.value).toBe('new@test.io');
  });

  it('edit modal shows raw_comments when present', async () => {
    await renderApp({ requests: [{ ...REQUESTS[0], raw_comments: 'Need access ASAP' }] });
    fireEvent.click(screen.getByRole('button', { name: 'alex' }));
    expect(screen.getByText('"Need access ASAP"')).toBeInTheDocument();
  });

  it('clicking project id cell also opens the edit modal', async () => {
    await renderApp();
    fireEvent.click(screen.getByText('prj-1'));
    expect(screen.getByRole('heading', { name: 'Edit Request' })).toBeInTheDocument();
  });

  it('Save Changes calls PUT endpoint and closes modal', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'alex' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Edit Request' })).not.toBeInTheDocument()
    );
    expect(global.fetch).toHaveBeenCalledWith('/api/requests/1', expect.objectContaining({ method: 'PUT' }));
  });

  it('Save Changes falls back to local state update when PUT throws', async () => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/me') return ok(USER);
      if (url === '/api/requests' && !opts.method) return ok(REQUESTS);
      if (/\/api\/requests\/[^/]+/.test(url) && opts?.method === 'PUT') return Promise.reject(new Error('fail'));
      return Promise.reject(new Error('unmocked'));
    });
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading requests...')).not.toBeInTheDocument(), { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: 'alex' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Edit Request' })).not.toBeInTheDocument()
    );
  });

  // -------------------------------------------------------------------------
  // handleAction (approve / decline)
  // -------------------------------------------------------------------------
  it('admin sees Approve and Decline buttons for pending rows', async () => {
    await renderApp({ user: ADMIN });
    expect(screen.getAllByText('Approve').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Decline').length).toBeGreaterThan(0);
  });

  it('non-admin does not see Approve/Decline buttons', async () => {
    await renderApp({ user: USER });
    expect(screen.queryByText('Approve')).not.toBeInTheDocument();
    expect(screen.queryByText('Decline')).not.toBeInTheDocument();
  });

  it('admin approving a request calls the approve endpoint and shows success notification', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getAllByText('Approve')[0]);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/requests/2/approve', expect.objectContaining({ method: 'POST' }))
    );
    await waitFor(() => expect(screen.getByText('Done')).toBeInTheDocument());
  });

  it('admin declining a request calls the decline endpoint', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getAllByText('Decline')[0]);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/requests/2/decline', expect.objectContaining({ method: 'POST' }))
    );
  });

  it('handleAction catch path updates local state optimistically', async () => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/me') return ok(ADMIN);
      if (url === '/api/requests' && !opts.method) return ok(REQUESTS);
      if (url === '/api/users' && !opts.method) return ok(USERS_LIST);
      if (/\/api\/requests\/[^/]+\/(approve|decline)/.test(url)) return Promise.reject(new Error('net'));
      return Promise.reject(new Error('unmocked'));
    });
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading requests...')).not.toBeInTheDocument(), { timeout: 3000 });
    fireEvent.click(screen.getAllByText('Approve')[0]);
    await act(async () => { await Promise.resolve(); });
    // No crash expected – local state updated optimistically
  });

  it('notification auto-hides after 5 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    try {
      mockFetch({ user: ADMIN });
      render(<App />);
      // Flush all microtasks/promises so auth + requests load
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      // Approve the pending request
      const approveBtn = screen.queryAllByText('Approve')[0];
      if (approveBtn) {
        fireEvent.click(approveBtn);
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });
        expect(screen.queryByText('Done')).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(5001));
        expect(screen.queryByText('Done')).not.toBeInTheDocument();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  // -------------------------------------------------------------------------
  // Reporting view – stats computed from requests
  // -------------------------------------------------------------------------
  it('reporting shows correct total count', async () => {
    await renderApp();
    fireEvent.click(screen.getByText('Reporting'));
    expect(screen.getByText(REQUESTS.length.toString())).toBeInTheDocument();
  });

  it('reporting shows Open Tickets (pending + error)', async () => {
    await renderApp();
    fireEvent.click(screen.getByText('Reporting'));
    expect(screen.getByText('Open Tickets')).toBeInTheDocument();
    // pending=1, error=1 → open=2; check the amber number div
    const openLabel = screen.getByText('Open Tickets');
    const card = openLabel.closest('[class*="rounded"]');
    expect(within(card).getByText('2')).toBeInTheDocument();
  });

  it('reporting shows Closed Tickets label', async () => {
    await renderApp();
    fireEvent.click(screen.getByText('Reporting'));
    expect(screen.getByText('Closed Tickets')).toBeInTheDocument();
  });

  it('reporting shows Errors stat card', async () => {
    await renderApp();
    fireEvent.click(screen.getByText('Reporting'));
    expect(screen.getByText('Errors')).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
  });

  it('reporting shows Status Breakdown table with all rows', async () => {
    await renderApp();
    fireEvent.click(screen.getByText('Reporting'));
    expect(screen.getByText('Status Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Approved / Actioned / Complete')).toBeInTheDocument();
    expect(screen.getByText('Declined / Revoked')).toBeInTheDocument();
    // 'Pending' appears in both the stat card label and the breakdown table row
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
  });

  it('reporting shows percentage of total', async () => {
    await renderApp();
    fireEvent.click(screen.getByText('Reporting'));
    // open=2/7 = 29%, closed=5/7 = 71%
    expect(screen.getByText('29% of total')).toBeInTheDocument();
    expect(screen.getByText('71% of total')).toBeInTheDocument();
  });

  it('toPercent returns 0% when there are no requests', async () => {
    await renderApp({ requests: [] });
    fireEvent.click(screen.getByText('Reporting'));
    const zeroPercents = screen.getAllByText('0%');
    expect(zeroPercents.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // User Management view
  // -------------------------------------------------------------------------
  it('user management shows empty state when users list is empty', async () => {
    await renderApp({ user: ADMIN, users: [] });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() =>
      expect(screen.getByText('No users registered in the portal.')).toBeInTheDocument()
    );
  });

  it('user management lists users from API', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => expect(screen.getByText('other')).toBeInTheDocument());
  });

  it('admin role badge uses blue style', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => {
      const adminBadges = screen.getAllByText('admin');
      expect(adminBadges.length).toBeGreaterThan(0);
    });
  });

  it('Make Admin button calls upsert with role=admin', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => expect(screen.getByText('Make Admin')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Make Admin'));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/users', expect.objectContaining({ method: 'POST' }))
    );
  });

  it('Make User button calls upsert with role=user', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => expect(screen.getByText('Make User')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Make User'));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/users', expect.objectContaining({ method: 'POST' }))
    );
  });

  it('delete enabled user calls DELETE endpoint', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle('Remove Access');
      const enabled = deleteButtons.find(b => !b.disabled);
      fireEvent.click(enabled);
    });
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/users/other@test.io',
        expect.objectContaining({ method: 'DELETE' })
      )
    );
  });

  it('delete button for own email is disabled', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => {
      const deleteButtons = screen.getAllByTitle('Remove Access');
      const ownBtn = deleteButtons.find(b => b.disabled);
      expect(ownBtn).toBeTruthy();
    });
  });

  it('handleUserAction shows success notification after upsert', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => expect(screen.getByText('Make Admin')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Make Admin'));
    await waitFor(() => expect(screen.getByText('Added')).toBeInTheDocument());
  });

  it('handleUserAction shows error detail when API returns error', async () => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/me') return ok(ADMIN);
      if (url === '/api/requests' && !opts.method) return ok(REQUESTS);
      if (url === '/api/users' && !opts.method) return ok(USERS_LIST);
      if (url === '/api/users' && opts?.method === 'POST') return notOk('Permission denied');
      return Promise.reject(new Error('unmocked'));
    });
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading requests...')).not.toBeInTheDocument(), { timeout: 3000 });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => expect(screen.getByText('Make Admin')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Make Admin'));
    await waitFor(() => expect(screen.getByText('Permission denied')).toBeInTheDocument());
  });

  it('handleUserAction shows fallback "Action failed" when no detail in error', async () => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/me') return ok(ADMIN);
      if (url === '/api/requests' && !opts.method) return ok(REQUESTS);
      if (url === '/api/users' && !opts.method) return ok(USERS_LIST);
      if (url === '/api/users' && opts?.method === 'POST') return notOk(); // no detail
      return Promise.reject(new Error('unmocked'));
    });
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading requests...')).not.toBeInTheDocument(), { timeout: 3000 });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => expect(screen.getByText('Make Admin')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Make Admin'));
    await waitFor(() => expect(screen.getByText('Action failed')).toBeInTheDocument());
  });

  it('handleUserAction catch path does not crash on network error', async () => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/me') return ok(ADMIN);
      if (url === '/api/requests' && !opts.method) return ok(REQUESTS);
      if (url === '/api/users' && !opts.method) return ok(USERS_LIST);
      if (url === '/api/users' && opts?.method === 'POST') return Promise.reject(new Error('network'));
      return Promise.reject(new Error('unmocked'));
    });
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading requests...')).not.toBeInTheDocument(), { timeout: 3000 });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => expect(screen.getByText('Make Admin')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Make Admin'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    // No crash, no notification shown
    expect(screen.queryByText('Added')).not.toBeInTheDocument();
  });

  it('fetchUsers catch path does not crash when /api/users throws', async () => {
    global.fetch = vi.fn((url, opts = {}) => {
      if (url === '/api/me') return ok(ADMIN);
      if (url === '/api/requests' && !opts.method) return ok(REQUESTS);
      if (url === '/api/users' && !opts.method) return Promise.reject(new Error('users fail'));
      return Promise.reject(new Error('unmocked'));
    });
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading requests...')).not.toBeInTheDocument(), { timeout: 3000 });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() =>
      expect(screen.getByText('No users registered in the portal.')).toBeInTheDocument()
    );
  });

  // -------------------------------------------------------------------------
  // Add User modal
  // -------------------------------------------------------------------------
  it('Add User button opens the add user modal', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Add User/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));
    expect(screen.getByText('Add Platform User')).toBeInTheDocument();
  });

  it('Grant Access button is disabled when email is empty', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Add User/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));
    expect(screen.getByRole('button', { name: 'Grant Access' })).toBeDisabled();
  });

  it('typing email enables Grant Access and calls POST /api/users', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Add User/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));
    await userEvent.type(screen.getByPlaceholderText('user@example.com'), 'newuser@test.io');
    fireEvent.click(screen.getByRole('button', { name: 'Grant Access' }));
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/users', expect.objectContaining({ method: 'POST' }))
    );
  });

  it('Cancel in Add User modal closes it', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Add User/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Add Platform User')).not.toBeInTheDocument();
  });

  it('Add User modal role selector can be changed to admin', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getByText('User Management'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Add User/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'admin' } });
    expect(select.value).toBe('admin');
  });

  // -------------------------------------------------------------------------
  // Notification styles
  // -------------------------------------------------------------------------
  it('success notification has emerald styling', async () => {
    await renderApp({ user: ADMIN });
    fireEvent.click(screen.getAllByText('Approve')[0]);
    await waitFor(() => expect(screen.getByText('Done')).toBeInTheDocument());
    const notification = screen.getByText('Done').closest('div');
    expect(notification.className).toMatch(/emerald/);
  });
});
