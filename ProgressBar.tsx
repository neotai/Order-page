import React from 'react';
import './ProgressBar.css';

interface ProgressBarProps {
  progress: number; // 0-100
  label?: string;
  color?: 'primary' | 'success' | 'warning' | 'danger';
  size?: 'small' | 'medium' | 'large';
  showPercentage?: boolean;
  animated?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  label,
  color = 'primary',
  size = 'medium',
  showPercentage = true,
  animated = false
}) => {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className={`progress-container size-${size}`}>
      {label && (
        <div className="progress-header">
          <span className="progress-label">{label}</span>
          {showPercentage && (
            <span className="progress-percentage">{Math.round(clampedProgress)}%</span>
          )}
        </div>
      )}
      <div className={`progress-bar-container color-${color}`}>
        <div 
          className={`progress-bar ${animated ? 'animated' : ''}`}
          style={{ width: `${clampedProgress}%` }}
        >
          {animated && <div className="progress-shine"></div>}
        </div>
      </div>
    </div>
  );
};

export default ProgressBar;