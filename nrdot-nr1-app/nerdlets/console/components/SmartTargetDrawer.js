import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Button,
  Stack,
  StackItem,
  TextField,
  Select,
  SelectItem,
  RadioGroup,
  Radio,
  Checkbox,
  HeadingText,
  NrqlQuery,
  Spinner,
  EmptyState,
  Icon
} from 'nr1';
import { motion } from 'framer-motion';

export default function SmartTargetDrawer({ onClose, onApply }) {
  const [targetMode, setTargetMode] = useState('query'); // 'query' | 'manual' | 'tag'
  const [selectedHosts, setSelectedHosts] = useState([]);
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState({});
  const [profile, setProfile] = useState('balanced');
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  
  const handleApply = async () => {
    const targets = {
      mode: targetMode,
      hosts: selectedHosts,
      query: query,
      tags: tags
    };
    
    await onApply(targets, profile);
    onClose();
  };
  
  const handlePreview = async () => {
    setIsLoading(true);
    // Simulate preview calculation
    setTimeout(() => {
      setPreview({
        hostCount: selectedHosts.length || Math.floor(Math.random() * 100) + 20,
        currentCost: Math.random() * 200 + 50,
        projectedCost: Math.random() * 100 + 20,
        projectedSavings: Math.random() * 100 + 30
      });
      setIsLoading(false);
    }, 1000);
  };
  
  return (
    <Drawer
      opened
      onClose={onClose}
      width="500px"
      className="smart-target-drawer"
    >
      <div className="drawer-content">
        <HeadingText type={HeadingText.TYPE.HEADING_3}>
          Smart Target Selection
        </HeadingText>
        
        <Stack 
          directionType={Stack.DIRECTION_TYPE.VERTICAL}
          spacingType={Stack.SPACING_TYPE.LARGE}
        >
          <StackItem>
            <RadioGroup value={targetMode} onChange={(e, value) => setTargetMode(value)}>
              <Radio value="query" label="NRQL Query" />
              <Radio value="manual" label="Manual Selection" />
              <Radio value="tag" label="Tag-based" />
            </RadioGroup>
          </StackItem>
          
          <StackItem>
            {targetMode === 'query' && (
              <QuerySelector
                value={query}
                onChange={setQuery}
                onHostsFound={setSelectedHosts}
              />
            )}
            
            {targetMode === 'manual' && (
              <ManualHostSelector
                selectedHosts={selectedHosts}
                onChange={setSelectedHosts}
              />
            )}
            
            {targetMode === 'tag' && (
              <TagSelector
                tags={tags}
                onChange={setTags}
                onHostsFound={setSelectedHosts}
              />
            )}
          </StackItem>
          
          <StackItem>
            <div className="profile-selector">
              <label>Target Profile:</label>
              <Select value={profile} onChange={(e, value) => setProfile(value)}>
                <SelectItem value="conservative">Conservative</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
              </Select>
            </div>
          </StackItem>
          
          <StackItem>
            <Button
              type={Button.TYPE.NORMAL}
              onClick={handlePreview}
              loading={isLoading}
              disabled={selectedHosts.length === 0 && !query && Object.keys(tags).length === 0}
            >
              Preview Impact
            </Button>
          </StackItem>
          
          {preview && (
            <StackItem>
              <motion.div
                className="impact-preview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <h4>Projected Impact</h4>
                <div className="preview-stats">
                  <div className="stat">
                    <span className="label">Affected Hosts:</span>
                    <span className="value">{preview.hostCount}</span>
                  </div>
                  <div className="stat">
                    <span className="label">Current Cost:</span>
                    <span className="value">${preview.currentCost.toFixed(2)}/hr</span>
                  </div>
                  <div className="stat">
                    <span className="label">Projected Cost:</span>
                    <span className="value">${preview.projectedCost.toFixed(2)}/hr</span>
                  </div>
                  <div className="stat highlight">
                    <span className="label">Estimated Savings:</span>
                    <span className="value">${preview.projectedSavings.toFixed(2)}/hr</span>
                  </div>
                </div>
              </motion.div>
            </StackItem>
          )}
          
          <StackItem className="drawer-actions">
            <Stack directionType={Stack.DIRECTION_TYPE.HORIZONTAL}>
              <StackItem>
                <Button onClick={onClose}>Cancel</Button>
              </StackItem>
              <StackItem>
                <Button
                  type={Button.TYPE.PRIMARY}
                  onClick={handleApply}
                  disabled={selectedHosts.length === 0 && !query && Object.keys(tags).length === 0}
                >
                  Apply to {selectedHosts.length || 'Selected'} Hosts
                </Button>
              </StackItem>
            </Stack>
          </StackItem>
        </Stack>
      </div>
    </Drawer>
  );
}

function QuerySelector({ value, onChange, onHostsFound }) {
  const [exampleQueries] = useState([
    {
      label: 'High Cost Hosts',
      query: `FROM SystemSample SELECT uniques(hostname) 
              WHERE nrdot_estimated_cost_per_hour > 1.0 
              SINCE 1 hour ago`
    },
    {
      label: 'Low Coverage Hosts',
      query: `FROM SystemSample SELECT uniques(hostname) 
              WHERE nrdot_process_coverage_critical < 0.9 
              SINCE 1 hour ago`
    },
    {
      label: 'Production Web Servers',
      query: `FROM SystemSample SELECT uniques(hostname) 
              WHERE tags.environment = 'production' 
              AND tags.role = 'web' 
              SINCE 1 hour ago`
    }
  ]);
  
  return (
    <div className="query-selector">
      <TextField
        label="NRQL Query"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        multiline
        style={{ minHeight: '100px' }}
        placeholder="SELECT uniques(hostname) FROM SystemSample WHERE..."
      />
      
      <div className="query-examples">
        <p>Examples:</p>
        {exampleQueries.map((example, i) => (
          <Button
            key={i}
            type={Button.TYPE.PLAIN}
            sizeType={Button.SIZE_TYPE.SMALL}
            onClick={() => onChange(example.query)}
          >
            {example.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ManualHostSelector({ selectedHosts, onChange }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [availableHosts, setAvailableHosts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Fetch available hosts
    fetchHosts().then(hosts => {
      setAvailableHosts(hosts);
      setLoading(false);
    });
  }, []);
  
  const filteredHosts = availableHosts.filter(host =>
    host.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  if (loading) return <Spinner />;
  
  return (
    <div className="manual-host-selector">
      <TextField
        label="Search Hosts"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Type to filter..."
      />
      
      <div className="host-list">
        {filteredHosts.length === 0 ? (
          <EmptyState
            iconType={EmptyState.ICON_TYPE.HARDWARE_AND_SOFTWARE__SOFTWARE__CLOUD}
            title="No hosts found"
            description="Try adjusting your search term"
          />
        ) : (
          filteredHosts.map(host => (
            <Checkbox
              key={host}
              checked={selectedHosts.includes(host)}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange([...selectedHosts, host]);
                } else {
                  onChange(selectedHosts.filter(h => h !== host));
                }
              }}
              label={host}
            />
          ))
        )}
      </div>
      
      <div className="selection-summary">
        {selectedHosts.length} hosts selected
      </div>
    </div>
  );
}

function TagSelector({ tags, onChange, onHostsFound }) {
  const [availableTags, setAvailableTags] = useState({});
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Fetch available tags
    fetchAvailableTags().then(tagData => {
      setAvailableTags(tagData);
      setLoading(false);
    });
  }, []);
  
  if (loading) return <Spinner />;
  
  return (
    <div className="tag-selector">
      <p>Select tags to filter hosts:</p>
      
      {Object.entries(availableTags).map(([tagKey, tagValues]) => (
        <div key={tagKey} className="tag-group">
          <label>{tagKey}:</label>
          <Select
            value={tags[tagKey] || ''}
            onChange={(e, value) => {
              const newTags = { ...tags };
              if (value) {
                newTags[tagKey] = value;
              } else {
                delete newTags[tagKey];
              }
              onChange(newTags);
            }}
          >
            <SelectItem value="">Any</SelectItem>
            {tagValues.map(value => (
              <SelectItem key={value} value={value}>{value}</SelectItem>
            ))}
          </Select>
        </div>
      ))}
      
      <div className="tag-summary">
        {Object.entries(tags).length > 0 && (
          <div>
            Selected tags:
            {Object.entries(tags).map(([key, value]) => (
              <span key={key} className="tag-chip">
                {key}:{value}
                <Icon
                  type={Icon.TYPE.INTERFACE__SIGN__TIMES}
                  onClick={() => {
                    const newTags = { ...tags };
                    delete newTags[key];
                    onChange(newTags);
                  }}
                />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Mock functions for demo - replace with actual API calls
async function fetchHosts() {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return [
    'web-server-01',
    'web-server-02',
    'api-server-01',
    'api-server-02',
    'db-primary-01',
    'db-replica-01',
    'cache-server-01',
    'worker-01',
    'worker-02',
    'worker-03'
  ];
}

async function fetchAvailableTags() {
  await new Promise(resolve => setTimeout(resolve, 500));
  return {
    environment: ['production', 'staging', 'development'],
    role: ['web', 'api', 'database', 'cache', 'worker'],
    region: ['us-east-1', 'us-west-2', 'eu-west-1'],
    team: ['platform', 'backend', 'frontend', 'data']
  };
}