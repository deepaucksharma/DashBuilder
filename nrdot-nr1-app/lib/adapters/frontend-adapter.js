/**
 * Frontend Component Adapter for New Relic One
 * 
 * This adapter allows reuse of existing frontend components
 * within the New Relic One platform by providing compatibility
 * layers and utilities.
 */

import React from 'react';
import { 
  NerdGraphQuery,
  PlatformStateContext,
  NerdletStateContext,
  Toast,
  logger,
  UserStorageMutation,
  UserStorageQuery,
  AccountStorageMutation,
  AccountStorageQuery
} from 'nr1';

/**
 * Adapt fetch calls to use NerdGraph
 */
export class NerdGraphAdapter {
  static async query(query, variables = {}) {
    try {
      const result = await NerdGraphQuery.query({
        query,
        variables
      });
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      return result.data;
    } catch (error) {
      logger.error('NerdGraph query failed', error);
      throw error;
    }
  }

  static async nrql(accountId, nrqlQuery) {
    const query = `
      query NrqlQuery($accountId: Int!, $query: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $query) {
              results
              metadata {
                timeWindow {
                  begin
                  end
                }
              }
            }
          }
        }
      }
    `;
    
    const result = await this.query(query, { accountId, query: nrqlQuery });
    return result?.actor?.account?.nrql;
  }
}

/**
 * Storage adapter for persisting data in NR1
 */
export class StorageAdapter {
  static async getUserData(collection, documentId) {
    try {
      const result = await UserStorageQuery.query({
        collection,
        documentId
      });
      return result.data;
    } catch (error) {
      logger.error('Failed to get user data', error);
      return null;
    }
  }

  static async setUserData(collection, documentId, data) {
    try {
      await UserStorageMutation.mutate({
        actionType: UserStorageMutation.ACTION_TYPE.WRITE_DOCUMENT,
        collection,
        documentId,
        document: data
      });
      return true;
    } catch (error) {
      logger.error('Failed to set user data', error);
      return false;
    }
  }

  static async getAccountData(accountId, collection, documentId) {
    try {
      const result = await AccountStorageQuery.query({
        accountId,
        collection,
        documentId
      });
      return result.data;
    } catch (error) {
      logger.error('Failed to get account data', error);
      return null;
    }
  }

  static async setAccountData(accountId, collection, documentId, data) {
    try {
      await AccountStorageMutation.mutate({
        accountId,
        actionType: AccountStorageMutation.ACTION_TYPE.WRITE_DOCUMENT,
        collection,
        documentId,
        document: data
      });
      return true;
    } catch (error) {
      logger.error('Failed to set account data', error);
      return false;
    }
  }
}

/**
 * HOC to inject platform context into existing components
 */
export function withPlatformContext(Component) {
  return function PlatformContextWrapper(props) {
    const platformContext = React.useContext(PlatformStateContext);
    const nerdletContext = React.useContext(NerdletStateContext);
    
    // Merge contexts and provide expected props
    const enhancedProps = {
      ...props,
      accountId: platformContext.accountId,
      timeRange: platformContext.timeRange,
      user: platformContext.user,
      nerdletState: nerdletContext,
      // Add API adapters
      api: {
        nerdgraph: NerdGraphAdapter,
        storage: StorageAdapter
      }
    };
    
    return <Component {...enhancedProps} />;
  };
}

/**
 * Cache adapter using NR1 storage
 */
export class CacheAdapter {
  static cachePrefix = 'cache:';
  
  static async get(key) {
    const data = await StorageAdapter.getUserData(
      this.cachePrefix,
      key
    );
    
    if (data && data.expiry > Date.now()) {
      return data.value;
    }
    
    return null;
  }
  
  static async set(key, value, ttl = 3600000) { // 1 hour default
    const data = {
      value,
      expiry: Date.now() + ttl
    };
    
    await StorageAdapter.setUserData(
      this.cachePrefix,
      key,
      data
    );
  }
  
  static async invalidate(pattern) {
    // NR1 doesn't support pattern-based deletion
    // Would need to track keys separately
    logger.warn('Pattern-based cache invalidation not supported in NR1');
  }
}

/**
 * WebSocket adapter for real-time features
 */
export class WebSocketAdapter {
  constructor() {
    // NR1 doesn't support WebSockets directly
    // Use polling with NerdGraph subscriptions instead
    this.subscriptions = new Map();
    this.pollingInterval = 5000; // 5 seconds
  }
  
  subscribe(channel, callback) {
    if (this.subscriptions.has(channel)) {
      return;
    }
    
    const interval = setInterval(async () => {
      try {
        // Poll for updates
        const data = await this.fetchUpdates(channel);
        if (data) {
          callback(data);
        }
      } catch (error) {
        logger.error('Subscription poll failed', error);
      }
    }, this.pollingInterval);
    
    this.subscriptions.set(channel, interval);
  }
  
  unsubscribe(channel) {
    const interval = this.subscriptions.get(channel);
    if (interval) {
      clearInterval(interval);
      this.subscriptions.delete(channel);
    }
  }
  
  async fetchUpdates(channel) {
    // Implement channel-specific update logic
    // This would poll NerdGraph or storage for changes
    return null;
  }
  
  destroy() {
    this.subscriptions.forEach(interval => clearInterval(interval));
    this.subscriptions.clear();
  }
}

/**
 * Error boundary for NR1 apps
 */
export class NR1ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error, errorInfo) {
    logger.error('Component error', { error, errorInfo });
    
    Toast.showToast({
      title: 'An error occurred',
      description: error.message,
      type: Toast.TYPE.CRITICAL
    });
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-state">
          <h3>Something went wrong</h3>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </button>
        </div>
      );
    }
    
    return this.props.children;
  }
}

/**
 * Utility to convert frontend routes to NR1 navigation
 */
export const NavigationAdapter = {
  navigate(path, params = {}) {
    // Convert frontend routes to nerdlet navigation
    const routeMap = {
      '/dashboards': { id: 'dashboards-nerdlet' },
      '/queries': { id: 'queries-nerdlet' },
      '/settings': { id: 'settings-nerdlet' },
      '/console': { id: 'console' }
    };
    
    const nerdlet = routeMap[path];
    if (nerdlet) {
      navigation.openNerdlet({
        ...nerdlet,
        urlState: params
      });
    }
  },
  
  getParams() {
    // Get URL state from nerdlet context
    const context = React.useContext(NerdletStateContext);
    return context.urlState || {};
  }
};

/**
 * Mock authentication for NR1 (uses platform auth)
 */
export const AuthAdapter = {
  async login() {
    // No-op - NR1 handles auth
    return { success: true };
  },
  
  async logout() {
    // No-op - NR1 handles auth
    return { success: true };
  },
  
  async getUser() {
    const context = React.useContext(PlatformStateContext);
    return {
      id: context.user?.id,
      email: context.user?.email,
      name: context.user?.name,
      accountId: context.accountId
    };
  },
  
  isAuthenticated() {
    // Always true in NR1 context
    return true;
  }
};

export default {
  NerdGraphAdapter,
  StorageAdapter,
  CacheAdapter,
  WebSocketAdapter,
  NR1ErrorBoundary,
  NavigationAdapter,
  AuthAdapter,
  withPlatformContext
};