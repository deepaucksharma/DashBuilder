const { RateLimiter } = require('../utils/rate-limiter.js');
const { logger } = require('../utils/logger.js');
const { NRGuardianError, APIError, ValidationError } = require('../utils/errors.js');

class NerdGraphClient {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.region = config.region || 'US';
    this.endpoint = this.region === 'EU' 
      ? 'https://api.eu.newrelic.com/graphql'
      : 'https://api.newrelic.com/graphql';
    
    this.rateLimiter = new RateLimiter({
      maxRequests: config.rateLimitMax || 25,
      interval: 60000 // 1 minute
    });

    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    };
  }

  async query(gqlQuery, variables = {}) {
    await this.rateLimiter.checkLimit();

    const body = JSON.stringify({
      query: gqlQuery,
      variables
    });

    let lastError;
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'API-Key': this.apiKey
          },
          body
        });

        if (!response.ok) {
          throw new APIError(`API request failed: ${response.status} ${response.statusText}`, response.status);
        }

        const data = await response.json();

        if (data.errors) {
          const errorMessage = data.errors.map(e => e.message).join(', ');
          throw new APIError(`GraphQL errors: ${errorMessage}`, 200, data.errors);
        }

        return data.data;
      } catch (error) {
        lastError = error;
        
        if (error instanceof APIError && error.statusCode === 429) {
          // Rate limited - wait longer
          const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(2, attempt + 2),
            this.retryConfig.maxDelay
          );
          logger.warn(`Rate limited, waiting ${delay}ms before retry ${attempt + 1}`);
          await this.sleep(delay);
        } else if (attempt < this.retryConfig.maxRetries) {
          // Other errors - exponential backoff
          const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(2, attempt),
            this.retryConfig.maxDelay
          );
          logger.debug(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1})`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  async nrql(accountId, nrqlQuery) {
    const gql = `
      query($accountId: Int!, $nrqlQuery: Nrql!) {
        actor {
          account(id: $accountId) {
            nrql(query: $nrqlQuery) {
              results
              metadata {
                eventTypes
                facets
                messages
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

    const result = await this.query(gql, { accountId: parseInt(accountId), nrqlQuery });
    return result.actor.account.nrql;
  }

  async getEventTypes(accountId, since = '1 day ago') {
    const nrqlQuery = `SHOW EVENT TYPES SINCE ${since}`;
    const result = await this.nrql(accountId, nrqlQuery);
    return result.results.map(r => r.eventType);
  }

  async getEventAttributes(accountId, eventType, since = '1 day ago') {
    const nrqlQuery = `SELECT keyset() FROM ${eventType} SINCE ${since} LIMIT 1`;
    try {
      const result = await this.nrql(accountId, nrqlQuery);
      if (result.results.length > 0) {
        return Object.keys(result.results[0]);
      }
      return [];
    } catch (error) {
      logger.debug(`Failed to get attributes for ${eventType}: ${error.message}`);
      return [];
    }
  }

  async getDashboards(accountId, limit = 100) {
    // Use string interpolation for the query since variables in entitySearch are problematic
    const gql = `
      query {
        actor {
          entitySearch(query: "accountId = ${parseInt(accountId)} AND type = 'DASHBOARD'") {
            results {
              entities {
                guid
                name
                ... on DashboardEntityOutline {
                  accountId
                  createdAt
                  updatedAt
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.query(gql, {});
    const entities = result.actor.entitySearch.results.entities || [];
    
    // Return only the requested number of dashboards
    return entities.slice(0, limit);
  }

  async getDashboard(guid) {
    const gql = `
      query($guid: EntityGuid!) {
        actor {
          entity(guid: $guid) {
            guid
            name
            ... on DashboardEntity {
              createdAt
              updatedAt
              permissions
              pages {
                name
                widgets {
                  title
                  layout {
                    row
                    column
                    width
                    height
                  }
                  rawConfiguration
                  visualization {
                    id
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.query(gql, { guid });
    return result.actor.entity;
  }

  async createDashboard(accountId, dashboard) {
    const gql = `
      mutation($accountId: Int!, $dashboard: DashboardInput!) {
        dashboardCreate(accountId: $accountId, dashboard: $dashboard) {
          entityResult {
            guid
            name
          }
          errors {
            description
            type
          }
        }
      }
    `;

    const result = await this.query(gql, { 
      accountId: parseInt(accountId), 
      dashboard 
    });

    if (result.dashboardCreate.errors?.length > 0) {
      throw new APIError(
        `Dashboard creation failed: ${result.dashboardCreate.errors.map(e => e.description).join(', ')}`,
        400,
        result.dashboardCreate.errors
      );
    }

    return result.dashboardCreate.entityResult;
  }

  async updateDashboard(guid, dashboard) {
    const gql = `
      mutation($guid: EntityGuid!, $dashboard: DashboardInput!) {
        dashboardUpdate(guid: $guid, dashboard: $dashboard) {
          entityResult {
            guid
            name
          }
          errors {
            description
            type
          }
        }
      }
    `;

    const result = await this.query(gql, { guid, dashboard });

    if (result.dashboardUpdate.errors?.length > 0) {
      throw new APIError(
        `Dashboard update failed: ${result.dashboardUpdate.errors.map(e => e.description).join(', ')}`,
        400,
        result.dashboardUpdate.errors
      );
    }

    return result.dashboardUpdate.entityResult;
  }

  async deleteDashboard(guid) {
    const gql = `
      mutation($guid: EntityGuid!) {
        dashboardDelete(guid: $guid) {
          status
          errors {
            description
            type
          }
        }
      }
    `;

    const result = await this.query(gql, { guid });

    if (result.dashboardDelete.errors?.length > 0) {
      throw new APIError(
        `Dashboard deletion failed: ${result.dashboardDelete.errors.map(e => e.description).join(', ')}`,
        400,
        result.dashboardDelete.errors
      );
    }

    return result.dashboardDelete.status === 'SUCCESS';
  }

  async getAlertPolicies(accountId) {
    const gql = `
      query($accountId: Int!) {
        actor {
          account(id: $accountId) {
            alerts {
              policiesSearch {
                policies {
                  id
                  name
                  incidentPreference
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.query(gql, { accountId: parseInt(accountId) });
    return result.actor.account.alerts.policiesSearch.policies;
  }

  async getAlertConditions(accountId, policyId) {
    const gql = `
      query($accountId: Int!, $policyId: ID!) {
        actor {
          account(id: $accountId) {
            alerts {
              nrqlConditionsSearch(searchCriteria: {policyId: $policyId}) {
                nrqlConditions {
                  id
                  name
                  enabled
                  nrql {
                    query
                  }
                  terms {
                    threshold
                    thresholdDuration
                    thresholdOccurrences
                    operator
                    priority
                  }
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.query(gql, { 
      accountId: parseInt(accountId), 
      policyId: policyId.toString() 
    });
    return result.actor.account.alerts.nrqlConditionsSearch.nrqlConditions;
  }

  async getEntity(guid) {
    const gql = `
      query($guid: EntityGuid!) {
        actor {
          entity(guid: $guid) {
            guid
            name
            type
            domain
            tags {
              key
              values
            }
            relationships {
              source {
                entity {
                  guid
                  name
                }
              }
              target {
                entity {
                  guid
                  name
                }
              }
              type
            }
          }
        }
      }
    `;

    const result = await this.query(gql, { guid });
    return result.actor.entity;
  }

  async searchEntities(query, limit = 100) {
    const gql = `
      query($query: String!, $limit: Int!) {
        actor {
          entitySearch(query: $query) {
            results(limit: $limit) {
              entities {
                guid
                name
                type
                domain
                tags {
                  key
                  values
                }
              }
            }
          }
        }
      }
    `;

    const result = await this.query(gql, { query, limit });
    return result.actor.entitySearch.results.entities;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { NerdGraphClient };
