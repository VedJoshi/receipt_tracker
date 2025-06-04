import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ 
    stage = 'uploading', 
    progress = 0, 
    estimatedTime = null,
    fileName = null,
    size = 'medium'
}) => {
    const stages = {
        uploading: { text: 'Uploading file...', icon: '📤' },
        processing: { text: 'Processing image...', icon: '⚙️' },
        extracting: { text: 'Extracting text...', icon: '🔍' },
        parsing: { text: 'Parsing receipt data...', icon: '📊' },
        saving: { text: 'Saving receipt...', icon: '💾' },
        complete: { text: 'Upload complete!', icon: '✅' }
    };

    const currentStage = stages[stage] || stages.uploading;

    return (
        <div className={`loading-container ${size}`}>
            <div className="spinner-wrapper">
                <div className="spinner">
                    <div className="spinner-inner"></div>
                </div>
                <div className="stage-icon">{currentStage.icon}</div>
            </div>
            
            <div className="loading-content">
                <div className="loading-text">{currentStage.text}</div>
                
                {fileName && (
                    <div className="file-info">
                        <span className="file-name">{fileName}</span>
                    </div>
                )}
                
                <div className="progress-container">
                    <div className="progress-bar">
                        <div 
                            className="progress-fill" 
                            style={{ width: `${Math.min(progress, 100)}%` }}
                        >
                            <div className="progress-shimmer"></div>
                        </div>
                    </div>
                    <div className="progress-text">{Math.round(progress)}%</div>
                </div>
                
                {estimatedTime && (
                    <div className="estimated-time">
                        Estimated time: {estimatedTime}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LoadingSpinner;