# NRDOT v2 Complete System Flow

## High-Level Architecture

```mermaid
graph TB
    subgraph "Host System"
        P[Processes] --> HM[Host Metrics Receiver]
    end
    
    subgraph "OpenTelemetry Collector"
        HM --> ML[Memory Limiter]
        ML --> RD[Resource Detection<br/>OS/Cloud Metadata]
        RD --> CPU[CPU Rate Calculator<br/>Cumulative → Rate]
        CPU --> SC[Process Scoring<br/>Classification]
        SC --> EWMA[EWMA Processor<br/>Anomaly Detection]
        EWMA --> AP[Attribute Promotion<br/>For NRQL]
        AP --> FO[Filter Optimization<br/>Profile-Based]
        FO --> KPI[KPI Generation]
        KPI --> CC[Cost Calculation]
        CC --> B[Batch Processor]
        B --> EXP[OTLP Exporter]
    end
    
    subgraph "Control Loop"
        PM[Prometheus Metrics<br/>localhost:8888] --> CL[Control Loop Script]
        CL --> PD{Profile<br/>Decision}
        PD -->|Conservative| ENV1[Min: 0.2<br/>CPU: 5%]
        PD -->|Balanced| ENV2[Min: 0.5<br/>CPU: 10%]
        PD -->|Aggressive| ENV3[Min: 0.7<br/>CPU: 20%]
        ENV1 --> RL[Reload Collector]
        ENV2 --> RL
        ENV3 --> RL
    end
    
    subgraph "New Relic"
        EXP --> NR[New Relic<br/>OTLP Endpoint]
        NR --> PS[ProcessSample<br/>Events]
        NR --> M[Metrics]
        PS --> NR1[NR1 App<br/>Dashboard]
    end
    
    RL -.->|Updates Env Vars| FO
    PM -.->|Metrics Feedback| CL
```

## Detailed Process Flow

```mermaid
sequenceDiagram
    participant OS as Operating System
    participant OC as OTEL Collector
    participant CL as Control Loop
    participant NR as New Relic
    
    loop Every 60 seconds
        OS->>OC: Process Metrics
        
        Note over OC: 1. Memory Protection
        OC->>OC: Check memory limits
        
        Note over OC: 2. Enrichment
        OC->>OC: Add OS type, cloud metadata
        
        Note over OC: 3. Rate Calculation
        OC->>OC: CPU time → utilization %
        
        Note over OC: 4. Classification
        OC->>OC: Score processes (0.0-1.0)
        OC->>OC: Classify (critical/database/web/etc)
        
        Note over OC: 5. EWMA & Anomaly
        OC->>OC: Calculate moving average
        OC->>OC: Detect anomalies
        
        Note over OC: 6. Filtering
        OC->>OC: Apply profile thresholds
        OC->>OC: Filter by importance/CPU/memory
        
        Note over OC: 7. Export
        OC->>NR: Send filtered metrics
    end
    
    loop Every 30 seconds
        OC->>CL: Prometheus metrics
        CL->>CL: Evaluate thresholds
        
        alt Cost > 2x Budget
            CL->>CL: Switch to Aggressive
        else Coverage < 95%
            CL->>CL: Relax filtering
        else Series > Max
            CL->>CL: Increase filtering
        end
        
        CL->>OC: Update environment vars
        CL->>OC: Reload configuration
    end
```

## Data Transformations

```mermaid
graph LR
    subgraph "Raw Process Data"
        R1[process.cpu.time<br/>cumulative]
        R2[process.memory.physical_usage<br/>bytes]
        R3[process.executable.name<br/>string]
    end
    
    subgraph "Enriched Data"
        E1[os.type = linux]
        E2[host.name = server01]
        E3[process.owner = root]
    end
    
    subgraph "Calculated Metrics"
        C1[process.cpu.utilization<br/>percentage]
        C2[process.importance = 0.9]
        C3[process.classification = database]
        C4[nrdot.ewma_value = 15.2]
    end
    
    subgraph "KPI Metrics"
        K1[nrdot.process.count = 150]
        K2[nrdot.process.coverage = 0.98]
        K3[nrdot.estimated.cost.hourly = 0.08]
    end
    
    R1 --> C1
    R2 --> C2
    R3 --> C2
    R3 --> C3
    C1 --> C4
    C2 --> K1
    C3 --> K2
    K1 --> K3
```

## Profile-Based Filtering Logic

```mermaid
graph TD
    START[Process Metric] --> IMP{Importance<br/>Score}
    
    IMP -->|>= 0.9| KEEP1[Always Keep<br/>Critical]
    IMP -->|< threshold| DROP[Drop Metric]
    IMP -->|>= threshold| CPU{CPU Check}
    
    CPU -->|< threshold| MEM{Memory Check}
    CPU -->|>= threshold| KEEP2[Keep<br/>High CPU]
    
    MEM -->|< threshold| DROP
    MEM -->|>= threshold| KEEP3[Keep<br/>High Memory]
    
    KEEP1 --> EXPORT[Export to<br/>New Relic]
    KEEP2 --> EXPORT
    KEEP3 --> EXPORT
    
    style KEEP1 fill:#90EE90
    style KEEP2 fill:#90EE90
    style KEEP3 fill:#90EE90
    style DROP fill:#FFB6C1
```

## Control Loop State Machine

```mermaid
stateDiagram-v2
    [*] --> Conservative: Initial State
    
    Conservative --> Balanced: Series < Target*0.8
    Conservative --> Balanced: Cost > Budget
    
    Balanced --> Conservative: Coverage < 95%
    Balanced --> Aggressive: Series > Max
    Balanced --> Aggressive: Cost > Budget
    
    Aggressive --> Balanced: Coverage < 95%
    Aggressive --> Balanced: Series < Target*0.8
    
    note right of Conservative: Max visibility<br/>Min filtering
    note right of Balanced: Recommended<br/>Good balance
    note right of Aggressive: Max savings<br/>Min coverage
```

## Cost Model

```
Hourly Cost = Series Count × 60 × $0.25/million

Where:
- Series Count = Number of unique process metric streams
- 60 = Datapoints per hour (1 per minute)
- $0.25 = Cost per million datapoints

Example:
- 5,000 series × 60 × $0.25/1,000,000 = $0.075/hour
- Monthly: $0.075 × 24 × 30 = $54/month
```