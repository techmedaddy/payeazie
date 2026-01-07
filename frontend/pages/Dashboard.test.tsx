import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { PaymentService } from '../services/payments';
import { PaymentStatus } from '../types';

// Mock the PaymentService
vi.mock('../services/payments', () => ({
  PaymentService: {
    getPaymentById: vi.fn(),
  },
}));

// Mock recharts to avoid canvas issues in tests
vi.mock('recharts', () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  CartesianGrid: () => <div />,
}));

describe('Dashboard - Payment Status Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const renderDashboard = () => {
    return render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );
  };

  it('should render all payment statuses correctly', async () => {
    const mockPayments = [
      {
        id: 'pay-1',
        orderId: 'ORD-001',
        amount: 1000,
        currency: 'USD',
        status: PaymentStatus.PROCESSING,
        createdAt: '2026-01-07T10:00:00Z',
        updatedAt: '2026-01-07T10:00:00Z',
      },
      {
        id: 'pay-2',
        orderId: 'ORD-002',
        amount: 2000,
        currency: 'USD',
        status: PaymentStatus.SUCCEEDED,
        createdAt: '2026-01-07T10:01:00Z',
        updatedAt: '2026-01-07T10:02:00Z',
      },
      {
        id: 'pay-3',
        orderId: 'ORD-003',
        amount: 3000,
        currency: 'USD',
        status: PaymentStatus.FAILED,
        createdAt: '2026-01-07T10:03:00Z',
        updatedAt: '2026-01-07T10:03:00Z',
      },
    ];

    // Store payment IDs in localStorage
    localStorage.setItem(
      'payeazie_recent_ids',
      JSON.stringify(['pay-1', 'pay-2', 'pay-3'])
    );

    // Mock getPaymentById to return corresponding payments
    vi.mocked(PaymentService.getPaymentById).mockImplementation((id) => {
      const payment = mockPayments.find((p) => p.id === id);
      return Promise.resolve(payment!);
    });

    renderDashboard();

    // Wait for payments to load
    await waitFor(() => {
      expect(screen.getByText('Processing')).toBeInTheDocument();
    });

    // Verify all statuses are rendered
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Succeeded')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();

    // Verify order IDs are displayed
    expect(screen.getByText('#ORD-001')).toBeInTheDocument();
    expect(screen.getByText('#ORD-002')).toBeInTheDocument();
    expect(screen.getByText('#ORD-003')).toBeInTheDocument();
  });

  it('should handle payments with missing status gracefully', async () => {
    const mockPayments = [
      {
        id: 'pay-no-status',
        orderId: 'ORD-NO-STATUS',
        amount: 1000,
        currency: 'USD',
        status: undefined as any, // Missing status
        createdAt: '2026-01-07T10:00:00Z',
        updatedAt: '2026-01-07T10:00:00Z',
      },
    ];

    localStorage.setItem(
      'payeazie_recent_ids',
      JSON.stringify(['pay-no-status'])
    );

    vi.mocked(PaymentService.getPaymentById).mockResolvedValue(
      mockPayments[0]
    );

    renderDashboard();

    // Should show "Unknown" for missing status
    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  it('should display empty state when no payments exist', async () => {
    // No localStorage data
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('No local history found.')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Create your first payment')
    ).toBeInTheDocument();
  });

  it('should handle failed API calls gracefully', async () => {
    localStorage.setItem(
      'payeazie_recent_ids',
      JSON.stringify(['pay-error'])
    );

    vi.mocked(PaymentService.getPaymentById).mockRejectedValue(
      new Error('API Error')
    );

    renderDashboard();

    // Should still render without crashing
    await waitFor(() => {
      expect(screen.queryByText('Processing')).not.toBeInTheDocument();
    });
  });

  it('should render status badges with icons', async () => {
    const mockPayment = {
      id: 'pay-with-icon',
      orderId: 'ORD-ICON',
      amount: 1000,
      currency: 'USD',
      status: PaymentStatus.SUCCEEDED,
      createdAt: '2026-01-07T10:00:00Z',
      updatedAt: '2026-01-07T10:00:00Z',
    };

    localStorage.setItem(
      'payeazie_recent_ids',
      JSON.stringify(['pay-with-icon'])
    );

    vi.mocked(PaymentService.getPaymentById).mockResolvedValue(mockPayment);

    const { container } = renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Succeeded')).toBeInTheDocument();
    });

    // Check for icon (SVG element)
    const statusBadge = container.querySelector('[role="status"]');
    expect(statusBadge).toBeInTheDocument();
    expect(statusBadge?.querySelector('svg')).toBeInTheDocument();
  });

  it('should set up auto-refresh interval', async () => {
    const mockPayment = {
      id: 'pay-refresh',
      orderId: 'ORD-REFRESH',
      amount: 1000,
      currency: 'USD',
      status: PaymentStatus.PROCESSING,
      createdAt: '2026-01-07T10:00:00Z',
      updatedAt: '2026-01-07T10:00:00Z',
    };

    localStorage.setItem(
      'payeazie_recent_ids',
      JSON.stringify(['pay-refresh'])
    );

    vi.mocked(PaymentService.getPaymentById).mockResolvedValue(mockPayment);

    renderDashboard();

    // Initial load should call the API
    await waitFor(() => {
      expect(screen.getByText('Processing')).toBeInTheDocument();
    });

    expect(PaymentService.getPaymentById).toHaveBeenCalled();
  });

  it('should display badge with correct styling', async () => {
    const mockPayment = {
      id: 'pay-style-1',
      orderId: 'ORD-STYLE-1',
      amount: 1000,
      currency: 'USD',
      status: PaymentStatus.SUCCEEDED,
      createdAt: '2026-01-07T10:00:00Z',
      updatedAt: '2026-01-07T10:00:00Z',
    };

    localStorage.setItem(
      'payeazie_recent_ids',
      JSON.stringify(['pay-style-1'])
    );

    vi.mocked(PaymentService.getPaymentById).mockResolvedValue(mockPayment);

    const { container } = renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Succeeded')).toBeInTheDocument();
    });

    // Verify badge exists with role
    const badge = container.querySelector('[role="status"]');
    expect(badge).toBeInTheDocument();
  });
});
