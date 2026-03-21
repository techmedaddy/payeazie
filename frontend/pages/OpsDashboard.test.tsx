import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import OpsDashboard from './OpsDashboard';
import { PaymentService } from '../services/payments';
import { PaymentStatus } from '../types';

const showToast = vi.fn();

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({
    showToast,
  }),
}));

vi.mock('../services/payments', () => ({
  PaymentService: {
    listPayments: vi.fn(),
    retryPayment: vi.fn(),
    reconcileProcessingPayment: vi.fn(),
    restartProcessingPayment: vi.fn(),
    simulateGatewayStatus: vi.fn(),
  },
}));

describe('OpsDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const now = Date.now();
  const toIso = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const mockListResponse = {
    data: [
      {
        id: 'pay-processing',
        orderId: 'ORD-PROCESSING',
        amount: 1000,
        currency: 'USD',
        status: PaymentStatus.PROCESSING,
        createdAt: toIso(20 * 60 * 1000),
        updatedAt: toIso(3 * 60 * 1000),
        processing: {
          active: true,
          startedAt: toIso(3 * 60 * 1000),
          elapsedSeconds: 180,
          thresholdSeconds: 60,
          isStuck: true,
          hasGatewayCharge: true,
          stuckSince: toIso(2 * 60 * 1000),
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
        id: 'pay-failed-1',
        orderId: 'ORD-FAILED-1',
        amount: 2000,
        currency: 'USD',
        status: PaymentStatus.FAILED,
        createdAt: toIso(10 * 60 * 1000),
        updatedAt: toIso(5 * 60 * 1000),
      },
      {
        id: 'pay-failed-2',
        orderId: 'ORD-FAILED-2',
        amount: 2200,
        currency: 'USD',
        status: PaymentStatus.FAILED,
        createdAt: toIso(8 * 60 * 1000),
        updatedAt: toIso(8 * 60 * 1000),
      },
      {
        id: 'pay-failed-3',
        orderId: 'ORD-FAILED-3',
        amount: 2600,
        currency: 'USD',
        status: PaymentStatus.FAILED,
        createdAt: toIso(6 * 60 * 1000),
        updatedAt: toIso(12 * 60 * 1000),
      },
      {
        id: 'pay-failed-prev',
        orderId: 'ORD-FAILED-PREV',
        amount: 1800,
        currency: 'USD',
        status: PaymentStatus.FAILED,
        createdAt: toIso(18 * 60 * 1000),
        updatedAt: toIso(18 * 60 * 1000),
      },
      {
        id: 'pay-success',
        orderId: 'ORD-SUCCESS',
        amount: 5000,
        currency: 'USD',
        status: PaymentStatus.SUCCEEDED,
        createdAt: toIso(25 * 60 * 1000),
        updatedAt: toIso(4 * 60 * 1000),
      },
    ],
    pagination: {
      page: 1,
      limit: 100,
      total: 6,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
    filters: {
      status: 'all',
    },
  };

  const renderOpsDashboard = () =>
    render(
      <BrowserRouter>
        <OpsDashboard />
      </BrowserRouter>
    );

  it('renders internal ops queues and failure spike summary', async () => {
    vi.mocked(PaymentService.listPayments).mockResolvedValue(mockListResponse);

    renderOpsDashboard();

    await waitFor(() => {
      expect(screen.getByText('Ops Center')).toBeInTheDocument();
    });

    expect(screen.getByText('Stuck Processing Queue')).toBeInTheDocument();
    expect(screen.getByText('Failure Recovery Queue')).toBeInTheDocument();
    expect(screen.getByText('Failure Spike Monitor')).toBeInTheDocument();
    expect(screen.getByText('Webhook / Gateway Simulator')).toBeInTheDocument();
    expect(screen.getByText('Outcome Story')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('Spike')).toBeInTheDocument();
    expect(screen.getAllByText('Reconcile').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Retry').length).toBeGreaterThan(0);
  });

  it('runs retry actions from the failure queue', async () => {
    vi.mocked(PaymentService.listPayments).mockResolvedValue(mockListResponse);
    vi.mocked(PaymentService.retryPayment).mockResolvedValue({ ok: true });

    renderOpsDashboard();

    await waitFor(() => {
      expect(screen.getAllByText('Retry').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('Retry')[0]);

    await waitFor(() => {
      expect(PaymentService.retryPayment).toHaveBeenCalledWith('pay-failed-1');
    });

    expect(showToast).toHaveBeenCalledWith('Retry queued for ORD-FAILED-1.', 'success');
  });

  it('runs the gateway simulator from the ops panel', async () => {
    vi.mocked(PaymentService.listPayments).mockResolvedValue(mockListResponse);
    vi.mocked(PaymentService.simulateGatewayStatus).mockResolvedValue({ ok: true });

    renderOpsDashboard();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Trigger Simulator Event' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Optional note'), {
      target: { value: 'Confirming the success webhook path for support.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trigger Simulator Event' }));

    await waitFor(() => {
      expect(PaymentService.simulateGatewayStatus).toHaveBeenCalledWith('pay-processing', {
        status: 'succeeded',
        note: 'Confirming the success webhook path for support.',
      });
    });

    expect(showToast).toHaveBeenCalledWith('Simulator pushed ORD-PROCESSING to succeeded.', 'success');
  });
});
