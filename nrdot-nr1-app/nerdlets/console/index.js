import React, { useState, useEffect, useCallback } from 'react';
import {
  Grid,
  GridItem,
  Card,
  CardBody,
  HeadingText,
  Button,
  Stack,
  StackItem,
  Toast,
  Modal,
  Select,
  SelectItem,
  TextField,
  Tabs,
  TabsItem,
  Icon,
  Badge
} from 'nr1';
import { motion, AnimatePresence } from 'framer-motion';
import ProfileControl from './components/ProfileControl';
import LiveKPICards from './components/LiveKPICards';
import ExperimentDrawer from './components/ExperimentDrawer';
import SmartTargetDrawer from './components/SmartTargetDrawer';
import NRQLQueryInput from './components/NRQLQueryInput';
import VisualQueryBuilderModal from './components/VisualQueryBuilderModal';
import { useProfileControl } from '../../lib/hooks/useProfileControl';
import { useOptimizationState } from '../../lib/hooks/useOptimizationState';

export default function ConsoleNerdlet() {
  const [accountId, setAccountId] = useState(null);
  const { 
    currentProfile, 
    isChanging, 
    changeProfile, 
    undoChange,
    canUndo,
    lastChange 
  } = useProfileControl(accountId);
  
  const { rings, experiments } = useOptimizationState(accountId);
  const [showExperiments, setShowExperiments] = useState(false);
  const [showSmartTarget, setShowSmartTarget] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingProfile, setPendingProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('optimization');
  const [showQueryBuilder, setShowQueryBuilder] = useState(false);

  const handleProfileChange = useCallback((profile) => {
    setPendingProfile(profile);
    setShowConfirmModal(true);
  }, []);

  const confirmProfileChange = useCallback(async () => {
    if (pendingProfile) {
      try {
        await changeProfile(pendingProfile);
        Toast.showToast({
          title: 'Profile Updated',
          description: `Switched to ${pendingProfile} profile. Changes will take effect in ~15 seconds.`,
          type: Toast.TYPE.SUCCESS,
          sticky: false,
          duration: 5000
        });
      } catch (error) {
        Toast.showToast({
          title: 'Profile Change Failed',
          description: error.message,
          type: Toast.TYPE.CRITICAL
        });
      }
    }
    setShowConfirmModal(false);
    setPendingProfile(null);
  }, [pendingProfile, changeProfile]);

  return (
    <div className="console-container">
      <Grid className="console-grid" spacingType={Grid.SPACING_TYPE.LARGE}>
        <GridItem columnSpan={12}>
          <ConsoleHeader 
            currentProfile={currentProfile}
            onOpenExperiments={() => setShowExperiments(true)}
            onOpenSmartTarget={() => setShowSmartTarget(true)}
            onOpenQueryBuilder={() => setShowQueryBuilder(true)}
          />
        </GridItem>
        
        <GridItem columnSpan={8}>
          <Stack directionType={Stack.DIRECTION_TYPE.VERTICAL}>
            <StackItem>
              <ProfileControl
                currentProfile={currentProfile}
                onProfileChange={handleProfileChange}
                isChanging={isChanging}
                disabled={isChanging}
              />
            </StackItem>
            
            <StackItem>
              <LiveKPICards accountId={accountId} />
            </StackItem>
            
            {canUndo && (
              <StackItem>
                <UndoSnackbar
                  lastChange={lastChange}
                  onUndo={undoChange}
                  timeLeft={30}
                />
              </StackItem>
            )}
          </Stack>
        </GridItem>
        
        <GridItem columnSpan={4}>
          <RingStatus rings={rings} />
          <ExperimentSummary experiments={experiments} />
        </GridItem>
      </Grid>
      
      <AnimatePresence>
        {showExperiments && (
          <ExperimentDrawer
            experiments={experiments}
            onClose={() => setShowExperiments(false)}
          />
        )}
        
        {showSmartTarget && (
          <SmartTargetDrawer
            onClose={() => setShowSmartTarget(false)}
            onApply={(targets, profile) => {
              console.log('Applying profile to targets:', targets, profile);
              // Implementation for bulk operations
            }}
          />
        )}
        
        {showConfirmModal && (
          <ProfileChangeModal
            currentProfile={currentProfile}
            newProfile={pendingProfile}
            onConfirm={confirmProfileChange}
            onCancel={() => {
              setShowConfirmModal(false);
              setPendingProfile(null);
            }}
          />
        )}
        
        {showQueryBuilder && (
          <VisualQueryBuilderModal
            isOpen={showQueryBuilder}
            onClose={() => setShowQueryBuilder(false)}
            onQueryRun={(queryData) => {
              console.log('Executing query:', queryData);
              Toast.showToast({
                title: 'Query Executed',
                description: `Running query: ${queryData.nrql}`,
                type: Toast.TYPE.SUCCESS
              });
            }}
            availableMetrics={[
              'nrdot.host.cpu.usage',
              'nrdot.host.memory.usage',
              'nrdot.host.processes.count',
              'nrdot.optimization.series.reduction',
              'nrdot.optimization.cost.savings'
            ]}
            availableDimensions={[
              'host', 'ring', 'profile', 'service', 'environment', 'region'
            ]}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ConsoleHeader({ currentProfile, onOpenExperiments, onOpenSmartTarget, onOpenQueryBuilder }) {
  return (
    <div className="console-header">
      <Stack 
        directionType={Stack.DIRECTION_TYPE.HORIZONTAL}
        spacingType={Stack.SPACING_TYPE.LARGE}
        fullWidth
      >
        <StackItem grow>
          <HeadingText type={HeadingText.TYPE.HEADING_2}>
            Optimization Console
          </HeadingText>
          <div className="profile-status">
            <span>Active Profile:</span>
            <Badge type={getProfileBadgeType(currentProfile)}>
              {currentProfile || 'Not Set'}
            </Badge>
          </div>
        </StackItem>
        
        <StackItem>
          <Button
            type={Button.TYPE.NORMAL}
            sizeType={Button.SIZE_TYPE.SMALL}
            onClick={onOpenExperiments}
          >
            <Icon type={Icon.TYPE.INTERFACE__OPERATIONS__CONFIGURE} />
            Experiments
          </Button>
        </StackItem>
        
        <StackItem>
          <Button
            type={Button.TYPE.NORMAL}
            sizeType={Button.SIZE_TYPE.SMALL}
            onClick={onOpenSmartTarget}
          >
            <Icon type={Icon.TYPE.INTERFACE__OPERATIONS__GROUP} />
            Smart Target
          </Button>
        </StackItem>
        
        <StackItem>
          <Button
            type={Button.TYPE.NORMAL}
            sizeType={Button.SIZE_TYPE.SMALL}
            onClick={onOpenQueryBuilder}
          >
            <Icon type={Icon.TYPE.INTERFACE__OPERATIONS__SEARCH} />
            Query Builder
          </Button>
        </StackItem>
      </Stack>
    </div>
  );
}

function UndoSnackbar({ lastChange, onUndo, timeLeft }) {
  const [remaining, setRemaining] = useState(timeLeft);
  
  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  if (remaining === 0) return null;
  
  return (
    <motion.div
      className="undo-snackbar"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
    >
      <Stack directionType={Stack.DIRECTION_TYPE.HORIZONTAL}>
        <StackItem grow>
          <span>Changed from {lastChange.from} to {lastChange.to}</span>
        </StackItem>
        <StackItem>
          <Button
            type={Button.TYPE.PLAIN}
            sizeType={Button.SIZE_TYPE.SMALL}
            onClick={onUndo}
          >
            Undo ({remaining}s)
          </Button>
        </StackItem>
      </Stack>
    </motion.div>
  );
}

function ProfileChangeModal({ currentProfile, newProfile, onConfirm, onCancel }) {
  const [impact, setImpact] = useState(null);
  
  useEffect(() => {
    // Fetch projected impact
    fetchProfileImpact(currentProfile, newProfile).then(setImpact);
  }, [currentProfile, newProfile]);
  
  return (
    <Modal hidden={false} onClose={onCancel}>
      <HeadingText type={HeadingText.TYPE.HEADING_3}>
        Confirm Profile Change
      </HeadingText>
      
      <div className="modal-content">
        <p>
          Change optimization profile from <strong>{currentProfile}</strong> to{' '}
          <strong>{newProfile}</strong>?
        </p>
        
        {impact && (
          <div className="impact-preview">
            <h4>Projected Impact:</h4>
            <ul>
              <li>Series Reduction: {impact.seriesReduction}%</li>
              <li>Cost Savings: ${impact.costSavings}/hour</li>
              <li>Coverage Impact: {impact.coverageImpact}%</li>
            </ul>
          </div>
        )}
        
        <Stack 
          directionType={Stack.DIRECTION_TYPE.HORIZONTAL}
          spacingType={Stack.SPACING_TYPE.LARGE}
          className="modal-actions"
        >
          <StackItem>
            <Button onClick={onCancel}>Cancel</Button>
          </StackItem>
          <StackItem>
            <Button 
              type={Button.TYPE.PRIMARY}
              onClick={onConfirm}
            >
              Apply Change
            </Button>
          </StackItem>
        </Stack>
      </div>
    </Modal>
  );
}

function RingStatus({ rings = [] }) {
  return (
    <Card>
      <CardBody>
        <HeadingText type={HeadingText.TYPE.HEADING_4}>
          Ring Distribution
        </HeadingText>
        <div className="ring-grid">
          {rings.map(ring => (
            <motion.div
              key={ring.id}
              className={`ring-cell ${ring.profile}`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="ring-number">R{ring.id}</div>
              <div className="ring-hosts">{ring.hostCount}</div>
              <div className="ring-profile">{ring.profile}</div>
            </motion.div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function ExperimentSummary({ experiments = [] }) {
  const activeExperiments = experiments.filter(e => e.status === 'active');
  
  return (
    <Card>
      <CardBody>
        <HeadingText type={HeadingText.TYPE.HEADING_4}>
          Active Experiments
        </HeadingText>
        {activeExperiments.length === 0 ? (
          <p className="empty-state">No active experiments</p>
        ) : (
          <Stack directionType={Stack.DIRECTION_TYPE.VERTICAL}>
            {activeExperiments.map(exp => (
              <StackItem key={exp.id}>
                <div className="experiment-summary">
                  <div className="exp-name">{exp.name}</div>
                  <div className="exp-progress">
                    <ProgressBar 
                      value={exp.progress} 
                      max={100}
                      label={`${exp.daysRemaining}d left`}
                    />
                  </div>
                </div>
              </StackItem>
            ))}
          </Stack>
        )}
      </CardBody>
    </Card>
  );
}

function ProgressBar({ value, max, label }) {
  const percentage = (value / max) * 100;
  
  return (
    <div className="progress-bar">
      <div className="progress-track">
        <div 
          className="progress-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="progress-label">{label}</span>
    </div>
  );
}

// Helper functions
function getProfileBadgeType(profile) {
  switch (profile) {
    case 'conservative': return Badge.TYPE.INFO;
    case 'balanced': return Badge.TYPE.SUCCESS;
    case 'aggressive': return Badge.TYPE.WARNING;
    case 'emergency': return Badge.TYPE.CRITICAL;
    default: return Badge.TYPE.NEUTRAL;
  }
}

async function fetchProfileImpact(currentProfile, newProfile) {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const impacts = {
    'conservative->balanced': { seriesReduction: 15, costSavings: 20, coverageImpact: -2 },
    'balanced->aggressive': { seriesReduction: 20, costSavings: 35, coverageImpact: -5 },
    'aggressive->emergency': { seriesReduction: 25, costSavings: 45, coverageImpact: -10 },
    'emergency->aggressive': { seriesReduction: -10, costSavings: -20, coverageImpact: 5 },
    'aggressive->balanced': { seriesReduction: -15, costSavings: -25, coverageImpact: 3 },
    'balanced->conservative': { seriesReduction: -20, costSavings: -30, coverageImpact: 2 }
  };
  
  const key = `${currentProfile}->${newProfile}`;
  return impacts[key] || { seriesReduction: 0, costSavings: 0, coverageImpact: 0 };
}