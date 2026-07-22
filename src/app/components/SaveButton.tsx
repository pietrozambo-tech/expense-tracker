import React from 'react';

interface SaveButtonProps {
  onClick: () => void;
  disabled: boolean;
  isEditing?: boolean;
  transactionType: 'expense' | 'income';
}

export function SaveButton({ onClick, disabled, isEditing = false, transactionType }: SaveButtonProps) {
  const transactionLabel = transactionType === 'expense' ? 'Expense' : 'Income';
  const buttonText = isEditing 
    ? `Update ${transactionLabel}`
    : `Save ${transactionLabel}`;
  
  console.log('SaveButton render:', { disabled, isEditing, transactionType, transactionLabel, buttonText });

  // Force repaint on every render using useEffect
  const [forceRender, setForceRender] = React.useState(0);
  
  React.useEffect(() => {
    const interval = setInterval(() => {
      setForceRender(prev => prev + 1);
    }, 50);
    return () => clearInterval(interval);
  }, [buttonText]);

  // Force repaint hack - add invisible animation
  const forceRepaintStyle = `
    @keyframes forceRepaint {
      0%, 100% { opacity: 0.9999; }
      50% { opacity: 1; }
    }
  `;

  if (disabled) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white from-60% via-white/80 to-transparent pt-8 pb-6 z-30 pointer-events-none max-w-[430px] mx-auto">
        <div className="px-6 pointer-events-auto">
          <div
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '16px',
              backgroundColor: '#E5E5E5',
              color: '#9CA3AF',
              textAlign: 'center' as const,
              fontWeight: 500,
              userSelect: 'none' as const,
              transform: 'translateZ(0)',
              WebkitTransform: 'translateZ(0)',
              willChange: 'contents'
            }}
          >
            {buttonText}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-white from-60% via-white/80 to-transparent pt-8 pb-6 z-30 pointer-events-none max-w-[430px] mx-auto">
      <style>{forceRepaintStyle}</style>
      <div className="px-6 pointer-events-auto">
        <div
          onClick={onClick}
          dangerouslySetInnerHTML={{ __html: `<span style="color: #FFFFFF; font-weight: 500; display: block;">${buttonText}</span>` }}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '16px',
            backgroundColor: '#3B82F6',
            cursor: 'pointer',
            boxShadow: '0 10px 25px rgba(59, 130, 246, 0.2)',
            textAlign: 'center' as const,
            userSelect: 'none' as const,
            transform: 'translateZ(0)',
            WebkitTransform: 'translateZ(0)',
            willChange: 'contents',
            isolation: 'isolate' as const
          }}
        />
      </div>
    </div>
  );
}