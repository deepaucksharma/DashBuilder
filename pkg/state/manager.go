package state

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/dgraph-io/badger/v3"
	"go.uber.org/zap"
)

const (
	// Key prefixes for different state types
	prefixProcess     = "process:"
	prefixCheckpoint  = "checkpoint:"
	prefixMetadata    = "meta:"
	
	// Default TTL values
	defaultStateTTL      = 24 * time.Hour
	defaultCheckpointTTL = 7 * 24 * time.Hour
	
	// Checkpoint intervals
	checkpointInterval = 5 * time.Minute
	
	// Version for state format compatibility
	stateVersion = "v1"
)

// ProcessState represents the state of a single process
type ProcessState struct {
	PID              int                    `json:"pid"`
	Name             string                 `json:"name"`
	ImportanceScore  float64                `json:"importance_score"`
	EWMAValues       map[string]float64     `json:"ewma_values"`
	RingAssignment   int                    `json:"ring_assignment"`
	LastUpdated      time.Time              `json:"last_updated"`
	Metadata         map[string]interface{} `json:"metadata,omitempty"`
}

// StateManager handles persistent state storage using BadgerDB
type StateManager struct {
	db               *badger.DB
	logger           *zap.Logger
	mu               sync.RWMutex
	checkpointTicker *time.Ticker
	stopCh           chan struct{}
	ttl              time.Duration
	checkpointTTL    time.Duration
	
	// Metrics for monitoring
	saveCount        uint64
	loadCount        uint64
	errorCount       uint64
	lastCheckpoint   time.Time
}

// Config for StateManager initialization
type Config struct {
	DBPath          string
	Logger          *zap.Logger
	TTL             time.Duration
	CheckpointTTL   time.Duration
	EnableCheckpoint bool
}

// NewStateManager creates a new state manager instance
func NewStateManager(cfg Config) (*StateManager, error) {
	if cfg.Logger == nil {
		cfg.Logger = zap.NewNop()
	}
	
	if cfg.TTL == 0 {
		cfg.TTL = defaultStateTTL
	}
	
	if cfg.CheckpointTTL == 0 {
		cfg.CheckpointTTL = defaultCheckpointTTL
	}
	
	// Open BadgerDB with optimized settings
	opts := badger.DefaultOptions(cfg.DBPath)
	opts.Logger = nil // Use our own logger
	opts.SyncWrites = false // Improve write performance
	opts.ValueLogFileSize = 100 << 20 // 100MB value log files
	opts.ValueThreshold = 1 << 10 // 1KB value threshold
	opts.NumVersionsToKeep = 1 // We don't need version history
	opts.CompactL0OnClose = true
	opts.NumLevelZeroTables = 5
	opts.NumLevelZeroTablesStall = 10
	
	db, err := badger.Open(opts)
	if err != nil {
		return nil, fmt.Errorf("failed to open BadgerDB: %w", err)
	}
	
	sm := &StateManager{
		db:            db,
		logger:        cfg.Logger,
		ttl:           cfg.TTL,
		checkpointTTL: cfg.CheckpointTTL,
		stopCh:        make(chan struct{}),
	}
	
	// Validate database integrity
	if err := sm.validateDB(); err != nil {
		cfg.Logger.Warn("Database validation failed, attempting recovery", zap.Error(err))
		if err := sm.recoverDB(); err != nil {
			db.Close()
			return nil, fmt.Errorf("failed to recover database: %w", err)
		}
	}
	
	// Start background tasks
	if cfg.EnableCheckpoint {
		sm.startCheckpointing()
	}
	
	// Start garbage collection
	sm.startGC()
	
	return sm, nil
}

// SaveProcessState saves a process state with TTL
func (sm *StateManager) SaveProcessState(state *ProcessState) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	state.LastUpdated = time.Now()
	
	data, err := json.Marshal(state)
	if err != nil {
		sm.errorCount++
		return fmt.Errorf("failed to marshal process state: %w", err)
	}
	
	key := fmt.Sprintf("%s%d", prefixProcess, state.PID)
	
	err = sm.db.Update(func(txn *badger.Txn) error {
		e := badger.NewEntry([]byte(key), data).WithTTL(sm.ttl)
		return txn.SetEntry(e)
	})
	
	if err != nil {
		sm.errorCount++
		return fmt.Errorf("failed to save process state: %w", err)
	}
	
	sm.saveCount++
	return nil
}

// LoadProcessState loads a process state by PID
func (sm *StateManager) LoadProcessState(pid int) (*ProcessState, error) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	
	var state ProcessState
	key := fmt.Sprintf("%s%d", prefixProcess, pid)
	
	err := sm.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(key))
		if err != nil {
			return err
		}
		
		return item.Value(func(val []byte) error {
			return json.Unmarshal(val, &state)
		})
	})
	
	if err == badger.ErrKeyNotFound {
		return nil, nil
	}
	
	if err != nil {
		sm.errorCount++
		return nil, fmt.Errorf("failed to load process state: %w", err)
	}
	
	sm.loadCount++
	return &state, nil
}

// LoadAllProcessStates loads all process states
func (sm *StateManager) LoadAllProcessStates() ([]*ProcessState, error) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	
	var states []*ProcessState
	
	err := sm.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = []byte(prefixProcess)
		
		it := txn.NewIterator(opts)
		defer it.Close()
		
		for it.Rewind(); it.Valid(); it.Next() {
			item := it.Item()
			
			err := item.Value(func(val []byte) error {
				var state ProcessState
				if err := json.Unmarshal(val, &state); err != nil {
					sm.logger.Warn("Failed to unmarshal process state",
						zap.String("key", string(item.Key())),
						zap.Error(err))
					return nil // Continue iteration
				}
				states = append(states, &state)
				return nil
			})
			
			if err != nil {
				return err
			}
		}
		
		return nil
	})
	
	if err != nil {
		sm.errorCount++
		return nil, fmt.Errorf("failed to load all process states: %w", err)
	}
	
	sm.loadCount += uint64(len(states))
	return states, nil
}

// DeleteProcessState deletes a process state
func (sm *StateManager) DeleteProcessState(pid int) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	key := fmt.Sprintf("%s%d", prefixProcess, pid)
	
	return sm.db.Update(func(txn *badger.Txn) error {
		return txn.Delete([]byte(key))
	})
}

// Checkpoint creates a checkpoint of current state
func (sm *StateManager) Checkpoint() error {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	timestamp := time.Now()
	states, err := sm.loadAllStatesInternal()
	if err != nil {
		return fmt.Errorf("failed to load states for checkpoint: %w", err)
	}
	
	checkpoint := map[string]interface{}{
		"version":    stateVersion,
		"timestamp":  timestamp,
		"states":     states,
		"save_count": sm.saveCount,
		"load_count": sm.loadCount,
		"error_count": sm.errorCount,
	}
	
	data, err := json.Marshal(checkpoint)
	if err != nil {
		return fmt.Errorf("failed to marshal checkpoint: %w", err)
	}
	
	key := fmt.Sprintf("%s%d", prefixCheckpoint, timestamp.Unix())
	
	err = sm.db.Update(func(txn *badger.Txn) error {
		e := badger.NewEntry([]byte(key), data).WithTTL(sm.checkpointTTL)
		return txn.SetEntry(e)
	})
	
	if err != nil {
		return fmt.Errorf("failed to save checkpoint: %w", err)
	}
	
	sm.lastCheckpoint = timestamp
	sm.logger.Info("Checkpoint created",
		zap.Time("timestamp", timestamp),
		zap.Int("state_count", len(states)))
	
	return nil
}

// RestoreFromCheckpoint restores state from a checkpoint
func (sm *StateManager) RestoreFromCheckpoint(timestamp time.Time) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	
	key := fmt.Sprintf("%s%d", prefixCheckpoint, timestamp.Unix())
	
	var checkpoint map[string]interface{}
	
	err := sm.db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(key))
		if err != nil {
			return err
		}
		
		return item.Value(func(val []byte) error {
			return json.Unmarshal(val, &checkpoint)
		})
	})
	
	if err != nil {
		return fmt.Errorf("failed to load checkpoint: %w", err)
	}
	
	// Validate checkpoint version
	if version, ok := checkpoint["version"].(string); !ok || version != stateVersion {
		return fmt.Errorf("incompatible checkpoint version: %v", checkpoint["version"])
	}
	
	// Clear existing states
	if err := sm.clearAllStates(); err != nil {
		return fmt.Errorf("failed to clear existing states: %w", err)
	}
	
	// Restore states
	states, ok := checkpoint["states"].([]interface{})
	if !ok {
		return fmt.Errorf("invalid checkpoint format: missing states")
	}
	
	for _, s := range states {
		stateData, err := json.Marshal(s)
		if err != nil {
			continue
		}
		
		var state ProcessState
		if err := json.Unmarshal(stateData, &state); err != nil {
			continue
		}
		
		if err := sm.saveProcessStateInternal(&state); err != nil {
			sm.logger.Warn("Failed to restore process state",
				zap.Int("pid", state.PID),
				zap.Error(err))
		}
	}
	
	sm.logger.Info("Restored from checkpoint",
		zap.Time("checkpoint_time", timestamp),
		zap.Int("state_count", len(states)))
	
	return nil
}

// GetMetrics returns current metrics
func (sm *StateManager) GetMetrics() map[string]interface{} {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	
	return map[string]interface{}{
		"save_count":      sm.saveCount,
		"load_count":      sm.loadCount,
		"error_count":     sm.errorCount,
		"last_checkpoint": sm.lastCheckpoint,
		"db_size":         sm.getDBSize(),
	}
}

// Close gracefully shuts down the state manager
func (sm *StateManager) Close() error {
	close(sm.stopCh)
	
	if sm.checkpointTicker != nil {
		sm.checkpointTicker.Stop()
	}
	
	// Final checkpoint
	if err := sm.Checkpoint(); err != nil {
		sm.logger.Warn("Failed to create final checkpoint", zap.Error(err))
	}
	
	return sm.db.Close()
}

// Internal helper methods

func (sm *StateManager) validateDB() error {
	// Check if we can read metadata
	err := sm.db.View(func(txn *badger.Txn) error {
		_, err := txn.Get([]byte(prefixMetadata + "version"))
		if err == badger.ErrKeyNotFound {
			// First time setup
			return sm.db.Update(func(txn *badger.Txn) error {
				return txn.Set([]byte(prefixMetadata+"version"), []byte(stateVersion))
			})
		}
		return err
	})
	
	return err
}

func (sm *StateManager) recoverDB() error {
	// Try to load the most recent checkpoint
	var latestCheckpoint time.Time
	
	err := sm.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = []byte(prefixCheckpoint)
		opts.Reverse = true
		
		it := txn.NewIterator(opts)
		defer it.Close()
		
		if it.Rewind(); it.Valid() {
			item := it.Item()
			key := string(item.Key())
			// Extract timestamp from key
			var timestamp int64
			if _, err := fmt.Sscanf(key, prefixCheckpoint+"%d", &timestamp); err == nil {
				latestCheckpoint = time.Unix(timestamp, 0)
			}
		}
		
		return nil
	})
	
	if err != nil {
		return err
	}
	
	if !latestCheckpoint.IsZero() {
		return sm.RestoreFromCheckpoint(latestCheckpoint)
	}
	
	// No checkpoint available, clear everything
	return sm.clearAllStates()
}

func (sm *StateManager) clearAllStates() error {
	return sm.db.Update(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = []byte(prefixProcess)
		
		it := txn.NewIterator(opts)
		defer it.Close()
		
		var keysToDelete [][]byte
		for it.Rewind(); it.Valid(); it.Next() {
			keysToDelete = append(keysToDelete, it.Item().KeyCopy(nil))
		}
		
		for _, key := range keysToDelete {
			if err := txn.Delete(key); err != nil {
				return err
			}
		}
		
		return nil
	})
}

func (sm *StateManager) loadAllStatesInternal() ([]*ProcessState, error) {
	var states []*ProcessState
	
	err := sm.db.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = []byte(prefixProcess)
		
		it := txn.NewIterator(opts)
		defer it.Close()
		
		for it.Rewind(); it.Valid(); it.Next() {
			item := it.Item()
			
			err := item.Value(func(val []byte) error {
				var state ProcessState
				if err := json.Unmarshal(val, &state); err != nil {
					return nil // Skip corrupted entries
				}
				states = append(states, &state)
				return nil
			})
			
			if err != nil {
				return err
			}
		}
		
		return nil
	})
	
	return states, err
}

func (sm *StateManager) saveProcessStateInternal(state *ProcessState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	
	key := fmt.Sprintf("%s%d", prefixProcess, state.PID)
	
	return sm.db.Update(func(txn *badger.Txn) error {
		e := badger.NewEntry([]byte(key), data).WithTTL(sm.ttl)
		return txn.SetEntry(e)
	})
}

func (sm *StateManager) startCheckpointing() {
	sm.checkpointTicker = time.NewTicker(checkpointInterval)
	
	go func() {
		for {
			select {
			case <-sm.checkpointTicker.C:
				if err := sm.Checkpoint(); err != nil {
					sm.logger.Error("Checkpoint failed", zap.Error(err))
				}
			case <-sm.stopCh:
				return
			}
		}
	}()
}

func (sm *StateManager) startGC() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		
		for {
			select {
			case <-ticker.C:
				err := sm.db.RunValueLogGC(0.5)
				if err != nil && err != badger.ErrNoRewrite {
					sm.logger.Debug("Value log GC error", zap.Error(err))
				}
			case <-sm.stopCh:
				return
			}
		}
	}()
}

func (sm *StateManager) getDBSize() int64 {
	lsm, vlog := sm.db.Size()
	return lsm + vlog
}