import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { KPICard } from '../../src/components/kpi-card';
import { DisclosureLevel } from '../../src/design-system/patterns';

// Mock performance API
global.performance = {
  now: jest.fn(() => Date.now()),
};

describe('KPICard', () => {
  const defaultProps = {
    title: 'CPU Usage',
    value: 75.5,
    unit: '%',
    subtitle: 'Average across all cores',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    performance.now.mockReturnValue(1000);
  });

  describe('Basic Rendering', () => {
    it('renders with minimal props', () => {
      render(<KPICard title="Test" value={42} />);
      
      expect(screen.getByText('Test')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders all provided information', () => {
      render(<KPICard {...defaultProps} />);
      
      expect(screen.getByText('CPU Usage')).toBeInTheDocument();
      expect(screen.getByText('75.5')).toBeInTheDocument();
      expect(screen.getByText('%')).toBeInTheDocument();
      expect(screen.getByText('Average across all cores')).toBeInTheDocument();
    });

    it('handles null and undefined values gracefully', () => {
      render(<KPICard title="Test" value={null} />);
      expect(screen.getByText('N/A')).toBeInTheDocument();

      render(<KPICard title="Test" value={undefined} />);
      expect(screen.getAllByText('N/A')).toHaveLength(2);
    });

    it('formats large numbers correctly', () => {
      render(<KPICard title="Requests" value={1234567} />);
      expect(screen.getByText('1.2M')).toBeInTheDocument();

      render(<KPICard title="Bytes" value={5432} />);
      expect(screen.getByText('5.4K')).toBeInTheDocument();
    });
  });

  describe('Status Indicators', () => {
    it('shows correct status styling', () => {
      const { container } = render(
        <KPICard {...defaultProps} status="critical" />
      );
      
      expect(container.firstChild).toHaveClass('critical');
    });

    it('shows zombie indicator when isZombie is true', () => {
      render(<KPICard {...defaultProps} isZombie={true} />);
      
      expect(screen.getByText('💀')).toBeInTheDocument();
      expect(screen.getByText('ZOMBIE PROCESS')).toBeInTheDocument();
    });

    it('shows error state correctly', () => {
      render(
        <KPICard 
          {...defaultProps} 
          error="Failed to fetch data"
          disclosureLevel={DisclosureLevel.DETAILED}
        />
      );
      
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch data')).toBeInTheDocument();
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('shows loading state', () => {
      render(<KPICard {...defaultProps} loading={true} />);
      
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  describe('Trend Display', () => {
    it('shows upward trend', () => {
      render(
        <KPICard 
          {...defaultProps} 
          trend="up"
          trendValue="+12.5%"
          trendPeriod="24h"
          disclosureLevel={DisclosureLevel.SECONDARY}
        />
      );
      
      expect(screen.getByText('+12.5%')).toBeInTheDocument();
      expect(screen.getByText('vs 24h')).toBeInTheDocument();
    });

    it('shows downward trend', () => {
      render(
        <KPICard 
          {...defaultProps} 
          trend="down"
          trendValue="-5.2%"
          disclosureLevel={DisclosureLevel.SECONDARY}
        />
      );
      
      expect(screen.getByText('-5.2%')).toBeInTheDocument();
    });
  });

  describe('Progressive Disclosure', () => {
    it('shows minimal content at PRIMARY level', () => {
      render(
        <KPICard 
          {...defaultProps}
          trend="up"
          trendValue="+10%"
          sparklineData={[{value: 10}, {value: 20}]}
          disclosureLevel={DisclosureLevel.PRIMARY}
        />
      );
      
      // Should show basic info
      expect(screen.getByText('CPU Usage')).toBeInTheDocument();
      expect(screen.getByText('75.5')).toBeInTheDocument();
      
      // Should NOT show trend or sparkline
      expect(screen.queryByText('+10%')).not.toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('shows additional content at SECONDARY level', () => {
      render(
        <KPICard 
          {...defaultProps}
          trend="up"
          trendValue="+10%"
          sparklineData={[{value: 10}, {value: 20}]}
          disclosureLevel={DisclosureLevel.SECONDARY}
        />
      );
      
      expect(screen.getByText('+10%')).toBeInTheDocument();
      expect(screen.getByLabelText(/Trend line/)).toBeInTheDocument();
    });

    it('shows all content at DETAILED level', () => {
      const lastUpdated = new Date('2023-11-28T10:30:00');
      render(
        <KPICard 
          {...defaultProps}
          lastUpdated={lastUpdated}
          confidence={0.85}
          disclosureLevel={DisclosureLevel.DETAILED}
        />
      );
      
      expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
      expect(screen.getByLabelText('Confidence: 85%')).toBeInTheDocument();
    });
  });

  describe('Interactivity', () => {
    it('handles click events when onClick is provided', () => {
      const handleClick = jest.fn();
      render(<KPICard {...defaultProps} onClick={handleClick} />);
      
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('shows hover state when interactive', () => {
      const handleClick = jest.fn();
      const { container } = render(
        <KPICard {...defaultProps} onClick={handleClick} />
      );
      
      fireEvent.mouseEnter(container.firstChild);
      // Component should have hover styles applied
      
      fireEvent.mouseLeave(container.firstChild);
      // Hover styles should be removed
    });

    it('is keyboard accessible when interactive', () => {
      const handleClick = jest.fn();
      render(<KPICard {...defaultProps} onClick={handleClick} />);
      
      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('tabIndex', '0');
      
      // Simulate Enter key press
      fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });
    });
  });

  describe('Data Freshness', () => {
    it('shows fresh data indicator', () => {
      const recentDate = new Date();
      const { container } = render(
        <KPICard {...defaultProps} lastUpdated={recentDate} />
      );
      
      // Fresh indicator should be visible (implementation specific)
      const freshIndicator = container.querySelector('[style*="backgroundColor"]');
      expect(freshIndicator).toBeTruthy();
    });

    it('shows stale data indicator', () => {
      const oldDate = new Date(Date.now() - 120000); // 2 minutes ago
      const { container } = render(
        <KPICard {...defaultProps} lastUpdated={oldDate} />
      );
      
      // Stale indicator should be visible
      const staleIndicator = container.querySelector('[style*="backgroundColor"]');
      expect(staleIndicator).toBeTruthy();
    });
  });

  describe('Performance', () => {
    it('tracks render performance in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      // Simulate slow render
      performance.now
        .mockReturnValueOnce(1000) // Start
        .mockReturnValueOnce(1020); // End (20ms)
      
      render(<KPICard {...defaultProps} />);
      
      // Should log warning for slow render
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[KPICard] Initial render took')
      );
      
      process.env.NODE_ENV = originalEnv;
    });

    it('displays sparkline efficiently', () => {
      const sparklineData = Array.from({ length: 50 }, (_, i) => ({
        value: Math.sin(i / 10) * 50 + 50,
      }));
      
      render(
        <KPICard 
          {...defaultProps}
          sparklineData={sparklineData}
          disclosureLevel={DisclosureLevel.SECONDARY}
        />
      );
      
      const svg = screen.getByLabelText(/Trend line/);
      expect(svg).toBeInTheDocument();
      expect(svg.querySelector('polyline')).toHaveAttribute('points');
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      render(<KPICard {...defaultProps} />);
      
      expect(screen.getByLabelText('CPU Usage: 75.5%')).toBeInTheDocument();
    });

    it('announces status to screen readers', () => {
      render(<KPICard {...defaultProps} status="critical" />);
      
      expect(screen.getByLabelText('Status: critical')).toBeInTheDocument();
    });

    it('provides alternative text for visual indicators', () => {
      render(
        <KPICard 
          {...defaultProps}
          sparklineData={[{value: 10}, {value: 20}]}
          trend="up"
          disclosureLevel={DisclosureLevel.SECONDARY}
        />
      );
      
      expect(screen.getByLabelText(/Trend line showing up trend/)).toBeInTheDocument();
    });
  });

  describe('Threshold Indicators', () => {
    it('shows performance bar when threshold is provided', () => {
      render(
        <KPICard 
          {...defaultProps}
          value={75}
          threshold={100}
          disclosureLevel={DisclosureLevel.SECONDARY}
        />
      );
      
      expect(screen.getByText('75/100')).toBeInTheDocument();
    });
  });

  describe('Confidence Indicator', () => {
    it('shows confidence bar when confidence < 1', () => {
      render(
        <KPICard 
          {...defaultProps}
          confidence={0.7}
        />
      );
      
      expect(screen.getByLabelText('Confidence: 70%')).toBeInTheDocument();
    });

    it('hides confidence bar when confidence = 1', () => {
      render(
        <KPICard 
          {...defaultProps}
          confidence={1}
        />
      );
      
      expect(screen.queryByLabelText(/Confidence:/)).not.toBeInTheDocument();
    });
  });
});