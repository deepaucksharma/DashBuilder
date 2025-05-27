import { NerdGraphQuery, NerdGraphMutation } from 'nr1';

const CONTROL_COLLECTION = 'nrdot-control';
const CONTROL_DOCUMENT_ID = 'active';

export class OptimizationControlAPI {
  static async getCurrentState(accountId) {
    const query = `
      query GetOptimizationState($accountId: Int!) {
        actor {
          account(id: $accountId) {
            nerdStorage {
              collection(collection: "${CONTROL_COLLECTION}") {
                document(documentId: "${CONTROL_DOCUMENT_ID}")
              }
            }
          }
        }
      }
    `;
    
    const { data, error } = await NerdGraphQuery.query({
      query,
      variables: { accountId }
    });
    
    if (error) {
      throw new Error(`Failed to fetch optimization state: ${error.message}`);
    }
    
    return data?.actor?.account?.nerdStorage?.collection?.document || {};
  }
  
  static async setProfile(accountId, profile, metadata = {}) {
    const mutation = `
      mutation SetOptimizationProfile($accountId: Int!, $collection: String!, $documentId: String!, $document: String!) {
        nerdStorageWriteDocument(
          accountId: $accountId,
          collection: $collection,
          documentId: $documentId,
          document: $document
        ) {
          collection
          documentId
          document
        }
      }
    `;
    
    const document = {
      action: 'setProfile',
      value: profile,
      timestamp: Date.now(),
      metadata: {
        ...metadata,
        source: 'nr1-app',
        user: metadata.user || 'unknown'
      }
    };
    
    const { data, error } = await NerdGraphMutation.mutate({
      mutation,
      variables: { 
        accountId,
        collection: CONTROL_COLLECTION,
        documentId: CONTROL_DOCUMENT_ID,
        document: JSON.stringify(document)
      }
    });
    
    if (error || !data?.nerdStorageWriteDocument) {
      throw new Error('Failed to update profile');
    }
    
    return document;
  }
  
  static async applyToHosts(accountId, hostFilters, profile) {
    // For bulk operations, we need to chunk the requests
    const chunks = this.chunkHosts(hostFilters, 100);
    const results = [];
    
    for (const [index, chunk] of chunks.entries()) {
      const mutation = `
        mutation BulkSetProfile($accountId: Int!, $collection: String!, $documentId: String!, $document: String!) {
          nerdStorageWriteDocument(
            accountId: $accountId,
            collection: $collection,
            documentId: $documentId,
            document: $document
          ) {
            collection
            documentId
            document
          }
        }
      `;
      
      const bulkDocId = `bulk-${Date.now()}-${index}`;
      const document = {
        action: 'bulkSetProfile',
        targets: chunk,
        profile: profile,
        timestamp: Date.now()
      };
      
      const { data, error } = await NerdGraphMutation.mutate({
        mutation,
        variables: {
          accountId,
          collection: CONTROL_COLLECTION,
          documentId: bulkDocId,
          document: JSON.stringify(document)
        }
      });
      
      results.push({
        chunk,
        success: !!data?.nerdStorageWriteDocument,
        error
      });
    }
    
    return results;
  }
  
  static chunkHosts(hosts, size) {
    const chunks = [];
    for (let i = 0; i < hosts.length; i += size) {
      chunks.push(hosts.slice(i, i + size));
    }
    return chunks;
  }
  
  static async getProfileHistory(accountId, limit = 50) {
    const query = `
      query GetProfileHistory($accountId: Int!) {
        actor {
          account(id: $accountId) {
            nrql(query: "
              SELECT 
                latest(action) as action,
                latest(value) as profile,
                latest(timestamp) as timestamp,
                latest(metadata.user) as user
              FROM Log
              WHERE message LIKE 'NRDOT Profile Change%'
              SINCE 7 days ago
              LIMIT ${limit}
            ") {
              results
            }
          }
        }
      }
    `;
    
    const { data } = await NerdGraphQuery.query({
      query,
      variables: { accountId }
    });
    
    return data?.actor?.account?.nrql?.results || [];
  }
}