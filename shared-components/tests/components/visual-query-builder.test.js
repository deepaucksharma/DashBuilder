import React from 'react';
import { render, fireEvent, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VisualQueryBuilder } from '../../src/components/visual-query-builder';

describe('VisualQueryBuilder', () => {
  let mockOnQueryChange;
  let mockOnQueryRun;

  beforeEach(() => {
    mockOnQueryChange = jest.fn();
    mockOnQueryRun = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders all main sections', () => {
    render(
      <VisualQueryBuilder
        onQueryChange={mockOnQueryChange}
        onQueryRun={mockOnQueryRun}
      />
    );

    expect(screen.getByText('Select Metrics')).toBeInTheDocument();
    expect(screen.getByText('Aggregation')).toBeInTheDocument();
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Group By')).toBeInTheDocument();
    expect(screen.getByText('Time Range')).toBeInTheDocument();
    expect(screen.getByText('Query Preview')).toBeInTheDocument();
  });

  test('shows default query preview when no metrics selected', () => {
    render(<VisualQueryBuilder />);
    
    const preview = screen.getByText('SELECT ... FROM Metric');
    expect(preview).toBeInTheDocument();
  });

  describe('Metric Selection', () => {
    test('searches and suggests metrics', async () => {
      const availableMetrics = ['system.cpu.usage', 'system.memory.usage', 'system.disk.io'];
      
      render(
        <VisualQueryBuilder
          availableMetrics={availableMetrics}
          onQueryChange={mockOnQueryChange}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search metrics...');
      fireEvent.change(searchInput, { target: { value: 'cpu' } });

      await waitFor(() => {
        const suggestions = document.querySelector('.search-suggestions');
        expect(suggestions).toBeTruthy();
        expect(within(suggestions).getByText(/cpu/)).toBeInTheDocument();
      });
    });

    test('adds metric on selection', async () => {
      const availableMetrics = ['system.cpu.usage'];
      
      render(
        <VisualQueryBuilder
          availableMetrics={availableMetrics}
          onQueryChange={mockOnQueryChange}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search metrics...');
      fireEvent.change(searchInput, { target: { value: 'cpu' } });
      
      await waitFor(() => {
        const suggestion = document.querySelector('.suggestion');
        expect(suggestion).toBeTruthy();
      });

      const suggestion = document.querySelector('.suggestion');
      fireEvent.click(suggestion);

      await waitFor(() => {
        expect(screen.getByText('average(system.cpu.usage)')).toBeInTheDocument();
      });

      expect(mockOnQueryChange).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            select: [{ metric: 'system.cpu.usage', aggregation: 'average' }]
          })
        })
      );
    });

    test('removes metric when X clicked', async () => {
      render(
        <VisualQueryBuilder
          initialQuery={{
            select: [{ metric: 'system.cpu.usage', aggregation: 'average' }],
            from: 'Metric',
            where: [],
            facet: [],
            since: '1 hour ago'
          }}
          onQueryChange={mockOnQueryChange}
        />
      );

      const removeButton = screen.getByRole('button', { name: '×' });
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(screen.queryByText('average(system.cpu.usage)')).not.toBeInTheDocument();
      });
    });
  });

  describe('Aggregation', () => {
    test('changes aggregation for all metrics', async () => {
      render(
        <VisualQueryBuilder
          initialQuery={{
            select: [{ metric: 'system.cpu.usage', aggregation: 'average' }],
            from: 'Metric',
            where: [],
            facet: [],
            since: '1 hour ago'
          }}
          onQueryChange={mockOnQueryChange}
        />
      );

      const sumButton = screen.getByText('Sum');
      fireEvent.click(sumButton);

      expect(mockOnQueryChange).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            select: [{ metric: 'system.cpu.usage', aggregation: 'sum' }]
          })
        })
      );
    });

    test('highlights active aggregation', () => {
      render(<VisualQueryBuilder />);

      const averageButton = screen.getByText('Average');
      expect(averageButton).toHaveClass('active');

      const sumButton = screen.getByText('Sum');
      fireEvent.click(sumButton);
      
      expect(sumButton).toHaveClass('active');
      expect(averageButton).not.toHaveClass('active');
    });
  });

  describe('Filters', () => {
    test('adds new filter row', () => {
      render(<VisualQueryBuilder />);

      const addFilterButton = screen.getByText('+ Add Filter');
      fireEvent.click(addFilterButton);

      expect(screen.getByText('Select field...')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Value...')).toBeInTheDocument();
    });

    test('updates query when filter is complete', async () => {
      render(
        <VisualQueryBuilder
          availableDimensions={['host', 'service']}
          onQueryChange={mockOnQueryChange}
        />
      );

      const addFilterButton = screen.getByText('+ Add Filter');
      fireEvent.click(addFilterButton);

      const fieldSelect = screen.getByDisplayValue('Select field...');
      fireEvent.change(fieldSelect, { target: { value: 'host' } });

      const valueInput = screen.getByPlaceholderText('Value...');
      fireEvent.change(valueInput, { target: { value: 'server-1' } });

      await waitFor(() => {
        expect(mockOnQueryChange).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.objectContaining({
              where: [{ field: 'host', operator: '=', value: 'server-1' }]
            })
          })
        );
      });
    });

    test('removes filter when X clicked', async () => {
      render(<VisualQueryBuilder onQueryChange={mockOnQueryChange} />);

      const addFilterButton = screen.getByText('+ Add Filter');
      fireEvent.click(addFilterButton);

      const removeButton = screen.getAllByRole('button').find(
        btn => btn.textContent === '×' && btn.className.includes('remove-filter')
      );
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(screen.queryByText('Select field...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Group By', () => {
    test('searches and suggests dimensions', async () => {
      const availableDimensions = ['host', 'service', 'region'];
      
      render(
        <VisualQueryBuilder
          availableDimensions={availableDimensions}
          onQueryChange={mockOnQueryChange}
        />
      );

      const groupByInput = screen.getByPlaceholderText('Add dimension...');
      fireEvent.change(groupByInput, { target: { value: 'ho' } });

      await waitFor(() => {
        const suggestions = document.querySelector('.groupby-suggestions');
        expect(suggestions).toBeTruthy();
        expect(within(suggestions).getByText('host')).toBeInTheDocument();
      });
    });

    test('adds dimension to group by', async () => {
      const availableDimensions = ['host'];
      
      render(
        <VisualQueryBuilder
          availableDimensions={availableDimensions}
          onQueryChange={mockOnQueryChange}
        />
      );

      const groupByInput = screen.getByPlaceholderText('Add dimension...');
      fireEvent.change(groupByInput, { target: { value: 'host' } });
      
      await waitFor(() => {
        const suggestion = document.querySelector('.suggestion');
        expect(suggestion).toBeTruthy();
      });

      const suggestion = document.querySelector('.suggestion');
      fireEvent.click(suggestion);

      expect(mockOnQueryChange).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            facet: ['host']
          })
        })
      );
    });
  });

  describe('Time Range', () => {
    test('updates time range on button click', () => {
      render(<VisualQueryBuilder onQueryChange={mockOnQueryChange} />);

      const fiveMinButton = screen.getByText('5m');
      fireEvent.click(fiveMinButton);

      expect(mockOnQueryChange).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            since: '5 minutes'
          })
        })
      );
    });

    test('handles custom time range', () => {
      // Mock window.prompt
      window.prompt = jest.fn(() => '2 hours ago');

      render(<VisualQueryBuilder onQueryChange={mockOnQueryChange} />);

      const customButton = screen.getByText('Custom');
      fireEvent.click(customButton);

      expect(window.prompt).toHaveBeenCalledWith(
        'Enter custom time range (e.g., "2 hours ago", "3 days ago"):'
      );
      expect(mockOnQueryChange).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            since: '2 hours ago'
          })
        })
      );
    });
  });

  describe('Query Building', () => {
    test('builds complete NRQL query', async () => {
      render(
        <VisualQueryBuilder
          initialQuery={{
            select: [{ metric: 'system.cpu.usage', aggregation: 'average' }],
            from: 'Metric',
            where: [{ field: 'host', operator: '=', value: 'server-1' }],
            facet: ['service'],
            since: '1 hour ago'
          }}
          onQueryChange={mockOnQueryChange}
        />
      );

      await waitFor(() => {
        expect(mockOnQueryChange).toHaveBeenCalledWith(
          expect.objectContaining({
            nrql: "SELECT average(system.cpu.usage) FROM Metric WHERE host = 'server-1' FACET service SINCE 1 hour ago"
          })
        );
      });
    });

    test('validates query and includes validation result', async () => {
      render(
        <VisualQueryBuilder
          initialQuery={{
            select: [{ metric: 'system.cpu.usage', aggregation: 'average' }],
            from: 'Metric',
            where: [],
            facet: [],
            since: '1 hour ago'
          }}
          onQueryChange={mockOnQueryChange}
        />
      );

      await waitFor(() => {
        expect(mockOnQueryChange).toHaveBeenCalledWith(
          expect.objectContaining({
            isValid: true,
            validationResult: expect.objectContaining({
              valid: true
            })
          })
        );
      });
    });
  });

  describe('Query Actions', () => {
    test('runs query when button clicked', async () => {
      render(
        <VisualQueryBuilder
          initialQuery={{
            select: [{ metric: 'system.cpu.usage', aggregation: 'average' }],
            from: 'Metric',
            where: [],
            facet: [],
            since: '1 hour ago'
          }}
          onQueryRun={mockOnQueryRun}
        />
      );

      const runButton = screen.getByText('Run Query');
      fireEvent.click(runButton);

      expect(mockOnQueryRun).toHaveBeenCalledWith({
        nrql: 'SELECT average(system.cpu.usage) FROM Metric SINCE 1 hour ago',
        query: expect.any(Object)
      });
    });

    test('disables run button when no metrics selected', () => {
      render(<VisualQueryBuilder />);

      const runButton = screen.getByText('Run Query');
      expect(runButton).toBeDisabled();
    });

    test('copies query to clipboard', async () => {
      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: jest.fn().mockResolvedValue()
        }
      });

      render(
        <VisualQueryBuilder
          initialQuery={{
            select: [{ metric: 'system.cpu.usage', aggregation: 'average' }],
            from: 'Metric',
            where: [],
            facet: [],
            since: '1 hour ago'
          }}
        />
      );

      const copyButton = screen.getByText('Copy');
      fireEvent.click(copyButton);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'SELECT average(system.cpu.usage) FROM Metric SINCE 1 hour ago'
      );
    });
  });

  describe('Edge Cases', () => {
    test('handles empty availableMetrics gracefully', () => {
      render(
        <VisualQueryBuilder
          availableMetrics={[]}
          onQueryChange={mockOnQueryChange}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search metrics...');
      fireEvent.change(searchInput, { target: { value: 'cpu' } });

      // Should show default metrics
      const suggestions = document.querySelector('.search-suggestions');
      expect(suggestions).toBeTruthy();
      expect(within(suggestions).getByText(/cpu/)).toBeInTheDocument();
    });

    test('prevents duplicate metrics', async () => {
      const availableMetrics = ['system.cpu.usage'];
      
      render(
        <VisualQueryBuilder
          availableMetrics={availableMetrics}
          initialQuery={{
            select: [{ metric: 'system.cpu.usage', aggregation: 'average' }],
            from: 'Metric',
            where: [],
            facet: [],
            since: '1 hour ago'
          }}
          onQueryChange={mockOnQueryChange}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search metrics...');
      fireEvent.change(searchInput, { target: { value: 'cpu' } });
      
      await waitFor(() => {
        const suggestion = document.querySelector('.suggestion');
        expect(suggestion).toBeTruthy();
      });

      const suggestion = document.querySelector('.suggestion');
      fireEvent.click(suggestion);

      // Should still have only one instance
      const metrics = screen.getAllByText(/average\(system.cpu.usage\)/);
      expect(metrics).toHaveLength(1);
    });

    test('handles IN operator for filters', async () => {
      render(
        <VisualQueryBuilder
          availableDimensions={['host']}
          onQueryChange={mockOnQueryChange}
        />
      );

      const addFilterButton = screen.getByText('+ Add Filter');
      fireEvent.click(addFilterButton);

      const fieldSelect = screen.getByDisplayValue('Select field...');
      fireEvent.change(fieldSelect, { target: { value: 'host' } });

      const operatorSelect = screen.getAllByRole('combobox')[1];
      fireEvent.change(operatorSelect, { target: { value: 'IN' } });

      const valueInput = screen.getByPlaceholderText('Value...');
      fireEvent.change(valueInput, { target: { value: 'server-1, server-2' } });

      await waitFor(() => {
        expect(mockOnQueryChange).toHaveBeenCalledWith(
          expect.objectContaining({
            nrql: expect.stringContaining("WHERE host IN (server-1, server-2)")
          })
        );
      });
    });
  });
});