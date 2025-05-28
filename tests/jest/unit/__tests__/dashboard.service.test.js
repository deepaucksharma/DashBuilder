const DashboardService = require('../../../../scripts/src/services/dashboard.service');

describe('DashboardService', () => {
  let dashboardService;
  let mockApiClient;

  beforeEach(() => {
    mockApiClient = {
      query: jest.fn(),
      mutate: jest.fn(),
    };
    dashboardService = new DashboardService(mockApiClient);
  });

  describe('list', () => {
    test('should list dashboards successfully', async () => {
      const mockDashboards = {
        actor: {
          entitySearch: {
            results: {
              entities: [
                { guid: 'dashboard1', name: 'Dashboard 1' },
                { guid: 'dashboard2', name: 'Dashboard 2' },
              ],
            },
          },
        },
      };

      mockApiClient.query.mockResolvedValue(mockDashboards);

      const result = await dashboardService.list();
      
      expect(mockApiClient.query).toHaveBeenCalledWith(
        expect.stringContaining('entitySearch')
      );
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Dashboard 1');
    });

    test('should handle errors when listing dashboards', async () => {
      mockApiClient.query.mockRejectedValue(new Error('API Error'));

      await expect(dashboardService.list()).rejects.toThrow('API Error');
    });
  });

  describe('create', () => {
    test('should create dashboard successfully', async () => {
      const dashboardConfig = {
        name: 'New Dashboard',
        permissions: 'PUBLIC_READ_ONLY',
        pages: [{
          name: 'Page 1',
          widgets: []
        }]
      };

      const mockResponse = {
        dashboardCreate: {
          entityResult: {
            guid: 'new-dashboard-guid',
          },
        },
      };

      mockApiClient.mutate.mockResolvedValue(mockResponse);

      const result = await dashboardService.create(dashboardConfig);
      
      expect(mockApiClient.mutate).toHaveBeenCalledWith(
        expect.stringContaining('dashboardCreate'),
        expect.objectContaining({
          dashboard: expect.objectContaining({
            name: 'New Dashboard',
          }),
        })
      );
      expect(result.guid).toBe('new-dashboard-guid');
    });
  });

  describe('delete', () => {
    test('should delete dashboard successfully', async () => {
      const mockResponse = {
        dashboardDelete: {
          status: 'SUCCESS',
        },
      };

      mockApiClient.mutate.mockResolvedValue(mockResponse);

      const result = await dashboardService.delete('dashboard-guid');
      
      expect(mockApiClient.mutate).toHaveBeenCalledWith(
        expect.stringContaining('dashboardDelete'),
        expect.objectContaining({
          guid: 'dashboard-guid',
        })
      );
      expect(result.status).toBe('SUCCESS');
    });
  });
});