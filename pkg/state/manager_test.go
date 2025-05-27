package state

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
)

func TestStateManager(t *testing.T) {
	// Create temporary directory for test database
	tmpDir, err := os.MkdirTemp("", "statemanager_test")
	require.NoError(t, err)
	defer os.RemoveAll(tmpDir)

	logger, _ := zap.NewDevelopment()
	
	cfg := Config{
		DBPath:           filepath.Join(tmpDir, "test.db"),
		Logger:           logger,
		TTL:              time.Hour,
		CheckpointTTL:    24 * time.Hour,
		EnableCheckpoint: true,
	}
	
	sm, err := NewStateManager(cfg)
	require.NoError(t, err)
	defer sm.Close()
	
	t.Run("SaveAndLoadProcessState", func(t *testing.T) {
		state := &ProcessState{
			PID:             1234,
			Name:            "test-process",
			ImportanceScore: 0.85,
			EWMAValues: map[string]float64{
				"cpu":    45.5,
				"memory": 67.8,
			},
			RingAssignment: 1,
			Metadata: map[string]interface{}{
				"owner": "test-user",
			},
		}
		
		// Save state
		err := sm.SaveProcessState(state)
		require.NoError(t, err)
		
		// Load state
		loaded, err := sm.LoadProcessState(1234)
		require.NoError(t, err)
		require.NotNil(t, loaded)
		
		assert.Equal(t, state.PID, loaded.PID)
		assert.Equal(t, state.Name, loaded.Name)
		assert.Equal(t, state.ImportanceScore, loaded.ImportanceScore)
		assert.Equal(t, state.EWMAValues, loaded.EWMAValues)
		assert.Equal(t, state.RingAssignment, loaded.RingAssignment)
		assert.NotZero(t, loaded.LastUpdated)
	})
	
	t.Run("LoadNonExistentProcess", func(t *testing.T) {
		loaded, err := sm.LoadProcessState(99999)
		require.NoError(t, err)
		assert.Nil(t, loaded)
	})
	
	t.Run("LoadAllProcessStates", func(t *testing.T) {
		// Save multiple states
		for i := 0; i < 5; i++ {
			state := &ProcessState{
				PID:             2000 + i,
				Name:            "test-process",
				ImportanceScore: float64(i) * 0.2,
				RingAssignment:  i % 3,
			}
			err := sm.SaveProcessState(state)
			require.NoError(t, err)
		}
		
		// Load all states
		states, err := sm.LoadAllProcessStates()
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(states), 5)
	})
	
	t.Run("DeleteProcessState", func(t *testing.T) {
		// Save a state
		state := &ProcessState{
			PID:  3000,
			Name: "to-delete",
		}
		err := sm.SaveProcessState(state)
		require.NoError(t, err)
		
		// Verify it exists
		loaded, err := sm.LoadProcessState(3000)
		require.NoError(t, err)
		require.NotNil(t, loaded)
		
		// Delete it
		err = sm.DeleteProcessState(3000)
		require.NoError(t, err)
		
		// Verify it's gone
		loaded, err = sm.LoadProcessState(3000)
		require.NoError(t, err)
		assert.Nil(t, loaded)
	})
	
	t.Run("Checkpoint", func(t *testing.T) {
		// Create checkpoint
		err := sm.Checkpoint()
		require.NoError(t, err)
		
		// Verify metrics
		metrics := sm.GetMetrics()
		assert.NotZero(t, metrics["last_checkpoint"])
	})
	
	t.Run("ThreadSafety", func(t *testing.T) {
		done := make(chan bool)
		
		// Writer goroutine
		go func() {
			for i := 0; i < 100; i++ {
				state := &ProcessState{
					PID:             4000 + i,
					Name:            "concurrent-test",
					ImportanceScore: 0.5,
				}
				sm.SaveProcessState(state)
			}
			done <- true
		}()
		
		// Reader goroutine
		go func() {
			for i := 0; i < 100; i++ {
				sm.LoadProcessState(4000 + i)
				sm.LoadAllProcessStates()
			}
			done <- true
		}()
		
		// Wait for both to complete
		<-done
		<-done
	})
}

func TestCheckpointRestore(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "checkpoint_test")
	require.NoError(t, err)
	defer os.RemoveAll(tmpDir)
	
	logger, _ := zap.NewDevelopment()
	
	cfg := Config{
		DBPath: filepath.Join(tmpDir, "test.db"),
		Logger: logger,
	}
	
	sm, err := NewStateManager(cfg)
	require.NoError(t, err)
	
	// Save some states
	states := []*ProcessState{
		{PID: 1001, Name: "proc1", ImportanceScore: 0.9},
		{PID: 1002, Name: "proc2", ImportanceScore: 0.8},
		{PID: 1003, Name: "proc3", ImportanceScore: 0.7},
	}
	
	for _, state := range states {
		err := sm.SaveProcessState(state)
		require.NoError(t, err)
	}
	
	// Create checkpoint
	err = sm.Checkpoint()
	require.NoError(t, err)
	checkpointTime := sm.lastCheckpoint
	
	// Modify states
	err = sm.SaveProcessState(&ProcessState{PID: 1001, Name: "modified", ImportanceScore: 0.1})
	require.NoError(t, err)
	
	// Restore from checkpoint
	err = sm.RestoreFromCheckpoint(checkpointTime)
	require.NoError(t, err)
	
	// Verify original state is restored
	loaded, err := sm.LoadProcessState(1001)
	require.NoError(t, err)
	assert.Equal(t, "proc1", loaded.Name)
	assert.Equal(t, 0.9, loaded.ImportanceScore)
	
	sm.Close()
}

func TestRecovery(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "recovery_test")
	require.NoError(t, err)
	defer os.RemoveAll(tmpDir)
	
	logger, _ := zap.NewDevelopment()
	dbPath := filepath.Join(tmpDir, "test.db")
	
	// Create initial state manager
	cfg := Config{
		DBPath:           dbPath,
		Logger:           logger,
		EnableCheckpoint: true,
	}
	
	sm1, err := NewStateManager(cfg)
	require.NoError(t, err)
	
	// Save states and create checkpoint
	for i := 0; i < 3; i++ {
		state := &ProcessState{
			PID:             5000 + i,
			Name:            "recovery-test",
			ImportanceScore: 0.5,
		}
		err := sm1.SaveProcessState(state)
		require.NoError(t, err)
	}
	
	err = sm1.Checkpoint()
	require.NoError(t, err)
	
	// Close first manager
	sm1.Close()
	
	// Create new manager with same DB path (simulating restart)
	sm2, err := NewStateManager(cfg)
	require.NoError(t, err)
	defer sm2.Close()
	
	// Verify states are preserved
	states, err := sm2.LoadAllProcessStates()
	require.NoError(t, err)
	assert.Len(t, states, 3)
}

func BenchmarkSaveProcessState(b *testing.B) {
	tmpDir, _ := os.MkdirTemp("", "bench")
	defer os.RemoveAll(tmpDir)
	
	cfg := Config{
		DBPath: filepath.Join(tmpDir, "bench.db"),
		Logger: zap.NewNop(),
	}
	
	sm, _ := NewStateManager(cfg)
	defer sm.Close()
	
	state := &ProcessState{
		PID:             1000,
		Name:            "benchmark",
		ImportanceScore: 0.5,
		EWMAValues: map[string]float64{
			"cpu":    50.0,
			"memory": 60.0,
		},
	}
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		state.PID = 1000 + i
		sm.SaveProcessState(state)
	}
}

func BenchmarkLoadProcessState(b *testing.B) {
	tmpDir, _ := os.MkdirTemp("", "bench")
	defer os.RemoveAll(tmpDir)
	
	cfg := Config{
		DBPath: filepath.Join(tmpDir, "bench.db"),
		Logger: zap.NewNop(),
	}
	
	sm, _ := NewStateManager(cfg)
	defer sm.Close()
	
	// Pre-populate
	for i := 0; i < 1000; i++ {
		state := &ProcessState{
			PID:  i,
			Name: "benchmark",
		}
		sm.SaveProcessState(state)
	}
	
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		sm.LoadProcessState(i % 1000)
	}
}