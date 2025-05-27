# State Management Package

Production-ready state management system using BadgerDB for the DashBuilder project.

## Features

- **Persistent Storage**: Uses BadgerDB for high-performance key-value storage
- **Process State Management**: Store and retrieve process information including importance scores, EWMA values, and ring assignments
- **TTL Support**: Automatic expiration of old state entries
- **Checkpointing**: Periodic snapshots for disaster recovery
- **Thread-Safe**: All operations are safe for concurrent use
- **Recovery Mechanisms**: Automatic recovery from corrupted state
- **Performance Optimized**: Tuned BadgerDB settings for optimal performance

## Usage

```go
import "github.com/deepak/dashbuilder/pkg/state"

// Create state manager
cfg := state.Config{
    DBPath:           "/var/lib/dashbuilder/state",
    Logger:           logger,
    TTL:              24 * time.Hour,
    CheckpointTTL:    7 * 24 * time.Hour,
    EnableCheckpoint: true,
}

sm, err := state.NewStateManager(cfg)
if err != nil {
    log.Fatal(err)
}
defer sm.Close()

// Save process state
processState := &state.ProcessState{
    PID:             1234,
    Name:            "my-app",
    ImportanceScore: 0.85,
    EWMAValues: map[string]float64{
        "cpu":    45.5,
        "memory": 67.8,
    },
    RingAssignment: 1,
    Metadata: map[string]interface{}{
        "version": "1.2.3",
    },
}

err = sm.SaveProcessState(processState)

// Load process state
loaded, err := sm.LoadProcessState(1234)

// Load all process states
states, err := sm.LoadAllProcessStates()

// Create checkpoint
err = sm.Checkpoint()

// Get metrics
metrics := sm.GetMetrics()
```

## Configuration

| Field | Description | Default |
|-------|-------------|---------|
| DBPath | Path to BadgerDB directory | Required |
| Logger | Zap logger instance | No-op logger |
| TTL | Time-to-live for state entries | 24 hours |
| CheckpointTTL | Time-to-live for checkpoints | 7 days |
| EnableCheckpoint | Enable automatic checkpointing | false |

## Performance

The state manager is optimized for:
- High write throughput with async writes
- Efficient memory usage with value thresholds
- Automatic garbage collection
- Minimal storage overhead

## Testing

Run tests with:
```bash
go test -v ./...
```

Run benchmarks with:
```bash
go test -bench=. -benchmem
```

## Recovery

The state manager automatically recovers from:
- Corrupted database files
- Incomplete writes
- Process crashes

Recovery is performed by:
1. Validating database integrity on startup
2. Loading the most recent checkpoint if validation fails
3. Clearing corrupted entries if no checkpoint is available