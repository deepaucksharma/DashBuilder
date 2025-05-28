import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, HeadingText, BlockText } from 'nr1';
import { VisualQueryBuilder } from '@dashbuilder/shared-components';

/**
 * Visual Query Builder Modal for NR1
 * Provides a visual interface for building NRQL queries
 */
export const VisualQueryBuilderModal = ({ 
  isOpen, 
  onClose, 
  onQueryRun,
  availableMetrics = [],
  availableDimensions = [],
  initialQuery = null 
}) => {
  const [currentQuery, setCurrentQuery] = useState(null);
  const [isValid, setIsValid] = useState(false);

  const handleQueryChange = (queryData) => {
    setCurrentQuery(queryData);
    setIsValid(queryData.isValid);
  };

  const handleRunQuery = () => {
    if (currentQuery && isValid) {
      onQueryRun(currentQuery);
      onClose();
    }
  };

  const handleCopyAndClose = () => {
    if (currentQuery) {
      navigator.clipboard.writeText(currentQuery.nrql);
      onClose();
    }
  };

  return (
    <Modal 
      hidden={!isOpen} 
      onClose={onClose}
      className="visual-query-builder-modal"
    >
      <div className="modal-header">
        <HeadingText type={HeadingText.TYPE.HEADING_3}>
          Visual Query Builder
        </HeadingText>
        <BlockText spacingType={[BlockText.SPACING_TYPE.MEDIUM]}>
          Build NRQL queries visually with drag-and-drop simplicity
        </BlockText>
      </div>

      <div className="modal-body">
        <VisualQueryBuilder
          onQueryChange={handleQueryChange}
          onQueryRun={handleRunQuery}
          availableMetrics={availableMetrics}
          availableDimensions={availableDimensions}
          initialQuery={initialQuery}
          className="nr1-visual-query-builder"
        />
      </div>

      <div className="modal-footer">
        <Button 
          type={Button.TYPE.TERTIARY}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type={Button.TYPE.SECONDARY}
          onClick={handleCopyAndClose}
          disabled={!currentQuery}
        >
          Copy Query & Close
        </Button>
        <Button
          type={Button.TYPE.PRIMARY}
          onClick={handleRunQuery}
          disabled={!isValid}
        >
          Run Query
        </Button>
      </div>
    </Modal>
  );
};

VisualQueryBuilderModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onQueryRun: PropTypes.func.isRequired,
  availableMetrics: PropTypes.arrayOf(PropTypes.string),
  availableDimensions: PropTypes.arrayOf(PropTypes.string),
  initialQuery: PropTypes.object
};

export default VisualQueryBuilderModal;