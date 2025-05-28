import React, { useState, useCallback, useEffect } from 'react';
import { 
  Stack, 
  StackItem, 
  TextField,
  Icon,
  InlineMessage,
  Card,
  CardBody,
  HeadingText,
  Button
} from 'nr1';
import { NRQLValidator } from '@dashbuilder/shared-components';

const validator = new NRQLValidator();

export default function NRQLQueryInput({ 
  onQuerySubmit, 
  placeholder = "Enter NRQL query...",
  initialQuery = "",
  showExamples = true 
}) {
  const [query, setQuery] = useState(initialQuery);
  const [validation, setValidation] = useState({ valid: true, errors: [], warnings: [] });
  const [showValidation, setShowValidation] = useState(false);

  // Validate query on change
  useEffect(() => {
    if (query.trim()) {
      const result = validator.validate(query);
      setValidation(result);
      setShowValidation(true);
    } else {
      setShowValidation(false);
    }
  }, [query]);

  const handleSubmit = useCallback(() => {
    if (validation.valid && onQuerySubmit) {
      onQuerySubmit(query);
    }
  }, [query, validation.valid, onQuerySubmit]);

  const exampleQueries = [
    {
      title: 'System CPU Usage',
      query: 'SELECT average(cpuPercent) FROM SystemSample SINCE 1 hour ago TIMESERIES'
    },
    {
      title: 'Process Count by Host',
      query: 'SELECT count(*) FROM ProcessSample FACET hostname SINCE 30 minutes ago'
    },
    {
      title: 'Top Memory Consumers',
      query: 'SELECT max(memoryResidentSizeBytes) FROM ProcessSample FACET processDisplayName LIMIT 10'
    }
  ];

  const handleExampleClick = (exampleQuery) => {
    setQuery(exampleQuery);
  };

  return (
    <Card>
      <CardBody>
        <Stack
          directionType={Stack.DIRECTION_TYPE.VERTICAL}
          gapType={Stack.GAP_TYPE.MEDIUM}
        >
          <StackItem>
            <HeadingText type={HeadingText.TYPE.HEADING_3}>
              NRQL Query Builder
            </HeadingText>
          </StackItem>

          <StackItem>
            <TextField
              multiline
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              style={{ width: '100%', minHeight: '100px' }}
            />
          </StackItem>

          {showValidation && (
            <StackItem>
              {validation.errors.length > 0 && (
                <Stack
                  directionType={Stack.DIRECTION_TYPE.VERTICAL}
                  gapType={Stack.GAP_TYPE.SMALL}
                >
                  {validation.errors.map((error, index) => (
                    <StackItem key={`error-${index}`}>
                      <InlineMessage
                        type={InlineMessage.TYPE.CRITICAL}
                        title="Error"
                      >
                        {error}
                      </InlineMessage>
                    </StackItem>
                  ))}
                </Stack>
              )}

              {validation.warnings.length > 0 && (
                <Stack
                  directionType={Stack.DIRECTION_TYPE.VERTICAL}
                  gapType={Stack.GAP_TYPE.SMALL}
                >
                  {validation.warnings.map((warning, index) => (
                    <StackItem key={`warning-${index}`}>
                      <InlineMessage
                        type={InlineMessage.TYPE.WARNING}
                        title="Warning"
                      >
                        {warning}
                      </InlineMessage>
                    </StackItem>
                  ))}
                </Stack>
              )}

              {validation.valid && validation.errors.length === 0 && validation.warnings.length === 0 && (
                <InlineMessage
                  type={InlineMessage.TYPE.SUCCESS}
                  title="Valid Query"
                >
                  Your NRQL query syntax is correct
                </InlineMessage>
              )}
            </StackItem>
          )}

          <StackItem>
            <Stack
              directionType={Stack.DIRECTION_TYPE.HORIZONTAL}
              gapType={Stack.GAP_TYPE.MEDIUM}
            >
              <StackItem>
                <Button
                  type={Button.TYPE.PRIMARY}
                  disabled={!validation.valid || !query.trim()}
                  onClick={handleSubmit}
                >
                  <Icon type={Icon.TYPE.INTERFACE__OPERATIONS__PLAY} />
                  Run Query
                </Button>
              </StackItem>
              <StackItem>
                <Button
                  type={Button.TYPE.NORMAL}
                  onClick={() => setQuery('')}
                >
                  Clear
                </Button>
              </StackItem>
            </Stack>
          </StackItem>

          {showExamples && (
            <StackItem>
              <Stack
                directionType={Stack.DIRECTION_TYPE.VERTICAL}
                gapType={Stack.GAP_TYPE.SMALL}
              >
                <StackItem>
                  <HeadingText type={HeadingText.TYPE.HEADING_5}>
                    Example Queries:
                  </HeadingText>
                </StackItem>
                {exampleQueries.map((example, index) => (
                  <StackItem key={index}>
                    <Button
                      type={Button.TYPE.PLAIN}
                      sizeType={Button.SIZE_TYPE.SMALL}
                      onClick={() => handleExampleClick(example.query)}
                      style={{ textAlign: 'left' }}
                    >
                      <strong>{example.title}:</strong> {example.query}
                    </Button>
                  </StackItem>
                ))}
              </Stack>
            </StackItem>
          )}
        </Stack>
      </CardBody>
    </Card>
  );
}