import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { PaymentService } from '../services/payments';
import { PaymentStatus } from '../types';

vi.mock('../services/payments', () => ({
  PaymentService: {
    listPayments: vi.fn(),
    reconcileProcessingPayment: vi.fn(),
    restartProcessingPayment: vi.fn(),
  },
}));

vi.mock('recharts', () => ({
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  CartesianGrid: () => <div />,
  Legend: () => <div />,
}));

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockListResponse = {
    data: [
      {
        id: 'pay-1',
        orderId: 'ORD-001',
        amount: 1000,
        currency: 'USD',
        status: PaymentStatus.PROCESSING,
        createdAt: '2026-01-07T10:00:00Z',
        updatedAt: '2026-01-07T10:00:00Z',
        processing: {
          active: true,
          startedAt: '2026-01-07T10:00:00Z',
          elapsedSeconds: 120,
          thresholdSeconds: 60,
          isStuck: true,
          hasGatewayCharge: true,
          stuckSince: '2026-01-07T10:01:00Z',
          recovery: {
            eligible: true,
            state: 'reconcile',
            canReconcile: true,
            canRestart: false,
            message: 'The payment looks stuck. Reconcile with the gateway to confirm the final outcome.',
          },
        },
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
      {
        id: 'pay-4',
        orderId: 'ORD-004',
        amount: 4000,
        currency: 'USD',
        status: PaymentStatus.REFUNDED,
        createdAt: '2026-01-07T10:04:00Z',
        updatedAt: '2026-01-07T10:05:00Z',
      },
    ],
    pagination: {
      page: 1,
      limit: 100,
      total: 4,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
    filters: {
      status: 'all',
    },
  };

  const renderDashboard = () =>
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

  it('renders refunded payments alongside the other statuses', async () => {
    vi.mocked(PaymentService.listPayments).mockResolvedValue(mockListResponse);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Refunded Payments')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Refunded').length).toBeGreaterThan(0);
    expect(screen.getByText('Refund Snapshot')).toBeInTheDocument();
    expect(screen.getByText('Refunded Volume')).toBeInTheDocument();
    expect(screen.getByText('Net Captured')).toBeInTheDocument();
    expect(screen.getByText('Performance Story')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getAllByText('ORD-004').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 refunded payments').length).toBeGreaterThan(0);
  });

  it('shows the refunded filter option', async () => {
    vi.mocked(PaymentService.listPayments).mockResolvedValue(mockListResponse);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'refunded' })).toBeInTheDocument();
    });
  });

  it('surfaces stuck processing recovery actions', async () => {
    vi.mocked(PaymentService.listPayments).mockResolvedValue(mockListResponse);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Processing Recovery Queue')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Reconcile').length).toBeGreaterThan(0);
  });

  it('handles failed API calls gracefully', async () => {
    vi.mocked(PaymentService.listPayments).mockRejectedValue(new Error('API Error'));

    renderDashboard();

    await waitFor(() => {
      expect(
        screen.getByText('Could not refresh the dashboard. Showing the last available data if any.')
      ).toBeInTheDocument();
    });
  });
});
