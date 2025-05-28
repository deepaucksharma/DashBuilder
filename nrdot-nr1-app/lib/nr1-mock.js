// Mock implementation of NR1 SDK for local development and testing

import React from 'react';

// Mock NrqlQuery component
export const NrqlQuery = ({ query, accountIds, children }) => {
  console.log('NrqlQuery:', { query, accountIds });
  
  // Simulate loading state
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState(null);
  
  React.useEffect(() => {
    setTimeout(() => {
      setLoading(false);
      setData({
        results: [
          {
            data: [
              { y: Math.random() * 100, x: Date.now() - 300000 },
              { y: Math.random() * 100, x: Date.now() - 240000 },
              { y: Math.random() * 100, x: Date.now() - 180000 },
              { y: Math.random() * 100, x: Date.now() - 120000 },
              { y: Math.random() * 100, x: Date.now() - 60000 },
              { y: Math.random() * 100, x: Date.now() }
            ]
          }
        ]
      });
    }, 1000);
  }, [query]);
  
  return children({ loading, data, error: null });
};

// Mock UI components
export const Card = ({ children, className }) => (
  <div className={`nr1-card ${className || ''}`} style={{ 
    padding: '16px', 
    borderRadius: '4px', 
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    backgroundColor: 'white',
    marginBottom: '16px'
  }}>
    {children}
  </div>
);

export const CardBody = ({ children }) => (
  <div className="nr1-card-body">{children}</div>
);

export const HeadingText = ({ children, type }) => {
  const Tag = type === 'heading-1' ? 'h1' : 
              type === 'heading-2' ? 'h2' : 
              type === 'heading-3' ? 'h3' : 'h4';
  return <Tag className={`nr1-${type}`}>{children}</Tag>;
};

export const BlockText = ({ children }) => (
  <p className="nr1-block-text">{children}</p>
);

export const Button = ({ children, onClick, variant, ...props }) => (
  <button 
    className={`nr1-button nr1-button--${variant || 'primary'}`}
    onClick={onClick}
    style={{
      padding: '8px 16px',
      borderRadius: '4px',
      border: 'none',
      backgroundColor: variant === 'primary' ? '#007e8b' : '#f0f0f0',
      color: variant === 'primary' ? 'white' : '#333',
      cursor: 'pointer'
    }}
    {...props}
  >
    {children}
  </button>
);

export const TextField = ({ value, onChange, placeholder, ...props }) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e, e.target.value)}
    placeholder={placeholder}
    className="nr1-text-field"
    style={{
      padding: '8px',
      borderRadius: '4px',
      border: '1px solid #ccc',
      width: '100%'
    }}
    {...props}
  />
);

export const Stack = ({ children, directionType, gapType, fullWidth }) => (
  <div 
    className={`nr1-stack nr1-stack--${directionType || 'vertical'}`}
    style={{
      display: 'flex',
      flexDirection: directionType === 'horizontal' ? 'row' : 'column',
      gap: gapType === 'small' ? '8px' : gapType === 'large' ? '24px' : '16px',
      width: fullWidth ? '100%' : 'auto'
    }}
  >
    {children}
  </div>
);

export const StackItem = ({ children, grow }) => (
  <div 
    className="nr1-stack-item"
    style={{ flex: grow ? 1 : 'initial' }}
  >
    {children}
  </div>
);

export const Spinner = ({ type }) => (
  <div className={`nr1-spinner nr1-spinner--${type || 'inline'}`}>
    Loading...
  </div>
);

export const Modal = ({ hidden, onClose, children }) => {
  if (hidden) return null;
  
  return (
    <div className="nr1-modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className="nr1-modal" style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        maxWidth: '90%',
        maxHeight: '90%',
        overflow: 'auto',
        position: 'relative'
      }}>
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer'
          }}
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
};

// Mock navigation
export const navigation = {
  openStackedNerdlet: (nerdletId) => {
    console.log('Opening nerdlet:', nerdletId);
  }
};

// Mock platform
export const PlatformStateContext = {
  Consumer: ({ children }) => children({ timeRange: { duration: 3600000 } })
};

// Mock NerdGraph
export const NerdGraphQuery = {
  query: async ({ query, variables }) => {
    console.log('NerdGraph Query:', { query, variables });
    return {
      data: {
        actor: {
          account: {
            nrql: {
              results: []
            }
          }
        }
      }
    };
  }
};

// Mock UserStorage
export const UserStorageMutation = {
  mutate: async ({ actionType, collection, documentId, document }) => {
    console.log('UserStorage Mutation:', { actionType, collection, documentId, document });
    return { data: document };
  }
};

export const UserStorageQuery = {
  query: async ({ collection, documentId }) => {
    console.log('UserStorage Query:', { collection, documentId });
    return { data: null };
  }
};