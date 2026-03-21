import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from './StatusBadge';
import { PaymentStatus } from '../../types';

describe('StatusBadge Component', () => {
  describe('Status Rendering', () => {
    it('should render SUCCEEDED status correctly', () => {
      render(<StatusBadge status={PaymentStatus.SUCCEEDED} />);
      expect(screen.getByText('Succeeded')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Payment status: Succeeded');
    });

    it('should render PROCESSING status correctly', () => {
      render(<StatusBadge status={PaymentStatus.PROCESSING} />);
      expect(screen.getByText('Processing')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Payment status: Processing');
    });

    it('should render PENDING status correctly', () => {
      render(<StatusBadge status={PaymentStatus.PENDING} />);
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Payment status: Pending');
    });

    it('should render FAILED status correctly', () => {
      render(<StatusBadge status={PaymentStatus.FAILED} />);
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Payment status: Failed');
    });

    it('should render REFUNDED status correctly', () => {
      render(<StatusBadge status={PaymentStatus.REFUNDED} />);
      expect(screen.getByText('Refunded')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Payment status: Refunded');
    });
  });

  describe('Fallback Handling', () => {
    it('should render "Unknown" when status is undefined', () => {
      render(<StatusBadge status={undefined} />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Payment status: Unknown');
    });

    it('should render "Unknown" when status is empty string', () => {
      render(<StatusBadge status="" />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('should render "Unknown" for unrecognized status', () => {
      render(<StatusBadge status="INVALID_STATUS" />);
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  describe('Icon Display', () => {
    it('should show icon by default', () => {
      const { container } = render(<StatusBadge status={PaymentStatus.SUCCEEDED} />);
      const badge = container.querySelector('[role="status"]');
      expect(badge?.querySelector('svg')).toBeInTheDocument();
    });

    it('should hide icon when showIcon is false', () => {
      const { container } = render(<StatusBadge status={PaymentStatus.SUCCEEDED} showIcon={false} />);
      const badge = container.querySelector('[role="status"]');
      expect(badge?.querySelector('svg')).not.toBeInTheDocument();
    });

    it('should show icon when showIcon is true', () => {
      const { container } = render(<StatusBadge status={PaymentStatus.PROCESSING} showIcon={true} />);
      const badge = container.querySelector('[role="status"]');
      expect(badge?.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('should apply small size classes', () => {
      const { container } = render(<StatusBadge status={PaymentStatus.SUCCEEDED} size="sm" />);
      const badge = container.querySelector('[role="status"]');
      expect(badge).toHaveClass('px-2', 'py-0.5', 'text-xs');
    });

    it('should apply medium size classes (default)', () => {
      const { container } = render(<StatusBadge status={PaymentStatus.SUCCEEDED} />);
      const badge = container.querySelector('[role="status"]');
      expect(badge).toHaveClass('px-2.5', 'py-1', 'text-sm');
    });

    it('should apply large size classes', () => {
      const { container } = render(<StatusBadge status={PaymentStatus.SUCCEEDED} size="lg" />);
      const badge = container.querySelector('[role="status"]');
      expect(badge).toHaveClass('px-3', 'py-1.5', 'text-base');
    });
  });

  describe('Styling', () => {
    it('should apply success styling for SUCCEEDED', () => {
      const { container } = render(<StatusBadge status={PaymentStatus.SUCCEEDED} />);
      const badge = container.querySelector('[role="status"]');
      expect(badge).toHaveClass('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
    });

    it('should apply processing styling with animation for PROCESSING', () => {
      const { container } = render(<StatusBadge status={PaymentStatus.PROCESSING} />);
      const badge = container.querySelector('[role="status"]');
      expect(badge).toHaveClass('bg-blue-50', 'text-blue-700', 'border-blue-200', 'animate-pulse');
    });

    it('should apply error styling for FAILED', () => {
      const { container } = render(<StatusBadge status={PaymentStatus.FAILED} />);
      const badge = container.querySelector('[role="status"]');
      expect(badge).toHaveClass('bg-red-50', 'text-red-700', 'border-red-200');
    });

    it('should apply refund styling for REFUNDED', () => {
      const { container } = render(<StatusBadge status={PaymentStatus.REFUNDED} />);
      const badge = container.querySelector('[role="status"]');
      expect(badge).toHaveClass('bg-orange-50', 'text-orange-700', 'border-orange-200');
    });

    it('should apply warning styling for Unknown', () => {
      const { container } = render(<StatusBadge status={undefined} />);
      const badge = container.querySelector('[role="status"]');
      expect(badge).toHaveClass('bg-amber-50', 'text-amber-700', 'border-amber-200');
    });
  });

  describe('Custom className', () => {
    it('should merge custom className with default classes', () => {
      const { container } = render(
        <StatusBadge status={PaymentStatus.SUCCEEDED} className="custom-class" />
      );
      const badge = container.querySelector('[role="status"]');
      expect(badge).toHaveClass('custom-class');
      expect(badge).toHaveClass('inline-flex'); // Should still have default classes
    });
  });

  describe('Accessibility', () => {
    it('should have role="status"', () => {
      render(<StatusBadge status={PaymentStatus.SUCCEEDED} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should have descriptive aria-label', () => {
      render(<StatusBadge status={PaymentStatus.PROCESSING} />);
      const badge = screen.getByRole('status');
      expect(badge).toHaveAttribute('aria-label', 'Payment status: Processing');
    });
  });
});
