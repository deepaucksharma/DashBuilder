import React, { useState, useEffect } from 'react';
import { 
  Grid, 
  GridItem, 
  HeadingText,
  NerdletStateContext,
  PlatformStateContext,
  Toast,
  navigation,
  Button,
  Spinner,
  Icon
} from 'nr1';
import { motion, AnimatePresence } from 'framer-motion';
import CostTileSet from './components/CostTileSet';
import CoverageTileSet from './components/CoverageTileSet';
import AnomalyTileSet from './components/AnomalyTileSet';
import { useOptimizationState } from '../../lib/hooks/useOptimizationState';
import { useRealTimeMetrics } from '../../lib/hooks/useRealTimeMetrics';

export default function OverviewNerdlet() {
  const { accountId, timeRange } = React.useContext(PlatformStateContext);
  const { optimizationState, loading, error } = useOptimizationState(accountId);
  const metrics = useRealTimeMetrics(accountId, timeRange);
  
  const [showWelcome, setShowWelcome] = useState(!optimizationState?.initialized);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (showWelcome) {
    return <WelcomeWizard onComplete={() => setShowWelcome(false)} />;
  }

  return (
    <div className="overview-container">
      <Grid className="overview-grid" spacingType={Grid.SPACING_TYPE.LARGE}>
        <GridItem columnSpan={12}>
          <HeaderSection metrics={metrics} />
        </GridItem>
        
        <GridItem columnSpan={4}>
          <AnimatePresence mode="wait">
            <motion.div
              key="cost-tiles"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <CostTileSet 
                metrics={metrics.cost}
                accountId={accountId}
                timeRange={timeRange}
              />
            </motion.div>
          </AnimatePresence>
        </GridItem>
        
        <GridItem columnSpan={4}>
          <AnimatePresence mode="wait">
            <motion.div
              key="coverage-tiles"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <CoverageTileSet 
                metrics={metrics.coverage}
                accountId={accountId}
                timeRange={timeRange}
              />
            </motion.div>
          </AnimatePresence>
        </GridItem>
        
        <GridItem columnSpan={4}>
          <AnimatePresence mode="wait">
            <motion.div
              key="anomaly-tiles"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <AnomalyTileSet 
                metrics={metrics.anomalies}
                accountId={accountId}
                timeRange={timeRange}
              />
            </motion.div>
          </AnimatePresence>
        </GridItem>
        
        <GridItem columnSpan={12}>
          <QuickActions 
            optimizationState={optimizationState}
            onNavigateToConsole={() => navigation.openNerdlet({ id: 'console' })}
          />
        </GridItem>
      </Grid>
    </div>
  );
}

function HeaderSection({ metrics }) {
  const savings = metrics?.cost?.totalSavings || 0;
  const reduction = metrics?.cost?.reductionPercent || 0;
  
  return (
    <div className="header-section">
      <HeadingText type={HeadingText.TYPE.HEADING_2}>
        Host Process Optimization Overview
      </HeadingText>
      <div className="header-stats">
        <motion.div 
          className="stat-badge"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <span className="stat-value">${savings.toFixed(2)}/hr</span>
          <span className="stat-label">Saved</span>
        </motion.div>
        <div className="stat-badge">
          <span className="stat-value">{reduction.toFixed(0)}%</span>
          <span className="stat-label">Reduction</span>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="loading-skeleton">
      {[...Array(9)].map((_, i) => (
        <div key={i} className="skeleton-tile">
          <div className="skeleton-header" />
          <div className="skeleton-value" />
          <div className="skeleton-chart" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ error }) {
  return (
    <div className="error-state">
      <HeadingText type={HeadingText.TYPE.HEADING_3}>
        Unable to load optimization data
      </HeadingText>
      <p>{error.message}</p>
      <Button onClick={() => window.location.reload()}>
        Retry
      </Button>
    </div>
  );
}

function WelcomeWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [selectedProfile, setSelectedProfile] = useState('balanced');
  
  const steps = [
    {
      title: "Welcome to NRDOT Process Optimization",
      content: "Reduce your host process metrics costs by 70%+ while maintaining critical visibility.",
      action: "Get Started"
    },
    {
      title: "Choose Your Starting Profile",
      content: <ProfileSelector onSelect={(profile) => setSelectedProfile(profile)} />,
      action: "Apply Profile"
    },
    {
      title: "Setup Complete!",
      content: "Your optimization is now active. Check the dashboard for real-time savings.",
      action: "View Dashboard"
    }
  ];
  
  return (
    <motion.div 
      className="welcome-wizard"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="wizard-content">
        <HeadingText>{steps[step].title}</HeadingText>
        <div className="wizard-body">{steps[step].content}</div>
        <Button onClick={() => {
          if (step < steps.length - 1) {
            setStep(step + 1);
          } else {
            onComplete();
          }
        }}>
          {steps[step].action}
        </Button>
      </div>
    </motion.div>
  );
}

function ProfileSelector({ onSelect }) {
  const profiles = [
    { value: 'conservative', label: 'Conservative', description: '~50% reduction, maximum coverage' },
    { value: 'balanced', label: 'Balanced', description: '~70% reduction, smart filtering' },
    { value: 'aggressive', label: 'Aggressive', description: '~85% reduction, critical only' }
  ];
  
  return (
    <div className="profile-selector">
      {profiles.map(profile => (
        <div 
          key={profile.value}
          className="profile-option"
          onClick={() => onSelect(profile.value)}
        >
          <h4>{profile.label}</h4>
          <p>{profile.description}</p>
        </div>
      ))}
    </div>
  );
}

function QuickActions({ optimizationState, onNavigateToConsole }) {
  return (
    <div className="quick-actions">
      <Button
        type={Button.TYPE.PRIMARY}
        onClick={onNavigateToConsole}
      >
        <Icon type={Icon.TYPE.INTERFACE__OPERATIONS__CONFIGURE} />
        Open Console
      </Button>
    </div>
  );
}