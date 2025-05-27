import { useState, useEffect } from 'react';
import { NerdGraphQuery } from 'nr1';

export function useOptimizationState(accountId) {
  const [state, setState] = useState({
    optimizationState: null,
    rings: [],
    experiments: [],
    loading: true,
    error: null
  });
  
  useEffect(() => {
    if (!accountId) return;
    
    const fetchState = async () => {
      try {
        // Fetch optimization state from NerdStorage
        const query = `
          query GetOptimizationData($accountId: Int!) {
            actor {
              account(id: $accountId) {
                nerdStorage {
                  collection(collection: "nrdot-state") {
                    document(documentId: "global")
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
        
        if (error) throw error;
        
        const storedState = data?.actor?.account?.nerdStorage?.collection?.document || {};
        
        // Simulate ring distribution
        const rings = generateRings();
        
        // Simulate experiments
        const experiments = generateExperiments();
        
        setState({
          optimizationState: {
            initialized: !!storedState.initialized,
            profile: storedState.profile || 'balanced',
            ...storedState
          },
          rings,
          experiments,
          loading: false,
          error: null
        });
      } catch (err) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: err
        }));
      }
    };
    
    fetchState();
    const interval = setInterval(fetchState, 30000); // Refresh every 30s
    
    return () => clearInterval(interval);
  }, [accountId]);
  
  return state;
}

// Helper functions to generate mock data
function generateRings() {
  const profiles = ['conservative', 'balanced', 'aggressive', 'emergency'];
  const rings = [];
  
  for (let i = 0; i < 16; i++) {
    rings.push({
      id: i,
      profile: profiles[Math.floor(Math.random() * profiles.length)],
      hostCount: Math.floor(Math.random() * 50) + 10
    });
  }
  
  return rings;
}

function generateExperiments() {
  return [
    {
      id: 'exp-001',
      name: 'Aggressive Profile Test - Web Tier',
      status: 'active',
      progress: 65,
      daysRemaining: 5,
      startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      metrics: {
        costReduction: 82,
        coverageImpact: -3,
        anomaliesDetected: 2
      }
    },
    {
      id: 'exp-002',
      name: 'Emergency Mode - Database Hosts',
      status: 'active',
      progress: 30,
      daysRemaining: 12,
      startDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
      metrics: {
        costReduction: 94,
        coverageImpact: -8,
        anomaliesDetected: 5
      }
    }
  ];
}