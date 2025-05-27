import React, { useState } from 'react';
import {
  Card,
  CardBody,
  HeadingText,
  Button,
  Stack,
  StackItem,
  RadioGroup,
  Radio,
  Icon,
  Tooltip
} from 'nr1';
import { motion } from 'framer-motion';

export default function ProfileControl({ 
  currentProfile, 
  onProfileChange, 
  isChanging, 
  disabled 
}) {
  const [selectedProfile, setSelectedProfile] = useState(currentProfile);
  
  const profiles = [
    {
      value: 'conservative',
      label: 'Conservative',
      description: '~50% reduction, maximum coverage',
      icon: Icon.TYPE.INTERFACE__STATE__HEALTHY,
      color: '#2196F3',
      metrics: {
        reduction: '50%',
        coverage: '99%',
        risk: 'Low'
      }
    },
    {
      value: 'balanced',
      label: 'Balanced',
      description: '~70% reduction, smart filtering',
      icon: Icon.TYPE.INTERFACE__OPERATIONS__CONFIGURE,
      color: '#4CAF50',
      metrics: {
        reduction: '70%',
        coverage: '95%',
        risk: 'Medium'
      }
    },
    {
      value: 'aggressive',
      label: 'Aggressive',
      description: '~85% reduction, critical only',
      icon: Icon.TYPE.INTERFACE__STATE__WARNING,
      color: '#FF9800',
      metrics: {
        reduction: '85%',
        coverage: '90%',
        risk: 'High'
      }
    },
    {
      value: 'emergency',
      label: 'Emergency',
      description: '~95% reduction, bare minimum',
      icon: Icon.TYPE.INTERFACE__STATE__CRITICAL,
      color: '#F44336',
      metrics: {
        reduction: '95%',
        coverage: '80%',
        risk: 'Very High'
      }
    }
  ];
  
  const handleApply = () => {
    if (selectedProfile !== currentProfile) {
      onProfileChange(selectedProfile);
    }
  };
  
  return (
    <Card className="profile-control">
      <CardBody>
        <HeadingText type={HeadingText.TYPE.HEADING_3}>
          Optimization Profile
        </HeadingText>
        
        <div className="profile-grid">
          {profiles.map(profile => (
            <motion.div
              key={profile.value}
              className={`profile-option ${selectedProfile === profile.value ? 'selected' : ''}`}
              onClick={() => !disabled && setSelectedProfile(profile.value)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ 
                borderColor: selectedProfile === profile.value ? profile.color : 'transparent',
                opacity: disabled ? 0.6 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer'
              }}
            >
              <div className="profile-header">
                <Icon 
                  type={profile.icon}
                  color={profile.color}
                />
                <h4>{profile.label}</h4>
              </div>
              
              <p className="profile-description">{profile.description}</p>
              
              <div className="profile-metrics">
                <div className="metric">
                  <span className="metric-label">Reduction:</span>
                  <span className="metric-value">{profile.metrics.reduction}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Coverage:</span>
                  <span className="metric-value">{profile.metrics.coverage}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Risk:</span>
                  <span className="metric-value">{profile.metrics.risk}</span>
                </div>
              </div>
              
              {currentProfile === profile.value && (
                <div className="current-badge">
                  <Icon type={Icon.TYPE.INTERFACE__SIGN__CHECKMARK} />
                  Current
                </div>
              )}
            </motion.div>
          ))}
        </div>
        
        <Stack 
          directionType={Stack.DIRECTION_TYPE.HORIZONTAL}
          spacingType={Stack.SPACING_TYPE.LARGE}
          className="profile-actions"
        >
          <StackItem grow>
            <div className="profile-info">
              {selectedProfile !== currentProfile && (
                <span className="pending-change">
                  <Icon type={Icon.TYPE.INTERFACE__INFO__INFO} />
                  Pending change: {currentProfile} → {selectedProfile}
                </span>
              )}
            </div>
          </StackItem>
          
          <StackItem>
            <Button
              type={Button.TYPE.PRIMARY}
              onClick={handleApply}
              disabled={disabled || selectedProfile === currentProfile}
              loading={isChanging}
            >
              Apply Profile
            </Button>
          </StackItem>
        </Stack>
      </CardBody>
    </Card>
  );
}