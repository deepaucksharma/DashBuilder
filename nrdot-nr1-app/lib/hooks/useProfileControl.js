import { useState, useEffect, useCallback } from 'react';
import { OptimizationControlAPI } from '../api/control';

export function useProfileControl(accountId) {
  const [state, setState] = useState({
    currentProfile: null,
    isChanging: false,
    lastChange: null,
    history: []
  });
  
  const [undoStack, setUndoStack] = useState([]);
  
  useEffect(() => {
    if (!accountId) return;
    
    const fetchState = async () => {
      try {
        const currentState = await OptimizationControlAPI.getCurrentState(accountId);
        setState(prev => ({
          ...prev,
          currentProfile: currentState.value || 'balanced'
        }));
      } catch (error) {
        console.error('Failed to fetch optimization state:', error);
      }
    };
    
    fetchState();
    const interval = setInterval(fetchState, 15000); // Poll every 15s
    
    return () => clearInterval(interval);
  }, [accountId]);
  
  const changeProfile = useCallback(async (newProfile, metadata = {}) => {
    setState(prev => ({ ...prev, isChanging: true }));
    
    try {
      const result = await OptimizationControlAPI.setProfile(
        accountId, 
        newProfile,
        metadata
      );
      
      setState(prev => ({
        ...prev,
        currentProfile: newProfile,
        lastChange: {
          from: prev.currentProfile,
          to: newProfile,
          timestamp: result.timestamp
        },
        isChanging: false
      }));
      
      // Add to undo stack
      setUndoStack(prev => [...prev, {
        profile: state.currentProfile,
        timestamp: Date.now()
      }]);
      
      // Clear undo stack after 30 seconds
      setTimeout(() => {
        setUndoStack(prev => prev.filter(item => 
          Date.now() - item.timestamp < 30000
        ));
      }, 30000);
      
    } catch (error) {
      setState(prev => ({ ...prev, isChanging: false }));
      throw error;
    }
  }, [accountId, state.currentProfile]);
  
  const undoChange = useCallback(async () => {
    if (undoStack.length === 0) return;
    
    const previousState = undoStack[undoStack.length - 1];
    await changeProfile(previousState.profile, { reason: 'undo' });
    setUndoStack(prev => prev.slice(0, -1));
  }, [undoStack, changeProfile]);
  
  return {
    ...state,
    changeProfile,
    undoChange,
    canUndo: undoStack.length > 0
  };
}