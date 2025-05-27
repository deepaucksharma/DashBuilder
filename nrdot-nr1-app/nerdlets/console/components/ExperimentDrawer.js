import React from 'react';
import {
  Drawer,
  Button,
  HeadingText,
  Stack,
  StackItem,
  Card,
  CardBody
} from 'nr1';

export default function ExperimentDrawer({ experiments, onClose }) {
  return (
    <Drawer
      opened
      onClose={onClose}
      width="600px"
      className="experiment-drawer"
    >
      <div className="drawer-content">
        <HeadingText type={HeadingText.TYPE.HEADING_3}>
          Optimization Experiments
        </HeadingText>
        
        <Stack 
          directionType={Stack.DIRECTION_TYPE.VERTICAL}
          spacingType={Stack.SPACING_TYPE.LARGE}
        >
          <StackItem>
            <p>Manage A/B tests and gradual rollouts</p>
          </StackItem>
          
          <StackItem>
            <Card>
              <CardBody>
                <p>Experiment management coming soon...</p>
              </CardBody>
            </Card>
          </StackItem>
          
          <StackItem>
            <Button onClick={onClose}>Close</Button>
          </StackItem>
        </Stack>
      </div>
    </Drawer>
  );
}