#!/usr/bin/env python3
import pandas as pd
import matplotlib.pyplot as plt
import sys
import os

# Read the latest results file
results_dir = 'experiment-results'
csv_files = [f for f in os.listdir(results_dir) if f.endswith('.csv')]
latest_file = os.path.join(results_dir, sorted(csv_files)[-1])

print(f"Analyzing: {latest_file}")

# Load data
df = pd.read_csv(latest_file)
df['timestamp'] = pd.to_datetime(df['timestamp'], unit='s')

# Create visualizations
fig, axes = plt.subplots(2, 2, figsize=(15, 10))
fig.suptitle('NRDOT v2 Experiment Results', fontsize=16)

# 1. Coverage over time by profile
ax1 = axes[0, 0]
for profile in df['profile'].unique():
    profile_data = df[df['profile'] == profile]
    ax1.plot(profile_data['timestamp'], profile_data['coverage'], label=profile, marker='.')
ax1.set_title('Coverage % by Profile')
ax1.set_xlabel('Time')
ax1.set_ylabel('Coverage %')
ax1.legend()
ax1.grid(True, alpha=0.3)

# 2. Cost reduction by profile
ax2 = axes[0, 1]
profile_means = df.groupby('profile')['cost_reduction'].mean()
ax2.bar(profile_means.index, profile_means.values, color=['blue', 'green', 'red'])
ax2.set_title('Average Cost Reduction by Profile')
ax2.set_xlabel('Profile')
ax2.set_ylabel('Cost Reduction %')
ax2.grid(True, alpha=0.3, axis='y')

# 3. CPU vs Coverage scatter
ax3 = axes[1, 0]
for profile in df['profile'].unique():
    profile_data = df[df['profile'] == profile]
    ax3.scatter(profile_data['cpu_usage'], profile_data['coverage'], 
                label=profile, alpha=0.6, s=50)
ax3.set_title('CPU Usage vs Coverage')
ax3.set_xlabel('CPU Usage %')
ax3.set_ylabel('Coverage %')
ax3.legend()
ax3.grid(True, alpha=0.3)

# 4. Data points vs Response time
ax4 = axes[1, 1]
for profile in df['profile'].unique():
    profile_data = df[df['profile'] == profile]
    ax4.scatter(profile_data['data_points'], profile_data['response_time'], 
                label=profile, alpha=0.6, s=50)
ax4.set_title('Data Points vs Response Time')
ax4.set_xlabel('Data Points')
ax4.set_ylabel('Response Time (ms)')
ax4.legend()
ax4.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig(os.path.join(results_dir, 'experiment-results.png'), dpi=150)
print(f"Visualization saved to: {os.path.join(results_dir, 'experiment-results.png')}")

# Print summary statistics
print("\n=== Summary Statistics ===")
summary = df.groupby('profile').agg({
    'coverage': ['mean', 'std'],
    'cost_reduction': ['mean', 'std'],
    'data_points': 'mean',
    'response_time': ['mean', 'std']
}).round(2)
print(summary)
